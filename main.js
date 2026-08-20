/* 萨姆萤光灯 · 个人主页脚本 */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ================= 背景图：实时池 + 本地兜底 + 只看实时开关 ================= */
  const LOCAL_BG = [
    { url: "assets/bg/bg-140591786.png", credit: "背景 © Pixiv 140591786" },
    { url: "assets/bg/bg-144019913.png", credit: "背景 © Pixiv 144019913「春日手信」" },
    { url: "assets/bg/bg-139886638.jpg", credit: "背景 © Pixiv 139886638「萤涟蝶梦」" },
    { url: "assets/bg/bg-143979655.png", credit: "背景 © Pixiv 143979655" },
    { url: "assets/bg/bg-141185006.png", credit: "背景 © Pixiv 141185006" },
  ];

  // 由 refresh_bg.py 生成的实时图（bg-realtime.js 注入），file:// 打开也兼容
  let realtimeBg = Array.isArray(window.REALTIME_BG) ? window.REALTIME_BG : [];

  // 「只看实时」开关：默认关，记忆在 localStorage
  let rtOnly = false;
  try { rtOnly = localStorage.getItem("bg-rt-only") === "1"; } catch {}

  const rtToggle = document.getElementById("rt-only");
  if (rtToggle) rtToggle.checked = rtOnly;

  function mergePool(a, b) {
    const seen = new Set();
    const out = [];
    [...a, ...b].forEach(it => {
      if (it && it.url && !seen.has(it.url)) { seen.add(it.url); out.push(it); }
    });
    return out;
  }

  // 按开关状态决定轮播池
  function currentPool() {
    return rtOnly ? mergePool(realtimeBg, []) : mergePool(realtimeBg, LOCAL_BG);
  }

  let pool = currentPool();

  const carousel = document.getElementById("bg-carousel");
  const layers = carousel.querySelectorAll(".bg-layer");
  const creditEl = document.getElementById("bg-credit");
  const refreshBtn = document.getElementById("bg-refresh");

  let loadedIdx = [];   // pool 中已成功预载的下标
  let pos = 0;
  let layerTurn = 0;
  let shown = false;
  let timer = null;

  function activate(idx) {
    const it = pool[idx];
    const layer = layers[layerTurn % 2];
    layer.style.backgroundImage = 'url("' + it.url + '")';
    layer.classList.remove("kb");
    void layer.offsetWidth; // 强制重排，重启 kenburns 动画
    layer.classList.add("active", "kb");
    layers[(layerTurn + 1) % 2].classList.remove("active");
    if (creditEl) creditEl.textContent = it.credit || "";
    layerTurn++;
  }

  function startTimer() {
    if (timer || reduceMotion) return;
    timer = setInterval(() => {
      if (loadedIdx.length === 0) return;
      pos = (pos + 1) % loadedIdx.length;
      activate(loadedIdx[pos]);
    }, 8000);
  }

  function showFirst() {
    if (shown) return;
    shown = true;
    if (loadedIdx.length === 0) return; // 全部失败则保持渐变底
    carousel.classList.add("ready");
    activate(loadedIdx[0]);
    startTimer();
  }

  function preloadAndShow() {
    loadedIdx = [];
    pool.forEach((it, i) => {
      const img = new Image();
      img.onload = () => { loadedIdx.push(i); showFirst(); };
      img.onerror = () => { /* 加载失败的图自动跳过 */ };
      img.src = it.url;
    });
    // 保险：3 秒内还没显示第一张也直接尝试
    setTimeout(() => {
      if (shown) return;
      shown = true;
      const first = loadedIdx.length ? loadedIdx[0] : 0;
      carousel.classList.add("ready");
      activate(first);
      startTimer();
    }, 3000);
  }

  // 按当前开关状态重建轮播
  function restartCarousel() {
    pos = 0; layerTurn = 0; shown = false;
    if (timer) { clearInterval(timer); timer = null; }
    pool = currentPool();
    if (pool.length === 0) {
      carousel.classList.remove("ready");
      layers.forEach(l => { l.classList.remove("active", "kb"); l.style.backgroundImage = ""; });
      if (creditEl) creditEl.textContent = rtOnly ? "暂无实时图，运行 refresh_bg.py 或点「换一批」" : "";
      return;
    }
    preloadAndShow();
  }

  // 开关事件
  if (rtToggle) {
    rtToggle.addEventListener("change", () => {
      rtOnly = rtToggle.checked;
      try { localStorage.setItem("bg-rt-only", rtOnly ? "1" : "0"); } catch {}
      restartCarousel();
    });
  }

  /* ================= 实时换一批 ================= */
  // 浏览器直连 lolicon（服务端已验证可用；浏览器端受 CORS 影响，失败则自动降级）
  async function fetchLive() {
    const url = "https://api.lolicon.app/setu/v2?r18=0&num=6&size=regular&excludeAI=1&tag="
      + encodeURIComponent("流萤");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (j.error || !Array.isArray(j.data)) throw new Error("API error");
      return j.data.map(d => ({
        url: (d.urls && (d.urls.regular || d.urls.original)) || "",
        credit: "实时 © " + (d.author || "Pixiv") + "（" + d.pid + "）",
      })).filter(it => it.url);
    } catch {
      return [];
    } finally {
      clearTimeout(t);
    }
  }

  // 重新加载 refresh_bg.py 生成的 bg-realtime.js（带时间戳防缓存）
  function loadRealtimeFile() {
    return new Promise(resolve => {
      const s = document.createElement("script");
      s.src = "bg-realtime.js?t=" + Date.now();
      s.onload = () => resolve(Array.isArray(window.REALTIME_BG) ? window.REALTIME_BG : []);
      s.onerror = () => resolve([]);
      document.head.appendChild(s);
    });
  }

  async function refreshBackgrounds() {
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "刷新中…";
    }
    let items = await fetchLive();                    // 1) 浏览器直连尝试
    const fileItems = await loadRealtimeFile();       // 2) 重读刷新脚本产物
    if (items.length === 0) items = fileItems;
    else if (fileItems.length > 0) items = items.concat(fileItems);

    if (items.length > 0) {
      realtimeBg = items;
      restartCarousel();
      if (creditEl) creditEl.textContent = "已刷新 ✓";
      setTimeout(() => {
        if (creditEl && loadedIdx.length) creditEl.textContent = pool[loadedIdx[0]].credit || "";
      }, 1800);
    } else if (creditEl) {
      creditEl.textContent = rtOnly
        ? "实时源不可用，请运行 refresh_bg.py 获取实时图"
        : "实时源不可用，继续使用本地图";
    }
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "🔄 换一批";
    }
  }

  if (refreshBtn) refreshBtn.addEventListener("click", refreshBackgrounds);

  /* ================= 背景粒子：樱花 + 萤火虫 ================= */
  const canvas = document.getElementById("fx-canvas");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, petals = [], fireflies = [];
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function rand(min, max) { return Math.random() * (max - min) + min; }

  function spawnPetals() {
    const count = Math.min(42, Math.floor(W / 26));
    petals = Array.from({ length: count }, () => ({
      x: rand(-40, W + 40),
      y: rand(-H, H),
      size: rand(6, 13),
      speedY: rand(0.5, 1.6),
      sway: rand(0.4, 1.2),
      phase: rand(0, Math.PI * 2),
      rot: rand(0, Math.PI * 2),
      rotSpeed: rand(-0.02, 0.02),
      alpha: rand(0.45, 0.85),
      hue: Math.random() > 0.35 ? 335 : 265,
    }));
  }

  function spawnFireflies() {
    const count = Math.min(18, Math.floor(W / 70));
    fireflies = Array.from({ length: count }, () => ({
      x: rand(0, W),
      y: rand(0, H),
      r: rand(1.6, 3.4),
      vx: rand(-0.25, 0.25),
      vy: rand(-0.2, 0.2),
      pulse: rand(0, Math.PI * 2),
      pulseSpeed: rand(0.015, 0.04),
    }));
  }

  function drawPetal(p) {
    p.y += p.speedY;
    p.phase += 0.012;
    p.rot += p.rotSpeed;
    p.x += Math.sin(p.phase) * p.sway * 0.6;

    if (p.y > H + 30) { p.y = -30; p.x = rand(-40, W + 40); }
    if (p.x < -50) p.x = W + 40;
    if (p.x > W + 50) p.x = -40;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.hue === 335 ? "#ffb3c8" : "#cdb4ff";
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFirefly(f) {
    f.x += f.vx;
    f.y += f.vy;
    f.pulse += f.pulseSpeed;
    if (f.x < -10) f.x = W + 10;
    if (f.x > W + 10) f.x = -10;
    if (f.y < -10) f.y = H + 10;
    if (f.y > H + 10) f.y = -10;

    const glow = 0.35 + Math.sin(f.pulse) * 0.25;
    ctx.save();
    ctx.globalAlpha = Math.max(0.12, glow);
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 5);
    g.addColorStop(0, "#ffe27a");
    g.addColorStop(1, "rgba(255, 226, 122, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#fff7c4";
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function tick() {
    ctx.clearRect(0, 0, W, H);
    petals.forEach(drawPetal);
    fireflies.forEach(drawFirefly);
    requestAnimationFrame(tick);
  }

  function initFx() {
    resize();
    spawnPetals();
    spawnFireflies();
    if (!reduceMotion) tick();
  }

  window.addEventListener("resize", () => {
    resize();
    spawnPetals();
    spawnFireflies();
  });

  /* ================= 导航：滚动高亮 + 毛玻璃 ================= */
  const header = document.getElementById("site-header");
  const navLinks = document.querySelectorAll(".nav-links a");
  const sections = ["hero", "about", "projects", "contact"].map(id => document.getElementById(id));

  function onScroll() {
    header.classList.toggle("scrolled", window.scrollY > 20);

    const pos = window.scrollY + window.innerHeight * 0.35;
    let current = "hero";
    sections.forEach(sec => {
      if (sec && sec.offsetTop <= pos) current = sec.id;
    });
    navLinks.forEach(a => {
      a.classList.toggle("active", a.getAttribute("href") === "#" + current);
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ================= 移动端菜单 ================= */
  const toggle = document.getElementById("nav-toggle");
  const menu = document.getElementById("nav-links");

  toggle.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  menu.addEventListener("click", (e) => {
    if (e.target.tagName === "A") {
      menu.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  /* ================= 滚动显现 ================= */
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.classList.add("visible");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add("visible"));
  }

  /* ================= 页脚年份 ================= */
  document.getElementById("year").textContent = new Date().getFullYear();

  restartCarousel();
  initFx();
  onScroll();
})();
