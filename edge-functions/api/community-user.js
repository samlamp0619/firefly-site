/**
 * 查某个发言者的 QQ 号和 SID：GET /api/community-user?postId=<帖子id>[&commentId=<评论id>]
 *
 * 社区界面默认只显示用户名，点一下才展开 QQ 和 SID —— 所以这个接口
 * 必须能按「帖子」或「评论」反查到作者。
 *
 * 只返回 username / sid / qq，不返回 regId。
 * ⚠️ 这等于把 QQ 号对看帖的人公开了，被爬的话拦不住。
 */
import { getStore } from "@edgeone/pages-blob";

const COMMUNITY = "community";
const USERS = "users";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function safeId(v) {
  return String(v || "").replace(/[^a-zA-Z0-9]/g, "");
}

async function findKey(store, prefix, id) {
  const r = await store.list({ prefix, consistency: "strong" });
  return r.blobs.map(b => b.key).find(k => k.indexOf("-" + id + ".json") > 0) || "";
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const postId = safeId(url.searchParams.get("postId"));
  const commentId = safeId(url.searchParams.get("commentId"));
  if (!postId) return json({ ok: false, error: "缺少帖子 id" }, 400);

  const store = getStore(COMMUNITY);

  /* 先确定要查谁的 regId */
  let regId = "";
  if (commentId) {
    const key = await findKey(store, "comments/" + postId + "/", commentId);
    if (!key) return json({ ok: false, error: "评论不存在" }, 404);
    const c = await store.get(key, { type: "json", consistency: "strong" });
    if (!c) return json({ ok: false, error: "评论不存在" }, 404);
    regId = c.regId;
  } else {
    const key = await findKey(store, "posts/", postId);
    if (!key) return json({ ok: false, error: "帖子不存在" }, 404);
    const p = await store.get(key, { type: "json", consistency: "strong" });
    if (!p) return json({ ok: false, error: "帖子不存在" }, 404);
    regId = p.regId;
  }

  if (!regId) return json({ ok: false, error: "找不到作者" }, 404);

  const u = await getStore(USERS).get("users/" + regId + ".json", { type: "json", consistency: "strong" });
  if (!u) return json({ ok: false, error: "作者账号已不存在" }, 404);

  return json({
    ok: true,
    username: u.username || "",
    sid: u.sid || "",
    qq: u.qq || "",
  });
}

export async function onRequestPost() {
  return json({ ok: false, error: "请用 GET" }, 405);
}
