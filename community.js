/* 社区：发帖 / 信息流 / 点赞 / 评论
 * ============================================================
 * 两种用法，同一份代码：
 *   · 独立页面 community.html   —— 完整信息流，可发帖、分页、按最新/最热排序
 *   · 主页 #community 板块      —— 只展示少量「近期热门」，末尾给个入口链接
 *     容器上写 data-preview="3" 就是预览模式。
 *
 * 后端：/api/community-posts（GET / POST / DELETE）
 *       /api/community-like（POST 切换）
 *       /api/community-comments（GET / POST / DELETE）
 *
 * ⚠️ 用户内容一律经过 esc() 再插入 DOM —— 这是 UGC，必须防注入。
 * ============================================================
 */
(() => {
  "use strict";

  const feedEl = document.getElementById("comm-feed");
  if (!feedEl) return;

  const preview = Number(feedEl.dataset.preview) || 0;   // 0 = 完整模式
  const isPage = preview === 0;

  const el = {
    composer: document.getElementById("comm-composer"),
    loginTip: document.getElementById("comm-login-tip"),
    loginLink: document.getElementById("comm-login-link"),
    input: document.getElementById("comm-input"),
    send: document.getElementById("comm-send"),
    hint: document.getElementById("comm-hint"),
    more: document.getElementById("comm-more"),
    count: document.getElementById("comm-count"),
    sortBtns: Array.from(document.querySelectorAll(".comm-sort-btn")),
  };

  let me = null;
  let cursor = 0;
  let loading = false;
  let posting = false;
  let sort = "new";                       // new | hot
  const openComments = new Set();

  /* ---------- 工具 ---------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function timeText(ts) {
    const diff = Date.now() - Number(ts || 0);
    if (diff < 0) return "刚刚";
    const m = Math.floor(diff / 60000);
    if (m < 1) return "刚刚";
    if (m < 60) return m + " 分钟前";
    const h = Math.floor(m / 60);
    if (h < 24) return h + " 小时前";
    const d = Math.floor(h / 24);
    if (d < 30) return d + " 天前";
    const dt = new Date(Number(ts));
    return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
  }

  async function api(path, opt) {
    const res = await fetch(path, Object.assign({ credentials: "same-origin", cache: "no-store" }, opt));
    let data = {};
    try { data = await res.json(); } catch { /* 忽略 */ }
    if (!res.ok || data.ok === false) throw new Error(data.error || "请求失败（" + res.status + "）");
    return data;
  }

  function setHint(text, kind) {
    if (!el.hint) return;
    el.hint.textContent = text || "";
    el.hint.className = "comm-hint" + (kind ? " is-" + kind : "");
  }

  /* ---------- 渲染 ---------- */

  function postHtml(p, opts) {
    const compact = !!(opts && opts.compact);
    const open = openComments.has(p.id);
    return '' +
      '<article class="comm-post' + (compact ? " is-compact" : "") + '" data-id="' + esc(p.id) + '">' +
        '<header class="comm-head">' +
          '<span class="comm-sid">SID ' + esc(p.sid || "—") + '</span>' +
          '<span class="comm-name">' + esc(p.name || "匿名") + '</span>' +
          '<time class="comm-time">' + esc(timeText(p.ts)) + '</time>' +
          (p.mine && !compact ? '<button type="button" class="comm-del" data-del="post">删除</button>' : '') +
        '</header>' +
        '<p class="comm-body">' + esc(p.body) + '</p>' +
        '<footer class="comm-foot">' +
          '<button type="button" class="comm-btn comm-like' + (p.liked ? " is-on" : "") + '" data-act="like">' +
            '<span class="comm-heart">' + (p.liked ? "♥" : "♡") + '</span>' +
            '<span class="comm-likes">' + (p.likeCount || 0) + '</span>' +
          '</button>' +
          '<button type="button" class="comm-btn" data-act="toggle-comments">' +
            '评论 <span class="comm-cc">' + (p.commentCount || 0) + '</span>' +
          '</button>' +
        '</footer>' +
        '<div class="comm-comments"' + (open ? '' : ' hidden') + '>' +
          '<div class="comm-cmt-list" data-list></div>' +
          '<form class="comm-cmt-form" data-cmt-form>' +
            '<input type="text" maxlength="300" placeholder="' + (me ? "写条评论…" : "登录后才能评论") + '"' +
              (me ? '' : ' disabled') + ' />' +
            '<button type="submit" class="btn btn-primary"' + (me ? '' : ' disabled') + '>发送</button>' +
          '</form>' +
        '</div>' +
      '</article>';
  }

  function emptyHtml() {
    return '<p class="comm-empty">还没有人发帖，来当第一个吧～</p>';
  }

  function previewMoreHtml() {
    return '<div class="comm-preview-more"><a href="community.html">看看全部发言 →</a></div>';
  }

  function renderPosts(posts, append) {
    const html = posts.map(p => postHtml(p)).join("");
    if (append) feedEl.insertAdjacentHTML("beforeend", html);
    else feedEl.innerHTML = html;
  }

  /* ---------- 信息流 ---------- */

  async function loadFeed(reset) {
    if (loading) return;
    loading = true;
    try {
      let url;
      if (preview) {
        /* 主页预览：拿最近 12 条，再按赞数挑前几条 */
        url = "/api/community-posts?limit=12";
      } else if (sort === "hot") {
        /* 最热：只在最近 30 条里排，不是全站历史，界面上有说明 */
        url = "/api/community-posts?limit=30";
      } else {
        url = "/api/community-posts" + (reset || !cursor ? "" : "?cursor=" + cursor);
      }

      const data = await api(url);
      if (data.loggedIn && !me) me = { loggedIn: true };

      if (preview) {
        const top = data.posts
          .slice()
          .sort((a, b) => (b.likeCount - a.likeCount) || (b.ts - a.ts))
          .slice(0, preview);
        feedEl.innerHTML = (top.length
          ? top.map(p => postHtml(p, { compact: true })).join("")
          : emptyHtml()) + previewMoreHtml();
        return;
      }

      cursor = data.nextCursor || 0;
      if (reset) feedEl.innerHTML = "";
      if (data.posts.length) {
        renderPosts(data.posts, !reset);
        data.posts.forEach(p => { if (openComments.has(p.id)) loadComments(p.id); });
      } else if (reset) {
        feedEl.innerHTML = emptyHtml();
      }

      if (el.count) {
        const n = feedEl.querySelectorAll(".comm-post").length;
        el.count.textContent = n ? "本次显示 " + n + " 条" : "";
      }

      if (el.more) {
        el.more.innerHTML = (sort === "new" && cursor)
          ? '<button type="button" class="comm-more-btn" id="comm-more-btn">加载更多</button>'
          : "";
        const moreBtn = document.getElementById("comm-more-btn");
        if (moreBtn) moreBtn.addEventListener("click", () => loadFeed(false));
      }
    } catch (err) {
      feedEl.innerHTML = '<p class="comm-empty">加载失败：' + esc(err.message) + '</p>';
    } finally {
      loading = false;
    }
  }

  /* ---------- 评论 ---------- */

  async function loadComments(postId) {
    const card = feedEl.querySelector('.comm-post[data-id="' + postId + '"]');
    if (!card) return;
    const box = card.querySelector("[data-list]");
    if (!box) return;
    box.innerHTML = '<span class="comm-cmt-loading">加载中…</span>';
    try {
      const data = await api("/api/community-comments?postId=" + encodeURIComponent(postId));
      if (!data.comments.length) {
        box.innerHTML = '<span class="comm-cmt-none">还没有评论。</span>';
        return;
      }
      box.innerHTML = data.comments.map(c => '' +
        '<div class="comm-cmt">' +
          '<span class="comm-cmt-head">' +
            '<b>SID ' + esc(c.sid || "—") + '</b> ' + esc(c.name || "匿名") +
            '<time>' + esc(timeText(c.ts)) + '</time>' +
            (c.mine ? '<button type="button" class="comm-del" data-del="comment" data-cid="' + esc(c.id) + '">删除</button>' : '') +
          '</span>' +
          '<span class="comm-cmt-body">' + esc(c.body) + '</span>' +
        '</div>'
      ).join("");
    } catch (err) {
      box.innerHTML = '<span class="comm-cmt-none">评论加载失败：' + esc(err.message) + '</span>';
    }
  }

  /* ---------- 交互 ---------- */

  feedEl.addEventListener("click", async e => {
    const card = e.target.closest(".comm-post");
    if (!card) return;
    const postId = card.dataset.id;

    const likeBtn = e.target.closest('[data-act="like"]');
    if (likeBtn) {
      if (!me) return requireLogin();
      likeBtn.disabled = true;
      try {
        const r = await api("/api/community-like", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId }),
        });
        likeBtn.classList.toggle("is-on", r.liked);
        likeBtn.querySelector(".comm-heart").textContent = r.liked ? "♥" : "♡";
        likeBtn.querySelector(".comm-likes").textContent = r.likeCount;
      } catch (err) {
        setHint(err.message, "err");
      } finally {
        likeBtn.disabled = false;
      }
      return;
    }

    const tg = e.target.closest('[data-act="toggle-comments"]');
    if (tg) {
      const box = card.querySelector(".comm-comments");
      const show = box.hidden;
      box.hidden = !show;
      if (show) { openComments.add(postId); await loadComments(postId); }
      else openComments.delete(postId);
      return;
    }

    const del = e.target.closest("[data-del]");
    if (del) {
      const kind = del.dataset.del;
      if (!confirm("确定删除？删了就找不回来了。")) return;
      try {
        if (kind === "post") {
          await api("/api/community-posts?id=" + encodeURIComponent(postId), { method: "DELETE" });
          card.remove();
          openComments.delete(postId);
          if (!feedEl.querySelector(".comm-post")) feedEl.innerHTML = emptyHtml();
        } else {
          const cid = del.dataset.cid;
          await api("/api/community-comments?postId=" + encodeURIComponent(postId) + "&id=" + encodeURIComponent(cid), { method: "DELETE" });
          const row = del.closest(".comm-cmt");
          if (row) row.remove();
          const cc = card.querySelector(".comm-cc");
          if (cc) cc.textContent = Math.max(0, Number(cc.textContent) - 1);
        }
      } catch (err) {
        setHint(err.message, "err");
      }
    }
  });

  feedEl.addEventListener("submit", async e => {
    const form = e.target.closest("[data-cmt-form]");
    if (!form) return;
    e.preventDefault();
    const card = form.closest(".comm-post");
    const input = form.querySelector("input");
    const text = input.value.trim();
    if (!text) return;
    const btn = form.querySelector("button");
    btn.disabled = true;
    try {
      const r = await api("/api/community-comments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: card.dataset.id, body: text }),
      });
      input.value = "";
      const c = r.comment;
      const box = card.querySelector("[data-list]");
      const none = box.querySelector(".comm-cmt-none");
      if (none) none.remove();
      box.insertAdjacentHTML("beforeend", '' +
        '<div class="comm-cmt">' +
          '<span class="comm-cmt-head">' +
            '<b>SID ' + esc(c.sid || "—") + '</b> ' + esc(c.name || "匿名") +
            '<time>刚刚</time>' +
            '<button type="button" class="comm-del" data-del="comment" data-cid="' + esc(c.id) + '">删除</button>' +
          '</span>' +
          '<span class="comm-cmt-body">' + esc(c.body) + '</span>' +
        '</div>');
      const cc = card.querySelector(".comm-cc");
      if (cc) cc.textContent = Number(cc.textContent) + 1;
    } catch (err) {
      setHint(err.message, "err");
    } finally {
      btn.disabled = false;
    }
  });

  /* 发帖（只有独立页面才有这个框） */
  if (el.send) {
    el.send.addEventListener("click", async () => {
      if (posting) return;
      if (!me) return requireLogin();
      const text = el.input.value.trim();
      if (text.length < 2) return setHint("多写几个字吧", "err");

      posting = true;
      el.send.disabled = true;
      el.send.textContent = "发布中…";
      setHint("");
      try {
        await api("/api/community-posts", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        });
        el.input.value = "";
        sort = "new";
        el.sortBtns.forEach(b => b.classList.toggle("is-active", b.dataset.sort === "new"));
        loadFeed(true);
        setHint("发布成功", "ok");
      } catch (err) {
        setHint(err.message, "err");
      } finally {
        posting = false;
        el.send.disabled = false;
        el.send.textContent = "发布";
      }
    });
  }

  /* 排序切换 */
  el.sortBtns.forEach(b => {
    b.addEventListener("click", () => {
      if (b.dataset.sort === sort) return;
      sort = b.dataset.sort;
      el.sortBtns.forEach(x => x.classList.toggle("is-active", x === b));
      cursor = 0;
      loadFeed(true);
    });
  });

  /* ---------- 登录状态 ---------- */

  function requireLogin() {
    const badge = document.getElementById("sid-badge");
    if (badge) badge.click();
    setHint("登录后才能发帖和点赞～", "err");
  }

  function applyAuth(loggedIn) {
    me = loggedIn ? (me || { loggedIn: true }) : null;
    if (el.composer) el.composer.hidden = !loggedIn;
    if (el.loginTip) el.loginTip.hidden = !!loggedIn;
  }

  if (el.loginLink) {
    el.loginLink.addEventListener("click", e => {
      e.preventDefault();
      const badge = document.getElementById("sid-badge");
      if (badge) badge.click();
    });
  }

  /* ---------- 启动 ---------- */

  applyAuth(false);
  api("/api/auth-me")
    .then(d => { if (d && d.loggedIn) applyAuth(true); })
    .catch(() => {})
    .finally(() => loadFeed(true));
})();
