# skill-hub one-shot deploy / repair script (owner machine)
# Usage (run in PowerShell from the kit folder):
#   pwsh deploy.ps1                 # deploy prebuilt lib only (default, most common)
#   pwsh deploy.ps1 -Build          # rebuild lib first (after editing src)
#   pwsh deploy.ps1 -Restart        # restart dsh web after deploy
#   pwsh deploy.ps1 -Build -Restart # rebuild + deploy + restart + verify
#   pwsh deploy.ps1 -WhatIf         # dry-run, change nothing
#   pwsh deploy.ps1 -Port 3080 -WorkDir "C:\your\dsh-project"   # overrides
# Note: for a FRESH machine (other users) use install.ps1 instead - it also
# registers the bundle into the profile, which deploy.ps1 assumes is done.

param(
  [switch]$WhatIf,
  [switch]$Build,
  [switch]$Restart,
  [int]$Port = 3080,
  [string]$WorkDir = ''
)

$ErrorActionPreference = 'Stop'
$root      = Split-Path -Parent $MyInvocation.MyCommand.Definition
$srcDir    = Join-Path $root 'src'
$libDir    = Join-Path $root 'lib'
$deployDir = Join-Path $env:USERPROFILE (Join-Path '.dsh' (Join-Path 'profiles' (Join-Path 'web' (Join-Path 'node_modules' 'skill-hub'))))

function Step([string]$m) { Write-Host $m -ForegroundColor Cyan }
function Ok([string]$m)   { Write-Host $m -ForegroundColor Green }

# Prepend a local node/npx to PATH when PATH lacks one (Chinese username paths
# MUST use $env:USERPROFILE). Owner-machine accelerator only: checks are
# guarded, so on any other machine this is a no-op and the system node is used.
$nodeBin = $null
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $wbRoot = Join-Path $env:USERPROFILE '.workbuddy\binaries\node\versions'
  if (Test-Path $wbRoot) {
    $latest = Get-ChildItem $wbRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1
    if ($latest) { $nodeBin = $latest.FullName }
  }
  if ($nodeBin) { $env:PATH = "$nodeBin;" + $env:PATH }
}

if ($WhatIf) { Write-Host '[WhatIf] dry-run, nothing will be changed.' -ForegroundColor Yellow }

Step '[1/4] validate paths ...'
if (-not (Test-Path $srcDir)) { throw "missing source dir: $srcDir" }
if (-not (Test-Path $libDir)) { throw "missing prebuilt dir: $libDir" }
Write-Host "  kit root  : $root"
Write-Host "  deploy to : $deployDir"

if ($Build) {
  Step '[2/4] build lib (node src\build.mjs) ...'
  if (-not $WhatIf) {
    & node (Join-Path $srcDir 'build.mjs')
    if ($LASTEXITCODE -ne 0) { Write-Warning "build.mjs exited $LASTEXITCODE - falling back to prebuilt lib/ (deploy continues)" }
  } else {
    Write-Host '  (WhatIf) will run: node src\build.mjs'
  }
}

Step '[3/4] deploy ...'
if (-not $WhatIf) {
  New-Item -ItemType Directory -Force -Path (Join-Path $deployDir 'lib') | Out-Null
  Copy-Item (Join-Path $libDir '*') (Join-Path $deployDir 'lib') -Recurse -Force
  $manifests = 'dsh.plugin.json', 'package.json', 'cordis.patch.yml'
  foreach ($f in $manifests) {
    $s = Join-Path $srcDir $f
    if (Test-Path $s) { Copy-Item $s $deployDir -Force }
  }
  Ok '  copied lib/ and plugin manifests.'
} else {
  Write-Host '  (WhatIf) will copy lib/* and 3 manifests into node_modules/skill-hub.'
}

if ($Restart) {
  Step "[4/4] restart dsh web (port $Port) ..."
  if (-not $WhatIf) {
    $wd = if ($WorkDir) { $WorkDir } else { (Get-Location).Path }
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
      $conns | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
        $procPath = try { (Get-Process -Id $_).Path } catch { '' }
        if ($procPath -and $procPath -notmatch 'node|dsh') {
          Write-Warning "  port $Port is owned by PID $_ ($procPath) which does not look like dsh - NOT killing it."
        } else {
          Write-Host "  stop process $_"
          Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        }
      }
      Start-Sleep -Seconds 1
    }
    $npxExe = Join-Path $nodeBin 'npx.cmd'
    if (-not (Test-Path $npxExe)) { $npxExe = 'npx.cmd' }
    $logOut = Join-Path $wd 'dsh_deploy.out.log'
    $logErr = Join-Path $wd 'dsh_deploy.err.log'
    $p = Start-Process -FilePath $npxExe -ArgumentList '--no-install', '@deepseek-ai/dsh', 'web' -WorkingDirectory $wd -RedirectStandardOutput $logOut -RedirectStandardError $logErr -WindowStyle Hidden -PassThru
    Write-Host "  started dsh web (PID $($p.Id), workdir $wd)"
    Start-Sleep -Seconds 3
  } else {
    Write-Host '  (WhatIf) will kill the listening process and restart dsh web via npx.'
  }
}

Step 'verify /api/skill-hub/list ...'
if (-not $WhatIf) {
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/skill-hub/list" -TimeoutSec 10
    $sum = 0
    foreach ($g in $r.groups) { $sum += $g.skills.Count }
    Ok "OK: $($r.groups.Count) groups, $sum skills total"
    Write-Host '  (hard-refresh the browser with Ctrl+Shift+R to take effect)' -ForegroundColor Yellow
  } catch {
    Write-Warning "verify failed: $_  -- service may still be starting, or path/port is wrong."
  }
}

Ok 'done.'
