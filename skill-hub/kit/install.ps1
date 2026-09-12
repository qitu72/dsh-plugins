# skill-hub one-shot INSTALL script (for a fresh machine).
# Unlike deploy.ps1 (owner-side repair), this script also REGISTERS the plugin
# into the dsh profile, which is required for dsh to load it at all:
#   1. copy lib/ + manifests into <profile>/node_modules/skill-hub
#   2. add "skill-hub" to the profile package.json  -> dsh.profile.bundles array
#   3. add "skill-hub": "*" to the profile package.json -> dependencies (idempotent)
# Usage (run from anywhere):
#   pwsh install.ps1                # install + register (no restart)
#   pwsh install.ps1 -Port 3080     # verify against a running dsh on this port
#   pwsh install.ps1 -Restart -WorkDir "C:\path\to\your\dsh-project"
#   pwsh install.ps1 -WhatIf        # dry-run, change nothing
# Pure ASCII on purpose: Windows PowerShell 5.1 reads .ps1 as GBK; non-ASCII
# comments/strings get mangled and break parsing (see kit/SPEC.md #5.1).

param(
  [switch]$WhatIf,
  [switch]$Restart,
  [int]$Port = 3080,
  [string]$ProfileName = '',
  [string]$WorkDir = ''
)

$ErrorActionPreference = 'Stop'
$root      = Split-Path -Parent $MyInvocation.MyCommand.Definition
$libDir    = Join-Path $root 'lib'
$srcDir    = Join-Path $root 'src'
$dshHome   = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$profilesDir = Join-Path $dshHome 'profiles'

function Step([string]$m) { Write-Host $m -ForegroundColor Cyan }
function Ok([string]$m)   { Write-Host $m -ForegroundColor Green }
function Warn([string]$m) { Write-Host $m -ForegroundColor Yellow }

if ($WhatIf) { Write-Host '[WhatIf] dry-run, nothing will be changed.' -ForegroundColor Yellow }

Step '[1/4] locate the dsh profile ...'
if (-not (Test-Path $libDir))  { throw "missing prebuilt dir: $libDir  (re-download the kit)" }
if (-not (Test-Path $profilesDir)) { throw "dsh profiles dir not found: $profilesDir  (is dsh installed?)" }

# Pick the profile: explicit -ProfileName > $env:DSH_PROFILE > web > default > desktop > first match.
$candidates = Get-ChildItem $profilesDir -Directory |
  Where-Object { Test-Path (Join-Path $_.FullName 'package.json') } |
  Select-Object -ExpandProperty Name
if (-not $candidates) { throw "no dsh profile with a package.json under $profilesDir" }
$want = if ($ProfileName) { $ProfileName } elseif ($env:DSH_PROFILE) { $env:DSH_PROFILE } else { '' }
$order = @($want, 'web', 'default', 'desktop') | Where-Object { $_ }
$picked = $null
foreach ($w in $order) { if ($candidates -contains $w) { $picked = $w; break } }
if (-not $picked) { $picked = $candidates | Select-Object -First 1 }
$profileDir = Join-Path $profilesDir $picked
$pkgPath    = Join-Path $profileDir 'package.json'
Write-Host "  profiles found : $($candidates -join ', ')"
Write-Host "  picked profile : $picked"
Write-Host "  manifest       : $pkgPath"

Step '[2/4] copy lib/ and manifests into the profile ...'
$deployDir = Join-Path $profileDir (Join-Path 'node_modules' 'skill-hub')
if (-not $WhatIf) {
  New-Item -ItemType Directory -Force -Path (Join-Path $deployDir 'lib') | Out-Null
  Copy-Item (Join-Path $libDir '*') (Join-Path $deployDir 'lib') -Recurse -Force
  foreach ($f in @('dsh.plugin.json', 'package.json', 'cordis.patch.yml')) {
    $s = Join-Path $srcDir $f
    if (Test-Path $s) { Copy-Item $s $deployDir -Force }
  }
  Ok '  copied.'
} else {
  Write-Host "  (WhatIf) will copy lib/* + manifests into $deployDir"
}

Step '[3/4] register bundle in profile package.json ...'
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$changed = $false
if (-not $pkg.dsh -or -not $pkg.dsh.profile) { throw 'profile package.json has no dsh.profile section - unsupported layout' }
$bundles = @($pkg.dsh.profile.bundles)
if (-not $bundles) { $bundles = @() }
if ($bundles -notcontains 'skill-hub') {
  if (-not $WhatIf) { $pkg.dsh.profile.bundles = $bundles + 'skill-hub'; $changed = $true }
  Write-Host '  + dsh.profile.bundles <- skill-hub'
} else {
  Write-Host '  = dsh.profile.bundles already contains skill-hub'
}
$deps = $pkg.dependencies
if (-not $deps) { $deps = New-Object PSObject } # empty object fallback
if (-not ($deps.PSObject.Properties['skill-hub'])) {
  if (-not $WhatIf) { $deps | Add-Member -NotePropertyName 'skill-hub' -NotePropertyValue '*'; $pkg.dependencies = $deps; $changed = $true }
  Write-Host '  + dependencies <- "skill-hub": "*"'
} else {
  Write-Host '  = dependencies already lists skill-hub'
}
if ($changed -and -not $WhatIf) {
  Copy-Item $pkgPath "$pkgPath.bak" -Force   # keep one backup before first write
  $pkg | ConvertTo-Json -Depth 64 | Set-Content $pkgPath -Encoding UTF8
  Ok '  manifest updated (backup written alongside: package.json.bak).'
}

if ($Restart) {
  Step '[4/4] restart dsh web ...'
  if (-not $WhatIf) {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
      $conns | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
        $procPath = try { (Get-Process -Id $_).Path } catch { '' }
        if ($procPath -and $procPath -notmatch 'node|dsh') {
          Warn "  port $Port is owned by PID $_ ($procPath) which does not look like dsh - NOT killing it."
        } else {
          Write-Host "  stop dsh process $_"
          Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        }
      }
      Start-Sleep -Seconds 1
    }
    $wd = if ($WorkDir) { $WorkDir } else { (Get-Location).Path }
    $npx = 'npx.cmd'
    $logOut = Join-Path $wd 'dsh_install.out.log'
    $logErr = Join-Path $wd 'dsh_install.err.log'
    $p = Start-Process -FilePath $npx -ArgumentList '--no-install', '@deepseek-ai/dsh', 'web' -WorkingDirectory $wd -RedirectStandardOutput $logOut -RedirectStandardError $logErr -WindowStyle Hidden -PassThru
    Write-Host "  started dsh web (PID $($p.Id), workdir $wd)"
    Start-Sleep -Seconds 3
  } else {
    Write-Host '  (WhatIf) will stop the dsh listener and restart via npx.'
  }
} else {
  Step '[4/4] restart skipped (use -Restart, or start dsh web yourself).'
}

Step 'verify /api/skill-hub/list ...'
if (-not $WhatIf) {
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/skill-hub/list" -TimeoutSec 10
    $sum = 0
    foreach ($g in $r.groups) { $sum += $g.skills.Count }
    Ok "OK: $($r.groups.Count) groups, $sum skills total"
    Warn '  (hard-refresh the browser with Ctrl+Shift+R to see the button)'
  } catch {
    Warn "verify failed: $_"
    Warn '  - if dsh was not running: start it, then re-run this script without -WhatIf to verify.'
    Warn '  - if it was already running: it must be RESTARTED once to load the newly registered bundle.'
  }
}

Ok 'done.'
