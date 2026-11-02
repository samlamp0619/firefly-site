# AstrBot 聊天桥接
# ------------------------------------------------------------
# 跑在部署 AstrBot 的那台电脑上。它主动去网站取待回答的消息，
# 本地问 AstrBot，再把答案送回网站 —— 全程不需要任何入站连接，
# 不用公网 IP，不用配路由器。
#
# 用法：双击「启动聊天桥.bat」
#
# 需要的文件（都在同目录）：
#   submissions-token.txt   管理员 token（从网站后台拿，不进 git）
#   astrbot-config.txt      AstrBot 地址和 API Key，格式见下
#
# astrbot-config.txt 内容示例：
#   url=http://127.0.0.1:6185
#   key=abk_xxxxxxxxxxxxxxxx
#   # 可选，默认 1500 毫秒
#   interval=1500
# ------------------------------------------------------------

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Site = "https://samlamp.top"
$TokenFile = Join-Path $Here "submissions-token.txt"
$ConfFile = Join-Path $Here "astrbot-config.txt"
$LogFile = Join-Path $Here "chat-bridge.log"

# ---------- 读取配置 ----------
if (-not (Test-Path $TokenFile)) {
    Write-Host "缺少 submissions-token.txt" -ForegroundColor Red
    Write-Host "把管理员 token 单独一行写进去。"
    Read-Host "按回车退出"; exit 1
}
$Token = (Get-Content $TokenFile -Raw).Trim()

if (-not (Test-Path $ConfFile)) {
    @"
# AstrBot 连接配置（本文件不会进 git）
# url 是 AstrBot 的 WebUI 地址，默认端口 6185
url=http://127.0.0.1:6185
# key 在 AstrBot WebUI 的「设置 → OpenAPI」里创建，形如 abk_xxx
key=
# 多久去网站取一次消息（毫秒）
interval=1500
"@ | Set-Content $ConfFile -Encoding UTF8
    Write-Host "已生成 astrbot-config.txt，请填好 url 和 key 后重新运行。" -ForegroundColor Yellow
    Read-Host "按回车退出"; exit 1
}

$Conf = @{}
foreach ($line in Get-Content $ConfFile -Encoding UTF8) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith("#")) { continue }
    $i = $t.IndexOf("=")
    if ($i -lt 1) { continue }
    $Conf[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim()
}

$AstrUrl = if ($Conf["url"]) { $Conf["url"].TrimEnd("/") } else { "http://127.0.0.1:6185" }
$AstrKey = $Conf["key"]
$Interval = 1500
if ($Conf["interval"]) { try { $Interval = [int]$Conf["interval"] } catch { } }

if (-not $AstrKey) {
    Write-Host "astrbot-config.txt 里还没填 key。" -ForegroundColor Red
    Write-Host "去 AstrBot 的 WebUI「设置 → OpenAPI」创建一个 API Key（形如 abk_xxx）。"
    Read-Host "按回车退出"; exit 1
}

function Log([string]$msg, [string]$color = "Gray") {
    $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $msg
    Write-Host $line -ForegroundColor $color
    try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch { }
}

# ---------- HTTP 工具（统一按 UTF-8 解码，否则中文会乱码） ----------
function Invoke-Utf8 {
    param(
        [string]$Url,
        [string]$Method = "GET",
        $Body = $null,
        [hashtable]$Headers = @{},
        [int]$TimeoutSec = 60
    )
    $params = @{
        Uri         = $Url
        Method      = $Method
        Headers     = $Headers
        TimeoutSec  = $TimeoutSec
        ErrorAction = "Stop"
    }
    if ($null -ne $Body) {
        $json = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Compress -Depth 10 }
        $params["Body"] = [System.Text.Encoding]::UTF8.GetBytes($json)
        $params["ContentType"] = "application/json; charset=utf-8"
    }
    $resp = Invoke-WebRequest @params
    $bytes = $resp.RawContentStream.ToArray()
    return [System.Text.Encoding]::UTF8.GetString($bytes)
}

