@echo off
title Programar respaldo diario
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  echo [X] Ejecuta este archivo como ADMINISTRADOR:
  echo     clic derecho sobre el archivo - Ejecutar como administrador
  pause
  exit /b 1
)
schtasks /Create /TN "LicoreriaPOS_Respaldo" /TR "\"%~dp0hacer_respaldo.bat\" auto" /SC DAILY /ST 23:30 /RU SYSTEM /RL HIGHEST /F
if errorlevel 1 (
  echo [X] No se pudo crear la tarea programada.
) else (
  echo.
  echo [OK] Listo: todos los dias a las 11:30 pm se hara un respaldo automatico.
  echo      Se guardan en la carpeta "respaldos". Configura BACKUP_COPY_DIR en backend\.env
  echo      para guardar tambien una copia en un USB o carpeta de Drive.
)
echo.
pause
