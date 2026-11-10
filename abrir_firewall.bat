@echo off
title Permitir acceso desde celulares
net session >nul 2>&1
if errorlevel 1 (
  echo [X] Ejecuta este archivo como ADMINISTRADOR:
  echo     clic derecho sobre el archivo - Ejecutar como administrador
  pause
  exit /b 1
)
netsh advfirewall firewall delete rule name="LicoreriaPOS puerto 3000" >nul 2>&1
netsh advfirewall firewall add rule name="LicoreriaPOS puerto 3000" dir=in action=allow protocol=TCP localport=3000 profile=private,domain
echo.
echo [OK] Los celulares y otras computadoras de la MISMA red WiFi ya pueden entrar.
echo      Si no entran: en Windows, abre la configuracion de la red WiFi y marcala como
echo      "Red privada" - no "Red publica" -.
echo.
pause
