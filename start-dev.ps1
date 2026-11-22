param($Port=5173)
Write-Host "Starting Aruba VTT Frontend on port $Port" -ForegroundColor Green
Write-Host "Vite dev server starting..." -ForegroundColor Cyan
& npm run dev