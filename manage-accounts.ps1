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
    Write-Host ("  {0,-7} {1,-16} {2,-14} {3,-6} {4}" -f "SID", "用户名", "QQ 号", "认证", "注册时间")
    Write-Host ("  " + ("-" * 68))
    foreach ($u in $r.users) {
        $when = ""
        if ($u.createdAt) {
            try { $when = ([datetime]::Parse($u.createdAt)).ToLocalTime().ToString("yyyy-MM-dd HH:mm") } catch { $when = $u.createdAt }
        }
        $v = if ($u.verified) { "黄V" } else { "-" }
        Write-Host ("  {0,-7} {1,-16} {2,-14} {3,-6} {4}" -f $u.sid, $u.username, $u.qq, $v, $when) -ForegroundColor $(if ($u.verified) { "Yellow" } else { "Gray" })
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

# ---------------- 黄V（认证） ----------------
# 认证用户会在社区的帖子和评论旁边多一个黄色 V 徽标。

function Toggle-Verified {
    try { $r = Call-Api "GET" $null } catch {
        Write-Host "  拉取失败：$($_.Exception.Message)" -ForegroundColor Red
        return
    }
    if ($r.count -eq 0) { Write-Host "  还没有账号。" -ForegroundColor Yellow; return }
    Show-List

    $name = Read-Host "  输入用户名（或 SID），直接回车取消"
    if (-not $name) { return }
    $name = $name.Trim()
    $hit = $r.users | Where-Object { $_.username -eq $name -or $_.sid -eq $name }
    if (-not $hit) { Write-Host "  没找到这个账号。" -ForegroundColor Red; return }
    if ($hit -is [array]) { Write-Host "  匹配到多个，请用 SID 再试一次。" -ForegroundColor Red; return }

    $cur = if ($hit.verified) { "已有黄V" } else { "还没有黄V" }
    Write-Host ("  目标：" + $hit.sid + "  " + $hit.username + "（" + $cur + "）") -ForegroundColor Cyan
    $ans = Read-Host "  输入 y 加黄V / 输入 n 取消黄V / 其他键放弃"
    $want = $null
    if ($ans -eq "y") { $want = $true }
    elseif ($ans -eq "n") { $want = $false }
    else { Write-Host "  已取消。"; return }

    try {
        $res = Call-Api "POST" @{ action = "set-verified"; regId = $hit.regId; verified = $want }
        if ($want) {
            Write-Host ("  ✓ 已给 " + $hit.username + " 加上黄V") -ForegroundColor Green
        } else {
            Write-Host ("  ✓ 已取消 " + $hit.username + " 的黄V") -ForegroundColor Green
        }
    } catch {
        Write-Host ("  失败：" + $_.Exception.Message) -ForegroundColor Red
    }
}
# ---------------- 社区审核 ----------------
# 先发后审就靠这几项：能看最近发言、能删任意帖子和评论。

function Get-Posts([int]$Limit = 20) {
    $url = "$Site/api/community-posts?limit=$Limit"
    return Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 60
}

function Show-Posts {
    Write-Host ""
    Write-Host "读取最近发言…" -ForegroundColor DarkGray
    try { $r = Get-Posts 20 } catch {
        Write-Host "拉取失败：$($_.Exception.Message)" -ForegroundColor Red
        return
    }
    if (-not $r.posts -or $r.posts.Count -eq 0) {
        Write-Host ""
        Write-Host "  社区里还没有发言。" -ForegroundColor Yellow
        Write-Host ""
        return
    }
    Write-Host ""
    Write-Host ("  最近 " + $r.posts.Count + " 条发言") -ForegroundColor Cyan
    Write-Host ""
    $i = 0
    foreach ($p in $r.posts) {
        $i++
        $when = try { ([datetime]::Parse("1970-01-01T00:00:00Z").AddMilliseconds($p.ts)).ToLocalTime().ToString("MM-dd HH:mm") } catch { "" }
        $text = $p.body -replace "\s+", " "
        if ($text.Length -gt 42) { $text = $text.Substring(0, 42) + "…" }
        Write-Host ("  [" + $i + "] " + $p.name + "（SID " + $p.sid + "） " + $when + "  ♥" + $p.likeCount + "  💬" + $p.commentCount)
        Write-Host ("      " + $text) -ForegroundColor DarkGray
    }
    Write-Host ""
    Write-Host "  删帖用菜单 6。" -ForegroundColor DarkGray
    Write-Host ""
}

function Remove-Post {
    try { $r = Get-Posts 20 } catch {
        Write-Host "  拉取失败：$($_.Exception.Message)" -ForegroundColor Red
        return
    }
    if (-not $r.posts -or $r.posts.Count -eq 0) { Write-Host "  没有发言可删。" -ForegroundColor Yellow; return }
    Show-Posts
    $n = Read-Host "  输入要删除的编号（直接回车取消）"
    if (-not $n) { return }
    $idx = 0
    if (-not [int]::TryParse($n, [ref]$idx)) { Write-Host "  编号不对。" -ForegroundColor Red; return }
    if ($idx -lt 1 -or $idx -gt $r.posts.Count) { Write-Host "  没有这个编号。" -ForegroundColor Red; return }
    $target = $r.posts[$idx - 1]
    Write-Host ("  要删除：" + $target.name + "（SID " + $target.sid + "）") -ForegroundColor Yellow
    Write-Host ("  内容：" + ($target.body -replace "\s+", " ")) -ForegroundColor DarkGray
    if ((Read-Host "  确认删除？输入 yes 继续") -ne "yes") { Write-Host "  已取消。"; return }
    try {
        $api = "$Site/api/community-posts?id=" + $target.id + "&token=$Token"
        $null = Invoke-RestMethod -Uri $api -Method Delete -TimeoutSec 60
        Write-Host "  ✓ 已删除这条发言（它的点赞和评论留在库里但不显示了）" -ForegroundColor Green
    } catch {
        Write-Host ("  失败：" + $_.Exception.Message) -ForegroundColor Red
    }
}

function Manage-Comments {
    try { $r = Get-Posts 20 } catch {
        Write-Host "  拉取失败：$($_.Exception.Message)" -ForegroundColor Red
        return
    }
    if (-not $r.posts -or $r.posts.Count -eq 0) { Write-Host "  没有发言。" -ForegroundColor Yellow; return }
    Show-Posts
    $n = Read-Host "  输入要查看评论的发言编号（直接回车取消）"
    if (-not $n) { return }
    $idx = 0
    if (-not [int]::TryParse($n, [ref]$idx)) { Write-Host "  编号不对。" -ForegroundColor Red; return }
    if ($idx -lt 1 -or $idx -gt $r.posts.Count) { Write-Host "  没有这个编号。" -ForegroundColor Red; return }
    $target = $r.posts[$idx - 1]

    try {
        $c = Invoke-RestMethod -Uri "$Site/api/community-comments?postId=$($target.id)" -Method Get -TimeoutSec 60
    } catch {
        Write-Host ("  拉取评论失败：" + $_.Exception.Message) -ForegroundColor Red
        return
    }
    if (-not $c.comments -or $c.comments.Count -eq 0) { Write-Host "  这篇没有评论。" -ForegroundColor Yellow; return }

    Write-Host ""
    Write-Host ("  共 " + $c.comments.Count + " 条评论") -ForegroundColor Cyan
    $i = 0
    foreach ($cm in $c.comments) {
        $i++
        Write-Host ("  [" + $i + "] " + $cm.name + "（SID " + $cm.sid + "）")
        Write-Host ("      " + $cm.body) -ForegroundColor DarkGray
    }
    Write-Host ""
    $n2 = Read-Host "  输入要删除的评论编号（直接回车取消）"
    if (-not $n2) { return }
    $j = 0
    if (-not [int]::TryParse($n2, [ref]$j)) { Write-Host "  编号不对。" -ForegroundColor Red; return }
    if ($j -lt 1 -or $j -gt $c.comments.Count) { Write-Host "  没有这个编号。" -ForegroundColor Red; return }
    $tcm = $c.comments[$j - 1]
    if ((Read-Host ("  确认删除 " + $tcm.name + " 的这条评论？输入 yes 继续")) -ne "yes") { Write-Host "  已取消。"; return }
    try {
        $null = Invoke-RestMethod -Uri "$Site/api/community-comments?postId=$($target.id)&id=$($tcm.id)&token=$Token" -Method Delete -TimeoutSec 60
        Write-Host "  ✓ 已删除" -ForegroundColor Green
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
    Write-Host "  8  加 / 取消黄V"
    Write-Host ""
    Write-Host "  --- 社区审核 ---" -ForegroundColor DarkGray
    Write-Host "  5  查看最近发言"
    Write-Host "  6  删除某条发言"
    Write-Host "  7  查看 / 删除某帖的评论"
    Write-Host ""
    Write-Host "  0  退出"
    Write-Host ""
    $pick = Read-Host "选一个"

    switch ($pick) {
        "1" { Show-List }
        "2" { Reset-Password }
        "3" { Remove-Account }
        "4" { Recalc-Counter }
        "8" { Toggle-Verified }
        "5" { Show-Posts }
        "6" { Remove-Post }
        "7" { Manage-Comments }
        "0" { return }
        default { Write-Host "  没有这个选项。" -ForegroundColor DarkGray }
    }
}
