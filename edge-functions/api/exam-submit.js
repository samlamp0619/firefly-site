/* 群管考核 · 交卷 + 自动批改
 * ============================================================
 * 路由：POST /api/exam-submit
 *   body: { sessionId, qq, nickname, answers: { q1_1: [0], q1_2: [0,2], q4_7: "星核猎手" } }
 *
 * ⚠️ 答案只在这个文件里。客户端（exam-data.js）只有题干和选项，
 *    所以打开控制台也看不到正确答案。
 *
 * 评分规则
 *   - 每个小问 1 分，共 33 分（见 DATA.totalPoints）
 *   - 单选：必须选中且只选中正确的那一项
 *   - 多选：必须与答案完全一致（选项集合相等），多选少选都不得分
 *   - 填空：忽略空白/标点后，包含关键词即算对（避免因多写几个字误判）
 *
 * 防作弊（有限）
 *   - 交卷必须在会话开始后 60 分钟内（服务端按开始时间算，刷新页面无效）
 *   - 同一 QQ 号只能交一次
 * ============================================================
 */
import { getStore } from "@edgeone/pages-blob";

const STORE_NAME = "exam";
const OPEN_AT = Date.parse("2026-10-23T16:00:00Z");
const CLOSE_AT = Date.parse("2026-10-24T16:00:00Z");
const DURATION_MS = 60 * 60 * 1000;
const GRACE_MS = 90 * 1000;   // 网络抖动宽限

/* ================= 参考答案 ================= *
 * 数组里存的是「选项下标」，从 0 开始。
 * 例如 q1_2: [0, 2] 表示选 A 和 C。
 * ============================================ */
const KEY = {
  // 第一大题：崩铁
  q1_1: { type: "single", answer: [0] },          // 18
  q1_2: { type: "multi", answer: [0, 2] },        // A, C
  q1_3: { type: "single", answer: [3] },          // D 比格椰 —— 流光萤萤
  q1_4: { type: "multi", answer: [1, 2] },        // B, C
  q2_1: { type: "single", answer: [2] },          // C 战斗
  q2_2: { type: "single", answer: [2] },          // C
  q2_3: { type: "multi", answer: [1, 2] },        // B, C
  q3_1: { type: "single", answer: [3] },          // D 派对车厢
  q3_2: { type: "multi", answer: [1, 2] },        // B, C
  q3_3: { type: "multi", answer: [1, 2, 3] },     // B, C, D
  q3_4: { type: "single", answer: [1] },          // B

  // 第二大题：流萤
  q4_1: { type: "single", answer: [2] },          // 24.06.19
  q4_2: { type: "single", answer: [1] },          // 自破碎的天空坠落
  q4_3: { type: "single", answer: [0] },          // 荡除蠹灾的铁骑
  q4_4: { type: "single", answer: [1] },          // 梦应归于何处
  q4_5: { type: "single", answer: [1] },          // 春日手信
  q4_6: { type: "single", answer: [2] },          // 预备，起爆
  // 填空题比其他题多 1 分：要靠自己回忆，没法用排除法猜
  q4_7: { type: "fill", answer: "星核猎手", points: 4 },
  q5_1: { type: "multi", answer: [0, 1] },        // A, B
  q5_2: { type: "multi", answer: [0, 1, 2] },     // A, B, C
  q6_1: { type: "single", answer: [1] },          // 飞火之萤a
  q6_2: { type: "single", answer: [3] },          // 100 亿
  q6_3: { type: "single", answer: [3] },          // UVR5 + so-vits-svc

  // 第三大题：群管理
  q7_1: { type: "single", answer: [1] },          // B 删除违规内容并私信警告
  q7_2: { type: "single", answer: [2] },          // C 上报群主并临时禁言
  q7_3: { type: "single", answer: [0] },          // A 私信提醒
  q7_4: { type: "multi", answer: [1, 2] },        // B, C
  q7_5: { type: "multi", answer: [1, 3] },        // B, D
  q8_1: { type: "single", answer: [1] },          // 错
  q8_2: { type: "single", answer: [1] },          // 错
  q8_3: { type: "single", answer: [0] },          // 对
  q8_4: { type: "single", answer: [1] },          // 错
  q9: { type: "single", answer: [0] },            // 已知晓，是
};

/* ================= 分值 ================= *
 * 试卷共 33 小问，满分 100 分。
 * 100 不能被 33 整除，所以：每题 3 分（33×3 = 99），
 * 再把唯一一道填空题（4-7 阵营）提到 4 分，凑满 100。
 *   第一大题 崩铁 11 题 × 3 = 33
 *   第二大题 流萤 11 题 × 3 + 填空 4 = 37
 *   第三大题 群管 10 题 × 3 = 30
 *                            合计 100
 * 想换分值只改这里（points 不写就按 3 分算）。
 * ============================================ */
