@echo off
setlocal
cd /d "%~dp0"
title HOLLOWGATE - TUNNEL HTTPS
set "CLOUDFLARED="
if exist "%~dp0cloudflared.exe" set "CLOUDFLARED=%~dp0cloudflared.exe"
if not defined CLOUDFLARED if exist "%~dp0cloudflared-windows-amd64.exe" set "CLOUDFLARED=%~dp0cloudflared-windows-amd64.exe"
if not defined CLOUDFLARED (
 where cloudflared >nul 2>nul
 if not errorlevel 1 set "CLOUDFLARED=cloudflared"
)
if not defined CLOUDFLARED (
 echo ERRORE: cloudflared non trovato.
 echo Metti cloudflared-windows-amd64.exe nella stessa cartella di questo file.
 echo Non occorre installarlo o rinominarlo.
 pause
 exit /b 1
)
echo HOLLOWGATE - Cloudflare Quick Tunnel DEMO
echo Avvia prima AVVIA_HOST.cmd e lascia aperte entrambe le finestre.
echo Cerca l'indirizzo https://...trycloudflare.com nell'output qui sotto.
"%CLOUDFLARED%" tunnel --url http://127.0.0.1:4177
if errorlevel 1 echo Errore avvio Cloudflare Tunnel: leggi il messaggio sopra.
pause
