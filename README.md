# 萨姆萤光灯 · 流萤翻唱小站

一只高三萤厨的二次元风个人主页：流萤主题背景轮播、飘落的樱花、闪烁的萤火虫、手绘萤火虫吉祥物。

## 快速开始

- **本地预览**：直接用浏览器打开 `index.html` 即可（零依赖、无需构建）。
- **项目结构**

```
personal-website/
├── index.html        # 页面结构与全部内容
├── styles.css        # 全部样式（青绿色主题）
├── main.js           # 背景轮播、实时刷新、只看实时开关、粒子、导航、动画
├── bg-realtime.js    # 实时背景池（由 refresh_bg.py 生成，勿手改）
├── refresh_bg.py     # 实时拉取 Pixiv 镜像流萤图的刷新脚本
├── assets/
│   ├── avatar.jpg    # B站头像
│   └── bg/           # 本地兜底背景图 + realtime/（实时图）
└── README.md
```

## 已配置的真实信息

| 项目 | 内容 |
| --- | --- |
| B站主页 | https://space.bilibili.com/669867138 |
| 粉丝群/萤厨群 | QQ群 716454006（纯展示，加群请复制群号） |
| QQ | 2946297906（点击可唤起 QQ 临时会话） |
| Email | samlamp@126.com（注明来意） |
| 2025 流萤翻唱合集（代表作） | https://www.bilibili.com/video/BV1MnvDByEfw/ |
| 2026 流萤翻唱合集 | 制作中，占位卡片 |

## 访客统计（不蒜子）

- 页面**右上角**显示「你是本站第 N 位访客 · 总访问量 M 次」，由免费服务 **不蒜子（Busuanzi）** 提供，无需注册、无需后端。
- 首次访问时 UV（独立访客数）就是你的序号；PV 为累计页面浏览量。
- 窄屏下自动精简为只显示「你是本站第 N 位访客」。
- 统计脚本加载超时（约 8 秒）会自动降级为「统计加载失败」提示，不影响页面其余功能。
- 数值按 IP + UA 近似去重统计，仅供娱乐参考；上线后从 0 开始累计。

## 背景图：实时获取机制

页面背景由「实时池 + 本地兜底」两层构成，优先级：实时池 → 本地图。

### 「只看实时」开关（右下角）

- 开启后轮播池**只保留实时拉取的图**，不显示本地兜底图；开关状态会记住（localStorage）。
- 开启但当前没有实时图时，页面保持薄荷渐变底并提示「暂无实时图」，点「🔄 换一批」或运行 `refresh_bg.py` 即可。
- 关闭后恢复「实时 + 本地」混合轮播。

### 实时池（Pixiv 镜像实时图）

1. 运行刷新脚本（需要本机有 Python 3，无第三方依赖）：

   ```bash
   cd personal-website
   python refresh_bg.py          # 默认拉 10 条、保存最多 8 张
   python refresh_bg.py 20       # 自定义数量
   ```

2. 脚本通过 **lolicon API**（服务端请求不受 CORS 限制）按 `tag=流萤`、`r18=0`（仅 SFW）、`excludeAI=1`（排除 AI 图）实时获取 Pixiv 作品，从 **i.pixiv.re 镜像**下载原图到 `assets/bg/realtime/`，并生成 `bg-realtime.js`。

3. 刷新网页（`Ctrl+F5`）即生效；**之后每次打开页面都会优先轮播这批实时图**。

### 页面内「🔄 换一批」按钮

右下角按钮会：
1. 尝试从浏览器直连 lolicon 拉取新图（受 CORS 影响，部分网络/浏览器可能失败，失败自动降级）；
2. 重新加载 `bg-realtime.js`（如果你刚跑过脚本，无需刷新网页即可生效）；
3. 都拿不到新图时继续使用本地 5 张兜底图（「只看实时」开启时则提示）。

> 想完全离线可用：跑一次 `refresh_bg.py` 后，把整个目录拷走即可，页面加载不再依赖外网。

### 本地兜底图（离线必现）