const DEFAULT_POINTS = 3;
const pointsOf = k => k.points || DEFAULT_POINTS;
const TOTAL = Object.values(KEY).reduce((sum, k) => sum + pointsOf(k), 0);   // 100

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function clean(v, max) {
  const s = String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return max ? s.slice(0, max) : s;
}

/* 归一化填空答案：去掉空白、常见标点、英文大小写差异 */
function normFill(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\s\u3000]/g, "")
    .replace(/[，,。.、；;：:！!？?"'“”‘’（）()【】\[\]《》<>~—\-_]/g, "");
}

function judge(key, given) {
  if (!key) return false;
  if (key.type === "fill") {
    const want = normFill(key.answer);
    const got = normFill(given);
    return got.length > 0 && (got === want || got.includes(want));
  }
  if (!Array.isArray(given)) return false;
  const got = [...new Set(given.filter(n => Number.isInteger(n)))].sort((a, b) => a - b);
  const want = [...key.answer].sort((a, b) => a - b);
  if (got.length !== want.length) return false;
  return got.every((v, i) => v === want[i]);
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "请求格式不正确" }, 400);
  }

  const sessionId = clean(body.sessionId, 40);
  const qq = clean(body.qq, 20).replace(/\D/g, "");
  const nickname = clean(body.nickname, 40);
  const feedback = clean(body.feedback, 500);
  const answers = body.answers && typeof body.answers === "object" ? body.answers : {};

  if (!/^\d{5,12}$/.test(qq)) {
    return json({ ok: false, error: "QQ 号看起来不对，请填写 5~12 位数字" }, 400);
  }
  if (!sessionId) {
    return json({ ok: false, error: "会话无效，请刷新页面重新进入" }, 400);
  }

  const store = getStore(STORE_NAME);

  // ---------- 1. 校验会话与时长 ----------
  let session;
  try {
    session = await store.get(`sessions/${sessionId}.json`, { type: "json", consistency: "strong" });
  } catch (e) {
    console.error("[exam-submit] 读会话失败", e && e.message);
    return json({ ok: false, error: "服务器繁忙，请重试" }, 500);
  }
  if (!session) {
    return json({ ok: false, error: "会话不存在或已失效，请刷新页面重新进入" }, 400);
  }

  const started = Date.parse(session.startedAt);
  const now = Date.now();
  const isPreviewSession = session.preview === true;   // 开考前自测用的会话

  if (!isPreviewSession) {
    if (!(started >= OPEN_AT && started < CLOSE_AT)) {
      return json({ ok: false, code: "CLOSED", error: "这场考核已经结束了" }, 403);
    }
  }
  if (now - started > DURATION_MS + GRACE_MS) {
    return json({
      ok: false,
      code: "TIMEOUT",
      error: "已超过 60 分钟答题时间，本次答卷未能提交",
    }, 403);
  }

  // ---------- 2. 同一 QQ 只能交一次（预览会话不参与查重，免得自测把真考堵了）----------
  if (!isPreviewSession) {
    try {
      const { blobs } = await store.list({ prefix: "records/", consistency: "strong" });
      for (const b of blobs) {
        const rec = await store.get(b.key, { type: "json", consistency: "strong" });
        if (rec && !rec.preview && rec.qq === qq) {
          return json({
            ok: false,
            code: "DUPLICATE",
            error: "这个 QQ 号已经提交过答卷了，每人仅有一次机会",
          }, 409);
        }
      }
    } catch (e) {
      console.error("[exam-submit] 查重失败", e && e.message);
      // 查重失败不阻断交卷，宁可收下也别让人白考
    }
  }

  // ---------- 3. 批改 ----------
  let score = 0;
  const detail = {};
  for (const [qid, key] of Object.entries(KEY)) {
    const ok = judge(key, answers[qid]);
    const pts = pointsOf(key);
    if (ok) score += pts;
    detail[qid] = ok ? pts : 0;   // 存每题得了多少分，比 0/1 更好用
  }

  const record = {
    id: sessionId,
    qq,
    nickname: nickname || "",
    score,
    total: TOTAL,
    percent: Math.round((score / TOTAL) * 1000) / 10,
    startedAt: session.startedAt,
    submittedAt: new Date(now).toISOString(),
    durationSec: Math.round((now - started) / 1000),
    preview: isPreviewSession,
    feedback,
    detail,
    answers,
  };

  try {
    await store.setJSON(`records/${sessionId}.json`, record);
  } catch (e) {
    console.error("[exam-submit] 保存失败", e && e.message, e && e.stack);
    return json({ ok: false, error: "保存答卷失败，请稍后重试" }, 500);
  }

  return json({
    ok: true,
    score,
    total: TOTAL,
    percent: record.percent,
    durationSec: record.durationSec,
  });
}
