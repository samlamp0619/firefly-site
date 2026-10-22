/* 歌曲投稿提交接口
 * ============================================================
 * 路由：POST /api/submit        （由 ./edge-functions/api/submit.js 自动生成）
 *
 * 存储：EdgeOne Blob，命名空间 "submissions"
 *   - 首次调用 getStore() 时平台会自动创建这个命名空间，无需任何配置
 *   - 每条投稿写成一个独立对象 items/<时间戳>-<随机>.json
 *     之所以不用一个总文件：Blob 是最终一致（60 秒），多人同时投稿时
 *     「读-改-写」同一个文件会互相覆盖丢数据；一条一个对象没这个问题。
 *
 * 防刷：
 *   - 蜜罐字段 website：正常人看不到，填了就是机器人（假装成功，不给反馈）
 *   - 拒绝包含网址的内容（正常投稿不需要链接）
 *   - 长度上限 + 必填校验 + 授权勾选必须为 true
 * ============================================================
 */
import { getStore } from "@edgeone/pages-blob";

const STORE_NAME = "submissions";
const MAX_LEN = { song: 60, singer: 60, submitter: 40 };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS,
    },
  });
}

/* 去掉控制字符和首尾空白，顺便把全角空格也算作空白 */
function clean(v) {
  return String(v == null ? "" : v)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\u3000]/g, " ")
    .trim();
}

/* 正常投稿不会带网址，带了基本都是广告/机器人 */
const HAS_URL = /(https?:\/\/|www\.|\.com\/|\.cn\/|\.net\/)/i;

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "请求格式不正确" }, 400);
  }
  if (!body || typeof body !== "object") {
    return json({ ok: false, error: "请求格式不正确" }, 400);
  }

  // 蜜罐：只有自动化脚本会填这一栏。假装成功，别让它知道被识破了。
  if (clean(body.website)) return json({ ok: true });

  const song = clean(body.song);
  const singer = clean(body.singer);
  const submitter = clean(body.submitter);

  if (!song) return json({ ok: false, error: "请填写歌曲名" }, 400);
  if (!singer) return json({ ok: false, error: "请填写原唱" }, 400);
  if (!submitter) return json({ ok: false, error: "请填写投稿人昵称" }, 400);

  if (song.length > MAX_LEN.song) return json({ ok: false, error: `歌曲名请控制在 ${MAX_LEN.song} 字以内` }, 400);
  if (singer.length > MAX_LEN.singer) return json({ ok: false, error: `原唱请控制在 ${MAX_LEN.singer} 字以内` }, 400);
  if (submitter.length > MAX_LEN.submitter) return json({ ok: false, error: `投稿人请控制在 ${MAX_LEN.submitter} 字以内` }, 400);

  if (body.agree !== true) {
    return json({ ok: false, error: "请先勾选授权确认" }, 400);
  }

  if (HAS_URL.test(song) || HAS_URL.test(singer) || HAS_URL.test(submitter)) {
    return json({ ok: false, error: "内容里不能包含网址" }, 400);
  }

  // 时间戳 + 随机后缀，保证 key 唯一（同一秒多人提交也不会撞）
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const rand = Math.random().toString(36).slice(2, 8);
  const id = `${stamp}-${rand}`;
  const key = `items/${id}.json`;

  const record = {
    id,
    song,
    singer,
    submitter,
    agree: true,
    at: now.toISOString(),
  };

  try {
    const store = getStore(STORE_NAME);
    await store.setJSON(key, record);
  } catch (e) {
    console.error("[submit] 写入失败", e && e.message, e && e.stack);
    return json({ ok: false, error: "保存失败了，请稍后再试一次" }, 500);
  }

  return json({ ok: true, id });
}
