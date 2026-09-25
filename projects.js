/* 萨姆萤光灯 · 我的作品栏
 * 读取 videos.js（由 refresh_videos.py 自动生成）渲染：
 *   最新投稿大卡 + 投稿统计 + 分类筛选 + 歌名搜索 + 投稿网格
 * 数据全部来自 B 站，改歌不用动这里，重跑 refresh_videos.py 即可。
 */
(() => {
  "use strict";

  const D = window.BILI_VIDEOS;
  const PAGE_SIZE = 12;
  const FALLBACK_SPACE = "https://space.bilibili.com/669867138";

  const $ = id => document.getElementById(id);

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  /* B 站图床支持 @后缀 出缩略图，省流量；
     同时把 http 统一成 https，否则 https 站点上会被浏览器按混合内容拦掉。 */
  function thumb(url, w, h) {
    const u = String(url || "").replace(/^http:\/\//i, "https://");
    return u ? u + "@" + w + "w_" + h + "h_1c.webp" : "";
  }

  function fmtDur(sec) {
    const s = parseInt(sec, 10) || 0;
    if (!s) return "";
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function fmtViews(n) {
    const v = parseInt(n, 10) || 0;
    if (v >= 100000000) return (v / 100000000).toFixed(1).replace(/\.0$/, "") + "亿";
    if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, "") + "万";
    return String(v);
  }

  function fmtDate(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ""));
    return m ? (+m[2]) + "月" + (+m[3]) + "日" : esc(d);
  }

  /* ---------- 没有数据时的兜底 ---------- */
  if (!D || !Array.isArray(D.videos) || D.videos.length === 0) {
    const card = $("latest-card");
    if (card) {
      card.innerHTML = '<p class="works-loading">投稿列表暂时读不到，' +
        '<a class="works-fallback-link" href="' + FALLBACK_SPACE +
        '" target="_blank" rel="noopener">直接去 B 站看 →</a></p>';
    }
    const panel = $("works-panel");
    if (panel) panel.hidden = true;
    return;
  }

  const VIDEOS = D.videos;
  const SPACE = D.space || FALLBACK_SPACE;

  /* ---------- 统计 ---------- */
  const counts = new Map();
  VIDEOS.forEach(v => {
    const s = (v.section || "").trim();
    if (s) counts.set(s, (counts.get(s) || 0) + 1);
  });
  const SECTIONS = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);

  let activeSection = "";
  let keyword = "";
  let shown = PAGE_SIZE;

  function filtered() {
    const kw = keyword.trim().toLowerCase();
    return VIDEOS.filter(v => {
      if (activeSection && (v.section || "").trim() !== activeSection) return false;
      if (kw && !(v.title || "").toLowerCase().includes(kw)) return false;
      return true;
    });
  }

  /* ---------- 最新投稿大卡 ---------- */
  function renderLatest() {
    const card = $("latest-card");
    if (!card) return;
    const v = VIDEOS[0];
    card.innerHTML =
      '<a class="latest-link" href="' + esc(v.url) + '" target="_blank" rel="noopener">' +
        '<span class="latest-cover">' +
          '<img src="' + esc(thumb(v.cover, 640, 400)) + '" alt="" loading="lazy" ' +
               'onerror="this.style.opacity=0" />' +
          '<span class="latest-badge">最新投稿</span>' +
        '</span>' +
        '<span class="latest-body">' +
          '<span class="latest-title">' + esc(v.title) + '</span>' +
          '<span class="latest-meta">' +
            '<span>' + fmtDate(v.date) + '</span>' +
            (fmtDur(v.duration) ? '<span>' + fmtDur(v.duration) + '</span>' : '') +
            '<span>' + fmtViews(v.views) + ' 播放</span>' +
          '</span>' +
          '<span class="latest-go">去 B 站看这一期 →</span>' +
        '</span>' +
      '</a>';
  }

  /* ---------- 统计行 ---------- */
  function renderStats() {
    const el = $("works-stats");
    if (!el) return;
    el.innerHTML =
      '<b>' + VIDEOS.length + '</b> 首投稿' +
      (SECTIONS.length ? '<span class="works-dot">·</span>' + SECTIONS.length + ' 个分类' : '') +
      '<span class="works-dot">·</span>最近更新 ' + fmtDate(VIDEOS[0].date);

    const totalEl = $("works-total");
    if (totalEl) totalEl.textContent = VIDEOS.length;

    const upEl = $("works-updated");
    if (upEl) upEl.textContent = "（同步于 " + (D.updated || "—") + "）";

    const cta = $("cta-followers");
    if (cta && D.followers) {
      cta.textContent = "已有 " + Number(D.followers).toLocaleString("zh-CN") +
        " 位萤厨在 B 站关注，新投稿会第一时间出现在你的关注列表里～";
    }
  }

  /* ---------- 分类 tab ---------- */
  function renderTabs() {
    const el = $("works-tabs");
    if (!el || SECTIONS.length < 2) return;
    const items = [["", "全部"], ...SECTIONS.map(s => [s, s])];
    el.innerHTML = items.map(([val, label]) =>
      '<button type="button" class="works-tab' + (val === activeSection ? " is-active" : "") +
      '" data-section="' + esc(val) + '" role="tab" aria-selected="' +
      (val === activeSection ? "true" : "false") + '">' +
      esc(label) + '<em>' + (val ? counts.get(val) : VIDEOS.length) + '</em></button>'
    ).join("");
  }

  /* ---------- 投稿网格 ---------- */
  function renderGrid() {
    const grid = $("works-grid");
    const empty = $("works-empty");
    const more = $("works-more");
    if (!grid) return;

    const list = filtered();
    const slice = list.slice(0, shown);

    grid.innerHTML = slice.map(v =>
      '<a class="work-card" href="' + esc(v.url) + '" target="_blank" rel="noopener" title="' +
        esc(v.title) + '">' +
        '<span class="work-cover">' +
          '<img src="' + esc(thumb(v.cover, 400, 225)) + '" alt="" loading="lazy" ' +
               'onerror="this.style.opacity=0" />' +
          (fmtDur(v.duration) ? '<span class="work-dur">' + fmtDur(v.duration) + '</span>' : '') +
        '</span>' +
        '<span class="work-title">' + esc(v.title) + '</span>' +
        '<span class="work-meta">' + fmtDate(v.date) + ' · ' + fmtViews(v.views) + ' 播放</span>' +
      '</a>'
    ).join("");

    if (empty) empty.hidden = list.length !== 0;
    if (more) {
      more.hidden = list.length <= shown;
      more.textContent = "加载更多（还有 " + Math.max(0, list.length - shown) + " 首）";
    }
  }

  /* ---------- 事件 ---------- */
  function bind() {
    const tabs = $("works-tabs");
    if (tabs) {
      tabs.addEventListener("click", e => {
        const btn = e.target.closest(".works-tab");
        if (!btn) return;
        activeSection = btn.dataset.section || "";
        shown = PAGE_SIZE;
        renderTabs();
        renderGrid();
      });
    }

    const search = $("works-search");
    if (search) {
      search.addEventListener("input", () => {
        keyword = search.value || "";
        shown = PAGE_SIZE;
        renderGrid();
      });
    }

    const more = $("works-more");
    if (more) {
      more.addEventListener("click", () => {
        shown += PAGE_SIZE;
        renderGrid();
      });
    }
  }

  renderLatest();
  renderStats();
  renderTabs();
  renderGrid();
  bind();
})();
