/* 萨姆萤光灯 · 2026.9 发稿计划表
 * 四列：日期 / 歌曲 / 原唱 / 歌曲投稿人
 * 行颜色按「今天」与计划日期自动比较：
 *   计划日期 < 今天  → 灰色（已过）
 *   计划日期 = 今天  → 黄色（就是今天）
 *   计划日期 > 今天  → 绿色（待发稿）
 * 数据来源：26.09发稿计划.xlsx
 */
(() => {
  "use strict";

  const SCHEDULE = [
    { date: "2026-09-04", song: "爱你是我的秘密", singer: "庄淇玟（29#）", submitter: "" },
    { date: "2026-09-11", song: "认真的雪",       singer: "薛之谦",        submitter: "月寻" },
    { date: "2026-09-18", song: "与花逝去的我",   singer: "归尘回梦",      submitter: "" },
    { date: "2026-09-24", song: "我是如此相信",   singer: "周杰伦",        submitter: "甲鱼心不是鱼" },
    { date: "2026-09-26", song: "交缠舞步",       singer: "三Z-STUDIO/HOYO-MIX", submitter: "" },
    { date: "2026-09-30", song: "NIGHT DANCER",   singer: "imase",         submitter: "猫妖无忧" },
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
        '<td class="sched-cell-song" data-label="歌曲">' + esc(item.song) + '</td>' +
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
