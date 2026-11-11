@echo off
setlocal
cd /d "%~dp0"
title HOLLOWGATE - GM HOST
echo ==============================================
echo HOLLOWGATE GM HOST - AVVIO WINDOWS
echo ==============================================
where node >nul 2>nul
if errorlevel 1 goto NO_NODE
if exist "node_modules\ws" goto START_HOST
echo Installazione libreria WebSocket...
call npm install --ignore-scripts --no-audit --no-fund
if errorlevel 1 goto INSTALL_FAILED
:START_HOST
echo.
echo Avvio server Hollowgate sulla porta 4177...
echo Tieni aperta questa finestra.
node server.mjs
echo.
echo Il server Hollowgate si e' arrestato.
pause
exit /b 0
:NO_NODE
echo.
echo ERRORE: Node.js non trovato.
echo Installa Node.js 22 LTS dal sito https://nodejs.org/
echo Riavvia poi questa finestra.
pause
exit /b 1
:INSTALL_FAILED
echo.
echo ERRORE: installazione delle dipendenze fallita.
echo Controlla la connessione Internet e il messaggio qui sopra.
pause
exit /b 1
