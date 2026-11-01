/**
 * 退出：POST /api/auth-logout
 * 会话是无状态签名 Cookie，服务端没有会话表可清 —— 清掉客户端 Cookie 就够了。
 */
function json(obj, status = 200, extraHeaders) {
  const h = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (extraHeaders) Object.assign(h, extraHeaders);
  return new Response(JSON.stringify(obj), { status, headers: h });
}

export async function onRequestPost() {
  return json({ ok: true }, 200, {
    "Set-Cookie": "dsh_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
  });
}

export async function onRequestGet() {
  return json({ ok: true }, 200, {
    "Set-Cookie": "dsh_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
  });
}
