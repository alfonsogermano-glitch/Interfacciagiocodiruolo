$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
. (Join-Path $root 'start-hollowgate-local.ps1') -CheckOnly
$email = Read-Host 'Email già presente nella copia locale (non comunicarla in chat)'
$secure = Read-Host 'Password DI TEST (12+ caratteri, non usare quella di Aruba)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  @{ email = $email; password = $plain } | ConvertTo-Json -Compress |
    node (Join-Path $root 'apps\aruba-api\create-local-login.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Login di test non creato.' }
} finally {
  $plain = $null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
