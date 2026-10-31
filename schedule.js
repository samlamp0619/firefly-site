/* 萨姆萤光灯 · 2026.10 发稿计划（日历视图）
 * ============================================================
 * 左侧月历，右侧显示选中日期的详情。
 * 日期底色按「今天」与计划日期自动比较：
 *   计划日期 < 今天  → 灰色（已过）
 *   计划日期 = 今天  → 黄色（就是今天）
 *   计划日期 > 今天  → 绿色（待发稿）
 * 已发稿的歌在 link 里填 B 站视频地址，详情里会出现直链按钮。
 * 串烧类节目用 medley 列出曲目。
 * 数据来源：26.10发稿计划.xlsx + 26.11发稿计划.xlsx
 * 多个月份共用一套数据，用标题两侧的 ‹ › 切换月份。
 * ============================================================
 */
(() => {
  "use strict";

  const SCHEDULE = [
    /* ---------- 2025.12 ---------- */
    { date: "2025-12-31", song: "错位时空【混剪向】", singer: "艾辰", submitter: "", link: "https://www.bilibili.com/video/BV1cAiKBGEVo", status: "已发布" },

    /* ---------- 2026.01 ---------- */
    { date: "2026-01-01", song: "The way I still love you （就像我还爱你一样）", singer: "Reynard Silva", submitter: "不******", link: "https://www.bilibili.com/video/BV1d1vDB4Er3", status: "已发布" },
    { date: "2026-01-02", song: "恋人", singer: "李荣浩", submitter: "只*****", link: "https://www.bilibili.com/video/BV1bZiFBgE6n", status: "已发布" },
    { date: "2026-01-03", song: "人类祈祷记录", singer: "Akie秋绘", submitter: "", link: "https://www.bilibili.com/video/BV167ivBsESv", status: "已发布" },
    { date: "2026-01-04", song: "雨爱", singer: "杨丞琳", submitter: "律*/萤**/信*****", link: "https://www.bilibili.com/video/BV1qDiLBcEHX", status: "已发布" },
    { date: "2026-01-09", song: "one more last time", singer: "Henry Young/Ashley Alisha", submitter: "天**", link: "https://www.bilibili.com/video/BV1Q1rKB3E9Z", status: "已发布" },
    { date: "2026-01-16", song: "堕", singer: "星火社", submitter: "s************", link: "", status: "已发布" },
    { date: "2026-01-23", song: "欧若拉", singer: "张韶涵", submitter: "", link: "https://www.bilibili.com/video/BV17YzNBCEkc", status: "已发布" },
    { date: "2026-01-30", song: "葡萄成熟时", singer: "陈奕迅", submitter: "我*******", link: "https://www.bilibili.com/video/BV1dH6vB4EJX", status: "已发布" },

    /* ---------- 2026.02 ---------- */
    { date: "2026-02-01", song: "跳楼机【流萤填翻】", singer: "-", submitter: "", link: "https://www.bilibili.com/video/BV1WA6vBzEC7", status: "已发布" },
    { date: "2026-02-03", song: "我只能离开", singer: "颜人中", submitter: "球****", link: "https://www.bilibili.com/video/BV19AF5z2Epd", status: "已发布" },
    { date: "2026-02-05", song: "在树上唱歌（1月雨爱占档）", singer: "郭静", submitter: "", link: "https://www.bilibili.com/video/BV1FxFYzyES9", status: "已发布" },
    { date: "2026-02-07", song: "不值得", singer: "梦飞船", submitter: "律*", link: "https://www.bilibili.com/video/BV1UvFszvEE9", status: "已发布" },
    { date: "2026-02-09", song: "啥啊", singer: "星葵77/洛天依Official", submitter: "", link: "https://www.bilibili.com/video/BV1hVcFzqEL9", status: "已发布" },
    { date: "2026-02-11", song: "我看过", singer: "周星星", submitter: "萤***", link: "https://www.bilibili.com/video/BV1s5ctz6Et4", status: "已发布" },
    { date: "2026-02-13", song: "如果可以", singer: "韦礼安", submitter: "", link: "https://www.bilibili.com/video/BV1yZcjzrE3j", status: "已发布" },
    { date: "2026-02-15", song: "海屿你", singer: "马也_Crabbit", submitter: "", link: "", status: "已发布" },
    { date: "2026-02-16", song: "春意红包", singer: "泠鸢yousa", submitter: "", link: "https://www.bilibili.com/video/BV1xGZTB6ETC", status: "已发布" },
    { date: "2026-02-17", song: "人间共鸣", singer: "李健", submitter: "", link: "https://www.bilibili.com/video/BV1EgZkBfEcf", status: "已发布" },
    { date: "2026-02-19", song: "春日影", singer: "CRYCHIC", submitter: "咳********", link: "https://www.bilibili.com/video/BV1eyZeBYExH", status: "已发布" },
    { date: "2026-02-21", song: "雨过后的风景", singer: "Dizzy Dizzo（蔡诗芸）", submitter: "", link: "https://www.bilibili.com/video/BV1UYfEBUEUW", status: "已发布" },
    { date: "2026-02-23", song: "星月神话", singer: "金莎", submitter: "小断腿**", link: "https://www.bilibili.com/video/BV1WdfiBoE4q", status: "已发布" },
    { date: "2026-02-25", song: "咏春", singer: "七朵组合", submitter: "", link: "https://www.bilibili.com/video/BV1J1fxB9EEm", status: "已发布" },
    { date: "2026-02-28", song: "有些", singer: "颜人中", submitter: "二****", link: "https://www.bilibili.com/video/BV1BkAUzfEET", status: "已发布" },

    /* ---------- 2026.03 ---------- */
    { date: "2026-03-06", song: "小半", singer: "陈粒", submitter: "", link: "https://www.bilibili.com/video/BV14aPszGEE2", status: "已发布" },
    { date: "2026-03-13", song: "晴天", singer: "周杰伦", submitter: "螢*****、傻****", link: "https://www.bilibili.com/video/BV1FtcDzcEgK", status: "已发布" },
    { date: "2026-03-20", song: "反乌托邦", singer: "乌托邦p", submitter: "", link: "https://www.bilibili.com/video/BV1cmAnzXEbm", status: "已发布" },
    { date: "2026-03-27", song: "飞萤燃夜", singer: "星尘infinity", submitter: "吾****", link: "https://www.bilibili.com/video/BV1wRXKBsE1T", status: "已发布" },

    /* ---------- 2026.04 ---------- */
    { date: "2026-04-03", song: "复梦天使", singer: "三Z-STUDIO/HOYO-MIX", submitter: "", link: "https://www.bilibili.com/video/BV1zv9uBZEA5", status: "已发布" },
    { date: "2026-04-04", song: "相信光（照亮未来）", singer: "炫动小霸王", submitter: "是***************", link: "https://www.bilibili.com/video/BV1qgDMBLE8N", status: "已发布" },
    { date: "2026-04-05", song: "春日梦语", singer: "王子健", submitter: "", link: "https://www.bilibili.com/video/BV1ekSUBQEzz", status: "已发布" },
    { date: "2026-04-06", song: "不说 (原来是不说)", singer: "周公", submitter: "萤*", link: "", status: "效果不佳未制作" },
    { date: "2026-04-10", song: "最初的记忆", singer: "徐佳莹", submitter: "", link: "https://www.bilibili.com/video/BV1X6QwBsEwZ", status: "已发布" },
    { date: "2026-04-17", song: "霜雪千年", singer: "洛天依Official/乐正绫", submitter: "*", link: "https://www.bilibili.com/video/BV1rfdBBQEfs", status: "已发布" },
    { date: "2026-04-24", song: "走马", singer: "陈粒", submitter: "", link: "https://www.bilibili.com/video/BV1Vco5BMEt6", status: "已发布" },
    { date: "2026-04-30", song: "勾指起誓", singer: "洛天依Official（冷鸢yousa）", submitter: "枫***", link: "https://www.bilibili.com/video/BV1Kp9aBKEbP", status: "已发布" },

    /* ---------- 2026.05 ---------- */
    { date: "2026-05-02", song: "于是", singer: "郑润泽", submitter: "", link: "https://www.bilibili.com/video/BV1hdR7BgErC", status: "已发布" },
    { date: "2026-05-03", song: "熄灭", singer: "TC", submitter: "", link: "https://www.bilibili.com/video/BV1PLRFByETR", status: "已发布" },
    { date: "2026-05-04", song: "我好像在哪里见过你", singer: "薛之谦", submitter: "", link: "", status: "已发布" },
    { date: "2026-05-08", song: "那天下雨了", singer: "周杰伦", submitter: "d****", link: "https://www.bilibili.com/video/BV1ZwRQB5ETy", status: "已发布" },
    { date: "2026-05-15", song: "Ai đưa em về", singer: "TIA/Lê Thiện Hiếu/CUKAK", submitter: "", link: "https://www.bilibili.com/video/BV1BR5e6eEhh", status: "已发布" },
    { date: "2026-05-22", song: "STYX HELIX", singer: "MYTH & ROID", submitter: "信*****", link: "https://www.bilibili.com/video/BV1sXGt69E29", status: "已发布" },
    { date: "2026-05-29", song: "眼泪的汛期", singer: "王唯旖", submitter: "", link: "https://www.bilibili.com/video/BV1A8Vh6cEBH", status: "已制作" },

    /* ---------- 2026.06 ---------- */
    { date: "2026-06-05", song: "记·念", singer: "雷雨心", submitter: "", link: "https://www.bilibili.com/video/BV1Nf7k6yEQc", status: "已发布" },
    { date: "2026-06-12", song: "焚蝶", singer: "铁痕电台-MSR/Aurora Sky", submitter: "流****", link: "https://www.bilibili.com/video/BV1hAE26aErS", status: "已发布" },
    { date: "2026-06-19", song: "嘉宾【流萤填翻】", singer: "-", submitter: "", link: "https://www.bilibili.com/video/BV1cuJc6REtt", status: "已发布" },
    { date: "2026-06-20", song: "只对你有感觉", singer: "林俊杰", submitter: "", link: "https://www.bilibili.com/video/BV1tAjr6gEGd", status: "已发布" },
    { date: "2026-06-21", song: "I Can't Wait", singer: "d0tc0mmie/GUMI", submitter: "海***", link: "https://www.bilibili.com/video/BV1W9jn6yEhj", status: "已发布" },
    { date: "2026-06-26", song: "妖精小姐的魔法邀约", singer: "宴宁/HOYO-MiX", submitter: "", link: "https://www.bilibili.com/video/BV1yh7q6tEmj", status: "已发布" },
    { date: "2026-06-30", song: "你", singer: "郑润泽", submitter: "悸*", link: "", status: "已制作" },

    /* ---------- 2026.07 ---------- */
    { date: "2026-07-02", song: "安荣", singer: "死水微澜乐队", submitter: "", link: "https://www.bilibili.com/video/BV1hyTk6ZEGA", status: "已发布" },
    { date: "2026-07-04", song: "蠢货", singer: "喻言", submitter: "手段在", link: "https://www.bilibili.com/video/BV14kTf6PEZL", status: "已发布" },
    { date: "2026-07-06", song: "宇宙一隅的我", singer: "长长长安pwp", submitter: "", link: "https://www.bilibili.com/video/BV1B1TD6FE6n", status: "已发布" },
    { date: "2026-07-08", song: "一个人想着一个人", singer: "曾沛慈", submitter: "星夜不想早睡", link: "https://www.bilibili.com/video/BV1NtMe6hE2f", status: "已发布" },
    { date: "2026-07-10", song: "Montagem pitty（拼接遗憾）", singer: "见过夏天P/洛天依", submitter: "", link: "https://www.bilibili.com/video/BV1WdNj6qEWt", status: "已发布" },
    { date: "2026-07-14", song: "小气鬼", singer: "王澳楠EVE", submitter: "微微萤火照亮我", link: "https://www.bilibili.com/video/BV1ZSNQ6tEB3", status: "已发布" },
    { date: "2026-07-16", song: "筑梦边境", singer: "KBShinya/三无Marblue", submitter: "", link: "https://www.bilibili.com/video/BV1TwKu6sECE", status: "已发布" },
    { date: "2026-07-18", song: "下雨天", singer: "与少年他/芝麻Mochi", submitter: "黔禄", link: "https://www.bilibili.com/video/BV1FwKc6pEnx", status: "已发布" },
    { date: "2026-07-19", song: "下一站", singer: "HOYO-MIX/小林未郁", submitter: "", link: "https://www.bilibili.com/video/BV1WpKB6YEhY", status: "已发布" },
    { date: "2026-07-20", song: "阴天", singer: "莫文蔚", submitter: "", link: "https://www.bilibili.com/video/BV1CBK26sEao", status: "已发布" },
    { date: "2026-07-22", song: "願い～あの頃のキミへ～（祈愿～致那时候的你～）", singer: "當山みれい", submitter: "梦醒时分", link: "", status: "已发布" },
    { date: "2026-07-24", song: "Summer Dream", singer: "chevy", submitter: "", link: "https://www.bilibili.com/video/BV1Huga6XEG8", status: "已发布" },
    { date: "2026-07-26", song: "肯定", singer: "是二哈ya", submitter: "流萤622", link: "https://www.bilibili.com/video/BV1z33L6gEkg", status: "已发布" },
    { date: "2026-07-28", song: "老男孩", singer: "杨坤/王源", submitter: "", link: "https://www.bilibili.com/video/BV1BU3e6oEbw", status: "已制作" },
    { date: "2026-07-30", song: "过火", singer: "张信哲", submitter: "饜照", link: "https://www.bilibili.com/video/BV1243a6PEZD", status: "已制作" },

    /* ---------- 2026.08 ---------- */
    { date: "2026-08-01", song: "自由落体", singer: "FREEFALL/诗岸", submitter: "", link: "https://www.bilibili.com/video/BV1JgGg68EEa", status: "已发布" },
    { date: "2026-08-03", song: "山茶花读不懂白玫瑰", singer: "梨笑笑", submitter: "余念耿耿", link: "https://www.bilibili.com/video/BV1Tv3f6CEjY", status: "已发布" },
    { date: "2026-08-05", song: "蝴蝶", singer: "洛天依", submitter: "", link: "https://www.bilibili.com/video/BV1KwMk6HE35", status: "已发布" },
    { date: "2026-08-07", song: "指纹", singer: "胡歌", submitter: "洛子/.", link: "https://www.bilibili.com/video/BV1amus6SE23", status: "已发布" },
    { date: "2026-08-09", song: "我多想说再见啊", singer: "柯立可", submitter: "", link: "https://www.bilibili.com/video/BV1ASuj6jEZM", status: "已发布" },
    { date: "2026-08-11", song: "爱，存在", singer: "魏奇奇", submitter: "梦醒时分", link: "https://www.bilibili.com/video/BV1e7uY6GE4a", status: "已发布" },
    { date: "2026-08-13", song: "越过长夜", singer: "拂言", submitter: "", link: "https://www.bilibili.com/video/BV168gJ6SEL5", status: "已发布" },
    { date: "2026-08-15", song: "青衣", singer: "是阿瑶吖", submitter: "饜照", link: "https://www.bilibili.com/video/BV1UXgM6NEVA", status: "已发布" },
    { date: "2026-08-17", song: "夏日尽头的我们", singer: "命运结构/诗岸", submitter: "", link: "https://www.bilibili.com/video/BV1bCbh6LENP", status: "已发布" },
    { date: "2026-08-19", song: "樱花草", singer: "Sweety", submitter: "", link: "https://www.bilibili.com/video/BV1AE8j6cEL6", status: "已发布" },
    { date: "2026-08-21", song: "猛毒注意·中文填词", singer: "元谋YUMI/洛天依", submitter: "", link: "", status: "已发布" },
    { date: "2026-08-23", song: "黑洞里", singer: "方大同", submitter: "黑洞Li", link: "https://www.bilibili.com/video/BV1G98s6ME8b", status: "已发布" },
    { date: "2026-08-25", song: "最美的期待", singer: "周笔畅", submitter: "坤白_新春限定", link: "https://www.bilibili.com/video/BV1J7hu6rEmq", status: "已发布" },
    { date: "2026-08-27", song: "星空剪影", singer: "蓝心羽", submitter: "蓝心羽", link: "", status: "已制作" },
    { date: "2026-08-29", song: "小情歌", singer: "苏打绿", submitter: "Fire", link: "https://www.bilibili.com/video/BV1y1426GEwH" },
    { date: "2026-08-31", song: "盛放", singer: "见过夏天P/洛天依", submitter: "", link: "https://www.bilibili.com/video/BV1z4t462EiN" },

    /* ---------- 2026.09 ---------- */
    { date: "2026-09-04", song: "爱你是我的秘密", singer: "庄淇玟（29#）", submitter: "", link: "https://www.bilibili.com/video/BV1pEtB6QEfP" },
    { date: "2026-09-11", song: "认真的雪", singer: "薛之谦", submitter: "月寻", link: "https://www.bilibili.com/video/BV1eHY76oE4T" },
    { date: "2026-09-18", song: "与花逝去的我", singer: "归尘回梦", submitter: "", link: "https://www.bilibili.com/video/BV1Evem6WE6W" },
    { date: "2026-09-24", song: "我是如此相信", singer: "周杰伦", submitter: "甲鱼心不是鱼", link: "https://www.bilibili.com/video/BV1ucaK6UEXL" },
    { date: "2026-09-26", song: "交缠舞步", singer: "三Z-STUDIO/HOYO-MIX", submitter: "", link: "" },
    { date: "2026-09-30", song: "NIGHT DANCER", singer: "imase", submitter: "猫妖无忧", link: "https://www.bilibili.com/video/BV1jEao6uEfo" },

    /* ---------- 2026.10 ---------- */
    { date: "2026-10-02", song: "别让我担心", singer: "ChiliChill乐团", submitter: "", link: "https://www.bilibili.com/video/BV1D9a26eEbx" },
    { date: "2026-10-03", song: "按下按钮01", singer: "", submitter: "", link: "" },
    { date: "2026-10-05", song: "大鱼", singer: "周深", submitter: "三流昔_月莹涟", link: "https://www.bilibili.com/video/BV1SdHx6jExA" },
    { date: "2026-10-07", song: "残月", singer: "MOCKER44./乌托邦P/洛天依", submitter: "", link: "https://www.bilibili.com/video/BV1zKHC6CE7T" },
    { date: "2026-10-10", song: "表白", singer: "萧亚轩", submitter: "冰汐_5fl2", link: "https://www.bilibili.com/video/BV1sNpg6FEAi" },
    { date: "2026-10-16", song: "守村人", singer: "薛之谦", submitter: "", link: "https://www.bilibili.com/video/BV1yXJt6uEbH" },
    { date: "2026-10-23", song: "2608歌曲投稿串烧（1）", singer: "", submitter: "", link: "",
      medley: ["风之子", "normal no more", "说好的幸福呢"] },
    { date: "2026-10-30", song: "秋凉", singer: "花烬_Phoenix/Kascout/星尘", submitter: "", link: "" },

    /* ---------- 2026.11 ---------- */
    { date: "2026-11-01", song: "我乘着风飞过来", singer: "洪辰/宁桓宇", submitter: "", link: "" },
    { date: "2026-11-06", song: "Da Capo", singer: "HOYO-MiX", submitter: "信我包卫萤的", link: "" },
    { date: "2026-11-08", song: "按下按钮02", singer: "", submitter: "", link: "" },
    { date: "2026-11-13", song: "我们俩", singer: "郭顶", submitter: "流萤622", link: "" },
    { date: "2026-11-15", song: "茶汤", singer: "郁可唯", submitter: "唱山歌的昔米露", link: "" },
    { date: "2026-11-20", song: "你/我 于万千星辰", singer: "3xg233/洛天依", submitter: "", link: "" },
    { date: "2026-11-27", song: "2608歌曲投稿串烧（2）", singer: "", submitter: "", link: "",
      medley: ["烂关系", "你是我爱这世界的原因", "真命天女"] },
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

    /* 板块大标题跟着当前月份走，切到 11 月就显示「2026.11 发稿计划」 */
    const secTitle = document.getElementById("schedule-title");
    if (secTitle) secTitle.textContent = view.year + "." + pad(view.month + 1) + " 发稿计划";

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

    /* 没有直链时按「状态」说话，别把已经发了的说成「还没有发布」 */
    const status = String(item.status || "");
    let tail;
    if (url) {
      tail = '<a class="detail-link" href="' + esc(url) + '" target="_blank" rel="noopener">去 B 站看这一期 →</a>';
    } else if (status === "已制作") {
      tail = '<p class="detail-soon">已经做好啦，等排期发布～</p>';
    } else if (status === "效果不佳未制作") {
      tail = '<p class="detail-soon">这期效果不太理想，最后没有制作～</p>';
    } else if (status === "已发布") {
      tail = '<p class="detail-soon">已经发布了，B 站直链还在补～</p>';
    } else {
      tail = '<p class="detail-soon">还没有发布，到时候会在这里放上 B 站直链～</p>';
    }
    html += tail;

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
