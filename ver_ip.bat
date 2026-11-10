@echo off
title Direccion IP de esta computadora
echo Direcciones IP de esta computadora:
echo.
ipconfig | findstr /i "IPv4"
echo.
echo En el celular - conectado al MISMO WiFi - abre el navegador y escribe:
echo      http://LA_DIRECCION_DE_ARRIBA:3000
echo Ejemplo:  http://192.168.1.50:3000
echo.
pause
