/**
 * 注册：POST /api/auth-register
 * 入参 JSON：{ username, qq, password }
 * 出参：{ ok, sid, username, qq }
 *
 * ── 为什么这么绕 ──────────────────────────────────────────────
 * EdgeOne Blob 没有原子自增、也没有 compare-and-swap，但「用户名唯一」
 * 「QQ 唯一」「SID 按注册顺序且不重号」都需要跨请求的互斥。
 *
 * 做法是「占位文件 + 等待 + 强一致列表 + 确定性裁决」：
 *   1. 每个竞争者写一个**以自己 regId 命名**的占位文件（永远不覆盖别人）
 *   2. 等 400ms，让同一波竞争者都写完
 *   3. 强一致 list 这个前缀，一次就能看到全部竞争者
 *   4. 按 regId 字典序排序，名次即结果（谁先谁后是确定的、可复现的）
 *
 * 因为占位文件互不覆盖，所以**没有任何人的记录会丢失**；
 * 裁决只看列表，所以并发下结果也唯一。
 *
 * ── SID ──────────────────────────────────────────────────────
 * claims/sid/<n>/ 里的占位文件**永久保留**，它就是号码占用表。
 * meta/counter.json 只是「下一个大概是几号」的提示，它过期了也不会错，
 * 顶多多试几轮。
 */
import { getStore } from "@edgeone/pages-blob";

const STORE = "users";
const LIMITS = { usernameMin: 2, usernameMax: 20, passwordMin: 8, passwordMax: 72, qqMin: 5, qqMax: 12 };
const PBKDF2_ITER = 100000;          // 探针实测 1 万次 6ms，10 万次约 60ms
const SETTLE_MS = 400;               // 等同一波竞争者写完
const SESSION_DAYS = 30;

const enc = new TextEncoder();

/* ---------- 通用小工具 ---------- */

function json(obj, status = 200, extraHeaders) {
  const h = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (extraHeaders) Object.assign(h, extraHeaders);
  return new Response(JSON.stringify(obj), { status, headers: h });
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function b64url(bytes) {
  let s = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* 密码哈希：PBKDF2-SHA256 */
async function hashPassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256
  );
  return hex(bits);
}

/* 会话签名密钥：首次用时随机生成并存进 Blob；模块级缓存，命中就不用再读 */
let SECRET_CACHE = null;
async function getSecret(store) {
  if (SECRET_CACHE) return SECRET_CACHE;
  const cur = await store.get("meta/secret.json", { type: "json", consistency: "strong" });
  if (cur && cur.secret) {
    SECRET_CACHE = cur.secret;
    return SECRET_CACHE;
  }
  const fresh = hex(crypto.getRandomValues(new Uint8Array(32)));
  await store.setJSON("meta/secret.json", { secret: fresh, createdAt: new Date().toISOString() });
  SECRET_CACHE = fresh;
  return fresh;
}

async function signSession(store, payload) {
  const secret = await getSecret(store);
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return body + "." + b64url(sig);
}

function sessionCookie(value) {
  return "dsh_session=" + value +
    "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + (SESSION_DAYS * 24 * 3600);
}

/* ---------- 校验 ---------- */

