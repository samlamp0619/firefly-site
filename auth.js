/* 账号状态：全站唯一的登录状态来源
 * ============================================================
 * 会话就是一个签名 Cookie（HttpOnly，JS 读不到也改不了），
 * 所以这里不存任何凭据，每次打开页面问一次 /api/auth-me。
 *
 * 这个文件只负责三件事：
 *   1. 查一次会话，广播出去（window.__auth + auth:change 事件）
 *   2. 左下角徽标显示「登录」或「SID 00001」
 *   3. 点徽标跳到设置页
 *
 * 登录 / 注册 / 退出的表单在设置页（settings.html），由 settings.js 处理。
 * 以前三个页面各塞一份弹窗，登录状态还要在社区的 chat 里同步，
 * 现在集中到设置页，页面里只剩这一个状态灯。
 * ============================================================
 */
(() => {
  "use strict";

  const badge = document.getElementById("sid-badge");
  const label = document.getElementById("sid-badge-label");
  const value = document.getElementById("sid-badge-value");

  let me = null;

  /* ---------- 广播 ---------- */

  function publish() {
    const state = me
      ? { loggedIn: true, sid: me.sid || "", username: me.username || "", qq: me.qq || "" }
      : { loggedIn: false, sid: "", username: "", qq: "" };
    window.__auth = state;
    document.dispatchEvent(new CustomEvent("auth:change", { detail: state }));
  }

  function setState(next) {
    me = next;
    renderBadge();
    publish();
  }

  /* ---------- 左下角徽标 ---------- */

  function renderBadge() {
    if (!badge || !label || !value) return;
    if (me && me.sid) {
      label.textContent = "SID";
      value.textContent = me.sid;
      value.hidden = false;
      badge.classList.add("is-signed-in");
      badge.title = "已登录：" + (me.username || "") + "，点开设置";
    } else {
      label.textContent = "登录";
      value.hidden = true;
      badge.classList.remove("is-signed-in");
      badge.title = "登录或注册";
    }
  }

  if (badge) {
    badge.addEventListener("click", () => {
      /* 已在设置页就不跳了，免得死循环 */
      if (document.body.dataset.page === "settings") return;
      const next = encodeURIComponent(location.pathname.split("/").pop() || "index.html");
      location.href = "settings.html?next=" + next + (me ? "#account" : "#login");
    });
  }

  /* ---------- 对外接口（设置页用） ---------- */

  window.DSH_AUTH = {
    get user() { return me; },
    /* 设置页登录成功后调用，把状态同步到全站 */
    apply(user) {
      setState(user
        ? { username: user.username || "", sid: user.sid || "", qq: user.qq || "" }
        : null);
    },
    refresh() { return check(); },
  };

  /* ---------- 查会话 ---------- */

  async function check() {
    try {
      const res = await fetch("/api/auth-me", { credentials: "same-origin", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      /* transient 表示服务端这次没验成（存储抖动），不代表登录失效 */
      if (data && data.transient) return;
      if (data && data.loggedIn) {
        setState({ username: data.username || "", sid: data.sid || "", qq: data.qq || "" });
      }
    } catch { /* 接口挂了就当没登录 */ }
  }

  /* ---------- 初始化 ---------- */

  setState(null);     // 先广播「未登录」，订阅方立刻能渲染正确形态
  check();

  /* 标签页重新可见时复查：用户在别处登出 / Cookie 被清掉，界面能跟上。
     只是同步，不会主动踢人。 */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (document.body.dataset.page === "settings") return;   // 设置页有自己的一套
    check();
  });
})();
