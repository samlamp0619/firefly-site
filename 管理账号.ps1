# 账号管理（站主用）
# ------------------------------------------------------------
# 调 /api/auth-admin，能看账号列表、重置密码、删号。
# 需要 submissions-token.txt 里的管理员 token（该文件不进 git）。
#
# 用法：双击「管理账号.bat」
# ------------------------------------------------------------

$ErrorActionPreference = "Stop"
$Site = "https://samlamp.top"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$TokenFile = Join-Path $Here "submissions-token.txt"

if (-not (Test-Path $TokenFile)) {
    Write-Host ""
    Write-Host "找不到 submissions-token.txt" -ForegroundColor Red
    Write-Host "把管理员 token 单独一行写进这个文件（它不会进 git）。"
    Read-Host "按回车退出"
    exit 1
}
$Token = (Get-Content $TokenFile -Raw).Trim()

function Call-Api([string]$Method, $Body) {
    $url = "$Site/api/auth-admin?token=$Token"
    if ($Method -eq "GET") {
        return Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 60
    }
    $json = $Body | ConvertTo-Json -Compress
    # 中文必须按 UTF-8 发出去，否则服务端收到乱码
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    return Invoke-RestMethod -Uri $url -Method Post -Body $bytes `
        -ContentType "application/json; charset=utf-8" -TimeoutSec 60
}

function Show-List {
    Write-Host ""
    Write-Host "读取账号列表…" -ForegroundColor DarkGray
    try { $r = Call-Api "GET" $null } catch {
        Write-Host "拉取失败：$($_.Exception.Message)" -ForegroundColor Red
        return
    }
    if ($r.count -eq 0) {
        Write-Host ""
        Write-Host "  还没有人注册。" -ForegroundColor Yellow
        Write-Host ""
        return
    }
    Write-Host ""
    Write-Host ("  共 " + $r.count + " 个账号" + $(if ($r.truncated) { "（只显示前 " + $r.shown + " 个）" } else { "" })) -ForegroundColor Cyan
    Write-Host ""
    Write-Host ("  {0,-7} {1,-16} {2,-14} {3}" -f "SID", "用户名", "QQ 号", "注册时间")
    Write-Host ("  " + ("-" * 60))
    foreach ($u in $r.users) {
        $when = ""
        if ($u.createdAt) {
            try { $when = ([datetime]::Parse($u.createdAt)).ToLocalTime().ToString("yyyy-MM-dd HH:mm") } catch { $when = $u.createdAt }
        }
        Write-Host ("  {0,-7} {1,-16} {2,-14} {3}" -f $u.sid, $u.username, $u.qq, $when)
    }
    Write-Host ""
}

function Pick-User {
    try { $r = Call-Api "GET" $null } catch { Write-Host "拉取失败" -ForegroundColor Red; return $null }
    if ($r.count -eq 0) { Write-Host "还没有账号。" -ForegroundColor Yellow; return $null }
    $name = Read-Host "  输入用户名（或 SID）"
    if (-not $name) { return $null }
    $name = $name.Trim()
    $hit = $r.users | Where-Object { $_.username -eq $name -or $_.sid -eq $name }
    if (-not $hit) { Write-Host "  没找到这个账号。" -ForegroundColor Red; return $null }
    if ($hit -is [array]) { Write-Host "  匹配到多个，请用 SID 再试一次。" -ForegroundColor Red; return $null }
    return $hit
}

function Reset-Password {
    $u = Pick-User
    if (-not $u) { return }
    Write-Host ("  正在重置：" + $u.sid + "  " + $u.username) -ForegroundColor Cyan
    $pw = Read-Host "  新密码（至少 8 位，输入时不显示）" -AsSecureString
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw))
    if ($plain.Length -lt 8) { Write-Host "  太短了，取消。" -ForegroundColor Red; return }
    try {
        $r = Call-Api "POST" @{ action = "reset-password"; regId = $u.regId; password = $plain }
        Write-Host ("  ✓ " + $u.username + " 的密码已重置，用新密码登录即可。") -ForegroundColor Green
    } catch {
        Write-Host ("  失败：" + $_.Exception.Message) -ForegroundColor Red
    }
}

function Remove-Account {
    $u = Pick-User
    if (-not $u) { return }
    Write-Host ("  要删除：" + $u.sid + "  " + $u.username + "（QQ " + $u.qq + "）") -ForegroundColor Yellow
    Write-Host "  默认不回收 SID —— 号码作废，后面的人不会顶替。" -ForegroundColor DarkGray
    $ans = Read-Host "  确认删除？输入 yes 继续"
    if ($ans -ne "yes") { Write-Host "  已取消。"; return }
    $free = Read-Host "  连 SID 一起放回？只清测试号才用（输入 yes）"
    $freeSid = ($free -eq "yes")
    try {
        $r = Call-Api "POST" @{ action = "delete"; regId = $u.regId; freeSid = $freeSid }
        Write-Host ("  ✓ 已删除 " + $u.sid + " " + $u.username + $(if ($freeSid) { "，号码已放回（当前最大号 " + $r.lastSid + "）" } else { "，号码保留作废" })) -ForegroundColor Green
    } catch {
        Write-Host ("  失败：" + $_.Exception.Message) -ForegroundColor Red
    }
}

function Recalc-Counter {
    try {
        $r = Call-Api "POST" @{ action = "recount" }
        Write-Host ("  ✓ 号段提示已重算，当前最大号：" + $r.lastSid) -ForegroundColor Green
    } catch {
        Write-Host ("  失败：" + $_.Exception.Message) -ForegroundColor Red
    }
}

# ---------------- 主循环 ----------------
while ($true) {
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "  萨姆萤光灯 · 账号管理" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "  1  查看账号列表"
    Write-Host "  2  重置某人的密码"
    Write-Host "  3  删除账号"
    Write-Host "  4  重算号段提示"
    Write-Host "  0  退出"
    Write-Host ""
    $pick = Read-Host "选一个"

    switch ($pick) {
        "1" { Show-List }
        "2" { Reset-Password }
        "3" { Remove-Account }
        "4" { Recalc-Counter }
        "0" { return }
        default { Write-Host "  没有这个选项。" -ForegroundColor DarkGray }
    }
}
