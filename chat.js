/* 在线对话：把消息发给 bot，轮询等回复
 * ============================================================
 * 链路：这里 POST /api/chat-send → 消息进网站队列 →
 *       家里那台电脑上的 chat-bridge.ps1 取走 → 本地问 AstrBot →
 *       POST /api/chat-bridge 写回 → 这里轮询 /api/chat-fetch 拿到。
 *
 * 所以这里要「等」：发出后每 1.2 秒查一次，最多等 120 秒。
 * ============================================================
 */
(() => {
  "use strict";

  const logEl = document.getElementById("chat-log");
  if (!logEl) return;

  const el = {
    form: document.getElementById("chat-form"),
    input: document.getElementById("chat-input"),
    send: document.getElementById("chat-send"),
    loginTip: document.getElementById("chat-login-tip"),
    loginLink: document.getElementById("chat-login-link"),
    quota: document.getElementById("chat-quota"),
    status: document.getElementById("chat-status"),
  };

  const POLL_MS = 1200;
  const WAIT_MAX_MS = 120 * 1000;
  const STORE_KEY = "chat-history-v1";

  let me = null;
  let busy = false;
  let history = [];

  /* ---------- 工具 ---------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

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

  function timeNow() {
    const d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  /* ---------- 渲染 ---------- */

  function bubble(role, text, opts) {
    const cls = role === "me" ? "is-me" : "is-bot";
    const tag = (opts && opts.tag) ? '<span class="chat-tag">' + esc(opts.tag) + "</span>" : "";
    const pending = (opts && opts.pending) ? ' is-pending' : "";
    return '<div class="chat-row ' + cls + pending + '">' +
        '<div class="chat-bubble">' + tag + '<span class="chat-text">' + esc(text) + '</span>' +
          '<time class="chat-time">' + esc((opts && opts.time) || timeNow()) + '</time>' +
        '</div>' +
      '</div>';
  }

  function push(role, text, opts) {
    history.push({ role, text, time: (opts && opts.time) || timeNow(), tag: (opts && opts.tag) || "" });
    if (history.length > 200) history = history.slice(-200);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(history)); } catch { /* 忽略 */ }
    logEl.insertAdjacentHTML("beforeend", bubble(role, text, opts));
    logEl.scrollTop = logEl.scrollHeight;
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      history = arr;
      arr.forEach(x => {
        logEl.insertAdjacentHTML("beforeend", bubble(x.role, x.text, { time: x.time, tag: x.tag }));
      });
      logEl.scrollTop = logEl.scrollHeight;
    } catch { /* 忽略 */ }
  }

  function setStatus(text, kind) {
    el.status.textContent = text || "";
    el.status.className = "chat-status" + (kind ? " is-" + kind : "");
  }

  /* ---------- 等待回复 ---------- */

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async function waitForAnswer(id) {
    const deadline = Date.now() + WAIT_MAX_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      let d;
      try {
        d = await api("/api/chat-fetch?id=" + encodeURIComponent(id));
      } catch {
        continue;                     // 偶尔失败就继续等
      }
      if (d && d.ready) return d;
    }
    return { ready: true, error: "等了太久没等到回复，可能是那边的桥接脚本没开。" };
  }

  /* ---------- 发消息 ---------- */

  el.form.addEventListener("submit", async e => {
    e.preventDefault();
    if (busy) return;

    const text = el.input.value.trim();
    if (!text) return;
    if (!me) return requireLogin();

    busy = true;
    el.send.disabled = true;
    el.input.value = "";
    push("me", text);

    /* 先放一个「正在输入」的占位气泡 */
    const holder = document.createElement("div");
    holder.className = "chat-row is-bot is-pending";
    holder.innerHTML = '<div class="chat-bubble"><span class="chat-dots"><i></i><i></i><i></i></span></div>';
    logEl.appendChild(holder);
    logEl.scrollTop = logEl.scrollHeight;
    setStatus("bot 正在输入…", "wait");

    try {
      const r = await api("/api/chat-send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (typeof r.remaining === "number") {
        el.quota.textContent = "今天还能聊 " + r.remaining + " 条";
      }

      const ans = await waitForAnswer(r.id);
      holder.remove();

      if (ans.error) {
        push("bot", "（出错了）" + ans.error, { tag: "错误" });
        setStatus("刚才那条没成功", "err");
      } else {
        push("bot", ans.text);
        setStatus("在线");
      }
    } catch (err) {
      holder.remove();
      const msg = err && err.message ? err.message : "发送失败";
      push("bot", "（出错了）" + msg, { tag: "错误" });
      setStatus(msg, "err");
      /* 额度用尽时把输入框也禁掉 */
      if (err && err.data && err.data.remaining === 0) {
        el.form.hidden = true;
        el.quota.textContent = "今天的额度用完了";
      }
    } finally {
      busy = false;
      el.send.disabled = false;
      el.input.focus();
    }
  });

  /* ---------- 登录状态 ---------- */

  function requireLogin() {
    const badge = document.getElementById("sid-badge");
    if (badge) badge.click();
  }

  function applyAuth(loggedIn) {
    me = loggedIn ? (me || { loggedIn: true }) : null;
    el.form.hidden = !loggedIn;
    el.loginTip.hidden = !!loggedIn;
    if (loggedIn) {
      setStatus("在线");
      el.input.focus();
    } else {
      setStatus("需要登录");
    }
  }

  if (el.loginLink) {
    el.loginLink.addEventListener("click", e => {
      e.preventDefault();
      requireLogin();
    });
  }

  /* ---------- 启动 ---------- */

  restore();
  applyAuth(false);
  api("/api/auth-me")
    .then(d => { if (d && d.loggedIn) applyAuth(true); })
    .catch(() => setStatus("登录状态查询失败", "err"));
})();
