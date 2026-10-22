/* 萨姆萤光灯 · 歌曲投稿表单
 * ============================================================
 * 提交到 POST /api/submit（见 edge-functions/api/submit.js），
 * 数据存在 EdgeOne Blob 里，不再经过问卷星。
 *
 * 这里只做前端校验和交互；真正的校验在服务端也有一份
 * （前端校验只是为了让用户少等一次往返，不能当安全边界）。
 * ============================================================
 */
(() => {
  "use strict";

  const form = document.getElementById("survey-form");
  if (!form) return;

  const songEl = document.getElementById("sf-song");
  const singerEl = document.getElementById("sf-singer");
  const submitterEl = document.getElementById("sf-submitter");
  const agreeEl = document.getElementById("sf-agree");
  const hpEl = document.getElementById("sf-website");
  const btn = document.getElementById("sf-submit");
  const msg = document.getElementById("sf-msg");

  function say(text, kind) {
    if (!msg) return;
    msg.textContent = text;
    msg.className = "sf-msg" + (kind ? " is-" + kind : "");
  }

  function fail(text, focusEl) {
    say(text, "err");
    if (focusEl && typeof focusEl.focus === "function") focusEl.focus();
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const song = songEl ? songEl.value.trim() : "";
    const singer = singerEl ? singerEl.value.trim() : "";
    const submitter = submitterEl ? submitterEl.value.trim() : "";
    const agree = !!(agreeEl && agreeEl.checked);

    // 前端校验（服务端还会再校验一次）
    if (!song) return fail("请填写歌曲名", songEl);
    if (!singer) return fail("请填写原唱", singerEl);
    if (!submitter) return fail("请填写投稿人昵称", submitterEl);
    if (!agree) return fail("请先勾选授权确认", agreeEl);

    if (btn) { btn.disabled = true; btn.textContent = "提交中…"; }
    say("");

    try {
      const r = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          song, singer, submitter, agree,
          website: hpEl ? hpEl.value : "",   // 蜜罐，正常是空
        }),
      });

      let data = null;
      try { data = await r.json(); } catch { /* 非 JSON 就当失败 */ }

      if (r.ok && data && data.ok) {
        say(`投稿成功！已收到「${song}」，谢谢～排期会更新到发稿计划里。`, "ok");
        form.reset();
        if (hpEl) hpEl.value = "";
      } else {
        say((data && data.error) || "提交失败了，请稍后再试", "err");
      }
    } catch {
      say("网络好像不太顺，请稍后再试一次", "err");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "提交投稿"; }
    }
  });
})();
