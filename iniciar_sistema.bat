@echo off
title ERP Licoreria POS - NO CERRAR ESTA VENTANA
cd /d "%~dp0backend"
:inicio
echo [%date% %time%] Iniciando el servidor...
node index.js
echo.
echo [%date% %time%] El servidor se detuvo. Se reinicia en 5 segundos...
echo    - Para apagarlo del todo, cierra esta ventana -
timeout /t 5 /nobreak >nul
goto inicio
