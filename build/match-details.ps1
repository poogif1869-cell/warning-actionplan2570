# จับคู่ไฟล์คำของบประมาณ (แบบฟอร์ม ฝยศ.1) กับโครงการในแผนปฏิบัติการ
#
# ชื่อไฟล์ใน Google Drive ไม่ตรงกับชื่อโครงการ และในไฟล์ไม่มีรหัสโครงการ
# จึงจับคู่จากเนื้อหาในชีต "1. รายละเอียดโครงการ" สามอย่างประกอบกัน
#   1. ชื่อโครงการ   (ช่อง "1. โครงการ")          — ตัวหลัก เทียบความคล้ายของตัวอักษร
#   2. งบประมาณ      (ช่อง "7. งบประมาณ")         — ถ้าเท่ากับงบในแผนพอดี มั่นใจขึ้นมาก
#   3. ผู้รับผิดชอบ   (ช่อง "9. ผู้รับผิดชอบโครงการ") — หน่วยงานตรงกันช่วยแยกชื่อที่คล้ายกัน
#
# ผลลัพธ์ (อยู่ใน data/project-details/ ซึ่งไม่ขึ้น git):
#   _จับคู่-ตรวจสอบ.csv   ตารางให้คนตรวจ เปิดด้วย Excel ได้เลย (UTF-8 มี BOM)
#   _โครงการที่ไม่มีไฟล์.csv
#   _extract.json         ข้อมูลที่ดึงได้จากทุกไฟล์ ไว้ใช้ขั้นนำเข้าเว็บ
#
# วิธีรัน:  powershell -ExecutionPolicy Bypass -File build\match-details.ps1
#
# ⚠️ ไฟล์นี้ต้องบันทึกเป็น UTF-8 มี BOM (มีข้อความไทยในโค้ด)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\xlsx-lib.ps1"

$proj = Split-Path $PSScriptRoot -Parent
$root = Join-Path $proj "data\project-details"
$bom = New-Object System.Text.UTF8Encoding($true)

# ---------------------------------------------------------------------
# แผนปฏิบัติการ — uid ต้องสร้างแบบเดียวกับ lib/plan.js: code + "#" + ลำดับแถว
# ---------------------------------------------------------------------
$plan = Get-Content -Raw -Encoding UTF8 (Join-Path $proj "data\plan-data.json") | ConvertFrom-Json
$fi = @{}
for ($i = 0; $i -lt $plan.fields.Count; $i++) { $fi[$plan.fields[$i]] = $i }

function Norm([string]$s) {
  if (-not $s) { return "" }
  $t = $s -replace "โครงการ|กิจกรรม", ""
  $t = $t -replace "[\s\.\,\(\)\[\]\-–—:;/\\""'“”‘’]", ""
  return $t.ToLower()
}

function Bigrams([string]$s) {
  $h = New-Object "System.Collections.Generic.HashSet[string]"
  for ($i = 0; $i -lt $s.Length - 1; $i++) { [void]$h.Add($s.Substring($i, 2)) }
  return , $h
}

# ความคล้ายของชื่อ 0..1 — Dice ของคู่ตัวอักษรติดกัน
# ภาษาไทยไม่เว้นวรรคระหว่างคำ ตัดคำไม่ได้ จึงเทียบระดับตัวอักษรแทน
# ชื่อหนึ่งอยู่ในอีกชื่อทั้งก้อน (เช่นในไฟล์เติมคำต่อท้าย) ถือว่าคล้ายมาก
function Sim($a, $ga, $b, $gb) {
  if (-not $a -or -not $b) { return 0 }
  if ($a -eq $b) { return 1 }
  # ::new() ไม่ใช่ New-Object — New-Object จะแตก HashSet ออกเป็นอาร์กิวเมนต์ทีละตัว
  $x = [System.Collections.Generic.HashSet[string]]::new($ga)
  $x.IntersectWith($gb)
  $d = (2.0 * $x.Count) / ($ga.Count + $gb.Count)
  $short = [math]::Min($a.Length, $b.Length)
  if ($short -ge 12 -and ($a.Contains($b) -or $b.Contains($a))) { $d = [math]::Max($d, 0.9) }
  return $d
}

function OrgKeys([string]$s) {
  if (-not $s) { return @() }
  return ($s -split "[/\\,\s]+" | ForEach-Object { $_ -replace "\.", "" } | Where-Object { $_.Length -ge 2 })
}

