@echo off
cd /d "%~dp0"
where cloudflared >nul 2>nul
if errorlevel 1 (
 echo Cloudflared non trovato. Installalo dal sito Cloudflare e verifica che sia nel PATH.
 pause
 exit /b 1
)
echo Avvio tunnel HTTPS verso il PC Game Master...
cloudflared tunnel --url http://127.0.0.1:4177
pause
