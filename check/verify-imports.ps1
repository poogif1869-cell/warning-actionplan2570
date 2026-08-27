<#
  ตรวจว่าทุก import ในโปรเจกต์ชี้ไปยังไฟล์ที่มีจริง และชื่อที่ import มีการ export จริง
  รวมทั้งตรวจวงเล็บ/ปีกกาว่าปิดครบ

  เขียนด้วย PowerShell ล้วนเพราะเครื่องนี้ไม่มี Node.js
  จึงรัน next build ในเครื่องไม่ได้ ต้องจับ error ให้ได้มากที่สุดก่อนขึ้น Vercel

      powershell -File check\verify-imports.ps1
#>

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$files = Get-ChildItem -Path $root -Recurse -Include "*.js", "*.jsx" -File |
    Where-Object { $_.FullName -notmatch "\\node_modules\\" -and $_.FullName -notmatch "\\\.next\\" }

$problems = 0
function Problem($msg) {
    Write-Host ("  FAIL  " + $msg) -ForegroundColor Red
    $script:problems++
}

# ตัดคอมเมนต์ออกก่อนแยก import/export
# ไม่งั้นคำว่า import หรือ export ที่อยู่ในคอมเมนต์จะถูกนับเป็นของจริง
function StripComments($t) {
    $t = [regex]::Replace($t, '/\*[\s\S]*?\*/', ' ')
    return [regex]::Replace($t, '(?m)//.*$', ' ')
}

Write-Host ""
Write-Host "=== verify imports / exports ==="
Write-Host ("  scanning {0} files" -f $files.Count)

# ---------- เก็บรายชื่อที่แต่ละไฟล์ export ----------
$exportsOf = @{}
foreach ($f in $files) {
    $text = StripComments (Get-Content $f.FullName -Raw -Encoding UTF8)
    $names = New-Object 'System.Collections.Generic.HashSet[string]'

    foreach ($m in [regex]::Matches($text, '(?m)^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)')) {
        [void]$names.Add($m.Groups[1].Value)
    }
    foreach ($m in [regex]::Matches($text, '(?m)^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)')) {
        [void]$names.Add($m.Groups[1].Value)
    }
    foreach ($m in [regex]::Matches($text, '(?m)^\s*export\s+class\s+([A-Za-z_$][\w$]*)')) {
        [void]$names.Add($m.Groups[1].Value)
    }
    # export { a, b as c }
    foreach ($m in [regex]::Matches($text, 'export\s*\{([^}]*)\}')) {
        foreach ($part in $m.Groups[1].Value -split ',') {
            $p = $part.Trim()
            if (-not $p) { continue }
            if ($p -match '\bas\s+([A-Za-z_$][\w$]*)\s*$') { [void]$names.Add($matches[1]) }
            elseif ($p -match '^([A-Za-z_$][\w$]*)$') { [void]$names.Add($matches[1]) }
        }
    }
    if ($text -match '(?m)^\s*export\s+default\b') { [void]$names.Add("default") }

    $exportsOf[$f.FullName.ToLower()] = $names
}

# ---------- เก็บชื่อทุกอย่างที่แต่ละไฟล์ประกาศเอง (ไม่ใช่แค่ที่ export) ----------
$declaredIn = @{}
foreach ($f in $files) {
    $text = StripComments (Get-Content $f.FullName -Raw -Encoding UTF8)
    $names = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($m in [regex]::Matches($text, '(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)')) {
        [void]$names.Add($m.Groups[1].Value)
    }
    # พารามิเตอร์ที่ destructure มา เช่น function Drawer({ uid, alerts })
    foreach ($m in [regex]::Matches($text, '\(\s*\{([^}]*)\}\s*\)')) {
        foreach ($part in $m.Groups[1].Value -split ',') {
            if ($part.Trim() -match '^([A-Za-z_$][\w$]*)') { [void]$names.Add($matches[1]) }
        }
    }
    $declaredIn[$f.FullName.ToLower()] = $names
}

