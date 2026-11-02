/* 账号系统前端：登录 / 注册 / 我的账号
 * ============================================================
 * 会话就是一个签名 Cookie（HttpOnly，JS 读不到也改不了），
 * 所以这里不存任何凭据，每次打开页面问一次 /api/auth-me。
 *
 * 后端：
 *   POST /api/auth-register  { username, qq, password }
 *   POST /api/auth-login     { account, password }   account 可填用户名或 QQ 号
 *   POST /api/auth-logout
 *   GET  /api/auth-me
 * ============================================================
 */
(() => {
  "use strict";

  /* 账号入口在左下角的徽标上：未登录显示「登录」，登录后显示「SID 00001」。
     顶部导航已经排满，塞不下一个按钮。 */
  const btn = document.getElementById("sid-badge");
  const overlay = document.getElementById("auth-overlay");
  if (!btn || !overlay) return;

  const el = {
    badge: document.getElementById("sid-badge"),
    badgeLabel: document.getElementById("sid-badge-label"),
    badgeValue: document.getElementById("sid-badge-value"),
    close: document.getElementById("auth-close"),
    title: document.getElementById("auth-modal-title"),
    forms: document.getElementById("auth-forms"),
    account: document.getElementById("auth-account-view"),
    form: document.getElementById("auth-form"),
    tabs: Array.from(document.querySelectorAll(".auth-tab")),
    accountLabel: document.getElementById("auth-account-label"),
    accountInput: document.getElementById("auth-account"),
    qqField: document.getElementById("auth-qq-field"),
    qqInput: document.getElementById("auth-qq"),
    passwordLabel: document.getElementById("auth-password-label"),
    passwordInput: document.getElementById("auth-password"),
    msg: document.getElementById("auth-msg"),
    submit: document.getElementById("auth-submit"),
    logout: document.getElementById("auth-logout"),
    myName: document.getElementById("auth-my-name"),
    mySid: document.getElementById("auth-my-sid"),
    myQq: document.getElementById("auth-my-qq"),
  };

  let mode = "login";        // login | register
  let me = null;             // 当前登录用户
  let busy = false;

  /* ---------- 小工具 ---------- */

  function setMsg(text, kind) {
    el.msg.textContent = text || "";
    el.msg.className = "auth-msg" + (kind ? " is-" + kind : "");
  }

  async function api(path, body) {
    const opt = body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : { method: "GET" };
    const res = await fetch(path, Object.assign({ credentials: "same-origin", cache: "no-store" }, opt));
    let data = {};
    try { data = await res.json(); } catch { /* 忽略 */ }
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || "请求失败（" + res.status + "）");
    }
    return data;
  }

  /* tab 上写「登录 / 注册」，提交按钮写「登录账号 / 注册账号」——
     两处原本都叫「注册」，点上面那个 tab 会毫无反应，很容易误以为按钮坏了 */
  function submitLabel() {
    return mode === "login" ? "登录账号" : "注册账号";
  }

  function setBusy(on, text) {
    busy = on;
    el.submit.disabled = on;
    el.submit.textContent = on ? (text || "处理中…") : submitLabel();
  }

  /* ---------- 界面状态 ---------- */

  function applyMode(next) {
    mode = next;
    el.tabs.forEach(t => {
      const on = t.dataset.mode === next;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    const isReg = next === "register";
    el.qqField.hidden = !isReg;
    /* 登录只要用户名——QQ 号只在注册时填一次，用来保证一号一人。
       （后端其实也认 QQ 号，留着当兜底，界面不宣传。） */
    el.accountLabel.textContent = "用户名";
    el.accountInput.autocomplete = isReg ? "nickname" : "username";
    el.accountInput.placeholder = isReg ? "2~20 个字" : "注册时填的用户名";
    el.passwordLabel.innerHTML = isReg
      ? '密码<span class="auth-hint">至少 8 位，忘了只能找站主重置</span>'
      : "密码";
    el.passwordInput.autocomplete = isReg ? "new-password" : "current-password";
    el.submit.textContent = submitLabel();
    setMsg("");
  }

  function showAccount(user) {
    el.forms.hidden = true;
    el.account.hidden = false;
    el.title.textContent = "我的账号";
    el.myName.textContent = user.username || "—";
    el.mySid.textContent = user.sid || "—";
    el.myQq.textContent = user.qq || "—";
  }

  function showForms() {
    el.account.hidden = true;
    el.forms.hidden = false;
    el.title.textContent = mode === "register" ? "注册" : "登录";
    applyMode(mode);
  }

  function open() {
    overlay.hidden = false;
    document.body.classList.add("auth-open");
    if (me) showAccount(me); else showForms();
    setTimeout(() => {
      (me ? el.logout : el.accountInput).focus();
    }, 30);
  }

  function close() {
    overlay.hidden = true;
    document.body.classList.remove("auth-open");
    setMsg("");
  }

  /* 左下角徽标：未登录显示「登录」，登录后显示「SID 00001」 */
  function refreshNav() {
    if (me && me.sid) {
      el.badgeLabel.textContent = "SID";
      el.badgeValue.textContent = me.sid;
      el.badgeValue.hidden = false;
      btn.classList.add("is-signed-in");
      btn.title = "已登录：" + (me.username || "") + "，点开看我的账号";
    } else {
      el.badgeLabel.textContent = "登录";
      el.badgeValue.hidden = true;
      btn.classList.remove("is-signed-in");
      btn.title = "登录或注册";
    }
  }

  /* 登录状态广播：auth.js 是唯一来源，其他模块（社区、聊天）订阅它。
     以前社区页和聊天页各自在加载时查一次 auth-me 就再也不更新，
     所以在弹窗里登录成功后，发帖框不出现、点赞还提示未登录。 */
  function publish() {
    const state = me
      ? { loggedIn: true, sid: me.sid || "", username: me.username || "", qq: me.qq || "" }
      : { loggedIn: false, sid: "", username: "", qq: "" };
    window.__auth = state;
    document.dispatchEvent(new CustomEvent("auth:change", { detail: state }));
  }

  /* 状态一变就同时更新徽标和广播 */
  function setState(next) {
    me = next;
    refreshNav();
    publish();
  }

  /* ---------- 事件 ---------- */

  btn.addEventListener("click", open);
  if (el.badge) el.badge.addEventListener("click", open);
  el.close.addEventListener("click", close);
  overlay.addEventListener("click", e => {
    if (e.target === overlay) close();   // 点遮罩关闭
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !overlay.hidden) close();
  });

  el.tabs.forEach(t => {
    t.addEventListener("click", () => {
      if (busy || t.dataset.mode === mode) return;
      applyMode(t.dataset.mode);
      el.title.textContent = mode === "register" ? "注册" : "登录";
    });
  });

  el.form.addEventListener("submit", async e => {
    e.preventDefault();
    if (busy) return;

    /* 整个处理体包在 try 里：早先有个重复 id 的 bug 让 el.accountInput 拿到了
       一个 div，读 .value 得到 undefined 后抛异常，而当时 try 只包住了请求那一小段，
       结果就是「点注册毫无反应、连个错误都没有」。现在任何异常都会显示出来。 */
    try {
      const account = String(el.accountInput.value || "").trim();
      const password = String(el.passwordInput.value || "");

      if (!account) return setMsg(mode === "register" ? "用户名要填" : "用户名要填", "err");
      if (!password) return setMsg("密码要填", "err");

      let body;
      if (mode === "register") {
        const qq = String(el.qqInput.value || "").trim();
        if (!/^\d{5,12}$/.test(qq)) return setMsg("QQ 号要是 5~12 位数字", "err");
        if (password.length < 8) return setMsg("密码至少 8 位", "err");
        body = { username: account, qq, password };
      } else {
        body = { account, password };
      }

      setBusy(true, mode === "register" ? "注册中…" : "登录中…");
      /* 注册要 4 秒上下（要读写好几趟存储），先给句话，免得很像卡住 */
      setMsg(mode === "register" ? "正在注册，大约需要几秒，别关页面…" : "正在登录…", "wait");

      const data = await api(mode === "register" ? "/api/auth-register" : "/api/auth-login", body);
      setState({ username: data.username, sid: data.sid, qq: data.qq });
      showAccount(me);
      setMsg(mode === "register" ? "注册成功，你的 SID 是 " + data.sid : "登录成功", "ok");
      el.passwordInput.value = "";
    } catch (err) {
      setMsg(err && err.message ? err.message : "出错了，请刷新页面重试", "err");
    } finally {
      setBusy(false);
    }
  });

  el.logout.addEventListener("click", async () => {
    el.logout.disabled = true;
    try {
      await api("/api/auth-logout", {});
    } catch { /* 清 Cookie 失败也让本地退出 */ }
    setState(null);
    showForms();
    setMsg("已退出", "ok");
    el.logout.disabled = false;
  });

  /* ---------- 初始化：问一次会话 ---------- */

  /* 先广播「未登录」，订阅方立刻就能渲染出正确形态，不会一直等接口 */
  setState(null);

  api("/api/auth-me")
    .then(data => {
      if (data && data.loggedIn) {
        setState({ username: data.username, sid: data.sid, qq: data.qq || "" });
      }
      return null;
    })
    .catch(() => { /* 接口挂了就当没登录 */ });

  /* 标签页重新可见时复查一次：
     浏览器可能把过期的 Cookie 清掉了，或者用户在别处登出，
     这里只做「状态同步」，不会主动踢人 */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    api("/api/auth-me")
      .then(data => {
        /* transient 表示服务端这次没验成（存储抖动），
           不代表登录失效——不要因为一次抖动就把界面上的人踢下线 */
        if (data && data.transient) return;
        const now = !!(data && data.loggedIn);
        if (now !== !!me) {
          setState(now ? { username: data.username, sid: data.sid, qq: data.qq || "" } : null);
        }
      })
      .catch(() => {});
  });
})();
