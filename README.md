# 萨姆萤光灯 · 流萤翻唱小站

一只高三萤厨的二次元风个人主页：流萤主题背景轮播、飘落的樱花、闪烁的萤火虫、手绘萤火虫吉祥物。

## 快速开始

- **本地预览**：直接用浏览器打开 `index.html` 即可（零依赖、无需构建）。
- **项目结构**

```
personal-website/
├── index.html          # 页面结构与全部内容
├── styles.css          # 全部样式（青绿色主题 + 深色模式）
├── main.js             # 背景轮播、实时刷新、主题切换、粒子、导航、动画
├── schedule.js         # 「发稿计划」表格数据 + 按日期自动着色
├── projects.js         # 「我的作品」栏渲染（读 videos.js，勿手改）
├── videos.js           # B站投稿数据（由 refresh_videos.py 生成，勿手改）
├── bg-realtime.js      # 实时背景池（由 refresh_bg.py 生成，勿手改）
├── refresh_videos.py   # 同步 B站投稿列表
├── refresh_bg.py       # 实时拉取 Pixiv 镜像流萤图
├── optimize_bg.ps1     # 背景图压缩（拉完新图跑一次）
├── build_font.py       # 生成标题字体子集
├── 404.html            # 自定义 404 页（样式内联，自包含）
├── assets/
│   ├── avatar.jpg      # B站头像
│   ├── fonts/          # 标题字体子集（由 build_font.py 生成）
│   └── bg/             # 本地兜底背景图 + realtime/（实时图）
└── README.md
```

> 三条自动生成的链路，都别手改产物，改源头再重跑脚本：
> `refresh_videos.py → videos.js`、`refresh_bg.py → bg-realtime.js`、
> `build_font.py → assets/fonts/`。

## 已配置的真实信息

| 项目 | 内容 |
| --- | --- |
| B站主页 | https://space.bilibili.com/669867138 |
| 粉丝群/萤厨群 | QQ群 716454006（纯展示，加群请复制群号） |
| QQ | 2946297906（点击可唤起 QQ 临时会话） |
| Email | samlamp@126.com（注明来意） |
| 2025 流萤翻唱合集（代表作） | https://www.bilibili.com/video/BV1MnvDByEfw/ |
| 2026 流萤翻唱合集 | 制作中，占位卡片 |

## 访客统计（自建为主，Vercount 兜底）

页面**右上角**显示「你是本站第 N 位访客 · 总访问量 M 次」。两层来源，前者不通自动退后者：

### 第 1 层：自建接口（首选）

- 代码：`edge-functions/api/count.js` → 自动生成路由 `POST /api/count`
- 存储：**EdgeOne KV**（免费版 1GB），键 `site_pv` / `site_uv`
- 为什么自建：原来两个第三方服务都出过事——**不蒜子已停服**（原站 502），换成 Vercount 后接口从国内访问要 **1.4～5.3 秒**（走 Cloudflare 海外边缘，实测落在阿姆斯特丹）。自建接口和站点跑在同一批边缘节点上，响应是**毫秒级**。
- **⚠️ 需要在控制台绑定一次 KV**（这一步无法用配置文件完成）：
  1. 控制台 → **存储 → KV** → 立即申请开通（免费）
  2. **创建命名空间**，名字随便（例如 `samlamp-visits`）
  3. 进入项目 → **KV 存储** → **绑定命名空间**，**变量名填 `VISITS`**
  - 没绑也能跑：接口返回 503，前端自动落到第 2 层，不会白屏。

### 第 2 层：Vercount 兜底

- **不引它的官方脚本**：它把请求超时**硬编码成 5 秒**，而接口从国内实测要 1.4～5.3 秒，经常刚好被 abort，数字就永远填不上。
- 所以 `main.js` 直接调 `POST https://events.vercount.one/api/v2/log`，body `{ url, isNewUv }`。

### 构建时把数字烤进 HTML（让首访也秒看到）

Vercount 有个**只读**接口（`GET /api/v2/log?url=...`，返回 `Data retrieved successfully`，**不增加计数**——只有 POST 才计数）。`build.mjs` 在构建时调它，把当前访客数直接写进 `index.html` 的两个 `<b>` 里。

