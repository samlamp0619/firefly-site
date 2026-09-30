#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
萨姆萤光灯 · 最新投稿同步脚本
================================
跑一次，就会把 B 站「萨姆萤光灯」的投稿列表写进 videos.js，
网页的「我的作品」栏读 videos.js 渲染，所以以后只要：

    py -3 refresh_videos.py

就会同步最新投稿（含封面、时长、播放量、合集分类），不用手动改网页。

只依赖 Python 标准库，不需要 pip install。

数据来源（按顺序尝试，前者失败自动降级）：
  1. 空间投稿列表 x/space/wbi/arc/search  —— 拿到「全部投稿」，最新在前
  2. 合集接口   x/web-interface/view       —— 从合集里取（分类信息来自这里）
  3. 两个都失败 → 保留现有 videos.js 不动，并打印原因
"""

import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# ============ 配置 ============
MID = "669867138"                     # 萨姆萤光灯的 UID
OUT_FILE = "videos.js"                # 生成的文件（与本脚本同目录）
MAX_VIDEOS = 300                      # 最多写入多少条
# 合集里的任意一个视频，用来取整份合集目录（随便换成一个在合集里的 BV 号也行）
SEED_BVID = "BV1EWxPePEEB"
# ==============================

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
HEADERS = {
    "User-Agent": UA,
    "Referer": "https://space.bilibili.com/%s" % MID,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
}

MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52,
]


def http_json(url, retries=3):
    """带重试的 GET，返回解析后的 JSON；失败抛 RuntimeError。"""
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last = "HTTP %s" % e.code
        except Exception as e:                                  # noqa: BLE001
            last = "%s: %s" % (type(e).__name__, e)
        if i < retries - 1:
            time.sleep(1.5 * (i + 1))
    raise RuntimeError("请求失败 %s（%s）" % (url.split("?")[0], last))


def get_wbi_keys():
    """取 wbi 签名用的 img_key / sub_key。"""
    d = http_json("https://api.bilibili.com/x/web-interface/nav")
    wbi = (d.get("data") or {}).get("wbi_img") or {}
    img_url = wbi.get("img_url") or ""
    sub_url = wbi.get("sub_url") or ""
    if not img_url or not sub_url:
        raise RuntimeError("拿不到 wbi 密钥")
    return (img_url.rsplit("/", 1)[-1].split(".")[0],
            sub_url.rsplit("/", 1)[-1].split(".")[0])


def enc_wbi(params, img_key, sub_key):
    """按 B 站 wbi 算法给参数签名，返回带 w_rid 的 dict。"""
    raw = img_key + sub_key
    mixin_key = "".join(raw[i] for i in MIXIN_KEY_ENC_TAB)[:32]

    params = dict(params)
    params["wts"] = int(time.time())
    params = {
        k: "".join(c for c in str(v) if c not in "!'()*")
        for k, v in sorted(params.items())
    }
    query = urllib.parse.urlencode(params)
    params["w_rid"] = hashlib.md5((query + mixin_key).encode("utf-8")).hexdigest()
    return params


def parse_length(s):
    """B 站空间接口的 length 是 "4:27" / "1:02:33" 这种字符串，不是秒数。
    直接 int() 会失败——之前就因此把时长全写成了 0，页面上的时长角标全都不显示。"""
    parts = str(s or "").strip().split(":")
    try:
        nums = [int(p) for p in parts]
    except ValueError:
        return 0
    if len(nums) == 1:
        return nums[0]
    if len(nums) == 2:
        return nums[0] * 60 + nums[1]
    if len(nums) == 3:
        return nums[0] * 3600 + nums[1] * 60 + nums[2]
    return 0


def fetch_space_videos():
    """来源 1：空间投稿列表（最新在前）。返回 list[dict]。"""
    img_key, sub_key = get_wbi_keys()
    signed = enc_wbi(
        {"mid": MID, "ps": 50, "pn": 1, "order": "pubdate", "platform": "web"},
        img_key, sub_key,
    )
    url = ("https://api.bilibili.com/x/space/wbi/arc/search?"
           + urllib.parse.urlencode(signed))
    d = http_json(url)
    if d.get("code") != 0:
        raise RuntimeError("空间接口返回 code=%s %s" % (d.get("code"), d.get("message")))

    vlist = ((d.get("data") or {}).get("list") or {}).get("vlist") or []
    out = []
    for v in vlist:
        out.append({
            "bvid": v.get("bvid") or "",
            "title": (v.get("title") or "").strip(),
            "date": time.strftime("%Y-%m-%d", time.localtime(v.get("created") or 0)),
            "duration": parse_length(v.get("length")),
            "views": v.get("play") or 0,
            "cover": v.get("pic") or "",
            "section": "",
        })
    return out


def fetch_season_videos():
    """来源 2：从合集目录取（带分类）。返回 (videos, season_title, season_total)。"""
    d = http_json("https://api.bilibili.com/x/web-interface/view?bvid=" + SEED_BVID)
    if d.get("code") != 0:
        raise RuntimeError("view 接口返回 code=%s" % d.get("code"))

    season = (d.get("data") or {}).get("ugc_season") or {}
    if not season:
        raise RuntimeError("这个 BV 号不属于任何合集，换一个 SEED_BVID")

    sections = {}
    videos = []
    for sec in season.get("sections") or []:
        sec_title = (sec.get("title") or "").strip()
        for ep in sec.get("episodes") or []:
            arc = ep.get("arc") or {}
            bvid = ep.get("bvid") or arc.get("bvid") or ""
            if not bvid:
                continue
            page = ep.get("page") or {}
            sections[bvid] = sec_title
            videos.append({
                "bvid": bvid,
                "title": (arc.get("title") or ep.get("title") or "").strip(),
                "date": time.strftime("%Y-%m-%d", time.localtime(arc.get("pubdate") or 0)),
                "duration": int(page.get("duration") or arc.get("duration") or 0),
                "views": ((arc.get("stat") or {}).get("view")) or 0,
                "cover": arc.get("pic") or "",
                "section": sec_title,
            })
    return videos, (season.get("title") or "").strip(), season.get("ep_count") or len(videos), sections


def norm_cover(url):
    """封面统一成 https：B 站返回的是 http，直接放到 https 站点会被浏览器
    按「混合内容」拦掉，图就全白了。"""
    url = (url or "").strip()
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("http://"):
        return "https://" + url[len("http://"):]
    return url


def fetch_followers():
    """粉丝数，失败不影响主流程。"""
    try:
        d = http_json("https://api.bilibili.com/x/relation/stat?vmid=" + MID, retries=2)
        return int((d.get("data") or {}).get("follower") or 0)
    except Exception:                                           # noqa: BLE001
        return 0


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(here, OUT_FILE)

    print("=" * 52)
    print("  萨姆萤光灯 · 最新投稿同步")
    print("=" * 52)

    # ---- 合集（拿分类 + 兜底数据） ----
    season_videos, season_title, season_total, sections = [], "", 0, {}
    try:
        season_videos, season_title, season_total, sections = fetch_season_videos()
        print("[OK]   合集「%s」：%d 个视频" % (season_title or "?", season_total))
    except Exception as e:                                      # noqa: BLE001
        print("[WARN] 合集读取失败：%s" % e)

    # ---- 空间投稿（首选：含合集外的新投稿） ----
    videos = []
    try:
        videos = fetch_space_videos()
        print("[OK]   空间投稿列表：%d 个视频（第一页）" % len(videos))
    except Exception as e:                                      # noqa: BLE001
        print("[WARN] 空间接口失败：%s" % e)
        if season_videos:
            print("       → 降级使用合集数据")
            videos = season_videos

    if not videos:
        print("\n[FAIL] 两个来源都失败了，保留现有 %s 不动。" % OUT_FILE)
        print("       常见原因：网络不通、被 B 站风控、或需要先在浏览器登录一次。")
        print("       稍后重跑即可，脚本不会破坏已有数据。")
        return 1

    # ---- 合并：空间列表为主，用合集补齐分类和缺失项 ----
    by_bvid = {}
    for v in videos:
        v["section"] = sections.get(v["bvid"], v.get("section", ""))
        by_bvid[v["bvid"]] = v
    for v in season_videos:
        by_bvid.setdefault(v["bvid"], v)

    merged = [v for v in by_bvid.values() if v.get("bvid")]
    for v in merged:
        v["url"] = "https://www.bilibili.com/video/" + v["bvid"]
        v["cover"] = norm_cover(v.get("cover"))
    merged.sort(key=lambda v: (v.get("date") or "", v.get("bvid") or ""), reverse=True)
    merged = merged[:MAX_VIDEOS]

    followers = fetch_followers()

    # ---- 写出 videos.js ----
    payload = {
        "updated": time.strftime("%Y-%m-%d %H:%M"),
        "mid": MID,
        "space": "https://space.bilibili.com/" + MID,
        "followers": followers,
        "seasonTitle": season_title,
        "seasonTotal": season_total,
        "total": len(merged),
        "videos": merged,
    }
    js = ("/* 本文件由 refresh_videos.py 自动生成，请勿手改；"
          "重新同步请运行：py -3 refresh_videos.py */\n"
          "window.BILI_VIDEOS = "
          + json.dumps(payload, ensure_ascii=False, indent=2)
          + ";\n")

    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(js)

    print("-" * 52)
    print("[DONE] 已写入 %s" % OUT_FILE)
    print("       共 %d 个视频，最新：%s  %s"
          % (len(merged), merged[0]["date"], merged[0]["title"]))
    if followers:
        print("       当前粉丝数：%d" % followers)
    print("       刷新网页即可看到更新。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
