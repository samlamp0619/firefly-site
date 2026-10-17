/* 自建访客计数（EdgeOne Makers · Edge Function + KV）
 * ============================================================
 * 路由：POST /api/count      （由 ./edge-functions/api/count.js 自动生成）
 *
 * 为什么自建：
 *   原来用的两个服务都出过事——不蒜子（Busuanzi）已经停服（原站 502），
 *   换成 Vercount 后接口从国内访问要 1.4~5.3 秒（走 Cloudflare 海外边缘）。
 *   自己跑在 EdgeOne 边缘节点上，和站点同一个网络，响应是毫秒级，
 *   而且不再依赖任何第三方公益服务。
 *
 * 存储：EdgeOne KV（免费版 1GB，够用几个数量级）
 *   需要在项目里绑定一个命名空间，变量名建议用 VISITS。
 *   没绑定时本接口返回 503，前端会自动退回 Vercount，不会白屏。
 *
 * 计数口径：
 *   site_pv  每次请求 +1
 *   site_uv  仅当请求体里 isNewUv=true 时 +1（由前端 cookie 判断）
 *
 * ⚠️ KV 是最终一致性存储（跨节点最长 60 秒），并发极高时计数可能少记几次。
 *    个人站点完全够用；要强一致得换 Blob 存储的强一致模式。
 * ============================================================
 */

const KEY_PV = "site_pv";
const KEY_UV = "site_uv";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS,
    },
  });
}

/* 绑定时选的变量名由你决定，这里把常见的几个都试一遍；
 * 另外有文档示例直接用全局变量，所以两边都找。 */
function pickKV(env) {
  const names = ["VISITS", "visits", "KV", "kv", "MY_KV", "my_kv", "COUNTER", "counter", "VERCOUNT"];
  if (env) {
    for (const n of names) {
      const v = env[n];
      if (v && typeof v.get === "function") return v;
    }
    // 最后兜底：env 上第一个看起来像 KV 的
    for (const k of Object.keys(env)) {
      const v = env[k];
      if (v && typeof v.get === "function" && typeof v.put === "function") return v;
    }
  }
  for (const n of names) {
    const v = globalThis[n];
    if (v && typeof v.get === "function" && typeof v.put === "function") return v;
  }
  return null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequest(context) {
  const kv = pickKV(context.env);
  if (!kv) {
    return json({
      error: "KV 未绑定",
      hint: "控制台 → 项目 → KV 存储 → 绑定命名空间，变量名建议用 VISITS",
    }, 503);
  }

  let isNewUv = false;
  if (context.request.method === "POST") {
    try {
      const body = await context.request.json();
      isNewUv = !!(body && body.isNewUv === true);
    } catch {
      // body 不是合法 JSON 就当作老访客，不影响 PV 计数
    }
  }

  const pv = num(await kv.get(KEY_PV)) + 1;
  await kv.put(KEY_PV, String(pv));

  let uv = num(await kv.get(KEY_UV));
  if (isNewUv) {
    uv += 1;
    await kv.put(KEY_UV, String(uv));
  }

  return json({ site_pv: pv, site_uv: uv, source: "self" });
}
