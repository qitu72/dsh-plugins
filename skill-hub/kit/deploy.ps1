# skill-hub one-shot deploy / repair script
# Usage (run in PowerShell from the kit folder):
#   pwsh deploy.ps1                 # deploy prebuilt lib only (default, most common)
#   pwsh deploy.ps1 -Build          # rebuild lib first (after editing src)
#   pwsh deploy.ps1 -Restart        # restart dsh web after deploy
#   pwsh deploy.ps1 -Build -Restart # rebuild + deploy + restart + verify
#   pwsh deploy.ps1 -WhatIf         # dry-run, change nothing

$WhatIf  = $false
$Build   = $false
$Restart = $false
foreach ($a in $args) {
  if ($a -eq '-WhatIf')  { $WhatIf  = $true }
  if ($a -eq '-Build')   { $Build   = $true }
  if ($a -eq '-Restart') { $Restart = $true }
}

$ErrorActionPreference = 'Stop'
$root      = Split-Path -Parent $MyInvocation.MyCommand.Definition
$srcDir    = Join-Path $root 'src'
$libDir    = Join-Path $root 'lib'
$deployDir = Join-Path $env:USERPROFILE (Join-Path '.dsh' (Join-Path 'profiles' (Join-Path 'web' (Join-Path 'node_modules' 'skill-hub'))))

function Step([string]$m) { Write-Host $m -ForegroundColor Cyan }
function Ok([string]$m)   { Write-Host $m -ForegroundColor Green }

# Prepend local workbuddy node/npx to PATH (Chinese username paths MUST use $env:USERPROFILE)
$nodeVer = '22.22.2'
$nodeBin = Join-Path $env:USERPROFILE (".workbuddy\binaries\node\versions\$nodeVer")
if (Test-Path $nodeBin) { $env:PATH = "$nodeBin;" + $env:PATH }

if ($WhatIf) { Write-Host '[WhatIf] dry-run, nothing will be changed.' -ForegroundColor Yellow }

Step '[1/4] validate paths ...'
if (-not (Test-Path $srcDir)) { throw "missing source dir: $srcDir" }
if (-not (Test-Path $libDir)) { throw "missing prebuilt dir: $libDir" }
Write-Host "  kit root  : $root"
Write-Host "  deploy to : $deployDir"

if ($Build) {
  Step '[2/4] build lib (node build.mjs) ...'
  if (-not $WhatIf) {
    Set-Location $root
    & node build.mjs
    if ($LASTEXITCODE -ne 0) { Write-Warning "build.mjs exited $LASTEXITCODE - falling back to prebuilt lib/ (deploy continues)" }
  } else {
    Write-Host '  (WhatIf) will run: node build.mjs'
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
  Step '[4/4] restart dsh web (port 3080) ...'
  if (-not $WhatIf) {
    $port = 3080
    $workDir = Join-Path $env:USERPROFILE 'CodeBuddy\20260814154319'
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
      $conns | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
        Write-Host "  stop process $_"
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
      }
      Start-Sleep -Seconds 1
    }
    $npxExe = Join-Path $nodeBin 'npx.cmd'
    if (-not (Test-Path $npxExe)) { $npxExe = 'npx.cmd' }
    $logOut = Join-Path $workDir 'dsh_deploy.out.log'
    $logErr = Join-Path $workDir 'dsh_deploy.err.log'
    $p = Start-Process -FilePath $npxExe -ArgumentList '--no-install', '@deepseek-ai/dsh', 'web' -WorkingDirectory $workDir -RedirectStandardOutput $logOut -RedirectStandardError $logErr -WindowStyle Hidden -PassThru
    Write-Host "  started dsh web (PID $($p.Id))"
    Start-Sleep -Seconds 3
  } else {
    Write-Host '  (WhatIf) will kill the listening process and restart dsh web via npx.'
  }
}

Step 'verify /api/skill-hub/list ...'
if (-not $WhatIf) {
  try {
    $port = 3080
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/skill-hub/list" -TimeoutSec 10
    $sum = 0
    foreach ($g in $r.groups) { $sum += $g.skills.Count }
    Ok "OK: $($r.groups.Count) groups, $sum skills total"
    Write-Host '  (hard-refresh the browser with Ctrl+Shift+R to take effect)' -ForegroundColor Yellow
  } catch {
    Write-Warning "verify failed: $_  -- service may still be starting, or path/port is wrong."
  }
}

Ok 'done.'
