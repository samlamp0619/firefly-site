#!/usr/bin/env node
/* 萨姆萤光灯 · 最新投稿同步（Node 版，供 EdgeOne 构建时执行）
 * ============================================================
 * 为什么需要 Node 版：
 *   GitHub Actions 的 runner 是海外机房 IP，B 站风控会直接拦掉，
 *   实测每天定时任务都失败、videos.js 一直停在旧数据。
 *   EdgeOne 的构建跑在国内网络，B 站访问正常，所以把同步放到构建阶段。
 *   EdgeOne 的构建镜像是 Node 的（没有 Python），因此这里用 Node 重写。
 *
 * 逻辑与 refresh_videos.py 保持一致：
 *   1. 空间投稿列表（wbi 签名）—— 能拿到全部投稿、最新在前
 *   2. 合集目录（view 接口）—— 拿分类，也是前者的兜底
 *   3. 两个都失败 → 保留现有 videos.js 不动，并以 0 退出（不能让构建挂掉）
 *
 * 本地也能跑：node refresh-videos.mjs
 * ============================================================
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MID = "669867138";
// 合集里的任意一个视频，用来取整份合集目录
const SEED_BVID = "BV1EWxPePEEB";
const MAX_VIDEOS = 300;

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(HERE, "videos.js");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// wbi 签名用的固定乱序表
const MIXIN_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function httpJson(url, retries = 3) {
  let last = "";
  for (let i = 0; i < retries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": UA,
          "Referer": "https://space.bilibili.com/" + MID,
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
      });
      clearTimeout(t);
      return await r.json();
    } catch (e) {
      last = `${e.name}: ${e.message}`;
      if (i < retries - 1) await sleep(1500 * (i + 1));
    }
  }
  throw new Error(`请求失败 ${url.split("?")[0]}（${last}）`);
}

/* B 站空间接口的 length 是 "4:27" / "1:02:33" 字符串，不是秒数 */
function parseLength(s) {
  const parts = String(s ?? "").trim().split(":");
  const nums = parts.map(p => parseInt(p, 10));
  if (nums.some(Number.isNaN)) return 0;
  if (nums.length === 1) return nums[0];
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return 0;
}

function ymd(sec) {
  const d = new Date((Number(sec) || 0) * 1000);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function nowStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* 封面统一成 https：B 站返回 http，放到 https 站点会被混合内容拦掉 */
function normCover(u) {
  const s = String(u || "").trim();
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("http://")) return "https://" + s.slice(7);
  return s;
}

async function getWbiKeys() {
  const d = await httpJson("https://api.bilibili.com/x/web-interface/nav");
  const wbi = (d.data || {}).wbi_img || {};
  const pick = u => String(u || "").split("/").pop().split(".")[0];
  const img = pick(wbi.img_url), sub = pick(wbi.sub_url);
  if (!img || !sub) throw new Error("拿不到 wbi 密钥");
  return [img, sub];
}

