/**
 * 查某个发言者的 QQ 号 / SID / 黄V：GET /api/community-user?postId=<帖子id>[&commentId=<评论id>]
 *
 * 社区界面默认只显示用户名，点一下才展开这些信息。
 *
 * ⚠️ 必须登录才能查——否则等于把全站用户的 QQ 号公开给任何人爬。
 * 只返回 username / sid / qq / verified，不返回 regId。
 */
import { getStore } from "@edgeone/pages-blob";

const COMMUNITY = "community";
const USERS = "users";

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
  /* 读会话密钥重试一次：冷启动时 Blob 偶发读失败会被当成「没登录」，
     于是用户明明登录着却收到 401 —— 这类假 401 就是这么来的。 */
  for (let i = 0; i < 2; i++) {
    try {
    const cur = await getStore(USERS).get("meta/secret.json", { type: "json", consistency: "strong" });
      if (cur && cur.secret) { SECRET_CACHE = cur.secret; return SECRET_CACHE; }
    } catch { /* 再试一次 */ }
  }
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

function safeId(v) {
  return String(v || "").replace(/[^a-zA-Z0-9]/g, "");
}

async function findKey(store, prefix, id) {
  const r = await store.list({ prefix, consistency: "strong" });
  return r.blobs.map(b => b.key).find(k => k.indexOf("-" + id + ".json") > 0) || "";
}

export async function onRequestGet(context) {
  const me = await session(context.request);
  if (!me) return json({ ok: false, error: "登录后才能查看" }, 401);

  const url = new URL(context.request.url);
  const postId = safeId(url.searchParams.get("postId"));
  const commentId = safeId(url.searchParams.get("commentId"));
  if (!postId) return json({ ok: false, error: "缺少帖子 id" }, 400);

  const store = getStore(COMMUNITY);
  let regId = "";

  if (commentId) {
    const key = await findKey(store, "comments/" + postId + "/", commentId);
    if (!key) return json({ ok: false, error: "评论不存在" }, 404);
    const c = await store.get(key, { type: "json", consistency: "strong" });
    if (!c) return json({ ok: false, error: "评论不存在" }, 404);
    regId = c.regId;
  } else {
    const key = await findKey(store, "posts/", postId);
    if (!key) return json({ ok: false, error: "帖子不存在" }, 404);
    const p = await store.get(key, { type: "json", consistency: "strong" });
    if (!p) return json({ ok: false, error: "帖子不存在" }, 404);
    regId = p.regId;
  }

  if (!regId) return json({ ok: false, error: "找不到作者" }, 404);

  const u = await getStore(USERS).get("users/" + regId + ".json", { type: "json", consistency: "strong" });
  if (!u) return json({ ok: false, error: "作者账号已不存在" }, 404);

  return json({
    ok: true,
    username: u.username || "",
    sid: u.sid || "",
    qq: u.qq || "",
    verified: !!u.verified,
  });
}

export async function onRequestPost() {
  return json({ ok: false, error: "请用 GET" }, 405);
}
