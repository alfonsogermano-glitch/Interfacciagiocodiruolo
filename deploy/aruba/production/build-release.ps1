param(
  [string]$OutputDirectory = '',
  [switch]$SkipBuild
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$releaseRoot=if($OutputDirectory){$OutputDirectory}else{Join-Path $root '.local\release'}
$stage=Join-Path $releaseRoot 'hollowgate-aruba-production'
$archive=Join-Path $releaseRoot 'hollowgate-aruba-production.zip'
$linuxArchive=Join-Path $releaseRoot 'hollowgate-aruba-production.tar.gz'
if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
New-Item -ItemType Directory -Force -Path $stage | Out-Null

if(-not $SkipBuild){
  Push-Location (Join-Path $root 'apps\aruba-vtt-pilot')
  try{npm run build;if($LASTEXITCODE -ne 0){throw 'Frontend build failed'}}finally{Pop-Location}
}

function Copy-Tree([string]$source,[string]$destination){
  New-Item -ItemType Directory -Force -Path $destination|Out-Null
  Copy-Item (Join-Path $source '*') $destination -Recurse -Force
}

Copy-Tree (Join-Path $root 'deploy\aruba\dist\vtt-pilot') (Join-Path $stage 'web')
Copy-Tree (Join-Path $root 'apps\aruba-api\src') (Join-Path $stage 'apps\aruba-api\src')
Copy-Item (Join-Path $root 'apps\aruba-api\package.json'),(Join-Path $root 'apps\aruba-api\package-lock.json'),(Join-Path $root 'apps\aruba-api\Dockerfile') (Join-Path $stage 'apps\aruba-api')
Copy-Tree (Join-Path $root 'deploy\aruba\sql') (Join-Path $stage 'database\sql')
Get-ChildItem (Join-Path $stage 'database\sql') -Recurse -File -Filter 'test_*.sql'|Remove-Item -Force
# Local CI helper contains a known placeholder password and grants permissions
# broader than the production runtime role. It must never ship.
Remove-Item (Join-Path $stage 'database\sql\setup-app-user.sql') -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $root 'deploy\aruba\data\supabase-export.json'),(Join-Path $root 'deploy\aruba\data\profile-id-mapping.json') (New-Item -ItemType Directory -Force -Path (Join-Path $stage 'migration\data'))
Copy-Tree (Join-Path $root 'deploy\aruba\data\binary-assets') (Join-Path $stage 'migration\data\binary-assets')
Copy-Item (Join-Path $root 'deploy\aruba\scripts\migrate-to-aruba-schema.mjs'),(Join-Path $root 'deploy\aruba\scripts\verify-migration.mjs') (New-Item -ItemType Directory -Force -Path (Join-Path $stage 'migration\scripts'))
Copy-Item (Join-Path $PSScriptRoot 'compose.production.yaml'),(Join-Path $PSScriptRoot 'production.env.example'),(Join-Path $PSScriptRoot 'Caddyfile.production'),(Join-Path $PSScriptRoot 'README.md') $stage
Copy-Item (Join-Path $PSScriptRoot 'install-private.sh'),(Join-Path $PSScriptRoot 'run-private-install-root.sh'),(Join-Path $PSScriptRoot 'resume-private-api-root.sh'),(Join-Path $PSScriptRoot 'publish-private-port-root.sh') $stage

$forbidden=Get-ChildItem $stage -Recurse -File|Where-Object{$_.Name -match '(?i)(password\.txt|\.key$|\.pem$|^\.env$|authenticated-test-account)'}
if($forbidden){throw "Forbidden secret-like files in release: $($forbidden.FullName -join ', ')"}
$unsafe=Get-ChildItem $stage -Recurse -File|Select-String -Pattern 'ci-only-password','service_role' -SimpleMatch
if($unsafe){throw "Unsafe credential marker in release: $(($unsafe.Path|Sort-Object -Unique) -join ', ')"}
$manifest=Get-ChildItem $stage -Recurse -File|Sort-Object FullName|ForEach-Object{
  $relative=$_.FullName.Substring($stage.Length+1).Replace('\','/')
  "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower())  $relative"
}
$manifest|Set-Content (Join-Path $stage 'SHA256SUMS') -Encoding ascii
if(Test-Path $archive){Remove-Item $archive -Force}
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $archive -CompressionLevel Optimal
Get-FileHash $archive -Algorithm SHA256|ForEach-Object{"$($_.Hash.ToLower())  $([IO.Path]::GetFileName($archive))"}|Set-Content "$archive.sha256" -Encoding ascii
if(Test-Path $linuxArchive){Remove-Item $linuxArchive -Force}
& tar.exe -czf $linuxArchive -C $releaseRoot 'hollowgate-aruba-production'
if($LASTEXITCODE -ne 0){throw 'Linux tar archive creation failed'}
Get-FileHash $linuxArchive -Algorithm SHA256|ForEach-Object{"$($_.Hash.ToLower())  $([IO.Path]::GetFileName($linuxArchive))"}|Set-Content "$linuxArchive.sha256" -Encoding ascii
Write-Host $linuxArchive
