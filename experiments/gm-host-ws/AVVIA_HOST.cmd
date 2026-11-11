@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js non trovato. Installa Node.js 22 dal sito ufficiale.
 pause
 exit /b 1
)
if not exist "node_modules\ws" (
 echo Installazione dipendenze (solo prima esecuzione)...
 call npm install --ignore-scripts
 if errorlevel 1 (echo Installazione fallita. & pause & exit /b 1)
)
echo HOLLOWGATE GM HOST - DEMO, NON PRODUZIONE
node server.mjs
pause