# แหล่งเงินจากข้อความ เช่น "กองทุนพัฒนายางพารามาตรา 49(1)" → "49(1)" · "ทุน กยท. ตามมาตรา 13" → "มาตรา 13"
# ใช้แยกโครงการชื่อเดียวกันที่อยู่คนละแหล่งเงิน (เช่น บำรุงรักษาระบบสารสนเทศ 49(1) กับ 49(3))
function FundCode([string]$s) {
  if (-not $s) { return "" }
  $m = [regex]::Match($s, "49\s*\(\s*(\d)\s*\)")
  if ($m.Success) { return "49(" + $m.Groups[1].Value + ")" }
  if ($s -match "มาตรา\s*13") { return "มาตรา 13" }
  return ""
}

$items = New-Object System.Collections.Generic.List[object]
for ($i = 0; $i -lt $plan.rows.Count; $i++) {
  $r = $plan.rows[$i]
  $lvl = [int]$r[$fi.lvl]
  if ($lvl -lt 1 -or $lvl -gt 2) { continue }
  $code = $plan.S[$r[$fi.code]]
  $name = $plan.S[$r[$fi.name]]
  $n = Norm $name
  $items.Add([pscustomobject]@{
    uid = "$code#$i"; code = $code; lvl = $lvl; name = $name
    budget = [double]$r[$fi.budget]; org = $plan.S[$r[$fi.org]]
    fund = $plan.S[$r[$fi.fund]]; top = $null
    n = $n; g = (Bigrams $n)
  })
}
$projects = @($items | Where-Object { $_.lvl -eq 1 })

# กิจกรรมผูกกับโครงการแม่ตามรหัส 6 หลักแรก — แม่ตัวแรกที่เจอ เหมือน lib/plan.js
$firstByCode = @{}
foreach ($p in $projects) { if (-not $firstByCode.ContainsKey($p.code)) { $firstByCode[$p.code] = $p } }
foreach ($it in $items) {
  if ($it.lvl -eq 1) { $it.top = $it; continue }
  $it.top = $firstByCode[$it.code.Substring(0, [math]::Min(6, $it.code.Length))]
  if (-not $it.fund -and $it.top) { $it.fund = $it.top.fund }
}
$items = @($items | Where-Object { $_.top })
Write-Host ("แผน: " + $projects.Count + " โครงการ / " + ($items.Count - $projects.Count) + " กิจกรรม")

# ---------------------------------------------------------------------
# อ่านชีต "1. รายละเอียดโครงการ" ตามป้ายเลขข้อ ไม่ใช่ตามตำแหน่งเซลล์
# ข้อความยาวดันแถวเลื่อนลงได้ในแต่ละไฟล์ แต่ป้าย "7. งบประมาณ" อยู่ติดค่าของมันเสมอ
# ---------------------------------------------------------------------
$LABELS = [ordered]@{
  "1" = "โครงการ"; "2" = "แผนงาน"; "3" = "แหล่งงบประมาณ"; "4" = "กิจกรรม"
  "5" = "ประเภทโครงการ"; "6" = "ระยะเวลาดำเนินการ"; "7" = "งบประมาณ"
  "8" = "สถานที่ดำเนินโครงการ"; "9" = "ผู้รับผิดชอบโครงการ"
}

function Test-Label([string]$v) {
  foreach ($k in $LABELS.Keys) {
    if ($v -match ("^\s*" + $k + "\s*\.\s*" + [regex]::Escape($LABELS[$k]))) { return $k }
  }
  return $null
}

# ค่าของป้ายหนึ่ง = เซลล์ทางขวาในแถวเดียวกัน จนกว่าจะเจอป้ายถัดไป
function Read-Fields($cells) {
  $out = @{}
  $byRow = $cells | Group-Object Row
  foreach ($g in $byRow) {
    if ([int]$g.Name -gt 12) { continue }  # ช่อง 1-9 อยู่หัวฟอร์มเสมอ
    $row = @($g.Group | Sort-Object Col)
    for ($i = 0; $i -lt $row.Count; $i++) {
      $k = Test-Label $row[$i].Value
      if (-not $k -or $out.ContainsKey($k)) { continue }
      $vals = @()
      for ($j = $i + 1; $j -lt $row.Count; $j++) {
        if (Test-Label $row[$j].Value) { break }
        $vals += $row[$j].Value.Trim()
      }
      $out[$k] = ($vals -join " ").Trim()
    }
  }
  return $out
}

