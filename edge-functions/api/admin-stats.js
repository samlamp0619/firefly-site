/**
 * 后台概览：GET /api/admin-stats?token=<管理员 token>
 *
 * 一次返回管理页面首屏要用的所有数字，避免前端发一堆请求。
 * 全部用 list() 数文件，不维护计数器 —— 所以永远和实际一致。
 *
 * 这个接口不开放给普通用户，只认管理员 token。
 */
import { getStore } from "@edgeone/pages-blob";

const USERS = "users";
const COMMUNITY = "community";
const CHAT = "chat";
const TOKEN_SHA256 = "dff03f44f4ce6b75c28bad292ce98ffafea8dfd95a951140e10dea8a1e10c67b";

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

/* 北京时间当天，形如 2026-11-08 */
function bjDay(offsetDays) {
  const t = new Date(Date.now() + 8 * 3600 * 1000 + (offsetDays || 0) * 86400000);
  return t.toISOString().slice(0, 10);
}

async function safeList(store, prefix) {
  try {
    const r = await store.list({ prefix, consistency: "strong" });
    return r.blobs.map(b => b.key);
  } catch {
    return [];
  }
}

export async function onRequestGet(context) {
  const token = new URL(context.request.url).searchParams.get("token") || "";
  if (!token || (await sha256Hex(token)) !== TOKEN_SHA256) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const userStore = getStore(USERS);
  const commStore = getStore(COMMUNITY);
  const chatStore = getStore(CHAT);

  /* 并行取各类键，任何一路失败都不拖垮整体 */
  const [userKeys, postKeys, commentKeys, likeKeys, quotaKeys, answerKeys, queueKeys] = await Promise.all([
    safeList(userStore, "users/"),
    safeList(commStore, "posts/"),
    safeList(commStore, "comments/"),
    safeList(commStore, "likes/"),
    safeList(chatStore, "quota/"),
    safeList(chatStore, "answers/"),
    safeList(chatStore, "queue/"),
  ]);

  const accountKeys = userKeys.filter(k => /^users\/[a-f0-9]{32}\.json$/.test(k));
  const posts = postKeys.filter(k => /^posts\/\d+-[a-z0-9]+\.json$/.test(k));

  /* 认证用户数：只读这一批账号，量不大 */
  let verifiedCount = 0;
  const sliced = accountKeys.slice(0, 200);
  const flags = await Promise.all(sliced.map(async k => {
    try {
      const u = await userStore.get(k, { type: "json", consistency: "strong" });
      return !!(u && u.verified);
    } catch { return false; }
  }));
  verifiedCount = flags.filter(Boolean).length;

  /* 今日聊天：quota/<regId>-<日期>.json 里的 count 相加 */
  const today = bjDay(0);
  const todayQuota = quotaKeys.filter(k => k.indexOf("-" + today + ".json") > 0);
  let todayChat = 0;
  const counts = await Promise.all(todayQuota.map(async k => {
    try {
      const q = await chatStore.get(k, { type: "json", consistency: "strong" });
      return Number(q && q.count) || 0;
    } catch { return 0; }
  }));
  todayChat = counts.reduce((a, b) => a + b, 0);

  /* 最近 7 天每天的发帖数：从键里的时间戳算，不用读文件 */
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = bjDay(-i);
    const from = Date.parse(d + "T00:00:00+08:00");
    const to = from + 86400000;
    const n = posts.filter(k => {
      const ts = Number(k.slice(6).split("-")[0]);
      return ts >= from && ts < to;
    }).length;
    days.push({ day: d.slice(5), count: n });
  }

  return json({
    ok: true,
    accounts: accountKeys.length,
    verified: verifiedCount,
    posts: posts.length,
    comments: commentKeys.length,
    likes: likeKeys.length,
    todayChat,
    chatPending: queueKeys.length,
    chatAnswered: answerKeys.length,
    week: days,
    serverNow: new Date().toISOString(),
    today,
  });
}

export async function onRequestPost() {
  return json({ ok: false, error: "请用 GET" }, 405);
}