function encWbi(params, imgKey, subKey) {
  const raw = imgKey + subKey;
  const mixin = MIXIN_TAB.map(i => raw[i]).join("").slice(0, 32);
  const p = { ...params, wts: Math.floor(Date.now() / 1000) };
  const query = Object.keys(p).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(p[k]).replace(/[!'()*]/g, ""))}`)
    .join("&");
  const w_rid = createHash("md5").update(query + mixin).digest("hex");
  return query + "&w_rid=" + w_rid;
}

async function fetchSpaceVideos() {
  const [imgKey, subKey] = await getWbiKeys();
  const qs = encWbi({ mid: MID, ps: 50, pn: 1, order: "pubdate", platform: "web" }, imgKey, subKey);
  const d = await httpJson("https://api.bilibili.com/x/space/wbi/arc/search?" + qs);
  if (d.code !== 0) throw new Error(`空间接口返回 code=${d.code} ${d.message || ""}`);
  const vlist = ((d.data || {}).list || {}).vlist || [];
  return vlist.map(v => ({
    bvid: v.bvid || "",
    title: String(v.title || "").trim(),
    date: ymd(v.created),
    duration: parseLength(v.length),
    views: v.play || 0,
    cover: v.pic || "",
    section: "",
  }));
}

async function fetchSeasonVideos() {
  const d = await httpJson("https://api.bilibili.com/x/web-interface/view?bvid=" + SEED_BVID);
  if (d.code !== 0) throw new Error("view 接口返回 code=" + d.code);
  const season = (d.data || {}).ugc_season;
  if (!season) throw new Error("这个 BV 号不属于任何合集，换一个 SEED_BVID");

  const sections = {};
  const videos = [];
  for (const sec of season.sections || []) {
    const secTitle = String(sec.title || "").trim();
    for (const ep of sec.episodes || []) {
      const arc = ep.arc || {};
      const bvid = ep.bvid || arc.bvid || "";
      if (!bvid) continue;
      sections[bvid] = secTitle;
      videos.push({
        bvid,
        title: String(arc.title || ep.title || "").trim(),
        date: ymd(arc.pubdate),
        duration: parseInt((ep.page || {}).duration || arc.duration || 0, 10) || 0,
        views: (arc.stat || {}).view || 0,
        cover: arc.pic || "",
        section: secTitle,
      });
    }
  }
  return { videos, sections, title: String(season.title || "").trim(),
           total: season.ep_count || videos.length };
}

async function fetchFollowers() {
  try {
    const d = await httpJson("https://api.bilibili.com/x/relation/stat?vmid=" + MID, 2);
    return parseInt((d.data || {}).follower || 0, 10) || 0;
  } catch { return 0; }
}

function loadExisting() {
  try {
    const s = readFileSync(OUT_FILE, "utf8");
    return JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
  } catch { return null; }
}

async function main() {
  console.log("=".repeat(52));
  console.log("  萨姆萤光灯 · 最新投稿同步（Node / EdgeOne 构建）");
  console.log("=".repeat(52));

  let seasonVideos = [], seasonSections = {}, seasonTitle = "", seasonTotal = 0;
  try {
    const s = await fetchSeasonVideos();
    seasonVideos = s.videos; seasonSections = s.sections;
    seasonTitle = s.title; seasonTotal = s.total;
    console.log(`[OK]   合集「${seasonTitle || "?"}」：${seasonTotal} 个视频`);
  } catch (e) {
    console.log("[WARN] 合集读取失败：" + e.message);
  }

  let spaceVideos = [];
  try {
    spaceVideos = await fetchSpaceVideos();
    console.log(`[OK]   空间投稿列表：${spaceVideos.length} 个视频（第一页）`);
  } catch (e) {
    console.log("[WARN] 空间接口失败：" + e.message);
    if (seasonVideos.length) {
      console.log("       → 降级使用合集数据");
      spaceVideos = seasonVideos;
    }
  }

  if (!spaceVideos.length) {
    console.log("\n[FAIL] 两个来源都失败了，保留现有 videos.js 不动（构建继续）。");
    // 以 0 退出：数据没更新，但绝不能让 EdgeOne 构建失败
    return 0;
  }

  const byBvid = new Map();
  for (const v of spaceVideos) {
    v.section = seasonSections[v.bvid] ?? v.section ?? "";
    byBvid.set(v.bvid, v);
  }
  for (const v of seasonVideos) if (!byBvid.has(v.bvid)) byBvid.set(v.bvid, v);

  let merged = [...byBvid.values()].filter(v => v.bvid).map(v => ({
    ...v,
    url: "https://www.bilibili.com/video/" + v.bvid,
    cover: normCover(v.cover),
  }));
  merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.bvid < b.bvid ? 1 : -1)));
  merged = merged.slice(0, MAX_VIDEOS);

  const followers = await fetchFollowers();

  const payload = {
    updated: nowStr(),
    mid: MID,
    space: "https://space.bilibili.com/" + MID,
    followers,
    seasonTitle,
    seasonTotal,
    total: merged.length,
    videos: merged,
  };

  const js = "/* 本文件由同步脚本自动生成，请勿手改；" +
             "重新同步：node refresh-videos.mjs 或 py -3 refresh_videos.py */\n" +
             "window.BILI_VIDEOS = " + JSON.stringify(payload, null, 2) + ";\n";
  writeFileSync(OUT_FILE, js, { encoding: "utf8" });

  console.log("-".repeat(52));
  console.log(`[DONE] 已写入 videos.js`);
  console.log(`       共 ${merged.length} 个视频，最新：${merged[0].date}  ${merged[0].title}`);
  if (followers) console.log(`       当前粉丝数：${followers}`);
  return 0;
}

main()
  .then(code => process.exit(code))
  .catch(e => {
    console.error("[ERROR]", e.message);
    // 出错也让构建继续，用仓库里现有的 videos.js 部署
    process.exit(0);
  });
