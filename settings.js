/* 设置页：账号 / 外观 / 背景
 * ============================================================
 * 账号的登录状态由 auth.js 统一管理，这里只管表单交互，
 * 登录成功后调 window.DSH_AUTH.apply(user) 把状态同步到全站。
 *
 * 外观和背景都存在 localStorage，key 和首页 main.js 保持一致：
 *   theme        "dark" | "light"，没有这个 key = 跟随系统
 *   bg-rt-only   "1" | "0"
 *   bg-live-pool 设置页「换一批」拉到的实时图，首页会优先用它
 * ============================================================
 */
(() => {
  "use strict";

  /* ---------- 小工具 ---------- */

  function $(id) { return document.getElementById(id); }

  function api(path, opt) {
    return fetch(path, Object.assign({ credentials: "same-origin", cache: "no-store" }, opt))
      .then(async res => {
        let data = {};
        try { data = await res.json(); } catch { /* 忽略 */ }
        if (!res.ok || data.ok === false) {
          const err = new Error(data.error || "请求失败（" + res.status + "）");
          err.data = data;
          throw err;
        }
        return data;
      });
  }

  function ls(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      if (val === null) localStorage.removeItem(key);
      else localStorage.setItem(key, val);
    } catch { /* 隐私模式下会抛，忽略 */ }
    return null;
  }

  function setMsg(text, kind) {
    const el = $("acct-msg");
    if (!el) return;
    el.textContent = text || "";
    el.className = "auth-msg" + (kind ? " is-" + kind : "");
  }

  /* ============================================================
     一、账号
     ============================================================ */

  let mode = "login";        // login | register
  let busy = false;

  const next = new URLSearchParams(location.search).get("next") || "";

  function applyMode(m) {
    mode = m;

    /* 早退：元素缺失时直接返回，别在事件里抛异常导致按钮看起来没反应 */
    const tabs = Array.from(document.querySelectorAll(".auth-tab"));
    const accountLabel = $("acct-account-label");
    const accountInput = $("acct-account");
    const qqField = $("acct-qq-field");
    const passwordLabel = $("acct-password-label");
    const passwordInput = $("acct-password");
    const submit = $("acct-submit");
    if (!accountInput || !submit) return;

    tabs.forEach(t => {
      const on = t.dataset.mode === m;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });

    const isReg = m === "register";
    if (accountLabel) accountLabel.textContent = isReg ? "用户名" : "用户名";
    accountInput.autocomplete = isReg ? "nickname" : "username";
    accountInput.placeholder = isReg ? "2~20 个字，注册后不能改" : "注册时填的用户名";
    if (qqField) qqField.hidden = !isReg;
    if (passwordLabel) {
      passwordLabel.innerHTML = isReg
        ? '密码<span class="auth-hint">至少 8 位，忘了只能找站主重置</span>'
        : "密码";
    }
    if (passwordInput) passwordInput.autocomplete = isReg ? "new-password" : "current-password";
    submit.textContent = isReg ? "注册账号" : "登录账号";
    setMsg("");
  }

  function showLoggedOut() {
    const forms = $("acct-forms");
    const view = $("acct-view");
    const sub = $("acct-sub");
    if (forms) forms.hidden = false;
    if (view) view.hidden = true;
    if (sub) sub.textContent = "未登录";
    applyMode(mode);
  }

  function showLoggedIn(user) {
    const forms = $("acct-forms");
    const view = $("acct-view");
    const sub = $("acct-sub");
    if (forms) forms.hidden = true;
    if (view) view.hidden = false;
    if (sub) sub.textContent = "已登录";
    if ($("acct-name")) $("acct-name").textContent = user.username || "—";
    if ($("acct-sid")) $("acct-sid").textContent = user.sid || "—";
    if ($("acct-user-qq")) $("acct-user-qq").textContent = user.qq || "—";
  }

  function syncAccount(user) {
    if (user) showLoggedIn(user); else showLoggedOut();
  }

  /* 登录 / 注册提交 */
  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;

    const accountInput = $("acct-account");
    const passwordInput = $("acct-password");
    const submit = $("acct-submit");
    if (!accountInput || !passwordInput || !submit) return;

    const account = (accountInput.value || "").trim();
    const password = passwordInput.value || "";

    if (!account) return setMsg(mode === "register" ? "填个用户名" : "填用户名", "err");
    if (!password) return setMsg("填密码", "err");

    busy = true;
    submit.disabled = true;

    try {
      if (mode === "register") {
        const qq = (($("acct-qq") || {}).value || "").trim();
        if (!/^\d{5,12}$/.test(qq)) throw new Error("QQ 号填 5~12 位数字");
        setMsg("正在注册，大约需要几秒，别关页面…", "wait");

        const data = await api("/api/auth-register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: account, qq, password }),
        });

        if (window.DSH_AUTH) window.DSH_AUTH.apply(data);
        syncAccount(data);
        setMsg("注册成功，SID " + data.sid, "ok");
        passwordInput.value = "";
        goNext();
      } else {
        setMsg("正在登录…", "wait");

        const data = await api("/api/auth-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account, password }),
        });

        if (window.DSH_AUTH) window.DSH_AUTH.apply(data);
        syncAccount(data);
        setMsg("登录成功", "ok");
        passwordInput.value = "";
        goNext();
      }
    } catch (err) {
      setMsg(err && err.message ? err.message : "操作失败", "err");
    } finally {
      busy = false;
      submit.disabled = false;
    }
  }

  /* 从别的页面点「登录」跳过来时，成功后就送回去 */
  function goNext() {
    if (!next || next === "settings.html") return;
    setTimeout(() => { location.href = next; }, 700);
  }

  /* 退出 */
  async function onLogout() {
    const btn = $("acct-logout");
    if (btn) btn.disabled = true;
    try {
      await api("/api/auth-logout", { method: "POST" });
    } catch { /* 就算接口失败也把界面切回去 */ }
    if (window.DSH_AUTH) window.DSH_AUTH.apply(null);
    syncAccount(null);
    setMsg("已退出登录", "ok");
    if (btn) btn.disabled = false;
  }

  /* 绑定 */
  Array.from(document.querySelectorAll(".auth-tab")).forEach(t => {
    t.addEventListener("click", () => applyMode(t.dataset.mode));
  });
  const form = $("acct-form");
  if (form) form.addEventListener("submit", onSubmit);
  const logoutBtn = $("acct-logout");
  if (logoutBtn) logoutBtn.addEventListener("click", onLogout);

  /* ============================================================
     二、外观
     ============================================================ */

  const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function applyTheme(theme, remember) {
    document.documentElement.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0d181c" : "#fdf2ff");
    if (remember) ls("theme", theme);
    renderThemeControls();
  }

  function renderThemeControls() {
    const auto = ls("theme") === null;

    /* 高亮的是「当前实际显示的主题」，不管它是系统给的还是手动钉的。
       按钮永远可点：点了就切过去并顺手关掉自动。 */
    Array.from(document.querySelectorAll("#theme-seg button")).forEach(b => {
      b.classList.toggle("is-active", b.dataset.themeValue === currentTheme());
    });

    const sw = $("theme-auto");
    if (sw) sw.setAttribute("aria-checked", auto ? "true" : "false");
  }

  Array.from(document.querySelectorAll("#theme-seg button")).forEach(b => {
    b.addEventListener("click", () => applyTheme(b.dataset.themeValue, true));
  });

  const autoSw = $("theme-auto");
  if (autoSw) {
    autoSw.addEventListener("click", () => {
      const auto = ls("theme") === null;
      if (auto) {
        /* 从自动切手动：把当前实际显示的主题钉住 */
        applyTheme(currentTheme(), true);
      } else {
        /* 从手动切回自动：清掉记忆，立刻按系统走 */
        ls("theme", null);
        applyTheme(mq && mq.matches ? "dark" : "light", false);
      }
    });
  }

  /* 自动模式下跟随系统变化 */
  if (mq) {
    const onSystem = e => { if (ls("theme") === null) applyTheme(e.matches ? "dark" : "light", false); };
    if (mq.addEventListener) mq.addEventListener("change", onSystem);
    else if (mq.addListener) mq.addListener(onSystem);
  }

  /* ============================================================
     三、背景
     ============================================================ */

  const RT_KEY = "bg-rt-only";
  const POOL_KEY = "bg-live-pool";

  const rtSw = $("bg-rt-only");
  if (rtSw) {
    rtSw.setAttribute("aria-checked", ls(RT_KEY) === "1" ? "true" : "false");
    rtSw.addEventListener("click", () => {
      const now = rtSw.getAttribute("aria-checked") === "true";
      const nextVal = !now;
      rtSw.setAttribute("aria-checked", nextVal ? "true" : "false");
      ls(RT_KEY, nextVal ? "1" : "0");
    });
  }

  /* 显示当前实时池的来源 */
  function renderCredit() {
    const el = $("bg-credit");
    if (!el) return;
    let pool = null;
    try { pool = JSON.parse(ls(POOL_KEY) || "null"); } catch { pool = null; }
    if (pool && Array.isArray(pool.items) && pool.items.length) {
      const when = pool.ts ? new Date(pool.ts) : null;
      const ago = when ? Math.max(0, Math.round((Date.now() - when.getTime()) / 60000)) : null;
      el.textContent = "实时图 " + pool.items.length + " 张" + (ago === null ? "" : "（" + (ago < 1 ? "刚刚" : ago + " 分钟前") + "）");
    } else {
      el.textContent = "还在用本地图";
    }
  }

  /* 换一批：浏览器直连 lolicon，结果存起来给首页用 */
  async function fetchLive() {
    const url = "https://api.lolicon.app/setu/v2?r18=0&num=6&size=regular&excludeAI=1&tag="
      + encodeURIComponent("流萤");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (j.error || !Array.isArray(j.data)) throw new Error("接口返回异常");
      return j.data.map(d => ({
        url: (d.urls && (d.urls.regular || d.urls.original)) || "",
        credit: "实时 © " + (d.author || "Pixiv") + "（" + d.pid + "）",
      })).filter(it => it.url);
    } finally {
      clearTimeout(t);
    }
  }

  const refreshBtn = $("bg-refresh");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      const old = refreshBtn.textContent;
      refreshBtn.textContent = "拉取中…";
      const credit = $("bg-credit");
      try {
        const items = await fetchLive();
        if (!items.length) throw new Error("这次没拉到，稍后再试");
        ls(POOL_KEY, JSON.stringify({ ts: Date.now(), items }));
        renderCredit();
        if (credit) credit.textContent = "已换 " + items.length + " 张 ✓";
      } catch (err) {
        if (credit) credit.textContent = err && err.message ? err.message : "拉取失败";
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = old;
      }
    });
  }

  /* ============================================================
     四、初始化
     ============================================================ */

  applyTheme(currentTheme(), false);
  renderThemeControls();
  renderCredit();

  /* 账号状态：auth.js 已经查过一次并广播，这里既订阅也读当前值 */
  document.addEventListener("auth:change", e => {
    syncAccount(e.detail && e.detail.loggedIn ? e.detail : null);
  });

  if (window.__auth && window.__auth.loggedIn) {
    syncAccount(window.__auth);
  } else {
    syncAccount(null);
  }
})();
