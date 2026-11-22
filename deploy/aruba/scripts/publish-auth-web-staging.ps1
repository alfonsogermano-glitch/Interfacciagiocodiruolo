<#
Publish selected authentication-page files to the isolated staging web root.
Run from PowerShell on the PC. Nothing in this script targets production.
Example: .\deploy\aruba\scripts\publish-auth-web-staging.ps1 -Files styles.css -Publish
#>
param(
  [ValidateSet('index.trial.html', 'styles.css', 'app.mjs', 'flow.mjs')]
  [string[]]$Files = @('styles.css'),
  [switch]$Publish
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$web = Join-Path $root 'apps\aruba-auth-web'
$key = Join-Path $env:USERPROFILE '.ssh\hollowgate_aruba'
$remote = 'hgadmin@212.237.9.78'
$run = 'hg-web-' + [guid]::NewGuid().ToString('N')
$stage = Join-Path (Join-Path $env:LOCALAPPDATA 'Temp\opencode') $run
$mode = if ($Publish) { 'publish' } else { 'preview' }
$Files = @($Files | Select-Object -Unique)

Push-Location $web
try {
  & node --test test/flow.test.mjs test/deployment.test.mjs
  if ($LASTEXITCODE -ne 0) { throw 'I test web locali non sono passati.' }
} finally { Pop-Location }

New-Item -ItemType Directory -Path $stage -ErrorAction Stop | Out-Null
$manifest = @()
foreach ($file in $Files) {
  $source = Join-Path $web $file
  Copy-Item -LiteralPath $source -Destination (Join-Path $stage $file)
  $hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifest += "$hash  $file"
}
[System.IO.File]::WriteAllText((Join-Path $stage 'SHA256SUMS'),
  (($manifest -join "`n") + "`n"), [System.Text.UTF8Encoding]::new($false))
Write-Host "Staging web: $mode ($($Files -join ', '))"
& scp -r -i $key -o BatchMode=yes -o KexAlgorithms=ecdh-sha2-nistp256 $stage "${remote}:/home/hgadmin/"
if ($LASTEXITCODE -ne 0) { throw 'Upload staging fallito; nessun file web è stato modificato.' }
& ssh -T -i $key -o BatchMode=yes -o KexAlgorithms=ecdh-sha2-nistp256 $remote "sudo -n /usr/local/sbin/hollowgate-publish-auth-web-staging $run $mode $($Files -join ' ')"
if ($LASTEXITCODE -ne 0) { throw 'Controllo o pubblicazione staging falliti: verificare l’output, non ripetere automaticamente.' }
