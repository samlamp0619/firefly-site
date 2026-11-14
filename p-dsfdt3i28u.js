/* 管理后台
 * ============================================================
 * 鉴权就一个管理员 token，存在 localStorage（关掉标签页就没了）。
 * 所有接口都带 ?token= 或 body 里带 token，服务端用 SHA-256 比对。
 *
 * 页面本身不含任何数据，全部走接口，所以直接访问 admin.html
 * 拿不到东西 —— 没有 token 就是一张登录卡片。
 * ============================================================
 */
(() => {
  "use strict";

  const TOKEN_KEY = "admin-token";

  const $ = id => document.getElementById(id);

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
  }

  function setToken(v) {
    try {
      if (v) localStorage.setItem(TOKEN_KEY, v);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* 隐私模式忽略 */ }
  }

  async function api(path, opt) {
    const res = await fetch(path, Object.assign({ cache: "no-store" }, opt));
    let data = {};
    try { data = await res.json(); } catch { /* 忽略 */ }
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || ("请求失败（" + res.status + "）"));
    }
    return data;
  }

  function withToken(path) {
    return path + (path.indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(token());
  }

  function fmtTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    const p = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate())
      + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  /* 把 UTC 的 ISO 转成本地可读；服务端给的 createdAt 已经是 ISO */
  function fmtLocal(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    const p = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate())
      + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  /* ============================================================
     登录
     ============================================================ */

  function showLogin(msg) {
    $("admin-login").hidden = false;
    $("admin-body").hidden = true;
    $("admin-logout").hidden = true;
    if (msg) {
      $("admin-login-msg").textContent = msg;
      $("admin-login-msg").className = "auth-msg is-err";
    }
  }

  function showBody() {
    $("admin-login").hidden = true;
    $("admin-body").hidden = false;
    $("admin-logout").hidden = false;
  }

  $("admin-login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const input = $("admin-token");
    const submit = $("admin-login-submit");
    const msg = $("admin-login-msg");
    const t = (input.value || "").trim();
    if (!t) {
      msg.textContent = "填一下 token";
      msg.className = "auth-msg is-err";
      return;
    }

    submit.disabled = true;
    msg.textContent = "验证中…";
    msg.className = "auth-msg";

    setToken(t);
    try {
      await api(withToken("/api/admin-stats"));
      msg.textContent = "";
      showBody();
      loadAll();
    } catch (err) {
      setToken("");
      msg.textContent = err.message || "令牌不对";
      msg.className = "auth-msg is-err";
    } finally {
      submit.disabled = false;
    }
  });

  $("admin-logout").addEventListener("click", () => {
    setToken("");
    showLogin("已退出");
  });

  /* ============================================================
     概览
     ============================================================ */

  async function loadStats() {
    const d = await api(withToken("/api/admin-stats"));
    $("st-accounts").textContent = d.accounts;
    $("st-verified").textContent = d.verified;
    $("st-posts").textContent = d.posts;
    $("st-comments").textContent = d.comments;
    $("st-likes").textContent = d.likes;
    $("st-today-chat").textContent = d.todayChat;
    $("admin-updated").textContent = "更新于 " + fmtLocal(d.serverNow);

    /* 最近 7 天柱状图，纯 CSS 高度 */
    const max = Math.max(1, ...d.week.map(x => x.count));
    $("admin-week").innerHTML = d.week.map(x =>
      '<div class="admin-bar" title="' + esc(x.day) + "：" + x.count + ' 条">' +
        '<i style="height:' + Math.round((x.count / max) * 100) + '%"></i>' +
        '<em>' + esc(x.day) + "</em>" +
      "</div>"
    ).join("");
  }

  /* ============================================================
     账号
     ============================================================ */

  let accounts = [];

  async function loadAccounts() {
    $("acct-count").textContent = "读取中…";
    const d = await api(withToken("/api/auth-admin"));
    accounts = d.users || [];
    $("acct-count").textContent = "共 " + d.count + " 个" + (d.truncated ? "（只显示前 " + d.shown + " 个）" : "");
    renderAccounts();
  }

  function renderAccounts() {
    const q = ($("acct-search").value || "").trim().toLowerCase();
    const list = q
      ? accounts.filter(u =>
          (u.username || "").toLowerCase().indexOf(q) >= 0 ||
          (u.sid || "").indexOf(q) >= 0 ||
          (u.qq || "").indexOf(q) >= 0)
      : accounts;

    $("acct-empty").hidden = list.length > 0;

    $("acct-tbody").innerHTML = list.map(u => {
      const v = u.verified
        ? '<span class="admin-v">黄V</span>'
        : '<span class="admin-nov">—</span>';
      return '<tr data-regid="' + esc(u.regId) + '">' +
        '<td class="admin-sid">' + esc(u.sid) + "</td>" +
        '<td>' + esc(u.username) + "</td>" +
        '<td class="admin-qq">' + esc(u.qq || "—") + "</td>" +
        "<td>" + v + "</td>" +
        '<td class="admin-when">' + esc(fmtLocal(u.createdAt)) + "</td>" +
        '<td class="admin-ops">' +
          '<button type="button" class="admin-op" data-act="verify">' + (u.verified ? "取消黄V" : "给黄V") + "</button>" +
          '<button type="button" class="admin-op" data-act="reset">重置密码</button>' +
          '<button type="button" class="admin-op is-danger" data-act="delete">删除</button>' +
        "</td>" +
      "</tr>";
    }).join("");
  }

  $("acct-search").addEventListener("input", renderAccounts);
  $("acct-reload").addEventListener("click", () => loadAccounts().catch(err => alert(err.message)));

  /* 表格上的操作（事件委托） */
  $("acct-tbody").addEventListener("click", async e => {
    const btn = e.target.closest(".admin-op");
    if (!btn) return;
    const tr = e.target.closest("tr");
    const regId = tr && tr.dataset.regid;
    const user = accounts.find(u => u.regId === regId);
    if (!user) return;

    const act = btn.dataset.act;
    btn.disabled = true;

    try {
      if (act === "verify") {
        const next = !user.verified;
        await api(withToken("/api/auth-admin"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "set-verified", regId, verified: next }),
        });
        user.verified = next;
        renderAccounts();
        loadStats().catch(() => {});
      }

      if (act === "reset") {
        const pw = prompt("给 " + user.username + "（SID " + user.sid + "）设一个新密码：\n至少 8 位。", "");
        if (pw === null) { btn.disabled = false; return; }
        if (pw.length < 8) { alert("密码至少 8 位"); btn.disabled = false; return; }
        const r = await api(withToken("/api/auth-admin"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reset-password", regId, password: pw }),
        });
        alert("已重置：" + r.username + "（SID " + r.sid + "）");
      }

      if (act === "delete") {
        const ok = confirm(
          "确定删除账号？\n\n" + user.username + "（SID " + user.sid + "，QQ " + (user.qq || "—") + "）\n\n" +
          "号码会作废保留，不会被下一个人占用。"
        );
        if (!ok) { btn.disabled = false; return; }
        await api(withToken("/api/auth-admin"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", regId, freeSid: false }),
        });
        accounts = accounts.filter(u => u.regId !== regId);
        renderAccounts();
        loadStats().catch(() => {});
      }
    } catch (err) {
      alert(err.message || "操作失败");
    } finally {
      btn.disabled = false;
    }
  });

  /* ============================================================
     社区
     ============================================================ */

  let postCursor = 0;
  let postItems = [];

  async function loadPosts(more) {
    if (!more) { postCursor = 0; postItems = []; $("post-list").innerHTML = ""; }
    $("post-count").textContent = "读取中…";

    const qs = "?limit=30" + (postCursor ? "&cursor=" + postCursor : "");
    const d = await api("/api/community-posts" + qs);
    const list = d.posts || [];
    postItems = postItems.concat(list);
    postCursor = d.nextCursor || 0;

    $("post-count").textContent = "共 " + (d.count == null ? postItems.length : d.count) + " 条";
    $("post-more").hidden = !postCursor;
    $("post-empty").hidden = postItems.length > 0;

    $("post-list").innerHTML = postItems.map(p =>
      '<article class="admin-post" data-id="' + esc(p.id) + '">' +
        '<div class="admin-post-head">' +
          "<b>" + esc(p.name) + "</b>" +
          '<span class="admin-post-meta">SID ' + esc(p.sid) + " · " + esc(fmtLocal(new Date(p.ts).toISOString())) + "</span>" +
          (p.verified ? '<span class="admin-v">黄V</span>' : "") +
        "</div>" +
        '<p class="admin-post-body">' + esc(p.body) + "</p>" +
        '<div class="admin-post-foot">' +
          "<span>♥ " + p.likeCount + " · 评论 " + p.commentCount + "</span>" +
          '<button type="button" class="admin-op" data-act="comments">看评论</button>' +
          '<button type="button" class="admin-op is-danger" data-act="del-post">删帖</button>' +
        "</div>" +
        '<div class="admin-comments" hidden></div>' +
      "</article>"
    ).join("");
  }

  $("post-reload").addEventListener("click", () => loadPosts(false).catch(err => alert(err.message)));
  $("post-more").addEventListener("click", () => loadPosts(true).catch(err => alert(err.message)));

  $("post-list").addEventListener("click", async e => {
    const btn = e.target.closest(".admin-op");
    if (!btn) return;
    const card = e.target.closest(".admin-post");
    const id = card && card.dataset.id;
    if (!id) return;

    const act = btn.dataset.act;
    btn.disabled = true;

    try {
      if (act === "comments") {
        const box = card.querySelector(".admin-comments");
        if (!box.hidden) { box.hidden = true; btn.disabled = false; return; }
        box.hidden = false;
        box.innerHTML = '<p class="admin-tip">读取中…</p>';

        const d = await api("/api/community-comments?postId=" + encodeURIComponent(id) + "&limit=100");
        const list = d.comments || [];
        if (!list.length) {
          box.innerHTML = '<p class="admin-tip">这条还没有评论</p>';
        } else {
          box.innerHTML = list.map(c =>
            '<div class="admin-comment" data-cid="' + esc(c.id) + '">' +
              '<div class="admin-comment-head"><b>' + esc(c.name) + "</b>" +
                '<span class="admin-post-meta">' + esc(fmtLocal(new Date(c.ts).toISOString())) + "</span></div>" +
              '<p class="admin-comment-body">' + esc(c.body) + "</p>" +
              '<button type="button" class="admin-op is-danger" data-act="del-comment">删除评论</button>' +
            "</div>"
          ).join("");
        }
      }

      if (act === "del-post") {
        if (!confirm("确定删除这条帖子？评论和点赞也会一起留在库里但不再显示。")) { btn.disabled = false; return; }
        await api(withToken("/api/community-posts?id=" + encodeURIComponent(id)), { method: "DELETE" });
        card.remove();
        postItems = postItems.filter(p => p.id !== id);
        loadStats().catch(() => {});
      }

      if (act === "del-comment") {
        const cid = e.target.closest(".admin-comment").dataset.cid;
        if (!confirm("确定删除这条评论？")) { btn.disabled = false; return; }
        await api(withToken("/api/community-comments?postId=" + encodeURIComponent(id) + "&id=" + encodeURIComponent(cid)), { method: "DELETE" });
        const node = e.target.closest(".admin-comment");
        if (node) node.remove();
        loadStats().catch(() => {});
      }
    } catch (err) {
      alert(err.message || "操作失败");
    } finally {
      btn.disabled = false;
    }
  });

  /* ============================================================
     诊断
     ============================================================ */

  async function loadDiag() {
    const d = await api(withToken("/api/auth-admin?diag=1"));
    const g = d.diag || {};
    $("dg-secret").textContent = g.secretExists
      ? "存在（" + (g.secretLength || 0) + " 位）"
      : "不存在 —— 所有登录都会失效";
    $("dg-secret-at").textContent = fmtLocal(g.secretCreatedAt);
    $("dg-counter").textContent = g.counterLastSid != null ? "lastSid = " + g.counterLastSid : "—";
    $("dg-now").textContent = fmtLocal(g.serverNow);
  }

  $("dg-refresh").addEventListener("click", () => loadDiag().catch(err => alert(err.message)));

  $("dg-recount").addEventListener("click", async () => {
    if (!confirm("按现有号段重算游标？删过号之后可以用，避免下次发号跳号。")) return;
    try {
      const r = await api(withToken("/api/auth-admin"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recount" }),
      });
      alert("已重算，lastSid = " + r.lastSid);
      loadDiag().catch(() => {});
      loadStats().catch(() => {});
    } catch (err) {
      alert(err.message || "重算失败");
    }
  });

  /* ============================================================
     启动
     ============================================================ */

  async function loadAll() {
    /* 三块互不依赖，挂了哪块只影响自己 */
    loadStats().catch(err => { $("admin-updated").textContent = err.message; });
    loadAccounts().catch(err => { $("acct-count").textContent = err.message; });
    loadPosts(false).catch(err => { $("post-count").textContent = err.message; });
    loadDiag().catch(() => {});
  }

  if (token()) {
    showBody();
    loadAll();
  } else {
    showLogin();
  }
})();
