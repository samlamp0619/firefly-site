/**
 * 桥接端点（给家里那台电脑上的脚本用）：/api/chat-bridge?token=<管理员 token>
 *
 *   GET               取待回答的消息，最多 10 条；取走即从队列删除
 *   POST { id, text } 写回 bot 的回复
 *   POST { id, error } 写回错误（AstrBot 挂了 / 超时）
 *
 * 取走即删是「至多一次」：脚本如果在处理途中崩了，这条消息就丢了，
 * 用户会一直转圈。所以脚本要尽量别崩，并且把超时当成错误回写。
 */
import { getStore } from "@edgeone/pages-blob";

const STORE = "chat";
const TOKEN_SHA256 = "dff03f44f4ce6b75c28bad292ce98ffafea8dfd95a951140e10dea8a1e10c67b";
const BATCH = 10;

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

async function authorize(context) {
  const token = new URL(context.request.url).searchParams.get("token") || "";
  if (!token) return false;
  return (await sha256Hex(token)) === TOKEN_SHA256;
}

/* ---------- 取待回答的消息 ---------- */
export async function onRequestGet(context) {
  if (!(await authorize(context))) return json({ ok: false, error: "unauthorized" }, 401);

  const store = getStore(STORE);
  const r = await store.list({ prefix: "queue/", consistency: "strong" });
  const keys = r.blobs.map(b => b.key).sort().slice(0, BATCH);

  const items = [];
  for (const key of keys) {
    const m = await store.get(key, { type: "json", consistency: "strong" });
    if (!m) continue;
    items.push({
      id: m.id,
      text: m.text,
      sessionId: m.sessionId,
      sid: m.sid,
      name: m.name,
    });
    /* 取走即删，避免下一轮又拿到同一条 */
    await store.delete(key).catch(() => {});
  }

  return json({ ok: true, count: items.length, items });
}

/* ---------- 写回回复 ---------- */
export async function onRequestPost(context) {
  if (!(await authorize(context))) return json({ ok: false, error: "unauthorized" }, 401);

  let body;
  try { body = await context.request.json(); } catch { return json({ ok: false, error: "请求格式不对" }, 400); }

  const id = String(body.id || "").replace(/[^a-z0-9]/g, "");
  if (!id) return json({ ok: false, error: "缺少消息 id" }, 400);

  const text = String(body.text == null ? "" : body.text).trim().slice(0, 8000);
  const error = String(body.error == null ? "" : body.error).trim().slice(0, 500);

  if (!text && !error) return json({ ok: false, error: "回复是空的" }, 400);

  await getStore(STORE).setJSON("answers/" + id + ".json", {
    id,
    text,
    error,
    ts: Date.now(),
  });

  return json({ ok: true, id });
}
