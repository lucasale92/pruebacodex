@echo off
cd /d "%~dp0"
echo Iniciando bot desde la carpeta del proyecto...
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js en PATH. Cerra y abri la terminal despues de instalarlo.
  pause
  exit /b 1
)
node --version
node index.js
echo El proceso del bot termino.
pause
