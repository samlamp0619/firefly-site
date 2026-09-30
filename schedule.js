/* 萨姆萤光灯 · 2026.10 发稿计划表
 * 四列：日期 / 歌曲 / 原唱 / 歌曲投稿人
 * 行颜色按「今天」与计划日期自动比较：
 *   计划日期 < 今天  → 灰色（已过）
 *   计划日期 = 今天  → 黄色（就是今天）
 *   计划日期 > 今天  → 绿色（待发稿）
 * 已发稿的歌在 link 里填 B 站视频地址，歌曲名就会变成可点击的直链；
 * 还没发的歌留空字符串，显示为普通文字。
 * 串烧类节目用 medley 列出曲目，会作为小字附在歌名下面。
 * 数据来源：26.10发稿计划.xlsx
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
  const EMPTY = '<span class="sched-empty">—</span>';

  const pad = n => String(n).padStart(2, "0");

  /* 本地时区的「今天」，格式与数据一致（YYYY-MM-DD），可直接字符串比较 */
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
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

  /* 2026-10-02 -> { md: "10月2日", wd: "周五" } */
  function dateParts(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return { md: m + "月" + d + "日", wd: WEEK[new Date(y, m - 1, d).getDay()] };
  }

  function stateOf(iso, today) {
    if (iso < today) return "past";
    if (iso === today) return "today";
    return "future";
  }

  /* 有 B 站直链就渲染成可点击的歌曲名；串烧再附一行小字曲目 */
  function songCell(item) {
    const url = safeUrl(item.link);
    const name = esc(item.song);
    let out = url
      ? '<a class="sched-link" href="' + esc(url) + '" target="_blank" rel="noopener"' +
        ' title="去 B 站看这期翻唱">' + name + '<span class="sched-link-mark">B站 ↗</span></a>'
      : name;

    if (Array.isArray(item.medley) && item.medley.length) {
      out += '<span class="sched-medley">串烧曲目：' +
        item.medley.map(esc).join(" / ") + '</span>';
    }
    return out;
  }

  function render() {
    const body = document.getElementById("schedule-body");
    if (!body) return;

    const today = todayKey();
    body.dataset.today = today;

    body.innerHTML = SCHEDULE.map(item => {
      const state = stateOf(item.date, today);
      const { md, wd } = dateParts(item.date);
      return '<tr class="sched-row is-' + state + '" title="' + esc(item.date) + '">' +
        '<td class="sched-cell-date" data-label="日期">' +
          '<span class="sched-date">' + md + '<em>' + wd + '</em></span>' +
          '<span class="sched-tag">' + TAG[state] + '</span>' +
        '</td>' +
        '<td class="sched-cell-song" data-label="歌曲">' + songCell(item) + '</td>' +
        '<td class="sched-cell-singer" data-label="原唱">' +
          (item.singer ? esc(item.singer) : EMPTY) +
        '</td>' +
        '<td class="sched-cell-submitter" data-label="投稿人">' +
          (item.submitter ? esc(item.submitter) : EMPTY) +
        '</td>' +
      '</tr>';
    }).join("");
  }

  render();

  /* 页面跨零点挂着时，日期一变就重新着色 */
  setInterval(() => {
    const body = document.getElementById("schedule-body");
    if (body && body.dataset.today !== todayKey()) render();
  }, 60000);
})();
