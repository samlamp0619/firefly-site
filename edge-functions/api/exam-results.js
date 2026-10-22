/* 群管考核 · 成绩读取 / 删除（只给自己用，带令牌）
 * ============================================================
 * GET    /api/exam-results?token=<令牌>          → 全部答卷，按分数从高到低
 * DELETE /api/exam-results?token=<令牌>&id=<id>  → 删除某一份（重考/作废用）
 *
 * 令牌与投稿接口共用同一个（submissions-token.txt），仓库里只存 sha256。
 * ============================================================
 */
import { getStore } from "@edgeone/pages-blob";

const STORE_NAME = "exam";
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

function sameHash(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function checkToken(token) {
  if (!token) return false;
  try {
    return sameHash(await sha256Hex(token), TOKEN_SHA256);
  } catch {
    return false;
  }
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const token = url.searchParams.get("token") || context.request.headers.get("x-token") || "";
  if (!token) return json({ ok: false, error: "缺少令牌" }, 401);
  if (!(await checkToken(token))) return json({ ok: false, error: "令牌不正确" }, 403);

  try {
    const store = getStore(STORE_NAME);
    const { blobs } = await store.list({ prefix: "records/", consistency: "strong" });

    const items = [];
    for (const b of blobs) {
      const rec = await store.get(b.key, { type: "json", consistency: "strong" });
      if (rec && rec.id) {
        // 只返回汇总需要的信息，不把逐题对错也传回去（表格里用不上）
        items.push({
          id: rec.id,
          qq: rec.qq,
          nickname: rec.nickname || "",
          score: rec.score,
          total: rec.total,
          percent: rec.percent,
          startedAt: rec.startedAt,
          submittedAt: rec.submittedAt,
          durationSec: rec.durationSec,
          // ⚠️ 这个字段必须带上：导出脚本靠它区分「预览自测」和「正式答卷」
          preview: rec.preview === true,
          feedback: rec.feedback || "",
        });
      }
    }
    // 分数高的在前；同分先交的在前
    items.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.submittedAt < b.submittedAt ? -1 : a.submittedAt > b.submittedAt ? 1 : 0;
    });

    return json({ ok: true, count: items.length, items });
  } catch (e) {
    console.error("[exam-results] 读取失败", e && e.message, e && e.stack);
    return json({ ok: false, error: "读取失败：" + (e && e.message ? e.message : "未知错误") }, 500);
  }
}

export async function onRequestDelete(context) {
  const url = new URL(context.request.url);
  const token = url.searchParams.get("token") || context.request.headers.get("x-token") || "";
  const id = (url.searchParams.get("id") || "").trim();

  if (!token) return json({ ok: false, error: "缺少令牌" }, 401);
  if (!(await checkToken(token))) return json({ ok: false, error: "令牌不正确" }, 403);
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return json({ ok: false, error: "id 格式不对" }, 400);

  try {
    const store = getStore(STORE_NAME);
    await store.delete(`records/${id}.json`);
    return json({ ok: true, deleted: id });
  } catch (e) {
    console.error("[exam-results] 删除失败", e && e.message);
    return json({ ok: false, error: "删除失败：" + (e && e.message ? e.message : "未知错误") }, 500);
  }
}
