# ดึงรายละเอียดโครงการจากแบบฟอร์ม ฝยศ.1 ที่จับคู่แล้ว → ไฟล์ SQL สำหรับนำเข้า Supabase
#
# ต้องรัน build\match-details.ps1 ก่อน (อ่าน _selected.json ที่สคริปต์นั้นเขียนไว้)
#
# ⚠️ ผลลัพธ์ไม่ขึ้น git โดยตั้งใจ — repo นี้เป็น public และไฟล์ที่ส่งให้เบราว์เซอร์
#    เปิดดูได้โดยไม่ต้องล็อกอิน เนื้อหาคำของบประมาณกับชื่อเจ้าหน้าที่จึงต้องอยู่ใน
#    ฐานข้อมูลที่อ่านได้เฉพาะคนล็อกอิน (ตาราง project_details ใน supabase/schema.sql)
#
# **ไม่เก็บเบอร์โทร** ตามที่ตกลงกับผู้ใช้ — เก็บแค่ชื่อกับตำแหน่ง
#
# วิธีรัน:  powershell -ExecutionPolicy Bypass -File build\export-details.ps1
# แล้วเอาไฟล์ data\project-details\_import-details.sql ไปวางใน Supabase SQL Editor
#
# ⚠️ ไฟล์นี้ต้องบันทึกเป็น UTF-8 มี BOM (มีข้อความไทยในโค้ด)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\xlsx-lib.ps1"

$proj = Split-Path $PSScriptRoot -Parent
$root = Join-Path $proj "data\project-details"
$bom = New-Object System.Text.UTF8Encoding($true)

$selPath = Join-Path $root "_selected.json"
if (-not (Test-Path -LiteralPath $selPath)) {
  throw "ไม่พบ _selected.json — ให้รัน build\match-details.ps1 ก่อน"
}
# ⚠️ ห้ามเขียน @(... | ConvertFrom-Json) — PowerShell 5.1 ส่งอาร์เรย์ทั้งก้อนเป็นค่าเดียว
# @() จะกลายเป็นอาร์เรย์ซ้อนอาร์เรย์ แล้ว $s.file ในลูปจะได้ชื่อไฟล์มาทั้ง 117 ชื่อรวดเดียว
$selected = Get-Content -Raw -Encoding UTF8 $selPath | ConvertFrom-Json
$selected = @($selected)

# ---------------------------------------------------------------------
# ป้ายของแบบฟอร์ม ฝยศ.1 — เลขข้อ + คำขึ้นต้น
# ช่อง 1-9 อยู่หัวฟอร์ม (ค่าอยู่ทางขวาในแถวเดียวกัน)
# ช่อง 15-22 เป็นก้อนข้อความ (ค่าอยู่ในแถวถัด ๆ ไปใต้ป้าย)
# ---------------------------------------------------------------------
$FORM_LABELS = [ordered]@{
  "1" = "โครงการ"; "2" = "แผนงาน"; "3" = "แหล่งงบประมาณ"; "4" = "กิจกรรม"
  "5" = "ประเภทโครงการ"; "6" = "ระยะเวลาดำเนินการ"; "7" = "งบประมาณ"
  "8" = "สถานที่ดำเนินโครงการ"; "9" = "ผู้รับผิดชอบโครงการ"
  "10" = "ยุทธศาสตร์ชาติ"; "11" = "แผนแม่บท"; "12" = "แผนปฏิบัติราชการ"
  "13" = "แผนวิสาหกิจ"; "14" = "นโยบาย"
  "15" = "หลักการและเหตุผล"; "16" = "วัตถุประสงค์"; "17" = "ผลผลิต"
  "18" = "ตัวชี้วัด"; "19" = "กลุ่มผู้มีส่วนได้ส่วนเสีย"
  "20" = "ประโยชน์ที่คาดว่าจะได้รับ"; "21" = "ผู้รับผิดชอบโครงการ"; "22" = "ผู้ประสานงาน"
}
$HEAD_KEYS = @("1", "2", "3", "4", "5", "6", "7", "8", "9")
$BLOCK_KEYS = @("15", "16", "17", "18", "19", "20", "21", "22")

function Get-LabelKey([string]$v) {
  foreach ($k in $FORM_LABELS.Keys) {
    if ($v -match ("^\s*" + $k + "\s*\.\s*" + [regex]::Escape($FORM_LABELS[$k]))) { return $k }
  }
  return $null
}

# ข้อความที่ไม่ใช่เนื้อหา: เส้นลงชื่อ ตัวอย่างในวงเล็บ ช่องว่างที่มีแต่จุด
function Test-Junk([string]$v) {
  $t = $v.Trim()
  if ($t.Length -lt 2) { return $true }
  if ($t -match "^ลงชื่อ") { return $true }
  if ($t -match "^\(ระบุ") { return $true }
  # .NET ไม่ยอมรับ \_ ใน regex (ไม่ใช่ escape ที่รู้จัก) — ขีดล่างเขียนตรง ๆ ได้เลย
  if ($t -match "^[._\-\s]+$") { return $true }
  return $false
}