# ชื่อของโปรเจกต์ที่ใช้ตรวจว่าลืม import — เอาเฉพาะที่ขึ้นต้นด้วยตัวพิมพ์ใหญ่
# เพราะ ALL_CAPS กับ PascalCase แทบไม่มีทางชนกับชื่อตัวแปรท้องถิ่น
$projectSymbols = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($k in $exportsOf.Keys) {
    foreach ($n in $exportsOf[$k]) {
        if ($n -cmatch '^[A-Z][A-Za-z0-9_]*$') { [void]$projectSymbols.Add($n) }
    }
}

# ---------- แก้ path "@/..." ให้เป็นไฟล์จริง ----------
function ResolveImport($spec, $fromFile) {
    if ($spec.StartsWith("@/")) {
        $base = Join-Path $root ($spec.Substring(2) -replace '/', '\')
    } elseif ($spec.StartsWith(".")) {
        $base = Join-Path (Split-Path -Parent $fromFile) ($spec -replace '/', '\')
    } else {
        return $null   # แพ็กเกจภายนอก ไม่ต้องตรวจ
    }
    foreach ($ext in @("", ".js", ".jsx", ".json", "\index.js", "\index.jsx")) {
        $try = $base + $ext
        if (Test-Path $try -PathType Leaf) { return (Resolve-Path $try).Path }
    }
    return "MISSING"
}

# ---------- ตรวจทีละไฟล์ ----------
foreach ($f in $files) {
    # $text = ต้นฉบับ ใช้ตอนนับวงเล็บ / $code = ตัดคอมเมนต์แล้ว ใช้ตอนแยก import
    $text = Get-Content $f.FullName -Raw -Encoding UTF8
    $code = StripComments $text
    $rel = $f.FullName.Substring($root.Length + 1)

    foreach ($m in [regex]::Matches($code, 'import\s+([^;]*?)\s+from\s+["'']([^"'']+)["'']')) {
        $clause = $m.Groups[1].Value
        $spec = $m.Groups[2].Value
        $target = ResolveImport $spec $f.FullName
        if ($null -eq $target) { continue }
        if ($target -eq "MISSING") {
            Problem ("{0}: import ไม่พบไฟล์ '{1}'" -f $rel, $spec)
            continue
        }
        if ($target.ToLower().EndsWith(".json")) { continue }

        $avail = $exportsOf[$target.ToLower()]
        if ($null -eq $avail) { continue }

        # default import: ชื่อที่อยู่นอกวงเล็บปีกกา
        $defaultPart = ($clause -replace '\{[^}]*\}', '').Trim().Trim(',').Trim()
        if ($defaultPart -and $defaultPart -notmatch '^\*') {
            if (-not $avail.Contains("default")) {
                Problem ("{0}: '{1}' ไม่มี export default (ต้องการโดย {2})" -f $rel, $spec, $defaultPart)
            }
        }

        # named imports
        if ($clause -match '\{([^}]*)\}') {
            foreach ($part in $matches[1] -split ',') {
                $p = $part.Trim()
                if (-not $p) { continue }
                if ($p -match '^([A-Za-z_$][\w$]*)') {
                    $name = $matches[1]
                    if (-not $avail.Contains($name)) {
                        Problem ("{0}: '{1}' ไม่ได้ export ชื่อ '{2}'" -f $rel, $spec, $name)
                    }
                }
            }
        }
    }

    # ---------- ตรวจว่าใช้สัญลักษณ์ของโปรเจกต์โดยลืม import ----------
    # ทิศทางนี้คือทิศที่ทำให้ build พังจริง (ReferenceError ตอน prerender)
    # จำกัดเฉพาะชื่อขึ้นต้นด้วยตัวพิมพ์ใหญ่ (ALL_CAPS หรือ PascalCase) เพื่อไม่ให้ชนกับตัวแปรท้องถิ่น
    $importedHere = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($m in [regex]::Matches($code, 'import\s+([^;]*?)\s+from\s+["''][^"'']+["'']')) {
        $clause = $m.Groups[1].Value
        $d = ($clause -replace '\{[^}]*\}', '').Trim().Trim(',').Trim()
        if ($d -and $d -notmatch '^\*') { [void]$importedHere.Add($d) }
        if ($clause -match '\{([^}]*)\}') {
            foreach ($part in $matches[1] -split ',') {
                $p = $part.Trim()
                if ($p -match '\bas\s+([A-Za-z_$][\w$]*)\s*$') { [void]$importedHere.Add($matches[1]) }
                elseif ($p -match '^([A-Za-z_$][\w$]*)') { [void]$importedHere.Add($matches[1]) }
            }
        }
    }

    # ตัด import, คอมเมนต์ และข้อความในเครื่องหมายคำพูดออกก่อน
    # ไม่งั้น method: "POST" หรือ className="meta" จะถูกนับเป็นการใช้สัญลักษณ์
    $scan = [regex]::Replace($code, 'import\s+[^;]*?\s+from\s+["''][^"'']+["''];?', '')
    $scan = [regex]::Replace($scan, '/\*[\s\S]*?\*/', ' ')
    $scan = [regex]::Replace($scan, '(?m)//.*$', ' ')
    $scan = [regex]::Replace($scan, '"(?:[^"\\]|\\.)*"', '""')
    $scan = [regex]::Replace($scan, "'(?:[^'\\]|\\.)*'", "''")
    $scan = [regex]::Replace($scan, ([char]96 + '(?:[^' + [char]96 + '\\]|\\.)*' + [char]96), '``')

    foreach ($sym in $projectSymbols) {
        if ($importedHere.Contains($sym)) { continue }
        if ($declaredIn[$f.FullName.ToLower()].Contains($sym)) { continue }
        # -cmatch เท่านั้น: -match ของ PowerShell ไม่สนตัวพิมพ์ จะจับ meta ว่าเป็น META
        if ($scan -cmatch ("\b" + [regex]::Escape($sym) + "\b")) {
            Problem ("{0}: ใช้ '{1}' แต่ไม่ได้ import และไม่ได้ประกาศในไฟล์นี้" -f $rel, $sym)
        }
    }

    # ---------- ตรวจว่าวงเล็บปิดครบ ----------
    # นับดิบทั้งไฟล์ ไม่พยายามแยก string/comment/regex ออก
    # เคยลองเขียน state machine แล้วมันอ่าน /\//g เป็นคอมเมนต์ // และอ่าน
    # JSX self-closing tag ที่ตามหลัง } เป็น regex literal ทำให้แจ้งผิดพลาดรัว
    # การนับดิบจับกรณีที่เกิดจริง (ลืมปิดวงเล็บตอนแก้โค้ด) ได้เหมือนกันโดยไม่มี false positive
    $pairs = @(
        @{ open = '\{'; close = '\}'; label = "{}" },
        @{ open = '\('; close = '\)'; label = "()" },
        @{ open = '\['; close = '\]'; label = "[]" }
    )
    foreach ($pair in $pairs) {
        $nOpen = ([regex]::Matches($text, $pair.open)).Count
        $nClose = ([regex]::Matches($text, $pair.close)).Count
        if ($nOpen -ne $nClose) {
            Problem ("{0}: วงเล็บ {1} ไม่สมดุล (เปิด {2} ปิด {3})" -f $rel, $pair.label, $nOpen, $nClose)
        }
    }
}

Write-Host ""
if ($problems -eq 0) {
    Write-Host "=== ผ่านทั้งหมด ไม่พบ import/export ที่ผิด ==="
    Write-Host ""
    exit 0
}
Write-Host ("=== พบปัญหา {0} จุด ===" -f $problems) -ForegroundColor Red
Write-Host ""
exit 1
