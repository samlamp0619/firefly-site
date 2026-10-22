/* 群管考核 · 开始作答（发放会话 + 截止时间）
 * ============================================================
 * 路由：POST /api/exam-start
 *
 * 为什么要服务端发会话：
 *   倒计时如果只靠前端，刷新页面就能重置。这里在进入考试时记一条
 *   sessions/<id>.json（含开始时间），交卷时用它判断是否超过 1 小时。
 *
 * 开放时间：北京时间 2026-10-24 全天
 *   北京 = UTC+8，所以是 UTC 2026-10-23T16:00 ~ 2026-10-24T16:00
 * ============================================================
 */
import { getStore } from "@edgeone/pages-blob";

const STORE_NAME = "exam";
const OPEN_AT = Date.parse("2026-10-23T16:00:00Z");   // 北京时间 10-24 00:00
const CLOSE_AT = Date.parse("2026-10-24T16:00:00Z");  // 北京时间 10-25 00:00
const DURATION_MS = 60 * 60 * 1000;                   // 1 小时

/* 预览令牌：和管理接口用同一个（submissions-token.txt）。
   带上它就跳过开放时间限制，用来在开考前自测整套流程。 */
const TOKEN_SHA256 = "dff03f44f4ce6b75c28bad292ce98ffafea8dfd95a951140e10dea8a1e10c67b";

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function isPreview(token) {
  if (!token) return false;
  try {
    return (await sha256Hex(token)) === TOKEN_SHA256;
  } catch {
    return false;
  }
}

export async function onRequestPost(context) {
  const now = Date.now();

  let preview = "";
  try {
    const body = await context.request.json();
    preview = String((body && body.preview) || "");
  } catch { /* 没有 body 就当作正常开始 */ }

  const isPreviewMode = await isPreview(preview);

  if (!isPreviewMode) {
    if (now < OPEN_AT) {
      return json({ ok: false, code: "NOT_OPEN", error: "考核尚未开放" }, 403);
    }
    if (now >= CLOSE_AT) {
      return json({ ok: false, code: "CLOSED", error: "考核已结束" }, 403);
    }
  }

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const startedAt = new Date(now).toISOString();

  try {
    const store = getStore(STORE_NAME);
    await store.setJSON(`sessions/${id}.json`, { id, startedAt, preview: isPreviewMode });
  } catch (e) {
    console.error("[exam-start] 写入失败", e && e.message, e && e.stack);
    return json({ ok: false, error: "开启失败，请刷新重试" }, 500);
  }

  return json({
    ok: true,
    sessionId: id,
    startedAt,
    deadline: new Date(now + DURATION_MS).toISOString(),
    durationMs: DURATION_MS,
    preview: isPreviewMode,
  });
}
