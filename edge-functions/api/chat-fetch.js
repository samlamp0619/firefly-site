/**
 * 取 bot 的回复：GET /api/chat-fetch?id=<消息id>
 *
 *   { ok:true, ready:false }                    还没好，继续轮询
 *   { ok:true, ready:true, text:"…" }           好了
 *   { ok:true, ready:true, error:"…" }          桥接那边出错了
 *
 * 不需要登录：消息 id 是 16 位随机串，猜不到；而且只返回这条消息的回复。
 */
import { getStore } from "@edgeone/pages-blob";

const STORE = "chat";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function onRequestGet(context) {
  const id = (new URL(context.request.url).searchParams.get("id") || "").replace(/[^a-z0-9]/g, "");
  if (!id) return json({ ok: false, error: "缺少消息 id" }, 400);

  const a = await getStore(STORE).get("answers/" + id + ".json", { type: "json", consistency: "strong" });
  if (!a) return json({ ok: true, ready: false });

  return json({
    ok: true,
    ready: true,
    text: a.text || "",
    error: a.error || "",
    ts: a.ts || 0,
  });
}

export async function onRequestPost() {
  return json({ ok: false, error: "请用 GET" }, 405);
}