- 效果：**第一次访问**的访客也能立刻看到数字，不用等那约 1.8 秒的异步请求。
- 浏览器加载后仍会用实时数据覆盖，所以烤进去的偏旧也没关系。
- `main.js` 配套处理了：**页面里已经有数字就不会退化成「加载失败」**。
- 取不到（比如构建机连不上 Vercount）就保留 `···` 占位，**不影响构建**。
- 注意：Vercount 按 URL 分站点，所以**用 `file://` 本地预览时数字会不一样**（本地文件是另一套计数），这是正常的，部署后正确。

### 两层共用的细节

- 超时统一 **12 秒**；数值写进 `localStorage`（键名 `visitorCountData`），**回访时先秒显缓存、再后台刷新**；
- UV 用 cookie 去重（名字沿用 `vercount_uv_<host>`，换后端也不会重复计数）；
- 改元素 ID 要动两处：`index.html` 里两个 `<b id="vercount_value_...">`，和 `main.js` 末尾那段；
- 窄屏下自动精简为只显示「你是本站第 N 位访客」；
- KV 是最终一致性存储（跨节点最长 60 秒），并发极高时可能少记几次，个人站完全够用。

## 歌曲投稿（自建表单 + Blob 存储）

原来的「歌曲投稿收集」嵌的是问卷星 iframe，现在换成了自建表单，数据存在自己的 EdgeOne Blob 里。

| 部分 | 文件 |
| --- | --- |
| 表单界面 | `index.html` 的 `#survey` 段 + `survey.js` |
| 提交接口 | `edge-functions/api/submit.js` → `POST /api/submit` |
| 读取接口 | `edge-functions/api/submissions.js` → `GET /api/submissions?token=…` |
| 本地取数 | `拉取投稿.bat` + `pull-submissions.ps1` → 生成 `投稿汇总.xlsx` |

### 表单字段

歌曲名 / 原唱 / 投稿人（三个必填）+「同意用于 AI 翻唱二创」勾选。

### 存储

- EdgeOne **Blob**，命名空间 `submissions`——**首次调用自动创建，不需要申请审核**。
  （对比：KV 要在控制台申请并等人工审核，计数器那个到现在还没批下来。）
- 每条投稿一个独立对象：`items/<时间戳>-<随机>.json`。
  不用「一个总文件」是因为 **Blob 是 60 秒最终一致**，多人同时投稿时「读-改-写」同一个文件会互相覆盖丢数据。

### ⚠️ 依赖与构建

- 接口里 `import { getStore } from "@edgeone/pages-blob"`，所以仓库根目录有 `package.json`，
  `edgeone.json` 里也加了 `"installCommand": "npm install"`。**`node_modules/` 不进仓库**，由构建时安装。
- 包名是 **`@edgeone/pages-blob`**。⚠️ 官方「存储概览」文档里写成了 `@tencent/pages-blob`，
  **那是笔误，npm 上不存在**（查过 registry，404）。

### 防刷

- **蜜罐字段** `website`：用 CSS 挪到屏幕外，正常人看不见；填了就说明是脚本
  → 服务端**假装提交成功**但不落库（不给机器人任何反馈）。
- 内容里含网址 → 拒绝（正常投稿不需要链接）。
- 长度上限、必填校验、授权必须是布尔 `true`（`"true"` 字符串也不算）。

> 这些只是「便宜的门槛」，真要刷还是能刷，个人站不值得为此上验证码。

### 取数据：双击「拉取投稿.bat」

调用读取接口，在本目录生成 **`投稿汇总.xlsx`**（列：序号 / 提交时间 / 歌曲名 / 原唱 / 投稿人 / 授权；
表头冻结、**序号是数字**可直接排序）。

- 令牌放在同目录的 **`submissions-token.txt`**（已在 `.gitignore` 里，不会进仓库）。
- **⚠️ 令牌丢了就读不到数据**，请自己备份。换令牌：改 `submissions.js` 里的 `TOKEN_SHA256`
  （仓库里只存 sha256，反推不出原文）后重新部署。
