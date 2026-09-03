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
# ของสำคัญต้องอยู่กลางภาพ เพราะ LINE ครอบขอบทิ้งเวลาแสดงในแชท
#
# รันเมื่อแก้ข้อความหรือไอคอน:  powershell -File build\make-og.ps1
# =====================================================================

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outFile = Join-Path $root "public\og-image.png"

$W = 1200
$H = 630

$GREEN_1 = [System.Drawing.ColorTranslator]::FromHtml("#0a4227")
$GREEN_3 = [System.Drawing.ColorTranslator]::FromHtml("#1a854e")
$GOLD = [System.Drawing.ColorTranslator]::FromHtml("#e0a33a")
$WHITE = [System.Drawing.ColorTranslator]::FromHtml("#ffffff")
$DIM = [System.Drawing.Color]::FromArgb(210, 255, 255, 255)
$FAINT = [System.Drawing.Color]::FromArgb(150, 255, 255, 255)

$bmp = New-Object System.Drawing.Bitmap($W, $H)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$gfx.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# ---------- พื้นหลังไล่เฉดเขียว เอียงแบบเดียวกับแถบหัวเรื่องของเว็บ ----------
$rect = New-Object System.Drawing.Rectangle(0, 0, $W, $H)
$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point(0, 0)),
  (New-Object System.Drawing.Point($W, $H)),
  $GREEN_1, $GREEN_3
)
$gfx.FillRectangle($grad, $rect)
$grad.Dispose()

# ---------- แถบทองด้านล่าง เหมือนเส้นใต้แถบหัวเรื่อง ----------
$goldBrush = New-Object System.Drawing.SolidBrush($GOLD)
$gfx.FillRectangle($goldBrush, 0, ($H - 12), $W, 12)

# ---------- ไอคอนวงกลม ----------
# ใช้แบบเดียวกับ favicon: วงนอกขาว วงในโปร่งเห็นพื้นเขียว หยดทอง
# กลับสีจาก favicon เพราะที่นี่พื้นหลังเป็นเขียวอยู่แล้ว
$icoSize = 150.0
$icoX = 96.0
$icoY = 150.0
$k = $icoSize / 48.0

$state = $gfx.Save()
$gfx.TranslateTransform($icoX, $icoY)
$gfx.ScaleTransform($k, $k)

$brush = New-Object System.Drawing.SolidBrush($WHITE)
$gfx.FillEllipse($brush, 0, 0, 48, 48)
$brush.Dispose()

$brush = New-Object System.Drawing.SolidBrush($GREEN_1)
$gfx.FillEllipse($brush, 7.5, 7.5, 33, 33)
$brush.Dispose()

$drop = New-Object System.Drawing.Drawing2D.GraphicsPath
$drop.AddBezier(24, 11.5, 24, 11.5, 34.5, 24, 34.5, 27.5)
$drop.AddArc(13.5, 17, 21, 21, 0, 180)
$drop.AddBezier(13.5, 27.5, 13.5, 24, 24, 11.5, 24, 11.5)
$drop.CloseFigure()
$gfx.FillPath($goldBrush, $drop)
$drop.Dispose()

$gfx.Restore($state)

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

$fontEyebrow = Get-ThaiFont -Size 26 -Style ([System.Drawing.FontStyle]::Regular)
$fontTitle = Get-ThaiFont -Size 72 -Style ([System.Drawing.FontStyle]::Bold)
$fontSub = Get-ThaiFont -Size 34 -Style ([System.Drawing.FontStyle]::Regular)
$fontFoot = Get-ThaiFont -Size 26 -Style ([System.Drawing.FontStyle]::Regular)

$textX = 96.0
$brushGold = New-Object System.Drawing.SolidBrush($GOLD)
$brushWhite = New-Object System.Drawing.SolidBrush($WHITE)
$brushDim = New-Object System.Drawing.SolidBrush($DIM)
$brushFaint = New-Object System.Drawing.SolidBrush($FAINT)

$gfx.DrawString("การยางแห่งประเทศไทย", $fontEyebrow, $brushGold, $textX, 336)
$gfx.DrawString("ระบบแจ้งเตือน", $fontTitle, $brushWhite, ($textX - 5), 372)
$gfx.DrawString("ผลการดำเนินงาน", $fontTitle, $brushWhite, ($textX - 5), 452)
$gfx.DrawString("แผนปฏิบัติการประจำปีงบประมาณ 2570", $fontSub, $brushDim, $textX, 533)

# ปีงบมุมขวาบน ถ่วงองค์ประกอบไม่ให้เอียงซ้ายทั้งภาพ
$fmtRight = New-Object System.Drawing.StringFormat
$fmtRight.Alignment = [System.Drawing.StringAlignment]::Far
$fontYear = Get-ThaiFont -Size 130 -Style ([System.Drawing.FontStyle]::Bold)
$gfx.DrawString("2570", $fontYear, $brushFaint, ($W - 96), 150, $fmtRight)
$gfx.DrawString("ปีงบประมาณ", $fontFoot, $brushFaint, ($W - 96), 300, $fmtRight)

$gfx.Dispose()
$bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

foreach ($o in @($fontEyebrow, $fontTitle, $fontSub, $fontFoot, $fontYear,
    $goldBrush, $brushGold, $brushWhite, $brushDim, $brushFaint, $fmtRight)) {
  $o.Dispose()
}

$kb = [math]::Round((Get-Item $outFile).Length / 1KB)
Write-Host "เสร็จแล้ว  public\og-image.png  ${W}x${H}  ${kb} KB"
