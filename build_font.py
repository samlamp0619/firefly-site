# -*- coding: utf-8 -*-
"""把标题字体（ZCOOL KuaiLe）做成「只含本站用到的字」的子集并自托管。

为什么这么做：
  1. 现在 <head> 里引的是 fonts.googleapis.com，国内经常直接超时，
     而且是 render-blocking 的 stylesheet —— 首屏会被它拖住。
  2. Google Fonts 的 text= 参数能在服务端做子集化，返回只含指定字的字体文件。
  3. 标题字体只用在「我们自己写的固定文案」上（视频标题已改用正文字体），
     所以子集一次生成后基本不用再动。

用法：py -3 build_font.py
产物：assets/fonts/zcool-kuaile-subset.woff2 + assets/fonts/fonts.css
"""
import io
import os
import re
import sys
import urllib.parse
import urllib.request

SITE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(SITE, "assets", "fonts")
FAMILY = "ZCOOL KuaiLe"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")

# 兜底字符集：万一以后加了新文案，这些常用字不会缺
EXTRA = (
    "的一是不了人我在有他这为之大来以个中上们到说国和地也子时道出而要于就下得可你年生"
    "自会那后能对着事其里所去行过家十用发天如然作方成者多日都三小军二无同么经法当起与"
    "好还加量更被给等别真新已线果走次该山将先声身话问力心反你明看原又么利比或但质气第"
    "向道命此变条只没结解问意建月公无系很者最重并物手应战向头文体因由其些然实想表但开"
    "流萤翻唱歌曲原唱投稿人日期计划发稿萨姆光灯站主页联系关于公告资源作品问卷收藏关注"
    "最新列表加载更多分类搜索共首播放同步于已过就是今天待绿色黄色灰色"
    "0123456789"
    "abcdefghijklmnopqrstuvwxyz"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "·—～~!@#$%^&*()_+-=[]{}|;:'\",.<>/?、。，！？：；“”‘’（）《》【】…￥"
)


def read(path):
    return io.open(path, encoding="utf-8").read()


def collect_chars():
    text = read(os.path.join(SITE, "index.html"))
    text += read(os.path.join(SITE, "schedule.js"))
    chars = set(text) | set(EXTRA)
    # 去掉控制字符和换行
    return "".join(sorted(c for c in chars if c.isprintable() and c != "\n"))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    chars = collect_chars()
    print("子集字符数：%d（非 ASCII %d）" % (len(chars), len([c for c in chars if ord(c) > 127])))

    url = ("https://fonts.googleapis.com/css2?family=%s&text=%s&display=swap"
           % (urllib.parse.quote(FAMILY), urllib.parse.quote(chars)))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        css = r.read().decode("utf-8")

    m = re.search(r"url\((https://[^)]+)\)", css)
    if not m:
        print("[FAIL] 返回的 CSS 里没有字体地址：")
        print(css[:400])
        return 1
    font_url = m.group(1)
    print("字体地址：%s" % font_url[:90])

    req = urllib.request.Request(font_url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        blob = r.read()
    print("下载完成：%.1f KB" % (len(blob) / 1024))

    fmt = "woff2" if font_url.lower().endswith(".woff2") or "\ufffd" not in "" else "woff2"
    if blob[:4] == b"wOF2":
        ext = "woff2"
    elif blob[:4] == b"wOFF":
        ext = "woff"
    else:
        ext = "woff2"          # Google 对现代 UA 基本都返回 woff2

    font_name = "zcool-kuaile-subset." + ext
    with open(os.path.join(OUT_DIR, font_name), "wb") as f:
        f.write(blob)

    local_css = (
        "/* 标题字体子集：由 build_font.py 生成，请勿手改。\n"
        "   只含本站用到的字，所以只有几十 KB；改完文案重跑 py -3 build_font.py 即可。 */\n"
        "@font-face {\n"
        "  font-family: 'ZCOOL KuaiLe';\n"
        "  font-style: normal;\n"
        "  font-weight: 400;\n"
        "  font-display: swap;\n"
        "  src: url('%s') format('%s');\n"
        "}\n" % (font_name, ext)
    )
    with io.open(os.path.join(OUT_DIR, "fonts.css"), "w", encoding="utf-8", newline="\n") as f:
        f.write(local_css)

    print("[DONE] 已写入 assets/fonts/%s 和 assets/fonts/fonts.css" % font_name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
