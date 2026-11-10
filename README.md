# 🍾 ERP Licorería POS — versión 2.0

Sistema de **punto de venta, caja, mesas, inventario y fiados** para licorerías y bares.
Corre en **una computadora del local** y se usa desde **laptop o celular** conectados al mismo WiFi.

## Qué incluye
- 🛒 **Punto de venta** con pago en Efectivo, Yape, Plin, Tarjeta o **Mixto** (el vuelto se descuenta del efectivo y la caja cuadra).
- 💰 **Control de caja**: apertura, gastos/ingresos, arqueo en vivo y cierre con descuadre.
- 🪑 **Mesas y cuentas**: agregar consumo, **quitar productos y anular cuentas con motivo** (devuelve el stock y queda registrado), cobrar.
- 💳 **Fiados**: cuentas a crédito, deuda por cliente y abonos.
- 📦 **Inventario** con alertas de stock mínimo, compras a proveedores y ajustes.
- 📊 **Reportes** por fechas y 🛡️ **Auditoría**: quién hizo qué (anulaciones, precios, ajustes…).
- 💾 **Respaldos** automáticos diarios de la base de datos.
- 🔐 **Seguridad**: contraseñas cifradas, sesiones con token, permisos por rol validados en el servidor.

## Instalación en 5 pasos (detalle en `INSTALACION_CLIENTE.md`)
1. Instalar **XAMPP** (MySQL) y **Node.js LTS**.
2. Copiar esta carpeta al disco (ej. `C:\LicoreriaPOS`).
3. En phpMyAdmin → **Importar** → `database/licoreria_db_limpia.sql`.
4. Doble clic en `instalar.bat` y luego en `iniciar_sistema.bat`.
5. Abrir `http://localhost:3000` — usuario **admin**, clave **admin123** *(cámbiala al entrar)*.

Desde el celular (mismo WiFi): `http://IP-DE-LA-PC:3000` — usa `ver_ip.bat` para ver la IP.

## Carpetas
```
backend/            Servidor (Node.js + Express)
  index.js          Todas las rutas de la API
  db.js             Conexión a MySQL (pool)
  lib/              Seguridad, transacciones, validaciones, migraciones, respaldos
  scripts/          Herramientas: respaldo, cambiar clave, probar conexión, librerías offline
  tests/            Pruebas automáticas (solo desarrollo)
  .env.example      Plantilla de configuración  ->  copiar como .env
frontend/           Pantallas (HTML + Bootstrap)
database/           licoreria_db_limpia.sql (instalación nueva) y crear_usuario_mysql.sql
*.bat               Instalar, iniciar, respaldos, firewall, ver IP (Windows)
```

## Permisos por rol
| Acción | Administrador | Cajero / Vendedor |
|---|:--:|:--:|
| Abrir y cerrar caja, gastos e ingresos | ✔ | ✔ |
| Punto de venta | ✔ | ✔ |
| Mesas: abrir, agregar, cobrar | ✔ | ✔ |
| Mesas: quitar producto / anular cuenta (con motivo, queda en auditoría) | ✔ | ✔ |
| Ver inventario (el **costo** solo lo ve el admin) | ✔ | ✔ (sin costos) |
| Pasar a fiado, cobrar abonos, ver deudores | ✔ | ✘ |
| Crear/editar productos, compras, ajustes de inventario | ✔ | ✘ |
| Reportes, auditoría, respaldos | ✔ | ✘ |
| Usuarios, clientes, categorías, proveedores | ✔ | ✘ |

> Los permisos se validan **en el servidor** (no solo se ocultan botones). Para cambiar qué puede hacer un rol, busca `soloAdmin` en `backend/index.js`.

## Configuración (`backend/.env`)
Se crea sola con `instalar.bat`. Lo más importante:
| Variable | Para qué sirve |
|---|---|
| `DB_USER` / `DB_PASSWORD` | Usuario de MySQL (recomendado: uno propio, ver `database/crear_usuario_mysql.sql`) |
| `PERMITIR_VENTA_SIN_STOCK` | `false` = no deja vender sin stock. `true` = permite (útil los primeros días) |
| `JWT_EXPIRES` | Duración de la sesión (por defecto 14 h) |
| `BACKUP_COPY_DIR` | Segunda copia del respaldo, ej. un USB: `E:\Respaldos` |
| `TRUST_PROXY` | `true` solo si lo publicas detrás de Cloudflare/Nginx |

## Herramientas de soporte
Se ejecutan dentro de la carpeta `backend`:
```
node scripts/probar_conexion.js                    Diagnostica MySQL y las tablas
node scripts/cambiar_password.js admin "ClaveNueva1"   Cuando el cliente olvida su clave
node scripts/respaldo.js                           Respaldo manual (o hacer_respaldo.bat)
node scripts/descargar_librerias.js                Hace que funcione SIN internet (una sola vez)
npm test                                           Pruebas automáticas (Node 22+)
```
Los registros del servidor quedan en `backend/logs/`. Los respaldos, en `respaldos/`.

## Usarlo con dominio en el futuro
Hoy el sistema funciona **solo dentro del local** (más seguro). Si el cliente quiere entrar desde su casa:
1. **Tailscale** (VPN privada): el dueño instala la app en la PC y en su celular y entra con la IP de Tailscale. Sin dominio, sin abrir puertos. Lo más simple.
2. **Cloudflare Tunnel + dominio propio** (ej. `pos.minegocio.com`): HTTPS gratis y sin abrir puertos del router. Pasos:
   instalar `cloudflared` → `cloudflared tunnel login` → `cloudflared tunnel create licoreria` →
   `cloudflared tunnel route dns licoreria pos.minegocio.com` → apuntar el túnel a `http://localhost:3000` →
   instalar como servicio, y poner `TRUST_PROXY=true` en `.env`. (Sigue la guía oficial de Cloudflare vigente.)

**Antes de publicarlo en internet:** cambia TODAS las claves por claves fuertes, prueba un respaldo y su restauración, y usa siempre HTTPS. Nunca abras el puerto 3000 directo en el router.

## Restaurar un respaldo
phpMyAdmin → base `licoreria_db` → **Importar** → elegir el archivo `respaldo_AAAA-MM-DD_HHMM.sql`.
(Para empezar de cero: borra la base, créala vacía e importa el respaldo.)