| 文件 | Pixiv 作品 ID |
| --- | --- |
| bg-140591786.png | 140591786 |
| bg-144019913.png | 144019913 |
| bg-139886638.jpg | 139886638 |
| bg-143979655.png | 143979655 |
| bg-141185006.png | 141185006 |

- 轮播：每 8 秒切换，1.6s 淡入淡出 + 缓慢缩放；某张失败自动跳过；系统「减少动态效果」时只显示第一张。
- 原图画师信息见对应 pixiv 作品页；个人网站使用没问题，若日后商用请先取得画师授权。

## 修改文案

所有文字都在 `index.html` 里，直接搜索替换：标题（`<title>` / `.logo` / `hero h1`）、自我介绍（`#about`）、作品卡片（`#projects`）、联系方式（`#contact`）。

## 自定义主题色

改 `styles.css` 顶部 `:root` 变量即可整体换色（当前为青绿色系）：

```css
--pink: #2ec4b6;    /* 主青绿 */
--purple: #1f9e92;  /* 深青绿 */
--blue: #7ed6c9;    /* 浅青绿 */
--amber: #ffd166;   /* 萤火虫黄 */
```

## 部署上线指南

> 本站是纯静态站（无构建步骤），总大小约 37MB（主要是背景大图）。任何静态托管都能直接跑。

### 方案一：GitHub Pages（免费，推荐）

1. 在 https://github.com/new 新建一个仓库（公开即可，例如 `firefly-site`）。
2. 把本目录推上去（**注意：仓库根目录 = 本目录内容**，不要把 `personal-website/` 这层文件夹也推进去）。本目录已附带一键脚本 **`deploy-github.bat`**：装好 Git、在 GitHub 建好空仓库后，用记事本把仓库地址填进脚本里的 `set "REPO_URL=..."`，双击运行即可自动完成 init/commit/push。手动命令如下：

   ```bash
   cd personal-website
   git init
   git add .
   git commit -m "上线：流萤翻唱小站 v1"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```

3. 仓库页面 → **Settings → Pages** → Source 选 **Deploy from a branch** → 分支选 **main**、目录选 **/(root)** → Save。
4. 等 1~2 分钟，访问 `https://<你的用户名>.github.io/<仓库名>/` 即可。
5. 以后更新内容：`git add . && git commit -m "xxx" && git push`，Pages 自动重新发布。

### 方案二：Netlify（免费，拖拽即上线，国内访问相对稳定）

1. 打开 https://app.netlify.com/drop
2. 把本机 `personal-website` **文件夹直接拖进去**，几秒后自动上线，得到一个 `https://xxx.netlify.app` 地址。
3. 之后每次改完，重新拖一次文件夹即可覆盖。

### 方案三：Cloudflare Pages（免费，全球 CDN 快）

1. https://dash.cloudflare.com → **Workers & Pages → Create → Pages → Direct Upload**
2. 上传 `personal-website` 文件夹内容 → Deploy。

### 绑定自己的域名

- 在域名商把 `www` / 根域名解析到对应平台（GitHub Pages 用 CNAME 指向 `<用户名>.github.io`，Netlify 用 CNAME 指向 `xxx.netlify.app`）。
- GitHub Pages：Settings → Pages → **Custom domain** 填入域名（会自动生成 `CNAME` 文件，也可手动建一个内容为域名的 `CNAME` 文件）。
- 所有平台都免费提供 HTTPS 证书。

### 国内托管（阿里云 OSS / 腾讯云 COS）

- 适合追求国内访问速度的场景；把 `assets` 等文件全部上传即可。
- ⚠️ 使用自己的域名 + 国内服务器/云存储做网站，需要 **ICP 备案**；用平台默认域名（如 `xxx.oss-cn-hangzhou.aliyuncs.com`）则不需要。

### 上线后小贴士

- **实时背景图**：部署后「🔄 换一批」按钮的浏览器直连可能被 CORS 拦截（正常现象），请继续用 `python refresh_bg.py` 更新图片，然后重新推送/上传即可。
- **图片缓存**：改完背景图发现没变化，先 `Ctrl+F5` 强刷。
- **体积优化**（可选）：37MB 主要是背景大图，以后可以压缩成 WebP（每张几百 KB），页面加载会更快。
