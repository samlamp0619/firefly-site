/**
 * 登录：POST /api/auth-login
 * 入参 JSON：{ account, password }   —— account 可以是用户名，也可以是 QQ 号
 * 出参：{ ok, sid, username, qq }
 *
 * 失败锁定：同一账号连续错 5 次，锁 10 分钟。计数存在 Blob 的 meta/fail-* 里。
 * （每次 Blob 读写 300ms 上下，加上 PBKDF2 10 万次约 60ms，暴力破解本来就快不起来，
 *   锁定只是再加一道。）
 */
import { getStore } from "@edgeone/pages-blob";

const STORE = "users";
const SESSION_DAYS = 30;
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;

const enc = new TextEncoder();

function json(obj, status = 200, extraHeaders) {
  const h = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (extraHeaders) Object.assign(h, extraHeaders);
  return new Response(JSON.stringify(obj), { status, headers: h });
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

function b64urlDecode(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hashPassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return hex(bits);
}

let SECRET_CACHE = null;
async function getSecret(store) {
  if (SECRET_CACHE) return SECRET_CACHE;
  const cur = await store.get("meta/secret.json", { type: "json", consistency: "strong" });
  if (cur && cur.secret) { SECRET_CACHE = cur.secret; return SECRET_CACHE; }
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

export async function onRequestPost(context) {
  const store = getStore(STORE);

  let body;
  try { body = await context.request.json(); } catch { return json({ ok: false, error: "请求格式不对" }, 400); }

  const account = String(body.account == null ? "" : body.account).trim().slice(0, 40);
  const password = String(body.password == null ? "" : body.password);
  if (!account || !password) return json({ ok: false, error: "账号和密码都要填" }, 400);

  /* --- 失败锁定检查 --- */
  const failKey = "meta/fail-" + (await sha256Hex(account.toLowerCase())) + ".json";
  const failRec = await store.get(failKey, { type: "json", consistency: "strong" });
  if (failRec && failRec.until && Date.now() < failRec.until) {
    const mins = Math.ceil((failRec.until - Date.now()) / 60000);
    return json({ ok: false, error: "密码错太多次了，请 " + mins + " 分钟后再试" }, 429);
  }

  async function recordFail() {
    const count = ((failRec && failRec.count) || 0) + 1;
    const rec = { count, until: count >= MAX_FAILS ? Date.now() + LOCK_MS : 0, at: new Date().toISOString() };
    await store.setJSON(failKey, rec).catch(() => {});
  }

  /* --- 查账号：纯数字当 QQ 查，否则当用户名查 --- */
  const isQQ = /^\d{5,12}$/.test(account);
  const lookupKey = isQQ
    ? "idx/qq-" + account + ".json"
    : "idx/name-" + (await sha256Hex(account.toLowerCase())) + ".json";

  const idx = await store.get(lookupKey, { type: "json", consistency: "strong" });
  if (!idx || !idx.regId) {
    await recordFail();
    return json({ ok: false, error: "账号或密码不对" }, 401);
  }

  const user = await store.get("users/" + idx.regId + ".json", { type: "json", consistency: "strong" });
  if (!user || !user.hash) {
    await recordFail();
    return json({ ok: false, error: "账号或密码不对" }, 401);
  }

  const got = await hashPassword(password, b64urlDecode(user.salt), user.iter || 100000);
  /* 定长比较，别用 ===（时序侧信道） */
  let diff = 0;
  const a = got, b = String(user.hash);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  if (diff !== 0) {
    await recordFail();
    return json({ ok: false, error: "账号或密码不对" }, 401);
  }

  /* 登录成功 → 清掉失败计数 */
  if (failRec) await store.delete(failKey).catch(() => {});

  const token = await signSession(store, {
    uid: user.regId, sid: user.sid, name: user.username,
    exp: Date.now() + SESSION_DAYS * 24 * 3600 * 1000,
  });

  return json(
    { ok: true, sid: user.sid, username: user.username, qq: user.qq },
    200,
    { "Set-Cookie": sessionCookie(token) }
  );
}

export async function onRequestGet() {
  return json({ ok: false, error: "请用 POST" }, 405);
}