# ---------------------------------------------------------------------
# ไล่ทุกไฟล์
# ---------------------------------------------------------------------
# ---------------------------------------------------------------------
# การแก้ไขด้วยมือ — build/details-overrides.csv (ขึ้น git ไม่หายเมื่อรันใหม่)
# คอลัมน์: ไฟล์ (path ใต้ data/project-details), รหัส (รหัสโครงการ/กิจกรรม หรือ - = ไม่นำเข้า), หมายเหตุ
# ใช้แทนผลจับคู่อัตโนมัติเสมอ — ตาราง _จับคู่-ตรวจสอบ.csv ถูกเขียนทับทุกรอบ แก้ในนั้นจะหาย
# ---------------------------------------------------------------------
$ovPath = Join-Path $PSScriptRoot "details-overrides.csv"
$overrides = @{}
if (Test-Path -LiteralPath $ovPath) {
  foreach ($o in (Import-Csv -LiteralPath $ovPath -Encoding UTF8)) {
    if ($o.'ไฟล์') { $overrides[$o.'ไฟล์'.Trim()] = $o }
  }
}

# รหัสที่คนใส่ → รายการในแผน (รหัสซ้ำ 9 รหัส: เลือกตัวที่แหล่งเงินตรงกับไฟล์ ไม่งั้นตัวแรก)
function Resolve-Code([string]$code, [string]$fund) {
  $c = $code.Trim()
  $hits = @($items | Where-Object { $_.uid -eq $c -or $_.code -eq $c })
  if ($hits.Count -gt 1 -and $fund) {
    $f = @($hits | Where-Object { $_.fund -eq $fund })
    if ($f.Count) { $hits = $f }
  }
  if ($hits.Count) { return $hits[0] } else { return $null }
}

