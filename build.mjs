#!/usr/bin/env node
/* EdgeOne 构建脚本
 * ============================================================
 * 做两件事：
 *   1) 同步 B 站投稿（失败不致命，保留仓库里现有的 videos.js）
 *   2) 给静态资源文件名加上内容哈希，并改写 HTML 里的引用
 *
 * 为什么要加哈希：
 *   EdgeOne 的默认浏览器缓存策略是「看文件名里有没有哈希」——
 *     带哈希（main.a1b2c3d4.js）→ max-age=31536000（一年）
 *     不带哈希（index.html / styles.css）→ max-age=0
 *   所以现在每次访问都要为 5 个 JS/CSS 各发一次条件请求。
 *   加上哈希后：没改动的文件浏览器直接用缓存、连请求都不发；
 *   改了内容的文件哈希跟着变，自然重新下载，不会出现新旧版本混用。
 *
 * 安全性：任何一步出错都直接抛异常 → 构建失败 → 不会发布半成品，
 *         线上仍然是上一次成功的部署。
 * ============================================================
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// HTML 里需要改写的文件类型
const ASSET_EXT = /\.(?:js|css)$/i;
// 已经是 <name>.<8位十六进制>.<ext> 形式的，说明已处理过，跳过
const ALREADY_HASHED = /\.[0-9a-f]{8}\.(?:js|css)$/i;

const log = (...a) => console.log(...a);
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function sha8(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 8);
}

/** 从 HTML 里收集本地 JS/CSS 引用（相对路径、非外链、未加哈希） */
function collectAssets(html) {
  const found = new Set();
  const re = /(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const p = m[1];
    if (/^(?:[a-z]+:)?\/\//i.test(p) || p.startsWith("data:")) continue;  // 外链
    if (!ASSET_EXT.test(p)) continue;
    const clean = p.replace(/^\.\//, "");
    if (ALREADY_HASHED.test(clean)) continue;
    found.add(clean);
  }
  return [...found];
}

/** 处理一个 HTML 文件：产出哈希副本并改写引用 */
function processHtml(file) {
  if (!existsSync(file)) {
    log(`  [跳过] ${basename(file)} 不存在`);
    return [];
  }
  const before = readFileSync(file, "utf8");
  const assets = collectAssets(before);
  if (!assets.length) {
    log(`  [跳过] ${basename(file)} 没有需要处理的本地资源`);
    return [];
  }

  const pairs = [];
  for (const rel of assets) {
    const abs = join(HERE, rel);
    if (!existsSync(abs)) {
      log(`  [警告] 找不到 ${rel}，保持原样`);
      continue;
    }
    const buf = readFileSync(abs);
    const base = basename(rel);
    const dot = base.lastIndexOf(".");
    const newBase = `${base.slice(0, dot)}.${sha8(buf)}${base.slice(dot)}`;
    const newRel = rel.slice(0, rel.length - base.length) + newBase;
    writeFileSync(join(dirname(abs), newBase), buf);
    pairs.push([rel, newRel]);
  }

  let after = before;
  for (const [oldRel, newRel] of pairs) {
    // 只替换属性值里那一处，避免 "main.js" 误伤 "domain.js" 这类子串
    const re = new RegExp(`(["'])(\\.\\/)?${escapeRe(oldRel)}(["'])`, "g");
    after = after.replace(re, (_all, q1, dotSlash, q2) => q1 + (dotSlash || "") + newRel + q2);
  }

  // 复核：改写后每个引用都必须真实存在，否则宁可让构建失败
  const missing = collectAssets(after).filter(p => !existsSync(join(HERE, p)));
  if (missing.length) {
    throw new Error(`${basename(file)} 改写后引用了不存在的文件：${missing.join("、")}`);
  }

  writeFileSync(file, after, "utf8");
  log(`  [OK] ${basename(file)}：改写 ${pairs.length} 个资源引用`);
  for (const [o, n] of pairs) log(`         ${o}  ->  ${n}`);
  return pairs;
}

// ---------- 1. 同步 B 站投稿（尽力而为） ----------
log("=".repeat(52));
log("  萨姆萤光灯 · EdgeOne 构建");
log("=".repeat(52));
log("");
log("[1/3] 同步 B 站投稿（失败不影响构建）");
const sync = spawnSync(process.execPath, [join(HERE, "refresh-videos.mjs")], {
  cwd: HERE,
  stdio: "inherit",
});
if (sync.status !== 0) {
  log(`  [警告] 同步脚本退出码 ${sync.status}，沿用仓库里现有的 videos.js`);
}

// ---------- 2. 把当前访客数烤进 HTML ----------
/* 为什么要烤：
 *   访客数平时是页面加载后异步请求拿的，第一次访问（浏览器本地还没缓存）
 *   要等接口返回——Vercount 从国内要 1.8 秒左右，那段时间只显示「···」。
 *   Vercount 有一个只读接口（GET 带 url 参数，不会增加计数），
 *   所以构建时可以把当前数字直接写进 HTML，首访也能秒看到。
 *   浏览器加载后仍会用实时数据覆盖，所以烤进去的偏旧也没关系。 */
const VERCOUNT_READ = "https://events.vercount.one/api/v2/log";
const SITE_URL = "https://samlamp.top/";

const withCommas = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

async function bakeCounter() {
  const file = join(HERE, "index.html");
  if (!existsSync(file)) return;
  const html = readFileSync(file, "utf8");
  if (!html.includes('id="vercount_value_site_uv"')) {
    log("  [跳过] 页面里没有统计元素");
    return;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    let j;
    try {
      const r = await fetch(`${VERCOUNT_READ}?url=${encodeURIComponent(SITE_URL)}`, {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      j = await r.json();
    } finally {
      clearTimeout(timer);
    }
    const d = j && j.data;
    if (!d) throw new Error("返回里没有 data");
    const uv = Number(d.site_uv);
    const pv = Number(d.site_pv);
    if (!Number.isFinite(uv) || !Number.isFinite(pv)) throw new Error("数值无效");

    const out = html
      .replace(/(<b id="vercount_value_site_uv">)[^<]*(<\/b>)/, `$1${withCommas(uv)}$2`)
      .replace(/(<b id="vercount_value_site_pv">)[^<]*(<\/b>)/, `$1${withCommas(pv)}$2`);
    if (out === html) throw new Error("没匹配到统计元素");

    writeFileSync(file, out, "utf8");
    log(`  [OK] 已烤入当前访客数：UV ${uv} / PV ${pv}`);
  } catch (e) {
    // 取不到就算了：页面保持「···」，浏览器加载后照样能拿到
    log(`  [警告] 取访客数失败（${e.message}），保留占位符，不影响构建`);
  }
}

log("");
log("[2/3] 把当前访客数烤进 HTML（让首访也能秒看到数字）");
await bakeCounter();

// ---------- 3. 资源哈希 ----------
log("");
log("[3/3] 给静态资源加内容哈希");
const total = [];
for (const page of ["index.html", "404.html", "exam.html"]) {
  total.push(...processHtml(join(HERE, page)));
}

log("");
log("=".repeat(52));
log(`[DONE] 构建完成，共处理 ${total.length} 个资源`);
log("=".repeat(52));