- xlsx 是脚本自己拼 OOXML + 用 .NET 自带 ZIP 打包生成的，**不依赖 openpyxl 之类的库**，机器上什么都不用装。
- 踩过两个坑（已修）：① PowerShell 5.1 的 `Invoke-RestMethod` 在响应头没带 `charset` 时按 Latin-1 解码，
  中文会变乱码——改成取原始字节按 UTF-8 解；② `styles.xml` 缺 `cellStyles` 会让 Excel/openpyxl 报「没有默认样式」。

### 已知的取舍

- 目前**没有后台管理页面**，只能靠脚本拉 Excel。**删改某条投稿目前做不到**
  （控制台的 Blob 只有只读浏览，删改必须通过函数）。需要的话我可以再加一个删除接口。
- 读取接口用 `consistency: "strong"`，保证刚提交的立刻能读到，代价是稍慢一点。

## 群管考核（限时答题 + 自动批改）

需求来自 `群管理员招募_C.docx`：3 大题 33 小问，含单选 / 多选 / 填空。首页公告区有「进入考核 →」按钮。

| 部分 | 文件 |
| --- | --- |
| 页面 | `exam.html` + `exam.css` + `exam.js` |
| 题库（**只有题干**） | `exam-data.js` |
| 发会话 | `edge-functions/api/exam-start.js` → `POST /api/exam-start` |
| 交卷批改 | `edge-functions/api/exam-submit.js` → `POST /api/exam-submit` |
| 成绩读取 / 删除 | `edge-functions/api/exam-results.js` |
| 导出 | `拉取考核成绩.bat` + `pull-exam-results.ps1` → `考核成绩.xlsx` |

### 分值（满分 100）

100 不能被 33 整除，所以每题 3 分（33×3＝99），再把唯一一道填空题（4-7 阵营）提到 4 分凑满：

| 大题 | 题数 | 分值 |
| --- | --- | --- |
| 一、崩铁知识 | 11 | 33 |
| 二、流萤知识 | 12 | 37（11×3 + 填空 4） |
| 三、群管能力 | 10 | 30 |

- **单选**：选中且只选中正确项才算对
- **多选**：必须与答案完全一致，**多选少选都不得分**
- **填空**：忽略空格/标点，包含关键词「星核猎手」即算对
- 想改分值：改 `exam-submit.js` 里 `KEY` 的 `points`（不写按 3 分算），`TOTAL` 会自动算

### ⚠️ 答案只在服务端

`exam-data.js` 里**只有题干和选项，没有答案**——打开控制台也看不到正确答案。
答案在 `edge-functions/api/exam-submit.js` 的 `KEY` 常量里。

### 时间与防作弊

- 开放时间：**北京时间 2026-10-24 全天**（UTC `2026-10-23T16:00` ~ `2026-10-24T16:00`）
- 点「开始答题」时服务端发一个会话并记录开始时间，**倒计时按这个时间算，刷新页面重置无效**
- 超过 60 分钟 + 90 秒宽限 → 拒收（`TIMEOUT`）
- 同一 QQ 只能交一次（`DUPLICATE`），QQ 必须是 5~12 位数字
- 交卷后 `localStorage` 打标记，同一浏览器不能重考

> **做不到的**：换浏览器 / 换 QQ 理论上可以重考。个人站不值得为此上实名验证。

### 预览模式（开考前自测）

正式开放前想走一遍完整流程，用带令牌的链接：

```
https://samlamp.top/exam.html?preview=<submissions-token.txt 里的令牌>
```

- 带正确的令牌 → 跳过开放时间限制，正常发会话、答题、交卷、批改
- 令牌不对 → 页面会明确提示「预览令牌不正确或已过期」，不会再显示成「尚未开放」误导人
- 预览会话标记 `preview: true`：**不参与查重**（不会把真考堵住），导出的表格里备注列写「预览（自测，不计入）」，统计时自动排除

### 取成绩

双击 **`拉取考核成绩.bat`** → `考核成绩.xlsx`

列：序号 / QQ号 / 群昵称 / 分数 / 得分率 / 提交时间 / 用时(分钟) / 备注。
按**分数从高到低**排，同分先交的在前；QQ 号写成文本列，避免 Excel 显示成科学计数法。

> 令牌与投稿接口共用（`submissions-token.txt`）。

## 构建与缓存（`edgeone.json` + `build.mjs`）

**项目配置放在仓库里，不需要动控制台。** `edgeone.json` 会覆盖控制台的同名设置：

