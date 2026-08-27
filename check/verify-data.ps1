<#
  ตรวจกระทบยอด data/plan-data.json กับตัวเลขในไฟล์ต้นฉบับ
  รันได้เลยด้วย PowerShell 5.1 ที่มากับ Windows ไม่ต้องติดตั้งอะไร

      powershell -File check\verify-data.ps1

  ระวังกับดัก PowerShell: $s กับ $S เป็นตัวแปรเดียวกัน (case-insensitive)
  อย่าตั้งชื่อตัวแปรชนกับ string table
#>

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$path = Join-Path $root "data\plan-data.json"

if (-not (Test-Path $path)) { Write-Host "NOT FOUND: $path"; exit 1 }

$json = Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json
$tbl  = $json.S
$f    = $json.fields
$iCode   = [array]::IndexOf($f, "code")
$iLvl    = [array]::IndexOf($f, "lvl")
$iName   = [array]::IndexOf($f, "name")
$iBudget = [array]::IndexOf($f, "budget")
$iStrat  = [array]::IndexOf($f, "strategy")
$iMonths = [array]::IndexOf($f, "months")

$pass = 0
$fail = 0
function Check($label, $actual, $expected) {
    if ($actual -eq $expected) {
        Write-Host ("  PASS  {0,-42} = {1}" -f $label, $actual)
        $script:pass++
    } else {
        Write-Host ("  FAIL  {0,-42} = {1}  (expected {2})" -f $label, $actual, $expected) -ForegroundColor Red
        $script:fail++
    }
}

Write-Host ""
Write-Host "=== reconcile data/plan-data.json ==="

# --- จำนวนแถวและระดับรายการ ---
$lvl0 = 0; $lvl1 = 0; $lvl2 = 0; $lvl3 = 0
foreach ($r in $json.rows) {
    switch ($r[$iLvl]) { 0 { $lvl0++ } 1 { $lvl1++ } 2 { $lvl2++ } 3 { $lvl3++ } }
}
Check "rows total"          $json.rows.Count 553
Check "projects (lvl 1)"    $lvl1 121
Check "activities (lvl 2)"  $lvl2 429
Check "sub-activities (lvl 3)" $lvl3 1
Check "non-project (lvl 0)" $lvl0 2

# --- งบประมาณ: ห้ามบวกข้ามระดับ นับเฉพาะ lvl 1 ---
$projBudget = 0
foreach ($r in $json.rows) { if ($r[$iLvl] -eq 1) { $projBudget += [double]$r[$iBudget] } }
Check "project budget (lvl 1 only)" ([long][math]::Round($projBudget)) 12769902181

# --- งบและจำนวนโครงการรายยุทธศาสตร์ ---
$sBudget = @{}
$sCount  = @{}
foreach ($r in $json.rows) {
    if ($r[$iLvl] -ne 1) { continue }
    $text = [string]$tbl[$r[$iStrat]]
    if ($text -match 'ยุทธศาสตร์ที่\s*(\d)') {
        $no = $matches[1]
        if (-not $sBudget.ContainsKey($no)) { $sBudget[$no] = [double]0; $sCount[$no] = 0 }
        $sBudget[$no] += [double]$r[$iBudget]
        $sCount[$no]++
    }
}
$expB = @{ "1" = 9999683542; "2" = 310107800; "3" = 1515144445; "4" = 944966394 }
$expC = @{ "1" = 40;         "2" = 15;        "3" = 58;         "4" = 8 }
foreach ($no in @("1", "2", "3", "4")) {
    Check "S$no budget" ([long][math]::Round($sBudget[$no])) $expB[$no]
    Check "S$no project count" $sCount[$no] $expC[$no]
}

# --- ตัวชี้วัดและแหล่งเงิน ---
Check "KPIs"  $json.kpis.Count  13
Check "funds" $json.funds.Count 7
Check "string table" $tbl.Count 2309
Check "fields" $f.Count 35

# --- meta ---
Check "grand total"   ([long]$json.meta.totals.grand)    14606749000
Check "projects total" ([long]$json.meta.totals.projects) 12769902181
Check "project count"  ([int]$json.meta.totals.projectCount) 121

# --- รหัสซ้ำ: ยืนยันข้อสมมติที่ทำให้ต้องคีย์ด้วย uid แทน code ---
$seen = @{}
$dupCodes = 0
foreach ($r in $json.rows) {
    $c = [string]$tbl[$r[$iCode]]
    if ($seen.ContainsKey($c)) { if ($seen[$c] -eq 1) { $dupCodes++ }; $seen[$c]++ }
    else { $seen[$c] = 1 }
}
Check "distinct codes"          $seen.Count 544
Check "codes appearing twice+"  $dupCodes 9

# --- แผนรายเดือน: ยืนยันว่าต้องม้วนจากกิจกรรมขึ้นโครงการ ---
$rowsWithPlan = 0
$lvl1WithOwnPlan = 0
$prefixWithPlan = @{}
foreach ($r in $json.rows) {
    $total = 0
    foreach ($v in $r[$iMonths]) { $total += $v }
    if ($total -gt 0) {
        $rowsWithPlan++
        if ($r[$iLvl] -eq 1) { $lvl1WithOwnPlan++ }
        $c = [string]$tbl[$r[$iCode]]
        if ($c.Length -ge 6) { $prefixWithPlan[$c.Substring(0, 6)] = 1 }
    }
}
$projCodes = @{}
foreach ($r in $json.rows) { if ($r[$iLvl] -eq 1) { $projCodes[[string]$tbl[$r[$iCode]]] = 1 } }
$covered = 0
foreach ($k in $projCodes.Keys) { if ($prefixWithPlan.ContainsKey($k)) { $covered++ } }
Check "rows with plan months"        $rowsWithPlan 399
Check "lvl-1 rows with own plan"     $lvl1WithOwnPlan 12
Check "projects covered after rollup" $covered 111

Write-Host ""
Write-Host ("=== {0} passed, {1} failed ===" -f $pass, $fail)
Write-Host ""
if ($fail -gt 0) { exit 1 }
exit 0
