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

  const btn = document.getElementById("nav-auth-btn");
  const overlay = document.getElementById("auth-overlay");
  if (!btn || !overlay) return;

  const el = {
    close: document.getElementById("auth-close"),
    title: document.getElementById("auth-modal-title"),
    forms: document.getElementById("auth-forms"),
    account: document.getElementById("auth-account"),
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

  function setBusy(on, text) {
    busy = on;
    el.submit.disabled = on;
    el.submit.textContent = on ? (text || "处理中…") : (mode === "login" ? "登录" : "注册");
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
    el.submit.textContent = isReg ? "注册" : "登录";
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

  function refreshNav() {
    if (me && me.sid) {
      btn.textContent = "SID " + me.sid;
      btn.classList.add("is-signed-in");
      btn.title = "已登录：" + (me.username || "");
    } else {
      btn.textContent = "登录";
      btn.classList.remove("is-signed-in");
      btn.title = "登录或注册";
    }
  }

  /* ---------- 事件 ---------- */

  btn.addEventListener("click", open);
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

    const account = el.accountInput.value.trim();
    const password = el.passwordInput.value;

    if (!account) return setMsg(mode === "register" ? "用户名要填" : "账号要填", "err");
    if (!password) return setMsg("密码要填", "err");

    let body;
    if (mode === "register") {
      const qq = el.qqInput.value.trim();
      if (!/^\d{5,12}$/.test(qq)) return setMsg("QQ 号要是 5~12 位数字", "err");
      if (password.length < 8) return setMsg("密码至少 8 位", "err");
      body = { username: account, qq, password };
    } else {
      body = { account, password };
    }

    setBusy(true, mode === "register" ? "注册中…" : "登录中…");
    setMsg("");
    try {
      const data = await api(mode === "register" ? "/api/auth-register" : "/api/auth-login", body);
      me = { username: data.username, sid: data.sid, qq: data.qq };
      refreshNav();
      showAccount(me);
      setMsg(mode === "register" ? "注册成功，你的 SID 是 " + data.sid : "登录成功", "ok");
      el.passwordInput.value = "";
    } catch (err) {
      setMsg(err.message || "出错了", "err");
    } finally {
      setBusy(false);
    }
  });

  el.logout.addEventListener("click", async () => {
    el.logout.disabled = true;
    try {
      await api("/api/auth-logout", {});
    } catch { /* 清 Cookie 失败也让本地退出 */ }
    me = null;
    refreshNav();
    showForms();
    setMsg("已退出", "ok");
    el.logout.disabled = false;
  });

  /* ---------- 初始化：问一次会话 ---------- */

  refreshNav();

  api("/api/auth-me")
    .then(data => {
      if (data && data.loggedIn) {
        me = { username: data.username, sid: data.sid, qq: data.qq || "" };
        refreshNav();
      }
      return null;
    })
    .catch(() => { /* 接口挂了就当没登录 */ });
})();
