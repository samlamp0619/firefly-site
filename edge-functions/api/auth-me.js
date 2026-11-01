/**
 * 当前会话：GET /api/auth-me
 * 出参：{ ok, loggedIn: true, sid, username, uid } 或 { ok, loggedIn: false }
 *
 * 会话是 HMAC 签名 Cookie，所以**校验不查库**——只验签 + 看是否过期。
 * 签名密钥存在 Blob 里（只有服务端能读），模块级缓存，热实例不用重复读。
 *
 * ⚠️ 已知取舍：这里只信 Cookie 里的内容，不回头查用户是否还存在于库里。
 *    以后要做「删号立即失效」时，再加一个 Blob 读即可（约 300ms）。
 */
import { getStore } from "@edgeone/pages-blob";

const STORE = "users";
const enc = new TextEncoder();

function json(obj, status = 200, extraHeaders) {
  const h = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (extraHeaders) Object.assign(h, extraHeaders);
  return new Response(JSON.stringify(obj), { status, headers: h });
}

function b64url(bytes) {
  const arr = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

let SECRET_CACHE = null;
async function getSecret(store) {
  if (SECRET_CACHE) return SECRET_CACHE;
  const cur = await store.get("meta/secret.json", { type: "json", consistency: "strong" });
  if (cur && cur.secret) { SECRET_CACHE = cur.secret; return SECRET_CACHE; }
  /* 还没人注册过，也就不会有会话——生成一个空密钥即可，注册时会写入正式密钥 */
  const fresh = hex(crypto.getRandomValues(new Uint8Array(32)));
  await store.setJSON("meta/secret.json", { secret: fresh, createdAt: new Date().toISOString() });
  SECRET_CACHE = fresh;
  return fresh;
}

export async function onRequestGet(context) {
  const store = getStore(STORE);
  const token = readCookie(context.request, "dsh_session");
  if (!token || token.indexOf(".") < 0) return json({ ok: true, loggedIn: false });

  const dot = token.indexOf(".");
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let valid = false;
  try {
    const secret = await getSecret(store);
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    valid = await crypto.subtle.verify("HMAC", key, b64urlDecode(sig), enc.encode(body));
  } catch {
    valid = false;
  }
  if (!valid) {
    return json({ ok: true, loggedIn: false }, 200, {
      "Set-Cookie": "dsh_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    });
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  } catch {
    return json({ ok: true, loggedIn: false });
  }

  if (!payload || !payload.uid || !payload.exp || Date.now() > payload.exp) {
    return json({ ok: true, loggedIn: false }, 200, {
      "Set-Cookie": "dsh_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    });
  }

  return json({
    ok: true,
    loggedIn: true,
    uid: payload.uid,
    sid: payload.sid,
    username: payload.name,
    qq: payload.qq || "",
  });
}

export async function onRequestPost() {
  return json({ ok: false, error: "请用 GET" }, 405);
}