# ---------- 调 AstrBot ----------
# 返回 @{ text = "..."; error = "" }
function Ask-AstrBot([string]$Text, [string]$Username, [string]$SessionId) {
    $payload = @{
        message          = $Text
        username         = $Username
        session_id       = $SessionId
        enable_streaming = $false
    }
    try {
        $raw = Invoke-Utf8 -Url "$AstrUrl/api/v1/chat" -Method "POST" -Body $payload `
            -Headers @{ Authorization = "Bearer $AstrKey" } -TimeoutSec 120
    }
    catch {
        $detail = $_.Exception.Message
        try {
            $r = $_.Exception.Response
            if ($r) {
                $sr = New-Object System.IO.StreamReader($r.GetResponseStream())
                $errBody = $sr.ReadToEnd()
                if ($errBody) { $detail = $errBody.Substring(0, [Math]::Min(300, $errBody.Length)) }
            }
        } catch { }
        return @{ text = ""; error = "AstrBot 请求失败：" + $detail }
    }

    $raw = $raw.Trim()
    if (-not $raw) { return @{ text = ""; error = "AstrBot 返回了空内容" } }

    # 情况一：直接就是 JSON
    if ($raw.StartsWith("{") -or $raw.StartsWith("[")) {
        try {
            $obj = $raw | ConvertFrom-Json
            foreach ($k in @("text", "content", "reply", "message", "data")) {
                if ($obj.PSObject.Properties.Name -contains $k) {
                    $v = $obj.$k
                    if ($v -is [string] -and $v.Trim()) { return @{ text = $v; error = "" } }
                    if ($v -and $v.PSObject.Properties.Name -contains "text") { return @{ text = [string]$v.text; error = "" } }
                }
            }
            return @{ text = $raw; error = "" }
        } catch {
            return @{ text = $raw; error = "" }
        }
    }

    # 情况二：SSE 流（data: 开头），把各段拼起来
    $parts = New-Object System.Collections.Generic.List[string]
    foreach ($line in ($raw -split "`r?`n")) {
        $l = $line.Trim()
        if (-not $l.StartsWith("data:")) { continue }
        $chunk = $l.Substring(5).Trim()
        if ($chunk -eq "[DONE]" -or -not $chunk) { continue }
        $added = $false
        try {
            $o = $chunk | ConvertFrom-Json
            foreach ($k in @("text", "content", "delta", "reply")) {
                if ($o.PSObject.Properties.Name -contains $k) {
                    $v = $o.$k
                    if ($v -is [string]) { $parts.Add($v); $added = $true }
                    elseif ($v -and $v.PSObject.Properties.Name -contains "text") { $parts.Add([string]$v.text); $added = $true }
                }
            }
        } catch { }
        if (-not $added) { $parts.Add($chunk) }
    }

    $text = ($parts -join "").Trim()
    if (-not $text) {
        # 实在解析不出来，把原文写进日志，方便排查
        try {
            $dump = Join-Path $Here "astrbot-last-response.txt"
            Set-Content -Path $dump -Value $raw -Encoding UTF8
            Log "解析不出回复内容，原始响应已存到 astrbot-last-response.txt" "Yellow"
        } catch { }
        return @{ text = ""; error = "AstrBot 的回复格式看不懂，请把 astrbot-last-response.txt 发给我" }
    }
    return @{ text = $text; error = "" }
}

# ---------- 主循环 ----------
Log "聊天桥启动" "Cyan"
Log ("AstrBot: " + $AstrUrl)
Log ("轮询间隔: " + $Interval + " 毫秒")
Log "按 Ctrl+C 停止"
Write-Host ""

$okCount = 0
$errCount = 0

while ($true) {
    $body = $null
    try {
        $raw = Invoke-Utf8 -Url "$Site/api/chat-bridge?token=$Token" -Method "GET" -TimeoutSec 60
        $body = $raw | ConvertFrom-Json
    }
    catch {
        Log ("取消息失败：" + $_.Exception.Message) "Red"
        Start-Sleep -Milliseconds ([Math]::Max($Interval, 3000))
        continue
    }

    if (-not $body.ok) {
        Log ("网站返回错误：" + $body.error) "Red"
        Start-Sleep -Milliseconds 5000
        continue
    }

    foreach ($item in @($body.items)) {
        if (-not $item -or -not $item.id) { continue }
        $show = $item.text
        if ($show.Length -gt 30) { $show = $show.Substring(0, 30) + "…" }
        Log ("收到 [" + $item.name + "/SID " + $item.sid + "] " + $show) "DarkGray"

        $t0 = Get-Date
        $res = Ask-AstrBot -Text $item.text -Username ("web-" + $item.sid) -SessionId $item.sessionId
        $ms = [int]((Get-Date) - $t0).TotalMilliseconds

        $payload = @{ id = $item.id }
        if ($res.error) { $payload["error"] = $res.error }
        else { $payload["text"] = $res.text }

        try {
            $null = Invoke-Utf8 -Url "$Site/api/chat-bridge?token=$Token" -Method "POST" -Body $payload -TimeoutSec 60
            if ($res.error) {
                $errCount++
                Log ("  失败（" + $ms + "ms）：" + $res.error) "Red"
            } else {
                $okCount++
                $preview = $res.text
                if ($preview.Length -gt 40) { $preview = $preview.Substring(0, 40) + "…" }
                Log ("  已回复（" + $ms + "ms）：" + $preview) "Green"
            }
        }
        catch {
            Log ("  回写失败：" + $_.Exception.Message) "Red"
        }
    }

    Start-Sleep -Milliseconds $Interval
}
