param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$api = Join-Path $root 'apps\aruba-api'
$vtt = Join-Path $root 'apps\aruba-vtt-pilot'

foreach ($path in @('certs\local\localhost-key.pem','certs\local\localhost-cert.pem',
  'apps\aruba-api\password.txt','apps\aruba-api\hmac.key')) {
  if (-not (Test-Path (Join-Path $root $path))) {
    throw "Prerequisito locale mancante: $path. Nessuna connessione a produzione consentita."
  }
}
if (-not (Test-Path (Join-Path $vtt 'node_modules\vite'))) {
  throw 'Dipendenze VTT assenti: eseguire npm ci in apps/aruba-vtt-pilot.'
}
try {
  $running = @(docker ps --filter 'name=^/hg-notes-real-pg$' --format '{{.Names}}' 2>$null)
} catch { throw 'Docker Desktop non disponibile. Avvialo prima di procedere.' }
if ($LASTEXITCODE -ne 0 -or $running -notcontains 'hg-notes-real-pg') {
  throw 'PostgreSQL di test hg-notes-real-pg non attivo. Non usare il database Aruba di produzione.'
}
$ports = @(docker port hg-notes-real-pg 5432/tcp 2>$null)
$portMatch = if ($ports.Count -eq 1) {
  [regex]::Match($ports[0], '^127\.0\.0\.1:(15432|15433)$')
}
if ($LASTEXITCODE -ne 0 -or $ports.Count -ne 1 -or -not $portMatch.Success) {
  throw 'Il database di test deve essere esposto SOLO su 127.0.0.1:15432 oppure :15433.'
}
$localPort = $portMatch.Groups[1].Value
if ($CheckOnly) { Write-Host 'Prerequisiti locali verificati.'; return }

# The existing API launcher pins the disposable DB, restricted user and
# disables signup/reset email, live game sessions and TURN.
Start-Process powershell.exe -WorkingDirectory $api -ArgumentList @(
  '-NoExit','-NoProfile','-File',(Join-Path $api 'start-local.ps1'),'-LocalPort',$localPort)
Start-Process powershell.exe -WorkingDirectory $vtt -ArgumentList @(
  '-NoExit','-NoProfile','-Command',
  '$env:HG_LOCAL_FULL="1"; $env:HG_LOCAL_HTTPS="1"; npm run dev')
Write-Host 'Ambiente locale avviato: https://localhost:5173/'
Write-Host 'VTT: https://localhost:5173/vtt/'
Write-Host 'Solo test: nessuna email e nessuna connessione al database di produzione.'
