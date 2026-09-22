# อ่านไฟล์ .xlsx ด้วย PowerShell ล้วน ๆ (เครื่องนี้ไม่มี Node/Python และห้ามติดตั้งเพิ่ม)
# .xlsx คือไฟล์ zip ที่ข้างในเป็น XML — เปิดด้วย System.IO.Compression แล้วอ่าน XML ตรง ๆ
#
# ใช้โดย: . "$PSScriptRoot\xlsx-lib.ps1"   (dot-source แล้วเรียก Open-Xlsx / Read-XlsxSheet)
#
# ⚠️ ไฟล์นี้ต้องบันทึกเป็น UTF-8 มี BOM — PowerShell 5.1 อ่านไฟล์ไม่มี BOM เป็น ANSI
#    ตัวอักษรไทยในสคริปต์จะเพี้ยน (ตอนนี้มีแค่ในคอมเมนต์ แต่กันไว้ก่อน)

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-ZipText($zip, [string]$path) {
  $e = $zip.GetEntry($path)
  if (-not $e) { return $null }
  $r = New-Object System.IO.StreamReader($e.Open(), [System.Text.Encoding]::UTF8)
  try { return $r.ReadToEnd() } finally { $r.Close() }
}

# ข้อความของ <si> หรือ <is> — มีได้ทั้ง <t> ตรง ๆ และ rich text หลายท่อน <r><t>
function Get-XmlRunText($node) {
  if (-not $node) { return "" }
  $sb = New-Object System.Text.StringBuilder
  foreach ($t in $node.GetElementsByTagName("t")) { [void]$sb.Append($t.InnerText) }
  return $sb.ToString()
}

# เปิดไฟล์ครั้งเดียว ได้ออบเจกต์ที่มี: Zip, Strings (shared strings), Sheets (ชื่อชีต -> path ใน zip)
# อย่าลืมเรียก Close-Xlsx ทุกครั้ง ไม่งั้นไฟล์ถูกล็อกค้าง
function Open-Xlsx([string]$file) {
  $zip = [System.IO.Compression.ZipFile]::OpenRead($file)

  $strings = New-Object System.Collections.Generic.List[string]
  $ssText = Read-ZipText $zip "xl/sharedStrings.xml"
  if ($ssText) {
    $ss = New-Object System.Xml.XmlDocument
    $ss.LoadXml($ssText)
    foreach ($si in $ss.DocumentElement.ChildNodes) {
      if ($si.LocalName -eq "si") { $strings.Add((Get-XmlRunText $si)) }
    }
  }

  $wb = New-Object System.Xml.XmlDocument
  $wb.LoadXml((Read-ZipText $zip "xl/workbook.xml"))
  $rels = New-Object System.Xml.XmlDocument
  $rels.LoadXml((Read-ZipText $zip "xl/_rels/workbook.xml.rels"))
  $target = @{}
  foreach ($r in $rels.DocumentElement.ChildNodes) { $target[$r.GetAttribute("Id")] = $r.GetAttribute("Target") }

  $sheets = [ordered]@{}
  $relNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  foreach ($s in $wb.GetElementsByTagName("sheet")) {
    $t = $target[$s.GetAttribute("id", $relNs)]
    if (-not $t) { continue }
    # Target เขียนได้ทั้งแบบสัมพัทธ์ (worksheets/sheet1.xml) และแบบเต็ม (/xl/worksheets/sheet1.xml)
    $p = if ($t.StartsWith("/")) { $t.TrimStart("/") } else { "xl/" + $t }
    $sheets[$s.GetAttribute("name")] = $p
  }

  return [pscustomobject]@{ Zip = $zip; Strings = $strings; Sheets = $sheets; File = $file }
}

function Close-Xlsx($x) { if ($x -and $x.Zip) { $x.Zip.Dispose() } }

# หาชีตจากชื่อ โดยไม่สนช่องว่างและจุด — ชื่อชีตในแต่ละไฟล์สะกดไม่เหมือนกัน
# ("1. รายละเอียดโครงการ" / "1.รายละเอียดโครงการ" / "1. รายละเอียดโครงการ ")
function Find-XlsxSheet($x, [string]$like) {
  $want = ($like -replace "[\s\.]", "")
  foreach ($n in $x.Sheets.Keys) {
    if (($n -replace "[\s\.]", "") -like ("*" + $want + "*")) { return $n }
  }
  return $null
}

# คืนรายการเซลล์ที่มีค่า: @{ Ref="B3"; Row=3; Col=2; Value="..." }
function Read-XlsxSheet($x, [string]$sheetName) {
  $path = $x.Sheets[$sheetName]
  if (-not $path) { return @() }
  $doc = New-Object System.Xml.XmlDocument
  $doc.LoadXml((Read-ZipText $x.Zip $path))
  $out = New-Object System.Collections.Generic.List[object]
  foreach ($c in $doc.GetElementsByTagName("c")) {
    $ref = $c.GetAttribute("r")
    $type = $c.GetAttribute("t")
    $val = $null
    if ($type -eq "s") {
      $v = $c.GetElementsByTagName("v")
      if ($v.Count) { $val = $x.Strings[[int]$v[0].InnerText] }
    } elseif ($type -eq "inlineStr") {
      $val = Get-XmlRunText $c
    } else {
      $v = $c.GetElementsByTagName("v")
      if ($v.Count) { $val = $v[0].InnerText }
    }
    if ($null -eq $val -or "$val".Trim() -eq "") { continue }
    $m = [regex]::Match($ref, "^([A-Z]+)(\d+)$")
    $col = 0
    foreach ($ch in $m.Groups[1].Value.ToCharArray()) { $col = $col * 26 + ([int][char]$ch - 64) }
    $out.Add([pscustomobject]@{ Ref = $ref; Row = [int]$m.Groups[2].Value; Col = $col; Value = "$val" })
  }
  return $out
}