# ตัดเบอร์โทรทิ้ง — ทั้งบรรทัดที่เป็นเบอร์ และตัวเลขยาว ๆ ที่ปนมาในบรรทัดอื่น
function Remove-Phone([string]$v) {
  if ($v -match "เบอร์|โทร|VoIP|ต่อ\s*\d") { return "" }
  return ($v -replace "\d[\d\-\s]{5,}\d", "").Trim()
}

function Get-Person($lines) {
  $name = ""; $pos = ""
  foreach ($l in $lines) {
    $t = Remove-Phone $l
    if (-not $t) { continue }
    if ($t -match "^\s*ชื่อ") { $name = ($t -replace "^\s*ชื่อ[^:：]*[:：]?\s*", "").Trim() }
    elseif ($t -match "^\s*ตำแหน่ง") { $pos = ($t -replace "^\s*ตำแหน่ง\s*[:：]?\s*", "").Trim() }
  }
  if (-not $name -and -not $pos) { return $null }
  return [ordered]@{ name = $name; position = $pos }
}

function Read-Detail($cells) {
  # ⚠️ ห้ามตั้งชื่อตัวแปรในนี้ว่า $labels — PowerShell ไม่สนตัวพิมพ์ใหญ่เล็ก
  # มันจะบังตาราง $LABELS ของสคริปต์ และเพราะ PowerShell ใช้ dynamic scope
  # ฟังก์ชันที่ถูกเรียกจากในนี้ (Get-LabelKey) จะเห็นตัวที่บังไว้ไปด้วย
  # แล้วหาป้ายไม่เจอสักอัน ได้ข้อมูลว่างทั้งไฟล์โดยไม่มี error ให้เห็น
  $found = New-Object System.Collections.Generic.List[object]
  foreach ($c in $cells) {
    $k = Get-LabelKey $c.Value
    if ($k) { $found.Add([pscustomobject]@{ key = $k; row = $c.Row; col = $c.Col }) }
  }
  # ป้ายเดียวกันโผล่ซ้ำได้ (เช่น 9 กับ 21 ใช้คำเดียวกัน) — เอาตัวแรกของแต่ละเลข
  $first = @{}
  foreach ($l in ($found | Sort-Object row, col)) {
    if (-not $first.ContainsKey($l.key)) { $first[$l.key] = $l }
  }

  # แถวที่ฟอร์มจบ — ใต้บรรทัด "หมายเหตุ" เป็นคำอธิบายวิธีกรอกกับตัวอย่าง ไม่ใช่ข้อมูล
  $stopRow = 9999
  foreach ($c in $cells) {
    if ($c.Value -match "^\s*หมายเหตุ" -and $c.Row -lt $stopRow -and $c.Row -gt 20) { $stopRow = $c.Row }
  }

  $out = [ordered]@{}

  foreach ($k in $HEAD_KEYS) {
    $l = $first[$k]
    if (-not $l) { continue }
    $sameRow = @($cells | Where-Object { $_.Row -eq $l.row -and $_.Col -gt $l.col } | Sort-Object Col)
    $vals = @()
    foreach ($c in $sameRow) {
      if (Get-LabelKey $c.Value) { break }
      if (-not (Test-Junk $c.Value)) { $vals += $c.Value.Trim() }
    }
    $out[$k] = ($vals -join " ").Trim()
  }

  foreach ($k in $BLOCK_KEYS) {
    $l = $first[$k]
    if (-not $l) { continue }
    # ขอบล่าง = แถวของป้ายถัดไป หรือแถว "หมายเหตุ"
    $below = @($found | Where-Object { $_.row -gt $l.row } | Sort-Object row)
    $endRow = if ($below.Count) { [math]::Min($below[0].row, $stopRow) } else { $stopRow }
    # ขอบขวา = คอลัมน์ของป้ายถัดไปในแถวเดียวกัน (17/18/19 อยู่แถวเดียวกันคนละคอลัมน์)
    $right = @($found | Where-Object { $_.row -eq $l.row -and $_.col -gt $l.col } | Sort-Object col)
    $endCol = if ($right.Count) { $right[0].col } else { 9999 }

    $lines = @($cells |
      Where-Object { $_.Row -gt $l.row -and $_.Row -lt $endRow -and $_.Col -ge $l.col -and $_.Col -lt $endCol } |
      Sort-Object Row, Col |
      ForEach-Object { $_.Value.Trim() } |
      Where-Object { -not (Test-Junk $_) })

    if ($k -eq "21" -or $k -eq "22") {
      $p = Get-Person $lines
      if ($p) { $out[$k] = $p }
    } else {
      $out[$k] = ($lines -join "`n").Trim()
    }
  }

  return $out
}