```json
{ "buildCommand": "node build.mjs" }
```

`build.mjs` 做两件事：

1. **同步 B 站投稿**（调用 `refresh-videos.mjs`，失败不致命，沿用仓库里现有的 `videos.js`）
2. **给静态资源文件名加内容哈希**，并改写 HTML 里的引用

### 为什么要加哈希

EdgeOne 的默认浏览器缓存策略是**看文件名里有没有哈希**：

| 文件名 | 默认 Cache-Control |
|---|---|
| `main.a1b2c3d4.js`（带哈希）| `max-age=31536000`（一年）|
| `index.html` / `styles.css` | `max-age=0`（每次都要问服务器）|

所以不加哈希时，**每次访问都要为 5 个 JS/CSS 各发一次条件请求**。加上哈希后：没改动的文件浏览器直接用缓存、连请求都不发；改了内容的哈希跟着变，自然重新下载，**不会出现新旧版本混用**。

### 注意

- 构件产物（`main.a1b2c3d4.js` 这类）**不进仓库**，已在 `.gitignore` 里排除；仓库里保留原名，本地直接打开 `index.html` 就能预览。
- `build.mjs` 任何一步出错都会**抛异常让构建失败**——这样线上仍是上一次成功的部署，不会发布半成品。
- 边缘缓存（CDN 那层）**每次部署都会自动失效**，不需要手动清缓存。

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

| 文件 | Pixiv 作品 ID | 原图 | 窄屏图 `-s` |
| --- | --- | --- | --- |
| bg-140591786.jpg | 140591786 | 449 KB | 124 KB |
| bg-144019913.jpg | 144019913 | 211 KB | 57 KB |
| bg-139886638.jpg | 139886638 | 487 KB | 146 KB |
| bg-143979655.jpg | 143979655 | 567 KB | 166 KB |
| bg-141185006.jpg | 141185006 | 503 KB | 140 KB |

- 轮播：每 8 秒切换，1.6s 淡入淡出 + 缓慢缩放；某张失败自动跳过；系统「减少动态效果」时只显示第一张。
- 原图画师信息见对应 pixiv 作品页；个人网站使用没问题，若日后商用请先取得画师授权。

### 窄屏自动用小图

每张本地图都多一份 `-s.jpg`（**800px 宽**）的窄版：

| 视口宽度 | 用哪张 |
| --- | --- |
| ≤ **820px**（手机 / 竖屏平板）| `xxx-s.jpg` |
| > 820px（笔记本 / 桌面）| `xxx.jpg` 原图（1920 宽）|

**为什么**：原图 1920 宽、单张 211~567KB，而手机屏幕只有 390 CSS px，就算 DPR 2 也只需要 780px——加载 1920 宽纯属浪费。五张合计 **2217 KB → 632 KB，省 71%**，这是手机端最大的一笔流量。

- 判断写在 `main.js` 的 `srcOf()` 里；三处用到图的地方（`loadImage` / `prefetchNext` / `activate`）都走它。
- 实时池的图本身只有 800 宽左右、没有 `urlSm`，会自动不切换，不受影响。
- 换图后要重新生成小图：用 .NET GDI+ 缩放到 800 宽、JPEG 质量 82，文件名加 `-s`。
- **⚠️ 换背景图必须换文件名。** `/assets/bg/*` 的浏览器缓存是 **`max-age=31536000, immutable`（一年）**，
  沿用旧文件名的话，回访用户一年内都看不到新图。加个后缀（如 `bg-140591786-v2.jpg`）再更新 `main.js` 里的路径即可。
  字体文件同理：改字体后也要换文件名。

## 修改文案

所有文字都在 `index.html` 里，直接搜索替换：标题（`<title>` / `.logo` / `hero h1`）、自我介绍（`#about`）、作品卡片（`#projects`）、联系方式（`#contact`）。

## 维护「发稿计划」表格（`#schedule`）

排期数据在 `schedule.js` 顶部的 `SCHEDULE` 数组里，一行一首歌，改完存盘刷新即生效：

```js
{ date: "2026-09-04", song: "爱你是我的秘密", singer: "庄淇玟（29#）", submitter: "" },
```

