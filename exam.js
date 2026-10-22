/* 群管考核 · 页面逻辑
 * ============================================================
 * 流程：
 *   1. 进来先判断开放时间（北京时间 2026-10-24 全天）
 *   2. 点「开始答题」→ POST /api/exam-start 拿会话和截止时间
 *      （倒计时从这一刻算，不是从打开页面算——这样不会因为
 *        还在读规则就白白消耗时间，而且题目在开始前不渲染）
 *   3. 答题过程中把答案存进 localStorage：刷新/误关不会丢
 *   4. 到点自动交卷；手动交卷前会提示还有几题没答
 *   5. 交卷后由服务端批改，这里只显示得分
 *
 * ⚠️ 答案不在这个文件里，也不在 exam-data.js 里，只在服务端。
 * ============================================================
 */
(() => {
  "use strict";

  const D = window.EXAM_DATA;
  const $ = id => document.getElementById(id);
  const LS_KEY = "exam-state-v1";

  // 北京时间 10-24 全天 = UTC 2026-10-23T16:00 ~ 2026-10-24T16:00
  const OPEN_AT = Date.parse("2026-10-23T16:00:00Z");
  const CLOSE_AT = Date.parse("2026-10-24T16:00:00Z");

  /* 预览模式：URL 带 ?preview=<管理令牌> 时跳过开放时间限制，
     用来在开考前把整套流程（计时、交卷、批改、导出）走一遍。
     令牌不对的话服务端照样拒绝。 */
  const PREVIEW = new URLSearchParams(location.search).get("preview") || "";

  let state = load();       // { sessionId, deadline, qq, nick, answers, feedback, done }
  let ticker = null;
  let submitting = false;

  /* ---------------- 工具 ---------------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const o = raw ? JSON.parse(raw) : null;
      return o && typeof o === "object" ? o : {};
    } catch {
      return {};
    }
  }

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* 隐私模式忽略 */ }
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function gate(html) {
    $("ex-gate-body").innerHTML = html;
    $("ex-gate").hidden = false;
    $("ex-main").hidden = true;
    $("ex-timer").hidden = true;
    if (ticker) { clearInterval(ticker); ticker = null; }
  }

  function say(text, kind) {
    const el = $("ex-msg");
    if (!el) return;
    el.textContent = text || "";
    el.className = "ex-msg" + (kind ? " is-" + kind : "");
  }

  /* ---------------- 题目渲染 ---------------- */
  const TYPE_LABEL = { single: "单选", multi: "多选", fill: "填空" };

  function renderQ(q) {
    let h = '<div class="ex-q" data-qid="' + esc(q.id) + '">';
    h += '<div class="ex-q-stem"><span class="ex-q-no">' + esc(q.no) + "</span>" +
         '<span class="ex-q-type">' + (TYPE_LABEL[q.type] || "单选") + "</span><br>" +
         esc(q.stem) + "</div>";

    if (q.type === "fill") {
      h += '<input class="ex-fill" type="text" data-fill="' + esc(q.id) + '" maxlength="40" ' +
           'placeholder="' + esc(q.placeholder || "填写答案") + '" autocomplete="off" />';
    } else {
      const inputType = q.type === "multi" ? "checkbox" : "radio";
      h += '<div class="ex-opts">';
      q.options.forEach((opt, i) => {
        h += '<label class="ex-opt" data-opt="' + esc(q.id) + "@" + i + '">' +
             '<input type="' + inputType + '" name="' + esc(q.id) + '" value="' + i +
             '" data-q="' + esc(q.id) + '" />' +
             "<span>" + esc(opt) + "</span></label>";
      });
      h += "</div>";
    }
    return h + "</div>";
  }

  function renderAll() {
    let html = "";
    for (const sec of D.sections) {
      html += '<section class="ex-card">';
      html += '<h2 class="ex-sec-title">' + esc(sec.title) + "</h2>";
      if (sec.intro) html += '<p class="ex-sec-intro">' + esc(sec.intro) + "</p>";
      for (const q of sec.questions) html += renderQ(q);
      html += "</section>";
    }
    $("ex-sections").innerHTML = html;

    // 回填草稿
    const ans = state.answers || {};
    for (const sec of D.sections) {
      for (const q of sec.questions) {
        const v = ans[q.id];
        if (q.type === "fill") {
          const el = document.querySelector('[data-fill="' + q.id + '"]');
          if (el && typeof v === "string") el.value = v;
        } else if (Array.isArray(v)) {
          for (const i of v) {
            const cb = document.querySelector('input[data-q="' + q.id + '"][value="' + i + '"]');
            if (cb) cb.checked = true;
          }
        }
      }
    }
    if (typeof state.feedback === "string") $("ex-feedback").value = state.feedback;
    if (typeof state.qq === "string") $("ex-qq").value = state.qq;
    if (typeof state.nick === "string") $("ex-nick").value = state.nick;

    syncPicked();
    updateProgress();
  }

  /* 选项选中态（单选/多选统一样式） */
  function syncPicked() {
    document.querySelectorAll(".ex-opt").forEach(label => {
      const input = label.querySelector("input");
      label.classList.toggle("is-picked", !!(input && input.checked));
    });
  }

  /* ---------------- 答案收集与进度 ---------------- */
  function collect() {
    const answers = {};
    for (const sec of D.sections) {
      for (const q of sec.questions) {
        if (q.type === "fill") {
          const el = document.querySelector('[data-fill="' + q.id + '"]');
          answers[q.id] = el ? el.value.trim() : "";
        } else {
          const picked = [...document.querySelectorAll('input[data-q="' + q.id + '"]:checked')];
          answers[q.id] = picked.map(p => Number(p.value));
        }
      }
    }
    return answers;
  }

  function allQuestions() {
    const out = [];
    for (const sec of D.sections) for (const q of sec.questions) out.push(q);
    return out;
  }

  function answeredCount() {
    let n = 0;
    for (const q of allQuestions()) {
      const v = (state.answers || {})[q.id];
      if (q.type === "fill" ? (typeof v === "string" && v.trim()) : (Array.isArray(v) && v.length)) n++;
    }
    return n;
  }

  function updateProgress() {
    const el = $("ex-progress");
    if (!el) return;
    const total = allQuestions().length;
    const done = answeredCount();
    el.innerHTML = "已答 <b>" + done + "</b> / " + total;
  }

  /* ---------------- 倒计时 ---------------- */
  function startTicker() {
    const clock = $("ex-clock");
    const wrap = $("ex-timer");
    wrap.hidden = false;

    const tick = () => {
      const left = Math.max(0, Date.parse(state.deadline) - Date.now());
      const s = Math.floor(left / 1000);
      clock.textContent = pad(Math.floor(s / 60)) + ":" + pad(s % 60);
      wrap.classList.toggle("is-urgent", left <= 5 * 60 * 1000);
      if (left <= 0) {
        if (ticker) { clearInterval(ticker); ticker = null; }
        submit(true);   // 自动收卷
      }
    };
    if (ticker) clearInterval(ticker);
    tick();
    ticker = setInterval(tick, 1000);
  }

  /* ---------------- 开始答题 ---------------- */
  async function begin() {
    const btn = $("ex-begin");
    if (btn) { btn.disabled = true; btn.textContent = "正在开启…"; }

    try {
      const r = await fetch("/api/exam-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: PREVIEW }),
      });
      const data = await r.json().catch(() => null);

      if (!r.ok || !data || !data.ok) {
        const msg = (data && data.error) || "开启失败，请刷新重试";
        gate('<p class="ex-intro">' + esc(msg) + '</p><a class="ex-btn ghost" href="/">返回主页</a>');
        return;
      }

      state = {
        sessionId: data.sessionId,
        deadline: data.deadline,
        qq: state.qq || "",
        nick: state.nick || "",
        answers: {},
        feedback: "",
        done: false,
      };
      save();

      $("ex-gate").hidden = true;
      $("ex-main").hidden = false;
      renderAll();
      startTicker();
      window.scrollTo({ top: 0 });
    } catch {
      gate('<p class="ex-intro">网络好像不太顺，请刷新重试。</p><a class="ex-btn ghost" href="/">返回主页</a>');
    }
  }

  /* ---------------- 交卷 ---------------- */
  async function submit(auto) {
    if (submitting || state.done) return;

    const qqEl = $("ex-qq");
    const qq = (qqEl ? qqEl.value : "").replace(/\D/g, "");

    if (!/^\d{5,12}$/.test(qq)) {
      if (auto) {
        // 自动收卷时 QQ 不合法也不能把人晾着，照常提交，让服务端记一条并提示
        say("QQ 号格式不对，成绩可能作废", "err");
      } else {
        say("请填写正确的 QQ 号（5~12 位数字）", "err");
        if (qqEl) qqEl.focus();
        return;
      }
    }

    const answers = collect();
    state.answers = answers;
    state.qq = qqEl ? qqEl.value.trim() : "";
    state.nick = ($("ex-nick") ? $("ex-nick").value : "").trim();
    state.feedback = ($("ex-feedback") ? $("ex-feedback").value : "").trim();
    save();

    if (!auto) {
      const left = allQuestions().length - answeredCount();
      if (left > 0 && !window.confirm("还有 " + left + " 题没作答，确定交卷吗？")) return;
    }

    submitting = true;
    const btn = $("ex-submit");
    if (btn) { btn.disabled = true; btn.textContent = auto ? "时间到，正在交卷…" : "正在交卷…"; }
    say(auto ? "时间到，正在自动交卷…" : "正在交卷…");

    try {
      const r = await fetch("/api/exam-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          qq,
          nickname: state.nick,
          feedback: state.feedback,
          answers,
        }),
      });
      const data = await r.json().catch(() => null);

      if (r.ok && data && data.ok) {
        state.done = true;
        save();
        const used = Math.floor((data.durationSec || 0) / 60);
        gate(
          '<p class="ex-intro">答卷已提交，感谢参与～</p>' +
          '<p class="ex-intro" style="margin-top:14px;font-size:1.1rem">' +
            "得分 <b style=\"color:var(--mint-deep);font-size:1.5rem\">" + data.score + "</b> / " + data.total +
            "（" + data.percent + "%）</p>" +
          '<p class="ex-intro" style="margin-top:8px;color:var(--ink-soft)">用时约 ' + used + " 分钟。结果以群主公布为准。</p>" +
          '<a class="ex-btn ghost" href="/">返回主页</a>'
        );
        return;
      }

      const msg = (data && data.error) || "提交失败，请稍后重试";
      const code = data && data.code;

      if (code === "DUPLICATE" || code === "TIMEOUT" || code === "CLOSED") {
        state.done = true;
        save();
        gate('<p class="ex-intro">' + esc(msg) + '</p><a class="ex-btn ghost" href="/">返回主页</a>');
        return;
      }

      say(msg, "err");
    } catch {
      say("网络好像不太顺，请点「交卷」重试一次", "err");
    } finally {
      submitting = false;
      if (btn && !state.done) { btn.disabled = false; btn.textContent = "交卷"; }
    }
  }

  /* ---------------- 入口 ---------------- */
  function boot() {
    const now = Date.now();

    // 已经交过卷
    if (state.done) {
      gate('<p class="ex-intro">你已经提交过答卷了，每人仅有一次机会。</p>' +
           '<a class="ex-btn ghost" href="/">返回主页</a>');
      return;
    }

    // 正在答题（刷新后继续）
    if (state.sessionId && state.deadline) {
      const left = Date.parse(state.deadline) - now;
      if (left > 0) {
        $("ex-gate").hidden = true;
        $("ex-main").hidden = false;
        renderAll();
        startTicker();
        return;
      }
      // 超过截止时间还挂着：直接交掉，免得白答
      $("ex-gate").hidden = true;
      $("ex-main").hidden = false;
      renderAll();
      submit(true);
      return;
    }

    // 未开放 / 已结束（预览模式跳过）
    if (!PREVIEW) {
      if (now < OPEN_AT) {
        gate('<p class="ex-intro">考核将于 <b>10 月 24 日 00:00</b> 开放，届时刷新本页即可参加。</p>' +
             '<a class="ex-btn ghost" href="/">返回主页</a>');
        return;
      }
      if (now >= CLOSE_AT) {
        gate('<p class="ex-intro">本次考核已于 10 月 24 日 24:00 结束，感谢关注～</p>' +
             '<a class="ex-btn ghost" href="/">返回主页</a>');
        return;
      }
    }

    // 正常：显示规则 + 开始按钮
    $("ex-intro").textContent = D.intro;
    $("ex-gate-body").insertAdjacentHTML("beforeend",
      '<ul class="ex-rules">' +
      "<li>共 <b>" + allQuestions().length + "</b> 小题，每题 1 分，满分 <b>" + D.totalPoints + "</b> 分</li>" +
      "<li>限时 <b>60 分钟</b>，点下面的按钮后开始倒计时，时间到自动收卷</li>" +
      "<li>每题只有一次机会，交卷后不可修改</li>" +
      "<li>答案请自己思考，<b>不要使用 AI 辅助</b>，发现即取消资格</li>" +
      "</ul>" +
      '<button type="button" class="ex-btn primary" id="ex-begin">开始答题</button>' +
      '<p class="ex-intro" style="margin-top:12px;color:var(--ink-soft);font-size:.84rem">' +
      "点下按钮后倒计时立刻开始，建议先准备好再点。</p>"
    );
    $("ex-begin").addEventListener("click", begin);
  }

  // 答题中改动 → 存草稿
  document.addEventListener("change", e => {
    const t = e.target;
    if (!t || !t.matches) return;
    if (t.matches("input[data-q]") || t.matches("[data-fill]") || t.id === "ex-feedback" ||
        t.id === "ex-qq" || t.id === "ex-nick") {
      state.answers = collect();
      if (t.id === "ex-qq") state.qq = t.value;
      if (t.id === "ex-nick") state.nick = t.value;
      if (t.id === "ex-feedback") state.feedback = t.value;
      save();
      syncPicked();
      updateProgress();
    }
  });

  document.addEventListener("input", e => {
    const t = e.target;
    if (!t || !t.matches) return;
    if (t.matches("[data-fill]") || t.id === "ex-feedback" || t.id === "ex-qq" || t.id === "ex-nick") {
      state.answers = collect();
      if (t.id === "ex-qq") state.qq = t.value;
      if (t.id === "ex-nick") state.nick = t.value;
      if (t.id === "ex-feedback") state.feedback = t.value;
      save();
      updateProgress();
    }
  });

  document.addEventListener("click", e => {
    const btn = e.target.closest && e.target.closest("#ex-submit");
    if (btn) submit(false);
  });

  // 答题中误关页面要提醒
  window.addEventListener("beforeunload", e => {
    if ($("ex-main") && !$("ex-main").hidden && !state.done) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  // 防止手机端切到别的 App 时计时停摆：页面回到前台时立刻校准一次
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.deadline && $("ex-main") && !$("ex-main").hidden) {
      const left = Date.parse(state.deadline) - Date.now();
      if (left <= 0) submit(true);
      else if (ticker) startTicker();
    }
  });

  boot();
})();
