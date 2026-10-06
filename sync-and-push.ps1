# 萨姆萤光灯 · 一键同步 B 站投稿并推送
# ============================================================
# 为什么要在本地跑：
#   B 站封的是「机房 IP」——实测 GitHub Actions 的 runner（海外机房）
#   和 EdgeOne 的构建服务器（腾讯云机房）都被拦，返回 -412 / -352。
#   只有你自己的家庭宽带 IP 能正常访问，所以同步只能在本机做。
#
# 用法：
#   双击同目录的「同步投稿.bat」，或者：
#   powershell -ExecutionPolicy Bypass -File sync-and-push.ps1
#
# 做完之后 EdgeOne 会自动重新部署，等 1~2 分钟刷新网站即可。
# ============================================================

$ErrorActionPreference = "Continue"

# 切到脚本所在目录（也就是仓库根目录）
Set-Location -LiteralPath $PSScriptRoot

function Step($n, $text) {
  Write-Host ""
  Write-Host "=== $n $text ===" -ForegroundColor Cyan
}

# 双击 .bat 运行时停下来让人看结果；被脚本/计划任务调用时不阻塞
function Pause-AtEnd {
  if (-not [Console]::IsInputRedirected) {
    Pause-AtEnd
  }
}

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  萨姆萤光灯 · 同步 B 站投稿" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# ---------- 0. 环境检查 ----------
Step "0/4" "检查环境"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[错误] 找不到 node，请先安装 Node.js：https://nodejs.org/" -ForegroundColor Red
  exit 1
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "[错误] 找不到 git，请先安装 Git for Windows：https://git-scm.com/download/win" -ForegroundColor Red
  exit 1
}
Write-Host ("  node " + (node --version) + " / git " + ((git --version) -replace 'git version ','' ))

# 仓库目录可能属于管理员组，git 会报 "dubious ownership"，这里显式放行
$safeDir = ($PWD.Path -replace '\\', '/')
$gitSafe = @("-c", "safe.directory=$safeDir")

# ---------- 1. 先拉一下远端，避免推送被拒 ----------
Step "1/4" "同步远端（git pull）"
git @gitSafe pull --rebase --autostash
if ($LASTEXITCODE -ne 0) {
  Write-Host "  [提示] pull 没成功，可能是网络问题或本地有冲突。" -ForegroundColor Yellow
  Write-Host "         如果是冲突，请先手动处理完再重跑本脚本。" -ForegroundColor Yellow
}

# ---------- 2. 拉取 B 站投稿 ----------
Step "2/4" "拉取 B 站最新投稿"
node refresh-videos.mjs
if ($LASTEXITCODE -ne 0) {
  Write-Host "  [提示] 同步脚本返回了非 0，但通常仍会保留现有数据。" -ForegroundColor Yellow
}

# ---------- 3. 有没有变化 ----------
Step "3/4" "检查 videos.js 是否有变化"
$changed = git @gitSafe status --porcelain -- videos.js
if (-not $changed) {
  Write-Host "  没有变化，不需要推送。网站数据已是最新。" -ForegroundColor Green
  Write-Host ""
  Pause-AtEnd
  exit 0
}

# ---------- 4. 提交并推送 ----------
Step "4/4" "提交并推送"
git @gitSafe add videos.js
$msg = "chore: 同步 B 站投稿（" + (Get-Date -Format "yyyy-MM-dd HH:mm") + "）"
git @gitSafe commit -m $msg
if ($LASTEXITCODE -ne 0) {
  Write-Host "  [错误] 提交失败。" -ForegroundColor Red
  Pause-AtEnd
  exit 1
}

git @gitSafe push origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host "  [错误] 推送失败。常见原因：" -ForegroundColor Red
  Write-Host "         · 没配 SSH 密钥（GitHub 需要 key 才能推送）" -ForegroundColor Red
  Write-Host "         · 网络不通" -ForegroundColor Red
  Pause-AtEnd
  exit 1
}

Write-Host ""
Write-Host "完成！EdgeOne 会在 1~2 分钟内自动重新部署。" -ForegroundColor Green
Write-Host "之后打开 https://samlamp.top/ 就能看到最新投稿。" -ForegroundColor Green
Write-Host ""
Read-Host "按回车键关闭"