- `date` 必须是 `YYYY-MM-DD`（补零），`submitter` 留空会显示为「—」。
- 行颜色按**浏览器本地日期**与 `date` 自动比较：早于今天=**灰**、等于今天=**黄**、晚于今天=**绿**，无需手动维护状态。
- 页面跨零点仍开着时，每分钟自动复查一次日期，重新着色。
- 窄屏（≤600px）下表格会自动变成卡片式排版，不用额外处理。
- 已发稿的歌曲在 `link` 里填 B 站视频地址，歌曲名就会变成可点击直链并带「B站 ↗」标签；留空则显示为普通文字。只放行 `http(s)`，写错协议不会被执行。

## 同步 B 站投稿（`#projects` 作品栏）

作品栏的数据全部来自 `videos.js`，而这个文件由脚本生成，**不用手改网页**。

### 三个入口，一份逻辑

| 脚本 | 用在哪 | 怎么跑 |
|---|---|---|
| **`同步投稿.bat`** | ⭐ **日常就用这个**（双击） | 双击即可，内部会调用下面的 .mjs |
| `sync-and-push.ps1` | 上面那个 .bat 实际执行的东西 | `powershell -ExecutionPolicy Bypass -File sync-and-push.ps1` |
| `refresh-videos.mjs` | 只同步、不提交推送 | `node refresh-videos.mjs` |
| `refresh_videos.py` | 纯 Python 版（备用） | `py -3 refresh_videos.py` |

逻辑一致：数据来源三层，优先级 **仓库已有数据（打底）＜ 合集目录 ＜ 空间投稿列表**；全失败就保留现有 `videos.js` 不动并打印原因。都会带上封面、时长、播放量、合集分类和粉丝数，封面统一转 `https`（否则 https 站点会被**混合内容**拦掉、封面全白）。

### ⚠️ 为什么同步只能在本机跑（重要，别白折腾）

**B 站封的是「机房 IP」，所有云端方案都试过，全部失败：**

| 方案 | 实测结果 |
|---|---|
| GitHub Actions | 海外机房 IP 被拦，连续 5 天定时任务全失败 |
| EdgeOne 构建 | 腾讯云机房 IP 也被拦：`view` 接口 `-412 request was banned`、空间接口 `-352 风控校验失败` |
| **本机（家庭宽带）** | ✅ **正常** —— 这是唯一稳定的 |

所以**不要**指望云端自动同步。它仍留在 `build.mjs` 的构建流程里（EdgeOne 每次部署都会先跑一遍），作为「能成最好、不成也无害」的兜底：失败时它会保留现有 `videos.js` 并以 0 退出，**不会让构建失败**（这一点已实测验证）。

### 日常怎么用

1. 在电脑上克隆一份仓库（只需一次）
2. 想要最新数据时，**双击 `同步投稿.bat`**
3. 脚本会：拉远端 → 同步 B 站 → 有变化就提交推送 → EdgeOne 自动重新部署
4. 等 1~2 分钟刷新 https://samlamp.top/ 即可

> 脚本依赖 `node` 和 `git`，两个都装好才能用。
> `.ps1` 文件带 **UTF-8 BOM**——PowerShell 5.1 见到 BOM 才会按 UTF-8 读，否则中文会乱码并报语法错误，改动这个文件时注意别把 BOM 弄丢。

### 其它

- 想改 UID / 视频数量上限，改脚本顶部的 `MID` / `MAX_VIDEOS`。
- 一个常被忽略的点：B 站对「爬虫 UA」也有风控（会返回 `-352`）。脚本都带了正常的浏览器 UA，所以本机能过；**但 UA 不是万能的——机房 IP 光靠 UA 过不去**，这就是上面那张表的原因。
- 空间接口返回的 `length` 是 `"4:27"` 这种**字符串**不是秒数，脚本里有 `parseLength` 专门解析——直接 `int()` 会让所有时长变成 0。
- 空间接口偶尔会限流（`-412`），这时会降级到合集数据。因为合集比空间列表少几个「未加入合集」的视频，所以合并时**把仓库已有数据也当成一层来源打底**，保证接口抽风时只缺新视频、不丢旧视频。

## 背景图体积（重要）

背景图**不要直接放原图**。曾经 13 张图合计 37 MB，压完之后只有 3.3 MB。拉完新图后跑一次：

