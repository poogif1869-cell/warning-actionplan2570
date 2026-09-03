# =====================================================================
# สร้างไอคอนทั้งชุดจากภาพต้นฉบับ Images\icon.png
# (เกจวัดผลการดำเนินงาน + กระดิ่งแจ้งเตือน พื้นโปร่ง 1254x1254)
#
# เครื่องนี้ไม่มี Node.js และไม่มีโปรแกรมแต่งรูป จึงใช้ System.Drawing
# ที่ติดมากับ Windows อยู่แล้ว
#
# สองเรื่องที่สคริปต์นี้ทำให้ ไม่ใช่แค่ย่อรูปเฉย ๆ:
#
# 1. **ครอบขอบโปร่งทิ้งก่อนย่อ** ภาพต้นฉบับมีเนื้อหาจริงแค่ 1057x971
#    ในผืน 1254x1254 ถ้าย่อทั้งผืนจะเสียพิกเซลไปกับที่ว่างราว 35%
#    ซึ่งที่ขนาด 16px แปลว่าเสียไป 5 พิกเซลจาก 16 — เห็นผลชัดมาก
#
# 2. **พื้นหลังต่างกันตามที่ระบบปฏิบัติการรองรับ** ที่ไหนรองรับพื้นโปร่ง
#    ก็ปล่อยโปร่ง ที่ไหนไม่รองรับ (iOS, Android maskable) รองด้วยเขียว กยท.
#    ไม่ใช่ขาว
#
# ⚠️ ภาพต้นฉบับเป็นบิตแมป **ไม่มีไฟล์เวกเตอร์** จึงไม่มี favicon.svg
#    เบราว์เซอร์ทุกตัวใช้ PNG หมด ต่างจากไอคอนชุดก่อนที่วาดเป็นเวกเตอร์
#
# รันเมื่อเปลี่ยนภาพต้นฉบับ:  powershell -File build\make-icons.ps1
# แล้ว **ขยับ VERSION ใน public\sw.js ด้วยทุกครั้ง**
# =====================================================================

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root "Images\icon.png"
$outDir = Join-Path $root "public\icons"

if (-not (Test-Path $srcPath)) { throw "ไม่พบภาพต้นฉบับ $srcPath" }
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$GREEN = [System.Drawing.ColorTranslator]::FromHtml("#0a4227")

$src = [System.Drawing.Bitmap]::FromFile($srcPath)
Write-Host "ต้นฉบับ $($src.Width)x$($src.Height)"

# ---------------------------------------------------------------------
# หากรอบของเนื้อหาจริง (พิกเซลที่ไม่โปร่ง) แล้วครอบขอบว่างทิ้ง
# สุ่มอ่านทีละ 2 พิกเซลก็พอ เร็วขึ้นเท่าตัวและคลาดเคลื่อนแค่ 1-2 พิกเซล
# ซึ่งไม่มีผลกับภาพที่กว้างพันกว่าพิกเซล
# ---------------------------------------------------------------------
$minX = $src.Width; $minY = $src.Height; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $src.Height; $y += 2) {
  for ($x = 0; $x -lt $src.Width; $x += 2) {
    if ($src.GetPixel($x, $y).A -gt 12) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
if ($maxX -lt 0) { throw "ภาพต้นฉบับโปร่งทั้งใบ" }

$cropW = $maxX - $minX + 1
$cropH = $maxY - $minY + 1
$crop = New-Object System.Drawing.Rectangle($minX, $minY, $cropW, $cropH)
Write-Host "เนื้อหาจริง ${cropW}x${cropH} (ครอบขอบว่างทิ้งแล้ว)"

# ---------------------------------------------------------------------
# วาดภาพที่ครอบแล้วลงผืนสี่เหลี่ยมจัตุรัส จัดกึ่งกลาง
#   Ratio   = ด้านที่ยาวกว่าของเนื้อหา กินพื้นที่กี่ส่วนของด้านผืน
#   GreenBg = รองพื้นเขียวเต็มผืน สำหรับที่ที่ไม่รองรับพื้นโปร่ง
# ---------------------------------------------------------------------
function New-Icon {
  param([int]$Size, [string]$Name, [double]$Ratio = 0.98, [bool]$GreenBg = $false)

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gfx.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $gfx.Clear([System.Drawing.Color]::Transparent)

  if ($GreenBg) {
    $brush = New-Object System.Drawing.SolidBrush($GREEN)
    $gfx.FillRectangle($brush, 0, 0, $Size, $Size)
    $brush.Dispose()
  }

  $box = $Size * $Ratio
  $scale = [Math]::Min($box / $cropW, $box / $cropH)
  $w = $cropW * $scale
  $h = $cropH * $scale
  $dest = New-Object System.Drawing.RectangleF(
    [single](($Size - $w) / 2), [single](($Size - $h) / 2), [single]$w, [single]$h)

  $gfx.DrawImage($src, $dest, $crop, [System.Drawing.GraphicsUnit]::Pixel)
  $gfx.Dispose()

  $file = Join-Path $outDir $Name
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()

  $bg = if ($GreenBg) { "พื้นเขียว" } else { "พื้นโปร่ง" }
  Write-Host ("  {0,-24} {1,4}x{1,-4} {2}" -f $Name, $Size, $bg)
}

Write-Host "`nfavicon — เต็มกรอบเกือบสุด เพราะทุกพิกเซลมีค่าที่ขนาดนี้"
New-Icon -Size 16 -Name "favicon-16.png"
New-Icon -Size 32 -Name "favicon-32.png"
New-Icon -Size 48 -Name "favicon-48.png"
New-Icon -Size 64 -Name "favicon-64.png"

Write-Host "`nไอคอนแอป purpose any — พื้นโปร่ง"
New-Icon -Size 192 -Name "icon-192.png"
New-Icon -Size 512 -Name "icon-512.png"

Write-Host "`nที่ระบบปฏิบัติการไม่รองรับพื้นโปร่ง — รองพื้นเขียว กยท."
# iOS แปลงพื้นโปร่งเป็นดำ และไม่ทำมุมมนให้เอง จึงรองพื้นเต็มแล้วให้ iOS ตัดมุม
New-Icon -Size 180 -Name "apple-touch-icon.png" -Ratio 0.8 -GreenBg $true

# Android ครอบไอคอน maskable เป็นวงกลม/สี่เหลี่ยมมนตามธีมของเครื่อง
# เนื้อหาต้องอยู่ในวงกลมกลางภาพเส้นผ่านศูนย์กลาง 80% ของด้าน
# ภาพนี้กว้าง 1057 สูง 971 เส้นทแยงมุมจึงยาวกว่าด้านกว้างราว 1.36 เท่า
# ย่อเหลือ 0.58 ของด้าน เส้นทแยงมุมจะพอดีอยู่ในวงปลอดภัย
New-Icon -Size 512 -Name "icon-maskable-512.png" -Ratio 0.58 -GreenBg $true

$src.Dispose()

# ไฟล์ SVG ของไอคอนชุดก่อนใช้ไม่ได้แล้ว ต้นฉบับรอบนี้เป็นบิตแมป
$oldSvg = Join-Path $outDir "favicon.svg"
if (Test-Path $oldSvg) {
  Remove-Item $oldSvg
  Write-Host "`nลบ favicon.svg ของชุดเก่าทิ้ง (ต้นฉบับรอบนี้เป็นบิตแมป ไม่มีเวกเตอร์)"
}

Write-Host "`nเสร็จแล้ว ไฟล์อยู่ที่ public\icons\"
Write-Host "อย่าลืมขยับ VERSION ใน public\sw.js"