$files = Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object { -not $_.Name.StartsWith("_") }
$rows = New-Object System.Collections.Generic.List[object]
$extract = New-Object System.Collections.Generic.List[object]
$n = 0
foreach ($f in $files) {
  $n++
  $rel = $f.FullName.Substring($root.Length + 1)
  Write-Progress -Activity "อ่านไฟล์" -Status $rel -PercentComplete ($n * 100 / $files.Count)
  $rec = [ordered]@{ file = $rel; folder = (Split-Path $rel -Parent); note = "" }

  if ($f.Extension -ne ".xlsx") {
    $rec.note = "ข้าม — ไฟล์ " + $f.Extension + " (หน้าสรุป ไม่ใช่แบบฟอร์ม ฝยศ.1)"
    $rows.Add([pscustomobject]$rec); continue
  }

  $x = $null
  try {
    $x = Open-Xlsx $f.FullName
    $sn = Find-XlsxSheet $x "1.รายละเอียดโครงการ"
    if (-not $sn) {
      $rec.note = "ไม่มีชีต 1. รายละเอียดโครงการ (น่าจะเป็นคำขอบริหารทั่วไป)"
      $rows.Add([pscustomobject]$rec); continue
    }
    $fields = Read-Fields (Read-XlsxSheet $x $sn)
  } catch {
    $rec.note = "อ่านไฟล์ไม่ได้: " + $_.Exception.Message
    $rows.Add([pscustomobject]$rec); continue
  } finally { Close-Xlsx $x }

  $name = "" + $fields["1"]
  $budgetText = ("" + $fields["7"]) -replace "[^\d\.]", ""
  $budget = 0.0
  [void][double]::TryParse($budgetText, [ref]$budget)
  $org = "" + $fields["9"]
  $rec.name = $name; $rec.budget = $budget; $rec.org = $org
  $rec.fund = "" + $fields["3"]; $rec.acts = "" + $fields["4"]

  # แบบฟอร์มที่ไม่ได้กรอกชื่อโครงการ = ไฟล์เปล่าที่ติดมาในโฟลเดอร์ ไม่ต้องจับคู่
  if (-not $name.Trim()) {
    $rec.conf = "แบบฟอร์มว่าง — ไม่ได้กรอกชื่อโครงการ"
    $rows.Add([pscustomobject]$rec); continue
  }

  # ---------- ให้คะแนนทุกโครงการและทุกกิจกรรม ----------
  # ไฟล์ของหน่วยธุรกิจตั้งชื่อตามกิจกรรม (เช่น "บริหารจัดการสวนยาง") ไม่ใช่ชื่อโครงการ
  # จึงต้องเทียบกับกิจกรรมด้วย ถ้าตรงกิจกรรมก็รู้โครงการแม่ไปด้วย
  $nn = Norm $name
  $gg = Bigrams $nn
  $fileOrg = @(OrgKeys $org) + @(OrgKeys $rec.folder)
  $fileFund = FundCode $rec.fund
  if (-not $fileFund) { $fileFund = FundCode $rec.file }
  $scored = foreach ($p in $items) {
    $s = Sim $nn $gg $p.n $p.g
    $budgetHit = ($budget -gt 0 -and [math]::Abs($budget - $p.budget) -lt 1)
    $orgHit = @((OrgKeys $p.org) | Where-Object { $fileOrg -contains $_ }).Count -gt 0
    $fundHit = ($fileFund -and $p.fund -eq $fileFund)
    [pscustomobject]@{ p = $p; sim = $s; budgetHit = $budgetHit; orgHit = $orgHit; fundHit = $fundHit
      score = $s + ($(if ($budgetHit) { 0.15 } else { 0 })) + ($(if ($orgHit) { 0.05 } else { 0 })) + ($(if ($fundHit) { 0.05 } else { 0 })) }
  }
  # คะแนนเท่ากันให้โครงการชนะกิจกรรม (กิจกรรมบางตัวชื่อเดียวกับโครงการแม่)
  $ranked = @($scored | Sort-Object @{ e = { $_.score }; Descending = $true }, @{ e = { $_.p.lvl } })
  $best = $ranked[0]
  # ตัวเลือกที่ 2 ต้องเป็นคนละโครงการ — กิจกรรมของโครงการเดียวกันไม่นับว่าสับสน
  $second = $ranked | Where-Object { $_.p.top.uid -ne $best.p.top.uid } | Select-Object -First 1

  $conf =
    if ($best.sim -ge 0.85 -or ($best.sim -ge 0.6 -and $best.budgetHit)) { "สูง" }
    elseif ($best.sim -ge 0.6) { "กลาง" }
    elseif ($best.sim -ge 0.4) { "ต่ำ — ต้องตรวจ" }
    else { "ไม่พบโครงการที่คล้าย" }
  # สองอันดับแรกคะแนนสูสีกัน = เสี่ยงจับผิดตัว แม้คะแนนจะสูง
  if ($second -and $best.sim -ge 0.4 -and ($best.score - $second.score) -lt 0.05) {
    $conf = "กลาง — มีโครงการชื่อคล้ายกัน 2 ตัว"
  }

  $bp = $best.p
  $rec.manual = ""
  $ov = $overrides[$rel]
  if ($ov) {
    $oc = ("" + $ov.'รหัส').Trim()
    if ($oc -eq "-") {
      $rec.conf = "ไม่นำเข้า (แก้ด้วยมือ)"; $rec.manual = "ไม่นำเข้า"; $rec.note = "" + $ov.'หมายเหตุ'
      $rows.Add([pscustomobject]$rec); continue
    }
    $hit = Resolve-Code $oc $fileFund
    if ($hit) {
      $bp = $hit
      $conf = "สูง"
      $rec.manual = "แก้ด้วยมือ: " + $oc
      $rec.note = "" + $ov.'หมายเหตุ'
      $best = [pscustomobject]@{
        sim = (Sim $nn $gg $bp.n $bp.g)
        budgetHit = ($budget -gt 0 -and [math]::Abs($budget - $bp.budget) -lt 1)
        orgHit = @((OrgKeys $bp.org) | Where-Object { $fileOrg -contains $_ }).Count -gt 0
        fundHit = ($fileFund -and $bp.fund -eq $fileFund)
      }
    } else {
      $rec.note = "รหัสที่แก้ด้วยมือ '" + $oc + "' ไม่มีในแผน — ใช้ผลอัตโนมัติไปก่อน"
    }
  }

  # ---------- แบบฟอร์มของกิจกรรมเดียว ----------
  # หลายหน่วยงานกรอก "1. โครงการ" เป็นชื่อโครงการแม่ แล้วใส่กิจกรรมของตัวเองไว้ในช่อง "4. กิจกรรม"
  # (เช่น นธก. ส่งแยก 4 ไฟล์ของ 040107) ถ้าไม่ดูช่อง 4 ทุกไฟล์จะแย่งที่เดียวกันแล้วเหลือใช้ได้ไฟล์เดียว
  # ใช้เฉพาะเมื่อช่อง 4 มีกิจกรรมเดียว — แบบฟอร์มทั้งโครงการที่ไล่ "1. ... 2. ..." ห้ามผูกกับกิจกรรมใดกิจกรรมหนึ่ง
  $actsText = "" + $fields["4"]
  if ($bp.lvl -eq 1 -and $actsText -and $actsText -notmatch "(^|\s)2\s*\.\s*\S") {
    $na = Norm $actsText
    $ga = Bigrams $na
    $kid = $items | Where-Object { $_.lvl -eq 2 -and $_.top.uid -eq $bp.uid } |
      ForEach-Object { [pscustomobject]@{ k = $_; s = (Sim $na $ga $_.n $_.g) } } |
      Sort-Object s -Descending | Select-Object -First 1
    if ($kid -and $kid.s -ge 0.6) { $bp = $kid.k }
  }

  $rec.uid = $bp.top.uid; $rec.code = $bp.top.code; $rec.planName = $bp.top.name
  $rec.level = if ($bp.lvl -eq 2) { "กิจกรรม" } else { "โครงการ" }
  $rec.actUid = if ($bp.lvl -eq 2) { $bp.uid } else { "" }
  $rec.actName = if ($bp.lvl -eq 2) { $bp.code + " " + $bp.name } else { "" }
  $rec.planBudget = $bp.budget; $rec.planOrg = $bp.org; $rec.planFund = $bp.fund
  $rec.sim = [math]::Round($best.sim * 100)
  $rec.budgetHit = $best.budgetHit; $rec.orgHit = $best.orgHit; $rec.fundHit = $best.fundHit; $rec.conf = $conf
  $rec.alt = if ($second) { $second.p.code + " " + $second.p.name + " (" + [math]::Round($second.sim * 100) + "%)" } else { "" }
  $rows.Add([pscustomobject]$rec)
  $extract.Add([pscustomobject]@{ file = $rel; fields = $fields; uid = $rec.uid; actUid = $rec.actUid; conf = $conf })
}
Write-Progress -Activity "อ่านไฟล์" -Completed

