/* 萨姆萤光灯 · 2026.10 发稿计划（日历视图）
 * ============================================================
 * 左侧月历，右侧显示选中日期的详情。
 * 日期底色按「今天」与计划日期自动比较：
 *   计划日期 < 今天  → 灰色（已过）
 *   计划日期 = 今天  → 黄色（就是今天）
 *   计划日期 > 今天  → 绿色（待发稿）
 * 已发稿的歌在 link 里填 B 站视频地址，详情里会出现直链按钮。
 * 串烧类节目用 medley 列出曲目。
 * 数据来源：26.10发稿计划.xlsx
 * ============================================================
 */
(() => {
  "use strict";

  const SCHEDULE = [
    { date: "2026-10-02", song: "别让我担心", singer: "ChiliChill乐团", submitter: "", link: "" },
    { date: "2026-10-03", song: "按下按钮01", singer: "", submitter: "", link: "" },
    { date: "2026-10-05", song: "大鱼", singer: "周深", submitter: "三流昔_月莹涟", link: "" },
    { date: "2026-10-07", song: "残月", singer: "MOCKER44./乌托邦P/洛天依", submitter: "", link: "" },
    { date: "2026-10-10", song: "表白", singer: "萧亚轩", submitter: "冰汐_5fl2", link: "" },
    { date: "2026-10-16", song: "守村人", singer: "薛之谦", submitter: "", link: "" },
    { date: "2026-10-23", song: "2608歌曲投稿串烧（1）", singer: "", submitter: "", link: "",
      medley: ["风之子", "normal no more", "说好的幸福呢"] },
    { date: "2026-10-30", song: "秋凉", singer: "花烬_Phoenix/Kascout/星尘", submitter: "", link: "" },
  ];

  const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const TAG = { past: "已过", today: "就是今天", future: "待发稿" };
  const EMPTY = '<span class="detail-empty">—</span>';

  const pad = n => String(n).padStart(2, "0");
  const iso = (y, m, d) => y + "-" + pad(m + 1) + "-" + pad(d);

  /* 本地时区的「今天」，格式与数据一致（YYYY-MM-DD），可直接字符串比较 */
  function todayKey() {
    const d = new Date();
    return iso(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  /* 只放行 http(s) 链接，避免数据被改坏时注入 javascript: 之类 */
  function safeUrl(url) {
    return /^https?:\/\//i.test(String(url || "")) ? String(url) : "";
  }

  function stateOf(date, today) {
    if (date < today) return "past";
    if (date === today) return "today";
    return "future";
  }

  /* 2026-10-07 -> { md: "10月7日", wd: "周三" } */
  function dateParts(date) {
    const [y, m, d] = date.split("-").map(Number);
    return { md: m + "月" + d + "日", wd: WEEK[new Date(y, m - 1, d).getDay()] };
  }

  const byDate = new Map();
  SCHEDULE.forEach(item => byDate.set(item.date, item));

  /* ---------- 视图状态 ---------- */
  let today = todayKey();
  const [ty, tm] = today.split("-").map(Number);
  let view = { year: ty, month: tm - 1 };   // month 从 0 开始
  let selected = "";

  /* 打开时选中哪天：今天有安排就选今天，否则选本月最近的一期 */
  function pickDefault(year, month) {
    if (byDate.has(today)) return today;
    const prefix = year + "-" + pad(month + 1);
    const list = SCHEDULE.map(s => s.date).filter(d => d.startsWith(prefix)).sort();
    if (!list.length) return "";
    return list.find(d => d > today) || list[list.length - 1];
  }

  /* ---------- 左：月历 ---------- */
  function renderCal() {
    const grid = document.getElementById("cal-grid");
    const title = document.getElementById("cal-title");
    if (!grid) return;

    if (title) title.textContent = view.year + " 年 " + (view.month + 1) + " 月";

    const firstWeekday = new Date(view.year, view.month, 1).getDay();          // 0 = 周日
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();

    let html = "";
    for (let i = 0; i < firstWeekday; i++) {
      html += '<span class="cal-day is-blank" aria-hidden="true"></span>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = iso(view.year, view.month, d);
      const item = byDate.get(date);
      const cls = ["cal-day"];
      const st = stateOf(date, today);
      if (item) {
        cls.push("has-song");
        // 今天统一由下面的 is-today 表达，避免同一个类名push两次
        if (st !== "today") cls.push("is-" + st);
      }
      if (date === today) cls.push("is-today");
      if (date === selected) cls.push("is-selected");

      html += '<button type="button" class="' + cls.join(" ") + '" data-date="' + date + '"' +
        (item ? ' title="' + esc(item.song) + '"' : '') + '>' +
        '<span class="cal-num">' + d + '</span>' +
        (item ? '<span class="cal-song">' + esc(item.song) + '</span>' : '') +
        '</button>';
    }
    grid.innerHTML = html;
  }

  /* ---------- 右：选中日期的详情 ---------- */
  function renderDetail() {
    const box = document.getElementById("cal-detail");
    if (!box) return;

    if (!selected) {
      box.innerHTML = '<p class="detail-none">这个月还没有安排～</p>';
      return;
    }

    const { md, wd } = dateParts(selected);
    const head = '<div class="detail-head">' +
      '<span class="detail-date">' + md + '<em>' + wd + '</em></span>' +
      '</div>';

    const item = byDate.get(selected);
    if (!item) {
      box.innerHTML = head + '<p class="detail-none">这天没有安排～</p>';
      return;
    }

    const state = stateOf(selected, today);
    const url = safeUrl(item.link);

    let html = head +
      '<span class="detail-tag is-' + state + '">' + TAG[state] + '</span>' +
      '<h3 class="detail-song">' + esc(item.song) + '</h3>';

    if (Array.isArray(item.medley) && item.medley.length) {
      html += '<p class="detail-medley">串烧曲目：' + item.medley.map(esc).join(" / ") + '</p>';
    }

    html += '<dl class="detail-meta">' +
      '<div><dt>原唱</dt><dd>' + (item.singer ? esc(item.singer) : EMPTY) + '</dd></div>' +
      '<div><dt>投稿人</dt><dd>' + (item.submitter ? esc(item.submitter) : EMPTY) + '</dd></div>' +
      '</dl>';

    html += url
      ? '<a class="detail-link" href="' + esc(url) + '" target="_blank" rel="noopener">去 B 站看这一期 →</a>'
      : '<p class="detail-soon">还没有发布，到时候会在这里放上 B 站直链～</p>';

    box.innerHTML = html;
  }

  function renderAll() {
    renderCal();
    renderDetail();
  }

  /* ---------- 交互 ---------- */
  const grid = document.getElementById("cal-grid");
  if (grid) {
    grid.addEventListener("click", e => {
      const btn = e.target.closest(".cal-day[data-date]");
      if (!btn) return;
      selected = btn.dataset.date;
      renderAll();
    });
  }

  function shiftMonth(delta) {
    const d = new Date(view.year, view.month + delta, 1);
    view = { year: d.getFullYear(), month: d.getMonth() };
    // 换月后：选中的那天还在这个月就保留，否则重新挑一个
    const prefix = view.year + "-" + pad(view.month + 1);
    if (!selected.startsWith(prefix)) selected = pickDefault(view.year, view.month);
    renderAll();
  }

  const prev = document.getElementById("cal-prev");
  const next = document.getElementById("cal-next");
  if (prev) prev.addEventListener("click", () => shiftMonth(-1));
  if (next) next.addEventListener("click", () => shiftMonth(1));

  /* ---------- 首次渲染 ---------- */
  selected = pickDefault(view.year, view.month);
  renderAll();

  /* 页面跨零点挂着时，日期一变就重新着色 */
  setInterval(() => {
    const t = todayKey();
    if (t !== today) { today = t; renderAll(); }
  }, 60000);
})();
