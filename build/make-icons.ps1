# =====================================================================
# สร้างไอคอนทั้งชุดของเว็บ
#
# **วาดขึ้นใหม่เป็นเวกเตอร์ทั้งหมด ไม่ได้ย่อมาจาก public/logo.png**
# ตราสัญลักษณ์เต็มดวงมีรายละเอียดมากเกินไป พอย่อลงมาที่ 16px
# (ขนาดที่ favicon แสดงจริง) เส้นใบยางกับขอบวงจะเละจนเหลือแค่ก้อนเขียว
#
# โครงสร้างแบบเดียวกับไอคอน Google Chrome:
#   วงนอกสีเขียว กยท.  ->  วงในสีขาว  ->  หยดน้ำยางสีทองอยู่บนพื้นขาว
#
# **พื้นนอกวงกลมโปร่งใส ไม่ใช่สี่เหลี่ยมสีขาว** ไอคอนจึงเป็นวงกลมจริง ๆ
# วางบนพื้นสีอะไรก็ได้ ยกเว้นสองไฟล์ที่ระบบปฏิบัติการไม่รองรับพื้นโปร่ง
# (apple-touch-icon กับ maskable) ซึ่งรองพื้นด้วย**สีเขียว ไม่ใช่สีขาว**
#
# เครื่องนี้ไม่มี Node.js และไม่มีโปรแกรมแต่งรูป จึงใช้ System.Drawing
# ที่ติดมากับ Windows อยู่แล้ว
#
# ⚠️ ต้องวาดให้ตรงกับ public/icons/favicon.svg เป๊ะ ๆ
# เบราว์เซอร์ใหม่ใช้ SVG เบราว์เซอร์เก่าใช้ PNG ถ้าสองไฟล์ไม่เหมือนกัน
# ผู้ใช้จะเห็นไอคอนสลับไปมา
#
# รันเมื่อแก้แบบไอคอน:  powershell -File build\make-icons.ps1
# แล้ว **ขยับ VERSION ใน public\sw.js ด้วยทุกครั้ง**
# =====================================================================

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root "public\icons"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# เขียวและทองของ กยท.
# ทองเข้มกว่าตัวแปร --gold ของเว็บ (#b8892b) เพราะหยดวางบนพื้นขาว
# ถ้าใช้ทองอ่อนกว่านี้จะจางจนแทบไม่เห็นตอนย่อลง 16px
$GREEN = [System.Drawing.ColorTranslator]::FromHtml("#0a4227")
$WHITE = [System.Drawing.ColorTranslator]::FromHtml("#ffffff")
$GOLD = [System.Drawing.ColorTranslator]::FromHtml("#e08a14")

# ---------------------------------------------------------------------
# รูปหยดน้ำยางในระบบพิกัด 48x48 เดียวกับ viewBox ของ SVG
# ปลายแหลมที่ (24, 11.5) โค้งลงมาเป็นครึ่งวงกลมรัศมี 10.5 ที่ (24, 27.5)
# ---------------------------------------------------------------------
function New-DropPath {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  # จุดควบคุมแรกทับจุดเริ่มต้น เพื่อให้ยอดเป็นมุมแหลม ไม่ใช่มุมมน
  $p.AddBezier(24, 11.5, 24, 11.5, 34.5, 24, 34.5, 27.5)
  # GDI+: มุม 0 องศาคือ 3 นาฬิกา กวาดบวก = ตามเข็ม (แกน y ชี้ลง)
  # กวาด 180 องศาจึงได้ครึ่งล่างของวงกลมพอดี
  $p.AddArc(13.5, 17, 21, 21, 0, 180)
  $p.AddBezier(13.5, 27.5, 13.5, 24, 24, 11.5, 24, 11.5)
  $p.CloseFigure()
  return $p
}

