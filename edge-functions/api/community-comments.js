/**
 * 评论：/api/community-comments
 *
 *   GET  ?postId=<id>     列出某篇帖子的评论（所有人可看，按时间正序）
 *   POST { postId, body } 发评论（必须登录）
 *   DELETE ?id=<commentId> 删自己的评论（管理员可用 token 删任何人的）
 *
 * 键：comments/<postId>/<13位时间戳>-<commentId>.json —— 键可排序，list 出来就是正序。
 * 帖子记录里只存一个 commentCount 当缓存（显示用），真实条数以这里的文件数为准。
 */
import { getStore } from "@edgeone/pages-blob";

const STORE = "community";
const AUTH_STORE = "users";
const TOKEN_SHA256 = "dff03f44f4ce6b75c28bad292ce98ffafea8dfd95a951140e10dea8a1e10c67b";
const MAX_BODY = 300;
const MAX_PER_POST = 200;        // 单篇最多留这么多条，防止被刷爆
const COMMENT_COOLDOWN_MS = 15 * 1000;

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

async function isAdmin(request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!token) return false;
  return (await sha256Hex(token)) === TOKEN_SHA256;
}

function clean(v, max) {
  return String(v == null ? "" : v)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

function newId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/* 找到帖子本体（信息流里的键是 posts/<ts>-<id>.json） */
async function findPostKey(store, postId) {
  const r = await store.list({ prefix: "posts/", consistency: "strong" });
  return r.blobs.map(b => b.key).find(k => k.indexOf("-" + postId + ".json") > 0) || "";
}

async function listComments(context, store) {
  const url = new URL(context.request.url);
  const postId = (url.searchParams.get("postId") || "").replace(/[^a-z0-9]/g, "");
  if (!postId) return json({ ok: false, error: "缺少帖子 id" }, 400);

  const me = await session(context.request);
  const r = await store.list({ prefix: "comments/" + postId + "/", consistency: "strong" });
  const keys = r.blobs.map(b => b.key).sort();
  const items = await Promise.all(keys.map(async k => {
    const c = await store.get(k, { type: "json", consistency: "strong" });
    if (!c) return null;
    return {
      id: c.id, ts: c.ts, name: c.name, sid: c.sid, body: c.body,
      mine: !!(me && me.uid === c.regId),
    };
  }));
  return json({ ok: true, loggedIn: !!me, comments: items.filter(Boolean) });
}

async function create(context, store) {
  const me = await session(context.request);
  if (!me) return json({ ok: false, error: "请先登录" }, 401);

  let body;
  try { body = await context.request.json(); } catch { return json({ ok: false, error: "请求格式不对" }, 400); }

  const postId = String(body.postId || "").replace(/[^a-z0-9]/g, "");
  if (!postId) return json({ ok: false, error: "缺少帖子 id" }, 400);

  const text = clean(body.body, MAX_BODY);
  if (!text) return json({ ok: false, error: "评论不能为空" }, 400);

  /* 频率限制 */
  const rlKey = "rl/" + me.uid + ".json";
  const rl = await store.get(rlKey, { type: "json", consistency: "strong" });
  const now = Date.now();
  if (rl && rl.lastComment && now - rl.lastComment < COMMENT_COOLDOWN_MS) {
    const wait = Math.ceil((COMMENT_COOLDOWN_MS - (now - rl.lastComment)) / 1000);
    return json({ ok: false, error: "评论太快了，等 " + wait + " 秒" }, 429);
  }

  /* 帖子必须存在，顺便把评论数缓存 +1 */
  const postKey = await findPostKey(store, postId);
  if (!postKey) return json({ ok: false, error: "帖子不存在" }, 404);
  const post = await store.get(postKey, { type: "json", consistency: "strong" });
  if (!post) return json({ ok: false, error: "帖子不存在" }, 404);

  const existing = await store.list({ prefix: "comments/" + postId + "/", consistency: "strong" });
  if (existing.blobs.length >= MAX_PER_POST) {
    return json({ ok: false, error: "这篇帖子的评论太多了，不再接收新评论" }, 429);
  }

  const id = newId();
  const comment = { id, postId, ts: now, regId: me.uid, name: me.name || "匿名", sid: me.sid || "", body: text };

  await Promise.all([
    store.setJSON("comments/" + postId + "/" + now + "-" + id + ".json", comment),
    store.setJSON(postKey, Object.assign({}, post, { commentCount: existing.blobs.length + 1 })),
    store.setJSON(rlKey, Object.assign({}, rl || {}, { lastComment: now })),
  ]);

  return json({ ok: true, comment: { id, ts: now, name: comment.name, sid: comment.sid, body: text, mine: true } });
}

async function remove(context, store) {
  const me = await session(context.request);
  const admin = await isAdmin(context.request);
  if (!me && !admin) return json({ ok: false, error: "请先登录" }, 401);

  const url = new URL(context.request.url);
  const postId = (url.searchParams.get("postId") || "").replace(/[^a-z0-9]/g, "");
  const cid = (url.searchParams.get("id") || "").replace(/[^a-z0-9]/g, "");
  if (!postId || !cid) return json({ ok: false, error: "参数不全" }, 400);

  const r = await store.list({ prefix: "comments/" + postId + "/", consistency: "strong" });
  const key = r.blobs.map(b => b.key).find(k => k.indexOf("-" + cid + ".json") > 0);
  if (!key) return json({ ok: false, error: "评论不存在" }, 404);

  const c = await store.get(key, { type: "json", consistency: "strong" });
  if (!c) return json({ ok: false, error: "评论不存在" }, 404);
  if (!admin && c.regId !== me.uid) return json({ ok: false, error: "只能删自己的评论" }, 403);

  await store.delete(key);

  /* 顺手把帖子上的评论数改掉 */
  const postKey = await findPostKey(store, postId);
  if (postKey) {
    const post = await store.get(postKey, { type: "json", consistency: "strong" });
    if (post) {
      const left = Math.max(0, r.blobs.length - 1);
      await store.setJSON(postKey, Object.assign({}, post, { commentCount: left })).catch(() => {});
    }
  }

  return json({ ok: true, deleted: cid });
}

export async function onRequestGet(context) {
  return listComments(context, getStore(STORE));
}

export async function onRequestPost(context) {
  return create(context, getStore(STORE));
}

export async function onRequestDelete(context) {
  return remove(context, getStore(STORE));
}
