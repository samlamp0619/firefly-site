# 萨姆萤光灯 · 拉取群管考核成绩并生成 Excel
# ============================================================
# 用法：双击「拉取考核成绩.bat」，或
#       powershell -ExecutionPolicy Bypass -File pull-exam-results.ps1
#
# 需要同目录下有 submissions-token.txt（和投稿接口共用一个管理令牌）。
#
# 输出：考核成绩.xlsx
#   序号 / QQ号 / 群昵称 / 分数 / 得分率 / 提交时间 / 用时(分钟) / 备注
#   按分数从高到低排；标了「预览」的是开考前自测的记录，正式统计时忽略。
# ============================================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$tokenFile = Join-Path $root "submissions-token.txt"
$outFile   = Join-Path $root "考核成绩.xlsx"
$apiBase   = "https://samlamp.top/api/exam-results"

function Say($text, $color = "Gray") { Write-Host $text -ForegroundColor $color }

Say "==============================================" Cyan
Say "  萨姆萤光灯 · 拉取群管考核成绩" Cyan
Say "==============================================" Cyan

# ---------- 1. 读令牌 ----------
if (-not (Test-Path $tokenFile)) {
    Say "[错误] 找不到 submissions-token.txt" Red
    Say "       这个文件里只放一行：你的管理令牌。" Red
    exit 1
}
$token = (Get-Content $tokenFile -Raw -Encoding UTF8).Trim()
if (-not $token) { Say "[错误] submissions-token.txt 是空的" Red; exit 1 }

# ---------- 2. 拉数据 ----------
Say ""
Say "正在拉取成绩…"
$resp = $null
try {
    # 不用 Invoke-RestMethod：PS 5.1 在响应头没 charset 时会按 Latin-1 解码，中文变乱码
    $raw = Invoke-WebRequest -Uri ($apiBase + "?token=" + [uri]::EscapeDataString($token)) `
                             -TimeoutSec 60 -UseBasicParsing -Method Get
    $jsonText = [System.Text.Encoding]::UTF8.GetString($raw.RawContentStream.ToArray())
    $resp = $jsonText | ConvertFrom-Json
} catch {
    $code = $null
    try { $code = $_.Exception.Response.StatusCode.value__ } catch {}
    if ($code -eq 401 -or $code -eq 403) {
        Say "[错误] 令牌不对（HTTP $code）——检查 submissions-token.txt" Red
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
Say ("拉到 " + $items.Count + " 份答卷") Green
if ($items.Count -eq 0) {
    Say ""
    Say "还没有人交卷～ 等有人提交后再来跑一次。" Yellow
    Read-Host "按回车键关闭"
    exit 0
}

$real = @($items | Where-Object { -not $_.preview })
$previewCount = $items.Count - $real.Count
if ($previewCount -gt 0) {
    Say ("其中 " + $previewCount + " 份是预览自测（已在备注里标注）") Yellow
}

# ---------- 3. 生成 xlsx ----------
function XmlEsc([string]$s) {
    if ($null -eq $s) { return "" }
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

function CellNum([string]$ref, $val, [int]$style) {
    return '<c r="' + $ref + '" s="' + $style + '"><v>' + $val + '</v></c>'
}

function Row([int]$r, [string[]]$vals, [int]$style) {
    $cells = ""
    for ($i = 0; $i -lt $vals.Length; $i++) {
        $col = [char](65 + $i)
        $cells += (Cell ($col.ToString() + $r) $vals[$i] $style)
    }
    return '<row r="' + $r + '">' + $cells + '</row>'
}

# 数据行：A=序号(数字) B=QQ号(文本，防止 Excel 显示成科学计数法)
#         D=分数(数字，**必须是小数**——考核有 1.5 / 0.5 分，用 int 会被截断)
#         G=用时(数字) 其余文本
function DataRow([int]$r, [int]$idx, [string]$qq, [string]$nick, $score,
                 [string]$rate, [string]$when, [int]$mins, [string]$note) {
    $cells  = (CellNum ("A" + $r) $idx 0)
    $cells += (Cell    ("B" + $r) $qq 0)
    $cells += (Cell    ("C" + $r) $nick 0)
    $cells += (CellNum ("D" + $r) $score 0)
    $cells += (Cell    ("E" + $r) $rate 0)
    $cells += (Cell    ("F" + $r) $when 0)
    $cells += (CellNum ("G" + $r) $mins 0)
    $cells += (Cell    ("H" + $r) $note 0)
    return '<row r="' + $r + '">' + $cells + '</row>'
}

$headers = @("序号", "QQ号", "群昵称", "分数", "得分率", "提交时间", "用时(分钟)", "备注")
$rowsXml = Row 1 $headers 1

$n = 0
foreach ($it in $items) {
    $n++
    $when = ""
    try {
        $when = ([datetime]::Parse($it.submittedAt)).ToLocalTime().ToString("yyyy-MM-dd HH:mm")
    } catch { $when = [string]$it.submittedAt }
    $mins = 0
    try { $mins = [int][math]::Round([double]$it.durationSec / 60) } catch {}
    $note = if ($it.preview) { "预览（自测，不计入）" } else { "" }
    # 分数直接用原值（可能是 98.5 这种小数），不要转 int
    $score = [double]$it.score
    $rowsXml += (DataRow ($n + 1) $n ([string]$it.qq) ([string]$it.nickname) `
                 $score (([string]$it.percent) + "%") $when $mins $note)
}

$sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
'<cols><col min="1" max="1" width="7"/><col min="2" max="2" width="16"/><col min="3" max="3" width="20"/>' +
'<col min="4" max="4" width="8"/><col min="5" max="5" width="10"/><col min="6" max="6" width="19"/>' +
'<col min="7" max="7" width="12"/><col min="8" max="8" width="22"/></cols>' +
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
'<sheets><sheet name="考核成绩" sheetId="1" r:id="rId1"/></sheets></workbook>'

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
'<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
'</styleSheet>'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (Test-Path $outFile) { Remove-Item $outFile -Force }

$zip = [System.IO.Compression.ZipFile]::Open($outFile, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $parts = [ordered]@{
        "[Content_Types].xml"        = $contentTypes
        "_rels/.rels"                = $rootRels
        "xl/workbook.xml"            = $workbookXml
        "xl/_rels/workbook.xml.rels" = $workbookRels
        "xl/styles.xml"              = $stylesXml
        "xl/worksheets/sheet1.xml"   = $sheetXml
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
Say ("共 " + $n + " 份答卷" + $(if ($previewCount -gt 0) { "（含 " + $previewCount + " 份预览自测）" } else { "" }))
Say ("正式答卷 " + $real.Count + " 份" + $(if ($real.Count -gt 0) { "，最高 " + ($real | Measure-Object -Property score -Maximum).Maximum + " 分" } else { "" }))
Say ""
Read-Host "按回车键关闭"
