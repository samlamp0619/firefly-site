/**
 * 社区帖子：/api/community-posts
 *
 *   GET    ?cursor=<ts>&limit=12   信息流（所有人可看；登录了会带上「我赞过没」）
 *   POST   { body }                发帖（必须登录）
 *   DELETE ?id=<postId>            删自己的帖（管理员可以用 token 删任何人的）
 *
 * 键设计：posts/<13位时间戳>-<id>.json —— 键本身按时间可排序，
 * 所以 list 一次就能拿到「最新的在前」，不用读全部帖子再排。
 *
 * 点赞数/评论数是存在帖子记录里的缓存值（Blob 没有原子自增，并发下可能少记一两笔，
 * 管理员可以 recount 修正）；「我赞过没」以 likes/<id>/<我的regId> 这个文件为准，绝对准确。
 */
import { getStore } from "@edgeone/pages-blob";

const STORE = "community";
const AUTH_STORE = "users";
const TOKEN_SHA256 = "dff03f44f4ce6b75c28bad292ce98ffafea8dfd95a951140e10dea8a1e10c67b";
const MAX_BODY = 1000;
const FEED_LIMIT = 12;
const POST_COOLDOWN_MS = 60 * 1000;     // 同一人 1 分钟只能发 1 条

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

function hex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
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

/* ---------- 会话校验（密钥存在 users 库里，模块级缓存） ---------- */
let SECRET_CACHE = null;
async function getSecret() {
  if (SECRET_CACHE) return SECRET_CACHE;
  const store = getStore(AUTH_STORE);
  const cur = await store.get("meta/secret.json", { type: "json", consistency: "strong" });
  if (cur && cur.secret) { SECRET_CACHE = cur.secret; return SECRET_CACHE; }
  return null;   // 还没人注册过 → 不存在会话
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
    return p;   // { uid, sid, name, qq, exp }
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
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/* ---------- 信息流 ---------- */
async function feed(context, store) {
  const url = new URL(context.request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit"), 10) || FEED_LIMIT, 1), 30);
  const cursor = parseInt(url.searchParams.get("cursor"), 10) || 0;   // 只取比它更早的

  const me = await session(context.request);

  const r = await store.list({ prefix: "posts/", consistency: "strong" });
  /* 键形如 posts/1762000000000-abc123.json，按时间倒序 */
  let keys = r.blobs.map(b => b.key).filter(k => /^posts\/\d+-[a-z0-9]+\.json$/.test(k));
  keys.sort().reverse();
  if (cursor) keys = keys.filter(k => Number(k.slice(6).split("-")[0]) < cursor);
  const page = keys.slice(0, limit);

  const posts = await Promise.all(page.map(async key => {
    const p = await store.get(key, { type: "json", consistency: "strong" });
    if (!p) return null;

    /* 点赞数直接从 likes/<id>/ 下的文件数出来——不存计数器，
       所以永远准确，也不会因为并发丢掉某一票。 */
    let likeCount = 0;
    let liked = false;
    try {
      const lk = await store.list({ prefix: "likes/" + p.id + "/", consistency: "strong" });
      likeCount = lk.blobs.length;
      if (me) liked = lk.blobs.some(b => b.key.indexOf("/" + me.uid + ".json") > 0);
    } catch { /* 读不到就当 0，不影响别的 */ }

    return {
      id: p.id,
      ts: p.ts,
      name: p.name,
      sid: p.sid,
      body: p.body,
      likeCount,
      commentCount: Number(p.commentCount) || 0,
      liked,
      mine: !!(me && me.uid === p.regId),
    };
  }));

  return json({
    ok: true,
    loggedIn: !!me,
    posts: posts.filter(Boolean),
    nextCursor: page.length === limit ? Number(page[page.length - 1].slice(6).split("-")[0]) : 0,
  });
}

/* ---------- 发帖 ---------- */
async function create(context, store) {
  const me = await session(context.request);
  if (!me) return json({ ok: false, error: "请先登录" }, 401);

  let body;
  try { body = await context.request.json(); } catch { return json({ ok: false, error: "请求格式不对" }, 400); }

  const text = clean(body.body, MAX_BODY);
  if (!text) return json({ ok: false, error: "内容不能为空" }, 400);
  if (text.length < 2) return json({ ok: false, error: "多写几个字吧" }, 400);

  /* 频率限制 */
  const rlKey = "rl/" + me.uid + ".json";
  const rl = await store.get(rlKey, { type: "json", consistency: "strong" });
  const now = Date.now();
  if (rl && rl.lastPost && now - rl.lastPost < POST_COOLDOWN_MS) {
    const wait = Math.ceil((POST_COOLDOWN_MS - (now - rl.lastPost)) / 1000);
    return json({ ok: false, error: "发太快了，等 " + wait + " 秒再发" }, 429);
  }

  const id = newId();
  const post = {
    id, ts: now,
    regId: me.uid, name: me.name || "匿名", sid: me.sid || "",
    body: text, commentCount: 0,
  };

  await Promise.all([
    store.setJSON("posts/" + now + "-" + id + ".json", post),
    store.setJSON(rlKey, Object.assign({}, rl || {}, { lastPost: now })),
  ]);

  return json({ ok: true, post: {
    id, ts: now, name: post.name, sid: post.sid, body: text,
    likeCount: 0, commentCount: 0, liked: false, mine: true,
  } });
}

/* ---------- 删帖 ---------- */
async function remove(context, store) {
  const me = await session(context.request);
  const admin = await isAdmin(context.request);
  if (!me && !admin) return json({ ok: false, error: "请先登录" }, 401);

  const id = (new URL(context.request.url).searchParams.get("id") || "").replace(/[^a-z0-9]/g, "");
  if (!id) return json({ ok: false, error: "缺少帖子 id" }, 400);

  const r = await store.list({ prefix: "posts/", consistency: "strong" });
  const key = r.blobs.map(b => b.key).find(k => k.indexOf("-" + id + ".json") > 0);
  if (!key) return json({ ok: false, error: "帖子不存在" }, 404);

  const p = await store.get(key, { type: "json", consistency: "strong" });
  if (!p) return json({ ok: false, error: "帖子不存在" }, 404);
  if (!admin && p.regId !== me.uid) return json({ ok: false, error: "只能删自己的帖子" }, 403);

  await store.delete(key);
  return json({ ok: true, deleted: id });
}

export async function onRequestGet(context) {
  return feed(context, getStore(STORE));
}

export async function onRequestPost(context) {
  return create(context, getStore(STORE));
}

export async function onRequestDelete(context) {
  return remove(context, getStore(STORE));
}
