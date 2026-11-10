@echo off
setlocal
title Instalador - ERP Licoreria POS
cd /d "%~dp0"
echo ==================================================
echo   INSTALADOR - ERP LICORERIA POS
echo ==================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] No se encontro Node.js en esta computadora.
  echo     Descargalo e instalalo desde https://nodejs.org  - version LTS -
  echo     y despues vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set NODEV=%%v
echo [OK] Node.js %NODEV% encontrado.

cd backend

if not exist node_modules\express\package.json (
  echo.
  echo Instalando dependencias - necesita internet, solo la primera vez...
  call npm install --omit=dev
  if errorlevel 1 (
    echo [X] Fallo la instalacion de dependencias. Revisa el internet.
    pause
    exit /b 1
  )
) else (
  echo [OK] Dependencias ya instaladas.
)

if not exist .env (
  copy /y .env.example .env >nul
  echo [OK] Se creo el archivo de configuracion backend\.env
) else (
  echo [OK] Ya existe backend\.env - no se modifica.
)

echo.
echo Probando la conexion con la base de datos...
echo --------------------------------------------------
call node scripts\probar_conexion.js
echo --------------------------------------------------
echo.
echo ==================================================
echo   SIGUIENTES PASOS
echo    1. En XAMPP enciende MySQL: boton Start.
echo    2. En phpMyAdmin importa  database\licoreria_db_limpia.sql
echo    3. Ejecuta  iniciar_sistema.bat
echo    4. Abre en el navegador:  http://localhost:3000
echo       Usuario: admin      Clave: admin123
echo       - Cambia esa clave apenas entres -
echo ==================================================
echo.
pause
