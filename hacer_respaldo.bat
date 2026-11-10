@echo off
title Respaldo - ERP Licoreria POS
cd /d "%~dp0backend"
node scripts\respaldo.js
if errorlevel 1 (
  echo.
  echo [X] El respaldo FALLO. Revisa el mensaje de arriba.
) else (
  echo.
  echo [OK] Respaldo terminado.
)
if /i not "%~1"=="auto" pause
