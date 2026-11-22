# Start Aruba VTT locally
Write-Host "Starting Aruba VTT Local Environment" -ForegroundColor Green

# Check Docker PostgreSQL
$pg = docker ps --filter "name=hg-notes-real-pg" --format "{{.Names}}"
if ($pg -ne "hg-notes-real-pg") {
    Write-Host "ERROR: PostgreSQL container not running!" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] PostgreSQL container running" -ForegroundColor Green

# Start API
Write-Host "Starting API server..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @("-NoExit", "-Command", "cd apps/aruba-api; `$env:PGHOST='127.0.0.1'; `$env:PGPORT='15432'; `$env:PGUSER='hollowgate_auth_app'; `$env:PGDATABASE='hollowgate_auth_test'; `$env:POSTGRES_PASSWORD_FILE='./password.txt'; `$env:PORT='3000'; `$env:AUTH_STAGING_ENABLED='true'; `$env:AUTH_ORIGIN='https://localhost:5173'; `$env:AUTH_RATE_LIMIT_KEY_FILE='./hmac.key'; `$env:RESEND_API_KEY_FILE='./resend.key'; `$env:AUTH_VTT_CAMPAIGNS_ENABLED='true'; `$env:AUTH_VTT_CHARACTERS_ENABLED='true'; `$env:AUTH_VTT_CHAPTERS_ENABLED='true'; `$env:AUTH_VTT_SCENES_ENABLED='true'; `$env:AUTH_VTT_NARRATIVE_CONTENT_ENABLED='true'; `$env:AUTH_VTT_CAMPAIGN_CHAT_ENABLED='true'; `$env:AUTH_VTT_CAMPAIGN_ROSTER_ENABLED='true'; `$env:AUTH_VTT_CHARACTER_AVAILABILITY_ENABLED='true'; `$env:AUTH_VTT_CHARACTER_ASSIGNMENTS_ENABLED='true'; `$env:AUTH_VTT_PLAYER_CHARACTERS_ENABLED='true'; `$env:AUTH_VTT_CHARACTER_PORTRAITS_ENABLED='true'; `$env:AUTH_VTT_ENTITY_NOTES_ENABLED='true'; `$env:AUTH_VTT_CAMPAIGN_NOTES_ENABLED='true'; `$env:AUTH_VTT_CAMPAIGN_NOTE_FOLDERS_ENABLED='true'; `$env:AUTH_VTT_ORIGINAL_NOTES_PANEL_ENABLED='true'; node src/index.mjs") -WorkingDirectory $PWD

Start-Sleep -Seconds 3

# Start Frontend
Write-Host "Starting Frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @("-NoExit", "-Command", "cd apps/aruba-vtt-pilot; npm run dev") -WorkingDirectory $PWD

Write-Host ""
Write-Host "Aruba VTT Started!" -ForegroundColor Green
Write-Host "API:      http://localhost:3000" -ForegroundColor Yellow
Write-Host "Frontend: https://localhost:5173/vtt/" -ForegroundColor Yellow
