/**
 * 点赞：POST /api/community-like  { postId }
 *
 * 一人一票，再点一次取消。票存在 likes/<postId>/<regId>.json ——
 * **文件名就是用户 id，所以写入天然幂等**，重复请求不会多算一票。
 *
 * 点赞数不存计数器，由 community-posts 在信息流里直接数文件个数，
 * 所以并发下不会出现「点了没加上」或「取消不了」的错账。
 */
import { getStore } from "@edgeone/pages-blob";

const STORE = "community";
const AUTH_STORE = "users";

const enc = new TextEncoder();

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function b64urlDecode(str) {
  const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
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
async function getSecret() {
  if (SECRET_CACHE) return SECRET_CACHE;
  const store = getStore(AUTH_STORE);
  const cur = await store.get("meta/secret.json", { type: "json", consistency: "strong" });
  if (cur && cur.secret) { SECRET_CACHE = cur.secret; return SECRET_CACHE; }
  return null;
}

async function session(request) {
  const token = readCookie(request, "dsh_session");
  if (!token || token.indexOf(".") < 0) return null;
  const dot = token.indexOf(".");
  const body = token.slice(0, dot);
  const secret = await getSecret();
  if (!secret) return null;
  try {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(token.slice(dot + 1)), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (!p || !p.uid || !p.exp || Date.now() > p.exp) return null;
    return p;
  } catch {
    return null;
  }
}

export async function onRequestPost(context) {
  const me = await session(context.request);
  if (!me) return json({ ok: false, error: "请先登录" }, 401);

  let body;
  try { body = await context.request.json(); } catch { return json({ ok: false, error: "请求格式不对" }, 400); }

  const postId = String(body.postId || "").replace(/[^a-z0-9]/g, "");
  if (!postId) return json({ ok: false, error: "缺少帖子 id" }, 400);

  const store = getStore(STORE);
  const key = "likes/" + postId + "/" + me.uid + ".json";

  const cur = await store.get(key, { type: "json", consistency: "strong" });
  if (cur) {
    await store.delete(key);
    const lk = await store.list({ prefix: "likes/" + postId + "/", consistency: "strong" });
    return json({ ok: true, liked: false, likeCount: lk.blobs.length });
  }

  await store.setJSON(key, { ts: Date.now() });
  const lk = await store.list({ prefix: "likes/" + postId + "/", consistency: "strong" });
  return json({ ok: true, liked: true, likeCount: lk.blobs.length });
}

export async function onRequestGet() {
  return json({ ok: false, error: "请用 POST" }, 405);
}
