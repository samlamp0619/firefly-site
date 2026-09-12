/* 萨姆萤光灯 · 2026.9 发稿计划表
 * 四列：日期 / 歌曲 / 原唱 / 歌曲投稿人
 * 行颜色按「今天」与计划日期自动比较：
 *   计划日期 < 今天  → 灰色（已过）
 *   计划日期 = 今天  → 黄色（就是今天）
 *   计划日期 > 今天  → 绿色（待发稿）
 * 已发稿的歌在 link 里填 B 站视频地址，歌曲名就会变成可点击的直链；
 * 还没发的歌留空字符串，显示为普通文字。
 * 数据来源：26.09发稿计划.xlsx
 */
(() => {
  "use strict";

  const SCHEDULE = [
    { date: "2026-09-04", song: "爱你是我的秘密", singer: "庄淇玟（29#）", submitter: "", link: "" },
    { date: "2026-09-11", song: "认真的雪",       singer: "薛之谦",        submitter: "月寻", link: "" },
    { date: "2026-09-18", song: "与花逝去的我",   singer: "归尘回梦",      submitter: "", link: "" },
    { date: "2026-09-24", song: "我是如此相信",   singer: "周杰伦",        submitter: "甲鱼心不是鱼", link: "" },
    { date: "2026-09-26", song: "交缠舞步",       singer: "三Z-STUDIO/HOYO-MIX", submitter: "", link: "" },
    { date: "2026-09-30", song: "NIGHT DANCER",   singer: "imase",         submitter: "猫妖无忧", link: "" },
  ];

  const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const TAG = { past: "已过", today: "就是今天", future: "待发稿" };

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

  /* 2026-09-04 -> { md: "9月4日", wd: "周五" } */
  function dateParts(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return { md: m + "月" + d + "日", wd: WEEK[new Date(y, m - 1, d).getDay()] };
  }

  function stateOf(iso, today) {
    if (iso < today) return "past";
    if (iso === today) return "today";
    return "future";
  }

  /* 有 B 站直链就渲染成可点击的歌曲名，否则是普通文字 */
  function songCell(item) {
    const url = safeUrl(item.link);
    const name = esc(item.song);
    if (!url) return name;
    return '<a class="sched-link" href="' + esc(url) + '" target="_blank" rel="noopener"' +
      ' title="去 B 站看这期翻唱">' + name + '<span class="sched-link-mark">B站 ↗</span></a>';
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
        '<td class="sched-cell-singer" data-label="原唱">' + esc(item.singer) + '</td>' +
        '<td class="sched-cell-submitter" data-label="投稿人">' +
          (item.submitter ? esc(item.submitter) : '<span class="sched-empty">—</span>') +
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
