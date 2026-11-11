$ErrorActionPreference = 'Stop'
$version = '2026.10.7'
$expected = '2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343'
$target = Join-Path $PSScriptRoot '..\desktop\bin\cloudflared-windows-amd64.exe'
$url = "https://github.com/cloudflare/cloudflared/releases/download/$version/cloudflared-windows-amd64.exe"
New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
Invoke-WebRequest -Uri $url -OutFile $target
$actual = (Get-FileHash -Algorithm SHA256 $target).Hash.ToLowerInvariant()
if ($actual -ne $expected) { Remove-Item $target -Force; throw "cloudflared SHA256 mismatch: $actual" }
Write-Host 'Cloudflared verificato tramite checksum ufficiale.'
