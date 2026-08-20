#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
实时拉取 Pixiv 镜像站的流萤图，生成 bg-realtime.js 供页面轮播。

原理：lolicon API（服务端请求不受 CORS 限制）按 tag=流萤、r18=0（仅 SFW）
返回 i.pixiv.re 图床直链，下载原图到 assets/bg/realtime/ 并生成
bg-realtime.js（页面用 <script> 方式加载，file:// 打开也兼容）。

用法：
    python refresh_bg.py          # 拉 10 张、保存最多 8 张
    python refresh_bg.py 20       # 自定义数量
然后刷新网页即可看到新图（或点页面右下角「🔄 换一批」）。
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent
RT_DIR = BASE / "assets" / "bg" / "realtime"
# 本地兜底图已占用的 PID，避免重复
USED_PIDS = {140591786, 144019913, 139886638, 143979655, 141185006, 143312965}
DEFAULT_NUM = 10
MAX_SAVE = 8


def fetch(url, timeout=30, referer=None):
    req = urllib.request.Request(url, headers={
        "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"),
        "Accept": "application/json",
    })
    if referer:
        req.add_header("Referer", referer)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def main():
    num = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_NUM
    RT_DIR.mkdir(parents=True, exist_ok=True)

    api = ("https://api.lolicon.app/setu/v2?r18=0&num=%d&size=regular&excludeAI=1&tag=%s"
           % (num, urllib.parse.quote("流萤")))
    try:
        raw = fetch(api)
    except Exception as e:
        print("API 请求失败：%s" % e)
        sys.exit(1)

    data = json.loads(raw.decode("utf-8")).get("data") or []
    print("API 返回 %d 条" % len(data))

    pool = []
    saved = 0
    for d in data:
        if saved >= MAX_SAVE:
            break
        pid = d.get("pid")
        if pid in USED_PIDS:
            continue
        url = (d.get("urls") or {}).get("regular") or (d.get("urls") or {}).get("original")
        if not url:
            continue
        try:
            img = fetch(url, timeout=60, referer="https://www.pixiv.net/")
            if len(img) < 10000:
                print("跳过 %s：图片过小" % pid)
                continue
            magic = img[:4].hex()
            if magic.startswith("ffd8"):
                ext = "jpg"
            elif magic.startswith("89504e47"):
                ext = "png"
            elif magic.startswith("52494646"):
                ext = "webp"
            else:
                ext = "jpg"
            fname = "rt_%d.%s" % (pid, ext)
            (RT_DIR / fname).write_bytes(img)
            pool.append({
                "url": "assets/bg/realtime/" + fname,
                "credit": "实时 © %s（Pixiv %s）" % (d.get("author") or "未知画师", pid),
            })
            saved += 1
            print("OK %s %d B" % (fname, len(img)))
        except Exception as e:
            print("跳过 %s：%s" % (pid, e))
        time.sleep(0.3)

    out = ("/* 实时背景池：由 refresh_bg.py 刷新生成，勿手改 */\n"
           "window.REALTIME_BG = %s;\n" % json.dumps(pool, ensure_ascii=False, indent=2))
    (BASE / "bg-realtime.js").write_text(out, encoding="utf-8")
    print("完成：保存 %d 张，已写入 bg-realtime.js（刷新网页即可看到）" % saved)


if __name__ == "__main__":
    main()
