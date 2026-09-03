# =====================================================================
# สร้างรูปตัวอย่างตอนแชร์ลิงก์ (Open Graph) ขนาด 1200x630
#
# LINE / Facebook / X อ่านแท็ก og:image แล้วเอารูปนี้ไปแสดงเป็นการ์ด
# ถ้าไม่มี LINE จะเดาเอาเองจากรูปแรกในหน้า ซึ่งหน้านี้ต้องล็อกอินก่อน
# บ็อตจึงเห็นแต่หน้า login แล้วการ์ดจะว่างเปล่าหรือขึ้นแค่ URL ดิบ ๆ
#
# **รูปนี้ต้องเปิดได้โดยไม่ต้องล็อกอิน** จึงวางไว้ใน public/ และยกเว้นใน
# matcher ของ middleware.js บ็อตของ LINE ไม่มีคุกกี้เซสชันของใครทั้งนั้น
#
# 1200x630 คืออัตราส่วน 1.91:1 ที่ LINE และ Facebook ใช้
# ของสำคัญต้องไม่ชิดขอบ เพราะบางที่ครอบขอบทิ้งเวลาแสดงในแชท
#
# รันเมื่อแก้ข้อความหรือเปลี่ยนภาพไอคอน:  powershell -File build\make-og.ps1
# =====================================================================

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root "Images\icon.png"
$outFile = Join-Path $root "public\og-image.png"

if (-not (Test-Path $srcPath)) { throw "ไม่พบภาพต้นฉบับ $srcPath" }

$W = 1200
$H = 630

# เขียวเข้มกว่าที่ใช้ในเว็บ เพราะภาพไอคอนมีวงเขียวสดอยู่แล้ว
# ถ้าพื้นสว่างพอ ๆ กัน ไอคอนจะจมหายไปกับพื้น
$GREEN_DARK = [System.Drawing.ColorTranslator]::FromHtml("#07301c")
$GREEN_MID = [System.Drawing.ColorTranslator]::FromHtml("#125b36")
$GOLD = [System.Drawing.ColorTranslator]::FromHtml("#e0a33a")
$WHITE = [System.Drawing.ColorTranslator]::FromHtml("#ffffff")
$DIM = [System.Drawing.Color]::FromArgb(205, 255, 255, 255)

$bmp = New-Object System.Drawing.Bitmap($W, $H)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$gfx.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gfx.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

# ---------- พื้นหลังไล่เฉดเขียว เอียงแบบเดียวกับแถบหัวเรื่องของเว็บ ----------
$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point(0, 0)),
  (New-Object System.Drawing.Point($W, $H)),
  $GREEN_DARK, $GREEN_MID
)
$gfx.FillRectangle($grad, 0, 0, $W, $H)
$grad.Dispose()

# ---------- แถบทองด้านล่าง เหมือนเส้นใต้แถบหัวเรื่อง ----------
$goldBrush = New-Object System.Drawing.SolidBrush($GOLD)
$gfx.FillRectangle($goldBrush, 0, ($H - 12), $W, 12)

# ---------- ภาพไอคอนด้านขวา ----------
# ครอบขอบโปร่งทิ้งก่อน ไม่งั้นภาพจะดูเล็กกว่าที่ควร เพราะมีที่ว่างล้อมอยู่ราว 35%
$src = [System.Drawing.Bitmap]::FromFile($srcPath)
$minX = $src.Width; $minY = $src.Height; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $src.Height; $y += 3) {
  for ($x = 0; $x -lt $src.Width; $x += 3) {
    if ($src.GetPixel($x, $y).A -gt 12) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
$cropW = $maxX - $minX + 1
$cropH = $maxY - $minY + 1
$crop = New-Object System.Drawing.Rectangle($minX, $minY, $cropW, $cropH)

$artH = 396.0
$artW = $artH * $cropW / $cropH
$artX = $W - $artW - 76
$artY = ($H - $artH) / 2 - 8
$dest = New-Object System.Drawing.RectangleF(
  [single]$artX, [single]$artY, [single]$artW, [single]$artH)
$gfx.DrawImage($src, $dest, $crop, [System.Drawing.GraphicsUnit]::Pixel)
$src.Dispose()

# ---------- ข้อความ ----------
# ฟอนต์ไทยที่ติดมากับ Windows ทุกเครื่อง ไล่หาตัวที่มีจริง
# ห้ามพึ่งฟอนต์ที่ต้องติดตั้งเพิ่ม เพราะสคริปต์นี้ต้องรันได้บนเครื่องเปล่า
function Get-ThaiFont {
  param([single]$Size, [System.Drawing.FontStyle]$Style)
  foreach ($name in @("Leelawadee UI", "Tahoma", "Segoe UI", "Microsoft Sans Serif")) {
    try {
      $f = New-Object System.Drawing.Font($name, $Size, $Style, [System.Drawing.GraphicsUnit]::Pixel)
      if ($f.Name -eq $name) { return $f }
      $f.Dispose()
    } catch {}
  }
  return New-Object System.Drawing.Font("Arial", $Size, $Style, [System.Drawing.GraphicsUnit]::Pixel)
}

$fontEyebrow = Get-ThaiFont -Size 27 -Style ([System.Drawing.FontStyle]::Regular)
$fontTitle = Get-ThaiFont -Size 66 -Style ([System.Drawing.FontStyle]::Bold)
$fontSub = Get-ThaiFont -Size 31 -Style ([System.Drawing.FontStyle]::Regular)

$brushGold = New-Object System.Drawing.SolidBrush($GOLD)
$brushWhite = New-Object System.Drawing.SolidBrush($WHITE)
$brushDim = New-Object System.Drawing.SolidBrush($DIM)

$textX = 78.0
$gfx.DrawString("การยางแห่งประเทศไทย", $fontEyebrow, $brushGold, $textX, 172)
$gfx.DrawString("ระบบแจ้งเตือน", $fontTitle, $brushWhite, ($textX - 5), 212)
$gfx.DrawString("ผลการดำเนินงาน", $fontTitle, $brushWhite, ($textX - 5), 288)

# เส้นทองคั่นก่อนบรรทัดล่าง ให้สายตาพัก
$penGold = New-Object System.Drawing.Pen($GOLD, 4)
$gfx.DrawLine($penGold, $textX, 390, ($textX + 84), 390)
$penGold.Dispose()

$gfx.DrawString("แผนปฏิบัติการประจำปีงบประมาณ 2570", $fontSub, $brushDim, $textX, 412)

$gfx.Dispose()
$bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

foreach ($o in @($fontEyebrow, $fontTitle, $fontSub, $goldBrush, $brushGold, $brushWhite, $brushDim)) {
  $o.Dispose()
}

$kb = [math]::Round((Get-Item $outFile).Length / 1KB)
Write-Host "เสร็จแล้ว  public\og-image.png  ${W}x${H}  ${kb} KB"