function clean(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function validate(body) {
  const username = clean(body.username, LIMITS.usernameMax);
  const qq = clean(body.qq, LIMITS.qqMax).replace(/\D/g, "");
  const password = String(body.password == null ? "" : body.password);

  if (username.length < LIMITS.usernameMin) return { error: "用户名至少 " + LIMITS.usernameMin + " 个字" };
  if (!/^[\w\u4e00-\u9fa5·_-]+$/.test(username)) return { error: "用户名只能用中英文、数字、下划线、连字符" };
  if (!/^\d{5,12}$/.test(qq)) return { error: "QQ 号要是 5~12 位数字" };
  if (password.length < LIMITS.passwordMin) return { error: "密码至少 " + LIMITS.passwordMin + " 位" };
  if (password.length > LIMITS.passwordMax) return { error: "密码太长了" };
  return { username, qq, password };
}

/* 列出某个前缀下的占位文件，返回 regId 数组（按字典序） */
async function claimants(store, prefix) {
  const r = await store.list({ prefix, consistency: "strong" });
  return r.blobs
    .map(b => b.key.slice(prefix.length).replace(/\.json$/, ""))
    .filter(Boolean)
    .sort();
}

export async function onRequestPost(context) {
  const store = getStore(STORE);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "请求格式不对" }, 400);
  }

  const v = validate(body);
  if (v.error) return json({ ok: false, error: v.error }, 400);

  const { username, qq, password } = v;
  const nameKey = await sha256Hex(username.toLowerCase());

  /* --- 1. 快速查表：已经存在就直接拒，省掉后面一整套流程。
         三个读并行，因为每次 Blob 读要 300ms 上下，串起来白等。 --- */
  const [nameHit, qqHit, counter] = await Promise.all([
    store.get("idx/name-" + nameKey + ".json", { type: "json", consistency: "strong" }),
    store.get("idx/qq-" + qq + ".json", { type: "json", consistency: "strong" }),
    store.get("meta/counter.json", { type: "json", consistency: "strong" }),
  ]);
  if (nameHit) return json({ ok: false, error: "这个用户名已经有人用了" }, 409);
  if (qqHit) return json({ ok: false, error: "这个 QQ 号已经注册过了" }, 409);

  const regId = crypto.randomUUID().replace(/-/g, "");
  const baseSid = (counter && Number(counter.lastSid)) || 0;
  const tryNo = baseSid + 1;

  /* --- 2. 写三份占位（都以 regId 命名，永不覆盖别人）--- */
  const claim = { regId, ts: new Date().toISOString() };
  await Promise.all([
    store.setJSON("claims/name-" + nameKey + "/" + regId + ".json", claim),
    store.setJSON("claims/qq-" + qq + "/" + regId + ".json", claim),
    store.setJSON("claims/sid-" + tryNo + "/" + regId + ".json", claim),
  ]);

  /* --- 3. 等同一波竞争者落盘，再一次性裁决 --- */
  await new Promise(r => setTimeout(r, SETTLE_MS));

  const [nameList, qqList, sidList] = await Promise.all([
    claimants(store, "claims/name-" + nameKey + "/"),
    claimants(store, "claims/qq-" + qq + "/"),
    claimants(store, "claims/sid-" + tryNo + "/"),
  ]);

  async function bail(msg, status) {
    // 输了就撤掉自己的占位，别占着位置
    await Promise.all([
      store.delete("claims/name-" + nameKey + "/" + regId + ".json"),
      store.delete("claims/qq-" + qq + "/" + regId + ".json"),
      store.delete("claims/sid-" + tryNo + "/" + regId + ".json"),
    ]).catch(() => {});
    return json({ ok: false, error: msg }, status);
  }

  if (!nameList.length || nameList[0] !== regId) {
    return bail("这个用户名已经有人用了", 409);
  }
  if (!qqList.length || qqList[0] !== regId) {
    return bail("这个 QQ 号已经注册过了", 409);
  }

  /* --- 4. 算 SID：在 claimants 里的位置（1 起）--- */
  const rank = sidList.indexOf(regId) + 1;
  if (rank < 1) return bail("发号失败，请重试", 500);
  const sid = String(tryNo + rank - 1).padStart(5, "0");

  /* --- 5. 写快速查表 + 账号本体 + 号段提示，四件事一起发，省掉两次串行等待 --- */
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt, PBKDF2_ITER);
  const now = new Date().toISOString();

  const user = {
    regId, username, qq, sid,
    salt: b64url(salt), iter: PBKDF2_ITER, hash,
    createdAt: now,
  };

  const writes = [
    store.setJSON("idx/name-" + nameKey + ".json", { regId, sid }),
    store.setJSON("idx/qq-" + qq + ".json", { regId, sid }),
    store.setJSON("users/" + regId + ".json", user),
  ];
  /* 号段提示往上推；落后了也不要紧，claims 才是真源 */
  if (Number(sid) > baseSid) {
    writes.push(store.setJSON("meta/counter.json", { lastSid: Number(sid), updatedAt: now }));
  }
  await Promise.all(writes);

  /* --- 6. 直接发登录态，不用再登一次 --- */
  const token = await signSession(store, {
    uid: regId, sid, name: username, qq, exp: Date.now() + SESSION_DAYS * 24 * 3600 * 1000,
  });

  return json({ ok: true, sid, username, qq }, 200, { "Set-Cookie": sessionCookie(token) });
}

export async function onRequestGet() {
  return json({ ok: false, error: "请用 POST" }, 405);
}
