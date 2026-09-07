# sync_skills.ps1 - 3-way skill library sync (DeepSeek Harness <-> CodeBuddy <-> WorkBuddy)
# Bidirectional incremental sync: newer mtime wins. Never deletes skills unique to any side.
# Run:  powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\scripts\sync_skills.ps1"
#
# Version rule (Owner-confirmed 2026-08-14): the file with the NEWER mtime wins
# (robocopy /XO = eXclude Older). Merge per-file, never delete. Chinese docs
# live in the skills-sync SKILL.md; keep this script ASCII-only for PS 5.1.
#
# 2026-08-24: AutoClaw leg replaced by DeepSeek Harness (~/.dsh/skills).
# Three legs are now: DeepSeek Harness <-> CodeBuddy <-> WorkBuddy.
#
# 2026-08-24 (XJ hardening): CodeBuddy's skill dir contains 73 junction
# entries pointing at the legacy AutoClaw library. Under a non-admin shell
# robocopy cannot traverse junctions (ERROR 448) and would abort the whole
# run. /XJ skips junction dirs on both sides so the sync always completes;
# the junction-backed skills are not copied (their content lives in the
# AutoClaw source dir anyway). Run as admin to also traverse junctions.

$ErrorActionPreference = 'Stop'

$root = "$env:USERPROFILE"
$pairs = @(
    , @("$root\.dsh\skills", "$root\.codebuddy\skills")
    , @("$root\.dsh\skills", "$root\.workbuddy\skills")
    , @("$root\.codebuddy\skills", "$root\.workbuddy\skills")
)

# Client-managed metadata files that must NOT be synced across clients
$exclude = @('*.bundled-hash', '_user_meta.json', '_bm_skillid_migration.json', '_bm_skillid_migration.json.fallback.bak')

$totalCopied = 0
foreach ($p in $pairs) {
    $a = $p[0]; $b = $p[1]
    Write-Host "== Sync: $a  <->  $b =="
    # A -> B  (/XJ: skip junction dirs - CodeBuddy's AutoClaw junctions are untraversable under non-admin)
    robocopy $a $b /E /XO /XJ /XF $exclude /R:1 /W:1 /MT:16 /NFL /NDL /NJH /NJS /NP
    $code = $LASTEXITCODE
    if ($code -ge 8) { Write-Host "ERROR A->B code=$code"; exit 1 }
    # B -> A
    robocopy $b $a /E /XO /XJ /XF $exclude /R:1 /W:1 /MT:16 /NFL /NDL /NJH /NJS /NP
    $code = $LASTEXITCODE
    if ($code -ge 8) { Write-Host "ERROR B->A code=$code"; exit 1 }
    # robocopy exit codes 1-7 are success (files copied / extra); 0 = nothing to do
    $totalCopied += ($code -band 1)
}

# ---- Conflict check: verify same-named SKILL.md hashes across the three ends ----
# Note: CodeBuddy junction dirs are untraversable under non-admin shells, so
# Test-Path on their SKILL.md returns false and they are simply skipped.
$libs = @(
    "$root\.dsh\skills",
    "$root\.codebuddy\skills",
    "$root\.workbuddy\skills"
)
$conflicts = @()
# Walk the first library as the baseline list of skill dirs
$skillDirs = Get-ChildItem "$($libs[0])" -Directory -Force -ErrorAction SilentlyContinue
foreach ($dir in $skillDirs) {
    $relDef = 'SKILL.md'
    $defPath = Join-Path $dir.FullName 'SKILL.md'
    if (-not (Test-Path $defPath)) {
        $alt = Join-Path $dir.FullName 'skill.md'
        if (Test-Path $alt) { $relDef = 'skill.md'; $defPath = $alt } else { continue }
    }
    $rel = "$($dir.Name)\$relDef"
    $hashes = @{}
    foreach ($lib in $libs) {
        $cand = Join-Path $lib $rel
        if (Test-Path $cand) { $hashes[$lib] = (Get-FileHash $cand -Algorithm SHA256).Hash }
    }
    if ($hashes.Count -ge 3) {
        $uniq = $hashes.Values | Sort-Object -Unique
        if ($uniq.Count -gt 1) {
            $conflicts += $rel
        }
    }
}
if ($conflicts.Count -gt 0) {
    Write-Host ""
    Write-Host "!! CONFLICT: these SKILL.md files still differ across the three ends (both sides edited? manual review needed):"
    $conflicts | ForEach-Object { Write-Host "   - $_" }
} else {
    Write-Host ""
    Write-Host "CONFLICT CHECK: all three ends consistent OK"
}

Write-Host "ALL SKILL SYNC DONE (files copied: $totalCopied)"