function New-Mark {
  param(
    [int]$Size,
    [string]$Name,
    # เติมพื้นเขียวเต็มสี่เหลี่ยม สำหรับที่ที่ไม่รองรับพื้นโปร่ง
    [bool]$SquareBg = $false,
    # ย่อตัวมาร์กเข้ามาจากขอบ 1.0 = เต็มขอบ
    [double]$Scale = 1.0
  )

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gfx.Clear([System.Drawing.Color]::Transparent)

  # วาดในพิกัด 48x48 เสมอ แล้วให้ระบบย่อลงตามขนาดไฟล์จริง
  $gfx.ScaleTransform($Size / 48.0, $Size / 48.0)

  if ($SquareBg) {
    $brush = New-Object System.Drawing.SolidBrush($GREEN)
    $gfx.FillRectangle($brush, 0, 0, 48, 48)
    $brush.Dispose()
  }

  # ย่อรอบจุดกึ่งกลาง
  if ($Scale -ne 1.0) {
    $gfx.TranslateTransform(24, 24)
    $gfx.ScaleTransform($Scale, $Scale)
    $gfx.TranslateTransform(-24, -24)
  }

  # วงนอกเขียว
  $brush = New-Object System.Drawing.SolidBrush($GREEN)
  $gfx.FillEllipse($brush, 0, 0, 48, 48)
  $brush.Dispose()

  # วงในขาว รัศมี 16.5 — เหลือขอบเขียวหนา 7.5 หน่วย (~2.5px ที่ขนาด 16px)
  # บางกว่านี้ขอบเขียวจะหายไปตอนย่อ เหลือเป็นวงขาวเปล่า ๆ
  $brush = New-Object System.Drawing.SolidBrush($WHITE)
  $gfx.FillEllipse($brush, 7.5, 7.5, 33, 33)
  $brush.Dispose()

  # หยดน้ำยาง
  $path = New-DropPath
  $brush = New-Object System.Drawing.SolidBrush($GOLD)
  $gfx.FillPath($brush, $path)
  $brush.Dispose()
  $path.Dispose()
  $gfx.Dispose()

  $file = Join-Path $outDir $Name
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()

  $bg = if ($SquareBg) { "พื้นเขียวเต็ม" } else { "พื้นโปร่ง" }
  Write-Host ("  {0,-24} {1,4}x{1,-4} {2}" -f $Name, $Size, $bg)
}

Write-Host "favicon (แสดงจริงที่ 16px)"
New-Mark -Size 16 -Name "favicon-16.png"
New-Mark -Size 32 -Name "favicon-32.png"
New-Mark -Size 48 -Name "favicon-48.png"

Write-Host "`nไอคอนแอป purpose any — พื้นโปร่ง เป็นวงกลมจริง"
New-Mark -Size 192 -Name "icon-192.png"
New-Mark -Size 512 -Name "icon-512.png"

Write-Host "`nที่ระบบปฏิบัติการไม่รองรับพื้นโปร่ง — รองพื้นเขียว ไม่ใช่ขาว"
# Android ครอบไอคอน maskable เป็นวงกลม/สี่เหลี่ยมมนตามธีมของเครื่อง
# เนื้อหาต้องอยู่ในวงกลมกลางภาพเส้นผ่านศูนย์กลาง 80% ของด้าน
# ย่อมาร์กเหลือ 0.8 แล้ววงขาวจะกว้าง 55% ของด้าน ยังอยู่ในเขตปลอดภัยสบาย ๆ
New-Mark -Size 512 -Name "icon-maskable-512.png" -SquareBg $true -Scale 0.8

# iOS ไม่รองรับพื้นโปร่ง (จะกลายเป็นพื้นดำ) และไม่ทำมุมมนให้เอง
# จึงรองพื้นเขียวเต็มแล้วให้ iOS ตัดมุมเอง
New-Mark -Size 180 -Name "apple-touch-icon.png" -SquareBg $true -Scale 0.82

Write-Host "`nเสร็จแล้ว ไฟล์อยู่ที่ public\icons\"
Write-Host "อย่าลืมขยับ VERSION ใน public\sw.js และแก้ favicon.svg ให้ตรงกัน"