# ---------------------------------------------------------------------
# อ่านทุกไฟล์ที่เลือกไว้
# ---------------------------------------------------------------------
$docs = New-Object System.Collections.Generic.List[object]
$seq = @{}
$n = 0
foreach ($s in $selected) {
  $n++
  $path = Join-Path $root $s.file
  Write-Progress -Activity "อ่านรายละเอียด" -Status $s.file -PercentComplete ($n * 100 / $selected.Count)
  $x = $null
  try {
    $x = Open-Xlsx $path
    $sn = Find-XlsxSheet $x "1.รายละเอียดโครงการ"
    if (-not $sn) { continue }
    $f = Read-Detail (Read-XlsxSheet $x $sn)
  } catch {
    Write-Host ("อ่านไม่ได้: " + $s.file + " — " + $_.Exception.Message)
    continue
  } finally { Close-Xlsx $x }

  $budget = 0.0
  [void][double]::TryParse((("" + $f["7"]) -replace "[^\d\.]", ""), [ref]$budget)

  $data = [ordered]@{
    name        = "" + $f["1"]
    program     = "" + $f["2"]
    fund        = "" + $f["3"]
    activities  = "" + $f["4"]
    ptype       = "" + $f["5"]
    period      = "" + $f["6"]
    budget      = $budget
    place       = "" + $f["8"]
    org         = "" + $f["9"]
    rationale   = "" + $f["15"]
    objectives  = "" + $f["16"]
    results     = "" + $f["17"]
    indicators  = "" + $f["18"]
    stakeholders = "" + $f["19"]
    benefits    = "" + $f["20"]
    owner       = $f["21"]
    coordinator = $f["22"]
  }

  $seq[$s.uid] = 1 + [int]$seq[$s.uid]
  $docs.Add([pscustomobject]@{
    uid = $s.uid; seq = $seq[$s.uid]; actUid = $s.actUid
    source = $s.file; data = $data
  })
}
Write-Progress -Activity "อ่านรายละเอียด" -Completed

# ---------------------------------------------------------------------
# เขียนไฟล์ SQL — ใช้ dollar-quoting จะได้ไม่ต้องหนีอัญประกาศในข้อความไทยยาว ๆ
# ---------------------------------------------------------------------
function Sql-Text([string]$v) {
  if ($null -eq $v) { return "null" }
  return "'" + ($v -replace "'", "''") + "'"
}

$sql = New-Object System.Collections.Generic.List[string]
$sql.Add("-- รายละเอียดโครงการจากแบบฟอร์ม ฝยศ.1 (Google Drive)")
$sql.Add("-- สร้างโดย build\export-details.ps1 เมื่อ " + (Get-Date).ToString("yyyy-MM-dd HH:mm"))
$sql.Add("-- เอกสาร " + $docs.Count + " ฉบับ · วางทั้งไฟล์ใน Supabase SQL Editor แล้วกด Run")
$sql.Add("-- รันซ้ำได้ ข้อมูลเดิมถูกล้างก่อนทุกครั้ง")
$sql.Add("")
$sql.Add("begin;")
$sql.Add("delete from public.project_details where true;")
$sql.Add("")

foreach ($d in $docs) {
  $json = ConvertTo-Json -InputObject $d.data -Depth 5 -Compress
  # ตัวคั่น dollar-quote ต้องไม่ไปโผล่ในเนื้อหา ไม่งั้น SQL จะจบสตริงกลางคัน
  $tag = "pd"
  while ($json.Contains("`$$tag`$")) { $tag = $tag + "x" }
  $sql.Add(
    "insert into public.project_details (uid, seq, act_uid, source, data) values (" +
    (Sql-Text $d.uid) + ", " + $d.seq + ", " +
    $(if ($d.actUid) { Sql-Text $d.actUid } else { "null" }) + ", " +
    (Sql-Text $d.source) + ", `$$tag`$" + $json + "`$$tag`$::jsonb);"
  )
}

$sql.Add("")
$sql.Add("commit;")

$outPath = Join-Path $root "_import-details.sql"
[System.IO.File]::WriteAllLines($outPath, [string[]]$sql, $bom)

"เอกสารที่อ่านได้: " + $docs.Count + " จาก " + $selected.Count + " ไฟล์ที่เลือกไว้"
"โครงการที่มีรายละเอียด: " + (@($docs | ForEach-Object { $_.uid } | Sort-Object -Unique).Count)
"ไฟล์ SQL: " + $outPath + " (" + [math]::Round((Get-Item -LiteralPath $outPath).Length / 1KB) + " KB)"
