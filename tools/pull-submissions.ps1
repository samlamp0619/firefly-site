# 萨姆萤光灯 · 拉取歌曲投稿并生成 Excel
# ============================================================
# 用法：双击「拉取投稿.bat」，或
#       powershell -ExecutionPolicy Bypass -File pull-submissions.ps1
#
# 需要同目录下有 submissions-token.txt（一行，放你的管理令牌）。
#
# 工作方式：调用 https://samlamp.top/api/submissions 拿到全部投稿，
#           在本目录生成/覆盖「投稿汇总.xlsx」。
#
# 为什么自己拼 xlsx：你机器上没有 openpyxl，也不想让你装东西。
#   所以直接用 OOXML 的 XML + .NET 自带 ZIP 打包，零依赖。
# ============================================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$tokenFile = Join-Path $root "submissions-token.txt"
$outFile   = Join-Path $root "投稿汇总.xlsx"
$apiBase   = "https://samlamp.top/api/submissions"

function Say($text, $color = "Gray") { Write-Host $text -ForegroundColor $color }

Say "==============================================" Cyan
Say "  萨姆萤光灯 · 拉取歌曲投稿" Cyan
Say "==============================================" Cyan

# ---------- 1. 读令牌 ----------
if (-not (Test-Path $tokenFile)) {
    Say "[错误] 找不到 submissions-token.txt" Red
    Say "       这个文件里只放一行：你的投稿管理令牌。" Red
    Say "       丢了令牌就读不到数据，请妥善保存。" Red
    exit 1
}
$token = (Get-Content $tokenFile -Raw -Encoding UTF8).Trim()
if (-not $token) { Say "[错误] submissions-token.txt 是空的" Red; exit 1 }

# ---------- 2. 拉数据 ----------
Say ""
Say "正在拉取投稿…"
$resp = $null
try {
    # 刻意不用 Invoke-RestMethod：PowerShell 5.1 在响应头没带 charset 时会按
    # Latin-1 解码，中文会变成「å¤§é±¼」这样的乱码。这里直接取原始字节按 UTF-8 解。
    $raw = Invoke-WebRequest -Uri ($apiBase + "?token=" + [uri]::EscapeDataString($token)) `
                             -TimeoutSec 60 -UseBasicParsing -Method Get
    $jsonText = [System.Text.Encoding]::UTF8.GetString($raw.RawContentStream.ToArray())
    $resp = $jsonText | ConvertFrom-Json
} catch {
    $code = $null
    try { $code = $_.Exception.Response.StatusCode.value__ } catch {}
    if ($code -eq 401 -or $code -eq 403) {
        Say "[错误] 令牌不对（HTTP $code）——检查 submissions-token.txt 的内容" Red
    } else {
        Say ("[错误] 请求失败：" + $_.Exception.Message) Red
    }
    exit 1
}

if (-not $resp -or -not $resp.ok) {
    Say ("[错误] " + $(if ($resp) { $resp.error } else { "返回为空" })) Red
    exit 1
}

$items = @($resp.items)
Say ("拉到 " + $items.Count + " 条投稿") Green
if ($items.Count -eq 0) {
    Say ""
    Say "还没有人投稿～ 等有人提交后再来跑一次。" Yellow
    Read-Host "按回车键关闭"
    exit 0
}

# ---------- 3. 生成 xlsx ----------
function XmlEsc([string]$s) {
    if ($null -eq $s) { return "" }
    # 注意先转 & 再转其他，否则 &amp; 会被二次转义
    $t = $s.Replace("&", "&amp;")
    $t = $t.Replace("<", "&lt;")
    $t = $t.Replace(">", "&gt;")
    $t = $t.Replace('"', "&quot;")
    $t = $t.Replace("'", "&apos;")
    return $t
}

function Cell([string]$ref, [string]$val, [int]$style) {
    return '<c r="' + $ref + '" t="inlineStr" s="' + $style + '"><is><t xml:space="preserve">' +
           (XmlEsc $val) + '</t></is></c>'
}

# 数字单元格（不能用 inlineStr，否则 Excel 里是文本，排序会变成 10 < 2）
function CellNum([string]$ref, [int]$val, [int]$style) {
    return '<c r="' + $ref + '" s="' + $style + '"><v>' + $val + '</v></c>'
}

function Row([int]$r, [string[]]$vals, [int]$style) {
    $cells = ""
    for ($i = 0; $i -lt $vals.Length; $i++) {
        $col = [char](65 + $i)     # A/B/C/D/E/F
        $cells += (Cell ($col.ToString() + $r) $vals[$i] $style)
    }
    return '<row r="' + $r + '">' + $cells + '</row>'
}

# 数据行：第 1 列是数字，其余是文本
function DataRow([int]$r, [int]$idx, [string[]]$vals) {
    $cells = (CellNum ("A" + $r) $idx 0)
    for ($i = 0; $i -lt $vals.Length; $i++) {
        $col = [char](66 + $i)     # B/C/D/E/F
        $cells += (Cell ($col.ToString() + $r) $vals[$i] 0)
    }
    return '<row r="' + $r + '">' + $cells + '</row>'
}

$headers = @("序号", "提交时间", "歌曲名", "原唱", "投稿人", "授权")
$rowsXml = Row 1 $headers 1

$n = 0
foreach ($it in $items) {
    $n++
    $when = ""
    try {
        $when = ([datetime]::Parse($it.at)).ToLocalTime().ToString("yyyy-MM-dd HH:mm")
    } catch { $when = [string]$it.at }
    $agree = if ($it.agree -eq $true) { "已授权" } else { "未勾选" }
    $rowsXml += (DataRow ($n + 1) $n @($when, [string]$it.song, [string]$it.singer, [string]$it.submitter, $agree))
}

$sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
'<cols><col min="1" max="1" width="7"/><col min="2" max="2" width="19"/><col min="3" max="3" width="30"/>' +
'<col min="4" max="4" width="26"/><col min="5" max="5" width="18"/><col min="6" max="6" width="10"/></cols>' +
'<sheetData>' + $rowsXml + '</sheetData></worksheet>'

$contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
'<Default Extension="xml" ContentType="application/xml"/>' +
'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
'</Types>'

$rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
'</Relationships>'

$workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
'<sheets><sheet name="投稿" sheetId="1" r:id="rId1"/></sheets></workbook>'

$workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
'</Relationships>'

$stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
'<fonts count="2"><font><sz val="11"/><name val="等线"/></font><font><b/><sz val="11"/><name val="等线"/></font></fonts>' +
'<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
'<borders count="1"><border/></borders>' +
'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
'<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
'<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
# cellStyles 不能少：缺了它 Excel/openpyxl 会报「没有默认样式」
'<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
'</styleSheet>'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (Test-Path $outFile) { Remove-Item $outFile -Force }

$zip = [System.IO.Compression.ZipFile]::Open($outFile, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $parts = [ordered]@{
        "[Content_Types].xml"          = $contentTypes
        "_rels/.rels"                  = $rootRels
        "xl/workbook.xml"              = $workbookXml
        "xl/_rels/workbook.xml.rels"   = $workbookRels
        "xl/styles.xml"                = $stylesXml
        "xl/worksheets/sheet1.xml"     = $sheetXml
    }
    foreach ($name in $parts.Keys) {
        $entry = $zip.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal)
        $stream = $entry.Open()
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($parts[$name])
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Dispose()
    }
} finally {
    $zip.Dispose()
}

Say ""
Say ("已生成：" + $outFile) Green
Say ("共 " + $n + " 条投稿，双击就能用 Excel 打开。") Green
Say ""
Read-Host "按回车键关闭"