```powershell
powershell -ExecutionPolicy Bypass -File optimize_bg.ps1
```

会在原地把 `assets/bg` 下的图统一压成「最宽 1920px 的 JPEG」，通常能省 90% 以上。用 .NET GDI+ 实现，**不需要安装 Python 图像库**。

另外 `main.js` 的背景轮播是**按需加载**的：开局只取要显示的那一张，成功后再预取下一张。不要改回「开局把整个池子全 `new Image()`」——那会让访客一次性拉几十 MB。

## 深色模式

- 首次访问跟随系统设置，之后按右上角（右下角工具条）的 🌙 / ☀️ 按钮手动切换，选择记在 `localStorage`。
- 想改深色配色，改 `styles.css` 末尾「深色模式」一节：先调 `html[data-theme="dark"]` 里的 `:root` 变量，个别浅色专有样式在下面的覆盖规则里。
- 决定主题的内联脚本放在 `index.html` 的 `<head>` 里，**不要挪到 body 或外部文件**，否则深色下会先闪一下白底。

## 字体

标题用的是**自托管的 ZCOOL KuaiLe 子集**（`assets/fonts/`，约 44 KB），不是 `fonts.googleapis.com`。

- 原因：`fonts.googleapis.com` 在国内经常超时，而且它是 `<link rel="stylesheet">`，会**阻塞首屏渲染**。
- Google Fonts 的 `text=` 参数能在服务端做子集化，`build_font.py` 就是干这个的：把 `index.html` + `schedule.js` 里出现的字抽出来，只要这 500 来个字。
- **改动标题文案后重跑** `py -3 build_font.py` 重新生成子集；漏掉的字会回退到系统字体，不会显示成方块。
- 正文不加载任何网络字体，直接用系统中文字体（苹方 / 微软雅黑），所以正文零下载。

## 分享预览与 SEO

链接发到 QQ / 微信 / B站私信时会显示卡片，靠的是 `index.html` 头部的这几组标签：

| 标签 | 值 |
| --- | --- |
| `og:image` / `twitter:image` | `https://samlamp.top/assets/og-cover.jpg` |
| `og:image:width` / `:height` | `1200` / `630` |
| `og:title` / `twitter:title` | 萨姆萤光灯 · 流萤翻唱 |

### 分享卡（`assets/og-cover.jpg`）

- **1200×630（1.91:1）** —— 这是微信/QQ/Twitter 卡片的通用比例，用别的比例会被裁掉两侧。
- 制作方式：写一个 1200×630 的 HTML（背景用 `assets/bg/bg-141185006.jpg`、左侧压白纱、标题用站酷快乐体），
  用无头浏览器截图，再转成 JPEG（质量 88，约 88 KB）。
- **换配色或换底图后要重新出图**，注意保持 1200×630。
- 底图取景用 `background-position: center 3%` —— 再往下会把头切掉。

### robots.txt / sitemap.xml

- `robots.txt` 全站放行，并指向 `sitemap.xml`。
- `sitemap.xml` 只有一条 `https://samlamp.top/`（单页站点，内容都在首页）。
- 两个文件都**不参与** `build.mjs` 的哈希改写（只处理 `.js` / `.css` 引用），直接原样部署。

## 404 页

`404.html` 的样式是**内联**的，故意不引 `styles.css`：GitHub Pages 对任意不存在的路径都会返回这个文件，相对路径会按「访客请求的那个目录」解析，多一层目录样式就全丢了。改配色时记得两边一起改。

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

> **本站当前已绑定自有域名 `samlamp.top`**（2026-09-30 起）。
> 仓库根目录的 `CNAME` 文件就是它，内容一行 `samlamp.top`——**不要删**，删了 GitHub 就不再认这个域名。
> 此时 `samlamp0619.github.io/firefly-site/` 会自动 301 跳到 `samlamp.top`，两个地址都能用。
> DNS 在阿里云云解析：`@` 指向 4 个 GitHub Pages IP，`www` CNAME 到 `samlamp0619.github.io`。
> 换域名时，除改 DNS 和 `CNAME` 外，记得同步改 `index.html` 里 4 处绝对地址（canonical + og:url + og:image + twitter:image）。

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
