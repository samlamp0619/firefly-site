/**
 * 发消息给 bot：POST /api/chat-send  { text }
 * 出参：{ ok, id, remaining }
 *
 * 流程：写进 queue/ 队列 → 家里的桥接脚本取走 → 本地问 AstrBot → 写 answers/
 * 前端再轮询 /api/chat-fetch?id= 拿结果。
 *
 * 每天限额：普通用户 15 条，黄V 300 条（防止账号被盗后刷爆模型额度）。
 * 日期按北京时间算，不用运行时默认时区。
 */
import { getStore } from "@edgeone/pages-blob";

const STORE = "chat";
const AUTH_STORE = "users";
const MAX_TEXT = 500;
const DAILY_NORMAL = 15;
const DAILY_VERIFIED = 300;

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
  const cur = await getStore(AUTH_STORE).get("meta/secret.json", { type: "json", consistency: "strong" });
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

/* 北京时间当天，形如 2026-11-02 */
function bjDay() {
  const t = new Date(Date.now() + 8 * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}

function clean(v, max) {
  return String(v == null ? "" : v)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

export async function onRequestPost(context) {
  const me = await session(context.request);
  if (!me) return json({ ok: false, error: "登录后才能和 bot 聊天" }, 401);

  let body;
  try { body = await context.request.json(); } catch { return json({ ok: false, error: "请求格式不对" }, 400); }

  const text = clean(body.text, MAX_TEXT);
  if (!text) return json({ ok: false, error: "说点什么吧" }, 400);
  if (text.length < 1) return json({ ok: false, error: "说点什么吧" }, 400);

  const store = getStore(STORE);
  const userStore = getStore(AUTH_STORE);

  /* 额度：黄V 宽松得多，普通用户每天 15 条 */
  const user = await userStore.get("users/" + me.uid + ".json", { type: "json", consistency: "strong" });
  const verified = !!(user && user.verified);
  const limit = verified ? DAILY_VERIFIED : DAILY_NORMAL;

  const day = bjDay();
  const quotaKey = "quota/" + me.uid + "-" + day + ".json";
  const quota = await store.get(quotaKey, { type: "json", consistency: "strong" });
  const used = (quota && Number(quota.count)) || 0;

  if (used >= limit) {
    return json({
      ok: false,
      error: verified
        ? "今天聊得有点多啦，明天再来吧～"
        : "普通用户每天 " + DAILY_NORMAL + " 条，今天用完了。认证（黄V）用户可以聊更多。",
      remaining: 0,
      limit,
      verified,
    }, 429);
  }

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const now = Date.now();

  await Promise.all([
    store.setJSON("queue/" + now + "-" + id + ".json", {
      id, ts: now, text,
      regId: me.uid, sid: me.sid || "", name: me.name || "",
      /* 每个用户一个固定 session，让 AstrBot 记住上下文 */
      sessionId: "web-" + me.uid,
    }),
    store.setJSON(quotaKey, { count: used + 1, day, updatedAt: new Date(now).toISOString() }),
  ]);

  return json({ ok: true, id, remaining: limit - used - 1, limit, verified });
}

export async function onRequestGet() {
  return json({ ok: false, error: "请用 POST" }, 405);
}
