/* 投稿数据读取接口（只给自己用，带令牌）
 * ============================================================
 * 路由：GET /api/submissions?token=<令牌>
 *
 * 返回：{ ok: true, count: N, items: [ {id, song, singer, submitter, agree, at}, ... ] }
 *       按提交时间正序（老的在前）
 *
 * 鉴权：仓库里只存令牌的 sha256，反推不出原文，所以公开仓库也安全。
 *       令牌原文只存在你本机的 submissions-token.txt（已在 .gitignore 里）。
 *       想换令牌：改下面的 TOKEN_SHA256，然后重新部署。
 * ============================================================
 */
import { getStore } from "@edgeone/pages-blob";

const STORE_NAME = "submissions";
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

/* 用 Web Crypto 算 sha256（Edge Functions 是 Workers 风格运行时，
   不保证有 node:crypto，所以走标准的 crypto.subtle） */
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* 定长比较，避免通过响应时间猜测令牌（这里只是随手做对，不必过度设计） */
function sameHash(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const token = url.searchParams.get("token") || context.request.headers.get("x-token") || "";
  if (!token) return json({ ok: false, error: "缺少令牌" }, 401);

  let given;
  try {
    given = await sha256Hex(token);
  } catch {
    return json({ ok: false, error: "服务器不支持摘要计算" }, 500);
  }
  if (!sameHash(given, TOKEN_SHA256)) {
    return json({ ok: false, error: "令牌不正确" }, 403);
  }

  try {
    const store = getStore(STORE_NAME);
    // 强一致：刚提交的投稿也要立刻能读到
    const { blobs } = await store.list({ prefix: "items/", consistency: "strong" });

    const items = [];
    for (const b of blobs) {
      const rec = await store.get(b.key, { type: "json", consistency: "strong" });
      if (rec && rec.id) items.push(rec);
    }
    items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

    return json({ ok: true, count: items.length, items });
  } catch (e) {
    console.error("[submissions] 读取失败", e && e.message, e && e.stack);
    return json({ ok: false, error: "读取失败：" + (e && e.message ? e.message : "未知错误") }, 500);
  }
}
