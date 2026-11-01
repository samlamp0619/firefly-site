/**
 * 管理员工具：/api/auth-admin?token=<管理员 token>
 *
 * 没有邮箱，用户忘了密码只能站主手动重置——这个接口就是那个入口。
 *
 *   GET  列出全部账号（按 SID 升序）
 *   POST { action: "delete", regId, freeSid? }          删号
 *   POST { action: "reset-password", regId, password }  重置密码
 *   POST { action: "recount" }                          重算号段提示
 *
 * 删号默认**不回收** SID（号码作废，符合「按注册先后永久发号」）。
 * 只有显式传 freeSid: true 才会连号码一起放出来——仅用于清理测试号。
 */
import { getStore } from "@edgeone/pages-blob";

const STORE = "users";
const TOKEN_SHA256 = "dff03f44f4ce6b75c28bad292ce98ffafea8dfd95a951140e10dea8a1e10c67b";
const PBKDF2_ITER = 100000;
const MAX_LIST = 200;          // 一次最多回多少条，超了提示分页

const enc = new TextEncoder();

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function b64url(bytes) {
  const arr = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return hex(bits);
}

async function authorize(context) {
  const token = new URL(context.request.url).searchParams.get("token") || "";
  if (!token) return false;
  return (await sha256Hex(token)) === TOKEN_SHA256;
}

/* SID 占用表：从 claims/sid-<n>/ 解析出 { sid, regId, num } */
async function listSidClaims(store) {
  const r = await store.list({ prefix: "claims/sid-", consistency: "strong" });
  return r.blobs
    .map(b => {
      const m = /^claims\/sid-(\d+)\/(.+)\.json$/.exec(b.key);
      return m ? { num: Number(m[1]), regId: m[2] } : null;
    })
    .filter(Boolean);
}

/* 把号段提示重算成「当前最大号」，删号之后调用 */
async function recount(store) {
  const claims = await listSidClaims(store);
  const max = claims.reduce((n, c) => Math.max(n, c.num), 0);
  await store.setJSON("meta/counter.json", { lastSid: max, updatedAt: new Date().toISOString() });
  return max;
}

export async function onRequestGet(context) {
  if (!(await authorize(context))) return json({ ok: false, error: "unauthorized" }, 401);

  const store = getStore(STORE);
  const claims = await listSidClaims(store);
  claims.sort((a, b) => a.num - b.num);

  const slice = claims.slice(0, MAX_LIST);
  const users = await Promise.all(slice.map(async c => {
    const u = await store.get("users/" + c.regId + ".json", { type: "json", consistency: "strong" });
    return {
      sid: u && u.sid ? u.sid : String(c.num).padStart(5, "0"),
      regId: c.regId,
      username: (u && u.username) || "（记录缺失）",
      qq: (u && u.qq) || "",
      createdAt: (u && u.createdAt) || "",
      ok: !!u,
    };
  }));

  return json({ ok: true, count: claims.length, shown: users.length, truncated: claims.length > MAX_LIST, users });
}

export async function onRequestPost(context) {
  if (!(await authorize(context))) return json({ ok: false, error: "unauthorized" }, 401);

  const store = getStore(STORE);
  let body;
  try { body = await context.request.json(); } catch { return json({ ok: false, error: "请求格式不对" }, 400); }

  const action = String(body.action || "");

  /* ---------- 重算号段 ---------- */
  if (action === "recount") {
    const max = await recount(store);
    return json({ ok: true, lastSid: max });
  }

  const regId = String(body.regId || "").replace(/[^a-zA-Z0-9]/g, "");
  if (!/^[a-f0-9]{32}$/.test(regId)) return json({ ok: false, error: "regId 不对" }, 400);

  const user = await store.get("users/" + regId + ".json", { type: "json", consistency: "strong" });

  /* ---------- 重置密码 ---------- */
  if (action === "reset-password") {
    if (!user) return json({ ok: false, error: "账号不存在" }, 404);
    const password = String(body.password || "");
    if (password.length < 8) return json({ ok: false, error: "密码至少 8 位" }, 400);
    if (password.length > 72) return json({ ok: false, error: "密码太长了" }, 400);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await hashPassword(password, salt, PBKDF2_ITER);
    const next = Object.assign({}, user, {
      salt: b64url(salt), iter: PBKDF2_ITER, hash,
      passwordResetAt: new Date().toISOString(),
    });
    await store.setJSON("users/" + regId + ".json", next);
    return json({ ok: true, sid: user.sid, username: user.username, note: "密码已重置，用新密码登录" });
  }

  /* ---------- 删号 ---------- */
  if (action === "delete") {
    if (!user && !body.freeSid) return json({ ok: false, error: "账号不存在" }, 404);

    const sid = user ? user.sid : "";
    const qq = user ? user.qq : "";
    const nameKey = user && user.username ? await sha256Hex(user.username.toLowerCase()) : "";
    const num = Number(sid) || 0;

    const jobs = [
      store.delete("users/" + regId + ".json"),
    ];
    if (nameKey) {
      jobs.push(store.delete("idx/name-" + nameKey + ".json"));
      jobs.push(store.delete("claims/name-" + nameKey + "/" + regId + ".json"));
    }
    if (qq) {
      jobs.push(store.delete("idx/qq-" + qq + ".json"));
      jobs.push(store.delete("claims/qq-" + qq + "/" + regId + ".json"));
    }
    /* 默认保留号码（作废不回收）；显式 freeSid 才放号 */
    if (body.freeSid === true && num) {
      jobs.push(store.delete("claims/sid-" + num + "/" + regId + ".json"));
    }
    await Promise.allSettled(jobs);

    let lastSid = null;
    if (body.freeSid === true) lastSid = await recount(store);

    return json({ ok: true, deleted: regId, sid, freedSid: body.freeSid === true, lastSid });
  }

  return json({ ok: false, error: "不认识的 action：" + action }, 400);
}
