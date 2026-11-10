@echo off
title Programar inicio automatico
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  echo [X] Ejecuta este archivo como ADMINISTRADOR:
  echo     clic derecho sobre el archivo - Ejecutar como administrador
  pause
  exit /b 1
)
schtasks /Create /TN "LicoreriaPOS_Servidor" /TR "\"%~dp0iniciar_sistema.bat\"" /SC ONSTART /RU SYSTEM /RL HIGHEST /F
if errorlevel 1 (
  echo [X] No se pudo crear la tarea programada.
) else (
  echo.
  echo [OK] Listo: el sistema se enciende solo cuando prendas esta computadora.
  echo      IMPORTANTE: en XAMPP, instala MySQL como servicio - casilla Svc - para que
  echo      tambien se encienda solo. El sistema espera a MySQL hasta 90 segundos.
)
echo.
pause
