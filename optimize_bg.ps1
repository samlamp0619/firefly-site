# 萨姆萤光灯 · 背景图压缩
# 用 .NET GDI+ 把 assets/bg 下的背景图统一压成「最宽 1920px 的 JPEG」。
# 原图是 4~8MB 的 PNG，压完通常几百 KB，首屏体积能降 90%+。
#
# 用法（在 personal-website 目录下）：
#   powershell -ExecutionPolicy Bypass -File optimize_bg.ps1
#
# refresh_bg.py 拉完新图后跑一次即可。

param(
  [int]$MaxWidth = 1920,
  [int]$Quality  = 82
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$site = Split-Path -Parent $MyInvocation.MyCommand.Path
$bgDir = Join-Path $site 'assets\bg'
$jpgCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
            Where-Object { $_.MimeType -eq 'image/jpeg' }

# JPEG 没有透明通道，先垫一层浅色底，避免透明区域变黑
$bgColor = [System.Drawing.Color]::FromArgb(255, 234, 250, 245)

function Convert-One {
  param([string]$Path, [string]$OutPath)

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $ms = New-Object System.IO.MemoryStream(,$bytes)
  $src = [System.Drawing.Image]::FromStream($ms)
  try {
    $w = $src.Width; $h = $src.Height
    if ($w -gt $MaxWidth) {
      $nw = $MaxWidth
      $nh = [int][math]::Round($h * ($MaxWidth / $w))
    } else {
      $nw = $w; $nh = $h
    }

    $bmp = New-Object System.Drawing.Bitmap($nw, $nh)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.Clear($bgColor)
      $g.DrawImage($src, 0, 0, $nw, $nh)
    } finally { $g.Dispose() }

    $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
      [System.Drawing.Imaging.Encoder]::Quality, [int]$Quality)
    $tmp = "$OutPath.tmp"
    $bmp.Save($tmp, $jpgCodec, $ep)
    $bmp.Dispose()

    if (Test-Path $OutPath) { Remove-Item $OutPath -Force }
    Move-Item $tmp $OutPath -Force
    return [pscustomobject]@{ From = "$w x $h"; To = "$nw x $nh" }
  } finally {
    $src.Dispose(); $ms.Dispose()
  }
}

$targets = @()
$targets += Get-ChildItem $bgDir -File | Where-Object { $_.Extension -match '^\.(png|jpg|jpeg|webp|bmp)$' }
$rtDir = Join-Path $bgDir 'realtime'
if (Test-Path $rtDir) {
  $targets += Get-ChildItem $rtDir -File | Where-Object { $_.Extension -match '^\.(png|jpg|jpeg|webp|bmp)$' }
}

$before = ($targets | Measure-Object -Property Length -Sum).Sum
Write-Output ("待处理 " + $targets.Count + " 张，合计 " + [math]::Round($before / 1MB, 2) + " MB")
Write-Output ("目标：最宽 " + $MaxWidth + "px，JPEG 质量 " + $Quality)
Write-Output ("-" * 74)

foreach ($f in $targets) {
  $out = [System.IO.Path]::ChangeExtension($f.FullName, '.jpg')
  $oldMB = [math]::Round($f.Length / 1MB, 2)
  try {
    $dim = Convert-One -Path $f.FullName -OutPath $out
    # 源文件不是 jpg 时删掉原图，避免仓库里留两份
    if ($f.FullName -ne $out) { Remove-Item $f.FullName -Force }
    $newLen = (Get-Item $out).Length
    $newMB = [math]::Round($newLen / 1MB, 2)
    $pct = if ($f.Length -gt 0) { [int](100 - ($newLen / $f.Length * 100)) } else { 0 }
    Write-Output ("  {0,-26} {1,7} MB -> {2,6} MB  (-{3}%)  {4} -> {5}" -f `
      (Split-Path $out -Leaf), $oldMB, $newMB, $pct, $dim.From, $dim.To)
  } catch {
    Write-Output ("  [FAIL] " + $f.Name + " : " + $_.Exception.Message)
  }
}

$after = (Get-ChildItem $bgDir -Recurse -File |
          Where-Object { $_.Extension -match '^\.(png|jpg|jpeg|webp|bmp)$' } |
          Measure-Object -Property Length -Sum).Sum
Write-Output ("-" * 74)
Write-Output ("合计 " + [math]::Round($before / 1MB, 2) + " MB -> " + [math]::Round($after / 1MB, 2) + " MB")
