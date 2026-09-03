# =====================================================================
# สร้างไอคอน PWA จาก public/logo.png (ตราสัญลักษณ์ กยท. 256x256 พื้นโปร่ง)
#
# เครื่องนี้ไม่มี Node.js และไม่มีโปรแกรมแต่งรูป จึงใช้ System.Drawing
# ที่ติดมากับ Windows อยู่แล้ว
#
# พื้นหลังเป็นสีขาว ไม่ใช่พื้นโปร่ง เพราะตราเป็นวงสีเขียว
# ถ้าปล่อยโปร่งแล้วระบบปฏิบัติการวางบนพื้นเข้ม ตราจะจมหายไป
# (ปัญหาเดียวกับตราในแถบหัวเรื่องที่ต้องรองด้วยวงกลมขาว)
#
# รันเมื่อเปลี่ยน logo.png เท่านั้น:  powershell -File build\make-icons.ps1
# =====================================================================

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root "public\logo.png"
$outDir = Join-Path $root "public\icons"

if (-not (Test-Path $srcPath)) { throw "ไม่พบ $srcPath" }
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$src = [System.Drawing.Image]::FromFile($srcPath)
Write-Host "ต้นฉบับ $($src.Width)x$($src.Height)"

function New-Icon {
  param([int]$Size, [double]$Ratio, [string]$Name)

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gfx.Clear([System.Drawing.Color]::White)

  $inner = [int]($Size * $Ratio)
  $pad = [int](($Size - $inner) / 2)
  $gfx.DrawImage($src, $pad, $pad, $inner, $inner)
  $gfx.Dispose()

  $path = Join-Path $outDir $Name
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host ("  {0,-22} {1}x{1}  ตรากว้าง {2}px" -f $Name, $Size, $inner)
}

# purpose "any" — ระบบวาดตามที่ให้ไปเลย เว้นขอบพองาม
New-Icon -Size 192 -Ratio 0.86 -Name "icon-192.png"
New-Icon -Size 512 -Ratio 0.86 -Name "icon-512.png"

# purpose "maskable" — Android ครอบเป็นวงกลม/สี่เหลี่ยมมนตามธีมของเครื่อง
# เนื้อหาต้องอยู่ในวงกลมกลางภาพเส้นผ่านศูนย์กลาง 80% ของด้าน
# สี่เหลี่ยมที่ใหญ่สุดที่อยู่ในวงนั้นได้ = 0.8 / sqrt(2) = 0.566 ของด้าน
New-Icon -Size 512 -Ratio 0.55 -Name "icon-maskable-512.png"

# iOS ไม่รองรับ maskable และไม่ทำมุมมนให้เอง ใช้ตัวเว้นขอบมากหน่อยจะดูดีกว่า
New-Icon -Size 180 -Ratio 0.8 -Name "apple-touch-icon.png"

# =====================================================================
# favicon — คนละแบบกับไอคอนแอปโดยตั้งใจ
#
# favicon แสดงจริงที่ 16x16 px รายละเอียดของตราเต็ม (เส้นใบยาง ขอบวง)
# จะเละหมดที่ขนาดนั้น จึงวาด "หยดน้ำยาง" ซึ่งเป็นรูปทรงที่เด่นที่สุดในตรา
# ขึ้นมาใหม่เป็นเวกเตอร์ ไม่ได้ย่อมาจาก logo.png
#
# ต้องวาดให้ตรงกับ public/icons/favicon.svg เป๊ะ ๆ (เบราว์เซอร์เก่าใช้ PNG
# เบราว์เซอร์ใหม่ใช้ SVG ถ้าสองไฟล์ไม่เหมือนกันจะเห็นไอคอนสลับไปมา)
# =====================================================================

$GREEN = [System.Drawing.ColorTranslator]::FromHtml("#0a4227")
$GOLD = [System.Drawing.ColorTranslator]::FromHtml("#f0a92b")

function New-Favicon {
  param([int]$Size, [string]$Name)

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $gfx.Clear([System.Drawing.Color]::Transparent)

  # วาดในระบบพิกัด 48x48 เหมือน viewBox ของ SVG แล้วค่อยย่อลงตามขนาดจริง
  $gfx.ScaleTransform($Size / 48.0, $Size / 48.0)

  $bgBrush = New-Object System.Drawing.SolidBrush($GREEN)
  $gfx.FillEllipse($bgBrush, 0, 0, 48, 48)
  $bgBrush.Dispose()

  # หยดน้ำยาง: ปลายแหลมด้านบน (24,7) โค้งลงมาเป็นครึ่งวงกลมรัศมี 13 ที่ (24,29)
  # จุดควบคุมแรกทับจุดเริ่มต้น เพื่อให้ยอดเป็นมุมแหลมไม่ใช่มุมมน
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddBezier(24, 7, 24, 7, 37, 23, 37, 29)
  # GDI+: มุม 0 องศาคือ 3 นาฬิกา กวาดบวก = ตามเข็ม (แกน y ชี้ลง)
  # กวาด 180 องศาจึงได้ครึ่งล่างของวงกลมพอดี
  $path.AddArc(11, 16, 26, 26, 0, 180)
  $path.AddBezier(11, 29, 11, 23, 24, 7, 24, 7)
  $path.CloseFigure()

  $fgBrush = New-Object System.Drawing.SolidBrush($GOLD)
  $gfx.FillPath($fgBrush, $path)
  $fgBrush.Dispose()
  $path.Dispose()
  $gfx.Dispose()

  $out = Join-Path $outDir $Name
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host ("  {0,-22} {1}x{1}  หยดน้ำยางบนวงกลมเขียว" -f $Name, $Size)
}

New-Favicon -Size 16 -Name "favicon-16.png"
New-Favicon -Size 32 -Name "favicon-32.png"
New-Favicon -Size 48 -Name "favicon-48.png"

$src.Dispose()
Write-Host "`nเสร็จแล้ว ไฟล์อยู่ที่ public\icons\"
Write-Host "ถ้าแก้รูป อย่าลืมขยับ VERSION ใน public\sw.js ด้วย"