# หลายไฟล์ชี้รายการเดียวกัน (โครงการเดียวกันและกิจกรรมเดียวกัน)
# อาจเป็นไฟล์แยกตามศูนย์/หน่วยย่อยของโครงการเดียว หรือจับผิดตัว — ให้คนดู
$dup = $rows | Where-Object { $_.uid -and -not $_.conf.StartsWith("ไม่นำเข้า") } | Group-Object { $_.uid + "|" + $_.actUid } | Where-Object { $_.Count -gt 1 }

# ---------------------------------------------------------------------
# ไฟล์ไหนเป็นตัวจริงของรายการนั้น — ไฟล์ซ้ำส่วนใหญ่คือฉบับเก่า/ฉบับแก้ไข
# หรือแบบฟอร์มเดียวกันที่สองหน่วยงานเก็บไว้คนละโฟลเดอร์
#   1. งบในไฟล์ตรงกับงบในแผน (= ฉบับที่ผ่านอนุมัติ)
#   2. ไม่อยู่ในโฟลเดอร์ "เก่า"
#   3. แก้ไขล่าสุด (วันที่ในไฟล์ zip ที่ดาวน์โหลดจาก Drive)
# ---------------------------------------------------------------------
foreach ($r in $rows) { $r | Add-Member -NotePropertyName use -NotePropertyValue "" -Force }
$usable = $rows | Where-Object { $_.uid -and $_.conf -and ($_.conf -eq "สูง" -or $_.conf.StartsWith("กลาง")) }
foreach ($g in ($usable | Group-Object { $_.uid + "|" + $_.actUid })) {
  $pick = $g.Group | Sort-Object `
    @{ e = { if ($_.budgetHit) { 0 } else { 1 } } },
    @{ e = { if ($_.file -match "(^|\\)เก่า\\") { 1 } else { 0 } } },
    @{ e = { (Get-Item -LiteralPath (Join-Path $root $_.file)).LastWriteTime }; Descending = $true } |
    Select-Object -First 1
  foreach ($r in $g.Group) { $r.use = if ($r -eq $pick) { "ใช้" } else { "ไม่ใช้ (มีฉบับที่ดีกว่า)" } }
}
foreach ($g in $dup) {
  foreach ($r in $g.Group) {
    $r.note = ($r.note + " หลายไฟล์ (" + $g.Count + ") ชี้รายการเดียวกัน").Trim()
  }
}

# ---------------------------------------------------------------------
# เขียนผล
# ---------------------------------------------------------------------
# เรียงอันที่ต้องตรวจขึ้นก่อน: ไม่พบ/ต่ำ → กลาง → สูง → ไฟล์ที่ข้าม
function ConfRank($c) {
  if (-not $c -or $c.StartsWith("แบบฟอร์มว่าง")) { return 4 }
  if ($c -eq "สูง") { return 3 }
  if ($c.StartsWith("กลาง")) { return 2 }
  return 1
}
$csv = $rows | Sort-Object @{ e = { ConfRank $_.conf } }, @{ e = { [int]$_.sim } } |
  ForEach-Object {
    [pscustomobject][ordered]@{
      "ความมั่นใจ"            = $_.conf
      "ชื่อคล้าย(%)"          = $_.sim
      "งบตรงกัน"             = $(if ($_.budgetHit) { "ตรง" } elseif ($_.uid) { "ไม่ตรง" } else { "" })
      "หน่วยงานตรงกัน"        = $(if ($_.orgHit) { "ตรง" } elseif ($_.uid) { "ไม่ตรง" } else { "" })
      "แหล่งเงินตรงกัน"       = $(if ($_.fundHit) { "ตรง" } elseif ($_.uid) { "ไม่ตรง" } else { "" })
      "จับคู่ระดับ"            = $_.level
      "ชื่อโครงการในไฟล์"       = $_.name
      "จับคู่กับ: รหัส"          = $_.code
      "จับคู่กับ: ชื่อในแผน"      = $_.planName
      "กิจกรรมที่ตรง"          = $_.actName
      "งบในไฟล์"             = $_.budget
      "งบในแผน"             = $_.planBudget
      "ผู้รับผิดชอบในไฟล์"       = $_.org
      "หน่วยงานในแผน"        = $_.planOrg
      "ตัวเลือกที่ 2"           = $_.alt
      "แหล่งเงินในไฟล์"        = $_.fund
      "แหล่งเงินในแผน"        = $_.planFund
      # ช่องให้คนตรวจกรอก — ขั้นนำเข้าจะอ่านช่องนี้ก่อนผลจับคู่อัตโนมัติ
      "ใช้ไฟล์นี้"             = $_.use
      "แก้ด้วยมือ"            = $_.manual
      "หมายเหตุ"             = $_.note
      "ไฟล์"                 = $_.file
      "uid"                 = $_.uid
    }
  }
$csvPath = Join-Path $root "_จับคู่-ตรวจสอบ.csv"
[System.IO.File]::WriteAllLines($csvPath, [string[]]($csv | ConvertTo-Csv -NoTypeInformation), $bom)

$hit = @{}
foreach ($r in $rows) { if ($r.uid -and $r.conf -and -not $r.conf.StartsWith("ไม่พบ") -and -not $r.conf.StartsWith("ต่ำ")) { $hit[$r.uid] = $true } }
$missing = $projects | Where-Object { -not $hit.ContainsKey($_.uid) } | ForEach-Object {
  [pscustomobject][ordered]@{ "รหัส" = $_.code; "ชื่อโครงการ" = $_.name; "งบ" = $_.budget; "หน่วยงาน" = $_.org; "uid" = $_.uid }
}
$missPath = Join-Path $root "_โครงการที่ไม่มีไฟล์.csv"
[System.IO.File]::WriteAllLines($missPath, [string[]]($missing | ConvertTo-Csv -NoTypeInformation), $bom)

[System.IO.File]::WriteAllText((Join-Path $root "_extract.json"), ($extract | ConvertTo-Json -Depth 5), $bom)

# ไฟล์ที่เลือกใช้จริง — build/export-details.ps1 อ่านรายการนี้ไปทำ SQL นำเข้า
$selected = @($rows | Where-Object { $_.use -eq "ใช้" } | ForEach-Object {
  [pscustomobject][ordered]@{ file = $_.file; uid = $_.uid; actUid = $_.actUid; actName = $_.actName }
})
[System.IO.File]::WriteAllText((Join-Path $root "_selected.json"), (ConvertTo-Json -InputObject $selected -Depth 3), $bom)

# ---------- สรุปบนจอ ----------
""
"ไฟล์ทั้งหมด: " + $rows.Count
$rows | Group-Object { if ($_.conf) { $_.conf } else { "ข้าม/อ่านไม่ได้" } } | Sort-Object Count -Descending |
  ForEach-Object { "  {0,4}  {1}" -f $_.Count, $_.Name }
"หลายไฟล์ชี้โครงการเดียวกัน: " + $dup.Count + " โครงการ"
"โครงการในแผนที่ยังไม่มีไฟล์ที่จับคู่ได้: " + @($missing).Count + " จาก " + $projects.Count
