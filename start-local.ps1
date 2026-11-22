$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$stateDir = Join-Path $root '.local'
$logDir = Join-Path $stateDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Stop-RecordedProcess([string]$name) {
  $pidFile = Join-Path $stateDir "$name.pid"
  if (Test-Path $pidFile) {
    $recordedPid = [int](Get-Content $pidFile -Raw)
    $process = Get-Process -Id $recordedPid -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -in @('node','powershell','npm','cmd')) {
      Stop-Process -Id $recordedPid -Force
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  }
}

Stop-RecordedProcess 'api'
Stop-RecordedProcess 'frontend'

$database = docker inspect -f '{{.State.Running}}' hg-aruba-migration-pg 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Container hg-aruba-migration-pg non trovato' }
if ($database -ne 'true') { docker start hg-aruba-migration-pg | Out-Null }

$apiLog = Join-Path $logDir 'api.log'
$apiErr = Join-Path $logDir 'api-error.log'
$frontendLog = Join-Path $logDir 'frontend.log'
$frontendErr = Join-Path $logDir 'frontend-error.log'
Remove-Item $apiLog,$apiErr,$frontendLog,$frontendErr -Force -ErrorAction SilentlyContinue

. (Join-Path $root 'apps\aruba-api\start-local.ps1') -ConfigureOnly
$api = Start-Process node.exe -ArgumentList @('src/index.mjs') `
  -WorkingDirectory (Join-Path $root 'apps\aruba-api') `
  -RedirectStandardOutput $apiLog -RedirectStandardError $apiErr -PassThru
$api.Id | Set-Content (Join-Path $stateDir 'api.pid') -NoNewline

$ready = $false
for ($i=0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  $response = & curl.exe -s --max-time 2 'http://localhost:3000/ready' 2>$null
  if ($response -match '"database":"ready"') { $ready = $true; break }
  if ($api.HasExited) { break }
}
if (-not $ready) {
  $details = (Get-Content $apiErr,$apiLog -ErrorAction SilentlyContinue | Select-Object -Last 20) -join [Environment]::NewLine
  throw "API non pronta.`n$details"
}

$env:HG_LOCAL_HTTPS = '1'
$frontend = Start-Process npm.cmd -ArgumentList @('run','dev') `
  -WorkingDirectory (Join-Path $root 'apps\aruba-vtt-pilot') `
  -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendErr -PassThru
$frontend.Id | Set-Content (Join-Path $stateDir 'frontend.pid') -NoNewline

$webReady = $false
for ($i=0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  & curl.exe -k -s -o NUL -w '%{http_code}' 'https://localhost:5173/' 2>$null | ForEach-Object {
    if ($_ -eq '200') { $webReady = $true }
  }
  if ($webReady -or $frontend.HasExited) { break }
}
if (-not $webReady) {
  $details = (Get-Content $frontendErr,$frontendLog -ErrorAction SilentlyContinue | Select-Object -Last 20) -join [Environment]::NewLine
  throw "Frontend non pronto.`n$details"
}

Write-Host 'Hollowgate locale avviato correttamente.' -ForegroundColor Green
Write-Host 'Frontend: https://localhost:5173/'
Write-Host 'API:      http://localhost:3000/ready'
Write-Host "Log:      $logDir"
