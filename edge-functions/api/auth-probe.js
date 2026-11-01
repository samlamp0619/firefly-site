/**
 * 临时探针：确认 EdgeOne 运行时到底支持哪些能力，用来决定账号系统怎么实现。
 *
 * 只回答布尔值 + 耗时，不返回任何敏感信息。需要管理员 token 才能调用。
 * ⚠️ 验证完就删掉这个文件。
 *
 * 用法：GET /api/auth-probe?token=<管理员 token>
 */
import { getStore } from "@edgeone/pages-blob";

const TOKEN_SHA256 =
  "dff03f44f4ce6b75c28bad292ce98ffafea8dfd95a951140e10dea8a1e10c67b";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* 跑一段代码，返回 { ok, ms, error } */
async function probe(fn) {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { ok: true, ms: Date.now() - t0, value };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: String((e && e.message) || e) };
  }
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  /* --- 鉴权 --- */
  const token = url.searchParams.get("token") || "";
  if (!token || (await sha256Hex(token)) !== TOKEN_SHA256) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const result = { ok: true, runtime: {}, crypto: {}, blob: {} };

  /* --- 运行时基本信息 --- */
  result.runtime = {
    hasProcess: typeof process !== "undefined",
    nodeVersion: typeof process !== "undefined" ? process.version : null,
    hasBuffer: typeof Buffer !== "undefined",
    hasAtob: typeof atob === "function",
    hasBtoa: typeof btoa === "function",
    dateNow: Date.now(),
    timezoneOffset: new Date().getTimezoneOffset(),
    hasSetTimeout: typeof setTimeout === "function",   // 有些运行时禁用定时器
    envKeyCount: context.env ? Object.keys(context.env).length : 0,
  };

  /* --- 1. PBKDF2（密码哈希的首选）--- */
  result.crypto.pbkdf2 = await probe(async () => {
    const key = await crypto.subtle.importKey("raw", enc.encode("probe-password"), "PBKDF2", false, ["deriveBits"]);
    // 先用 1 万次测速度，再据此推算 10 万次要多久
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 10000, hash: "SHA-256" }, key, 256
    );
    return [...new Uint8Array(bits)].slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
  });

  /* --- 2. HMAC（会话签名）--- */
  result.crypto.hmac = await probe(async () => {
    const key = await crypto.subtle.importKey("raw", enc.encode("probe-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode("probe-data"));
    const arr = [...new Uint8Array(sig)];
    // 顺便验证 verify 也能用（校验签名要用）
    const ok = await crypto.subtle.verify("HMAC", key, sig, enc.encode("probe-data"));
    const bad = await crypto.subtle.verify("HMAC", key, sig, enc.encode("probe-data-x"));
    return { hex8: arr.slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join(""), verifyOk: ok, verifyRejectsWrong: bad === false };
  });

  /* --- 3. 随机数 / UUID --- */
  result.crypto.random = await probe(async () => {
    const a = crypto.getRandomValues(new Uint8Array(8));
    const b = crypto.getRandomValues(new Uint8Array(8));
    return {
      getRandomValues: true,
      differs: a.join(",") !== b.join(","),
      randomUUID: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : null,
    };
  });

  /* --- 4. Blob：写入 → 强一致回读 → 列表 → 删除 --- */
  const stamp = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const key = "probe/" + stamp + ".json";
  const store = getStore("users");

  result.blob.set = await probe(async () => {
    await store.setJSON(key, { stamp, n: 42 });
    return true;
  });

  result.blob.getStrong = await probe(async () => {
    const v = await store.get(key, { type: "json", consistency: "strong" });
    return v && v.n === 42;
  });

  result.blob.getEventual = await probe(async () => {
    const v = await store.get(key, { type: "json" });
    return v && v.n === 42;
  });

  result.blob.listStrong = await probe(async () => {
    const r = await store.list({ prefix: "probe/", consistency: "strong" });
    return {
      count: r.blobs.length,
      found: r.blobs.some(b => b.key === key),
      sample: r.blobs[0] ? Object.keys(r.blobs[0]) : [],   // 看有没有 etag
    };
  });

  /* 100 个 key 的 list 耗时，用来估算「算名次」的成本 */
  result.blob.listBulk = await probe(async () => {
    const tasks = [];
    for (let i = 0; i < 20; i++) tasks.push(store.setJSON("probe/bulk-" + stamp + "-" + i + ".json", { i }));
    await Promise.all(tasks);
    const r = await store.list({ prefix: "probe/", consistency: "strong" });
    return { count: r.blobs.length };
  });

  result.blob.cleanup = await probe(async () => {
    const r = await store.list({ prefix: "probe/", consistency: "strong" });
    await Promise.all(r.blobs.map(b => store.delete(b.key)));
    return r.blobs.length;
  });

  /* --- 5. 计时器（做防爆破延迟要用）--- */
  result.runtime.sleep = await probe(async () => {
    await new Promise(r => setTimeout(r, 50));
    return true;
  });

  return json(result);
}
