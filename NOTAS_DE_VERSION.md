# Notas de la versión 2.0 — qué cambió y por qué

## 🔴 Problemas críticos que se corrigieron
| Antes | Ahora |
|---|---|
| Contraseñas guardadas en **texto plano** (`123`, `1234`). | Cifradas con **bcrypt**. Las antiguas se convierten solas al primer arranque. Mínimo 6 caracteres. Aviso si la clave es simple. |
| **Ningún endpoint validaba sesión ni rol**: cualquiera en el WiFi podía crear un admin o ver reportes. | Todo `/api` exige **token de sesión (JWT)** y el **rol se valida en el servidor** (se lee de la base de datos en cada petición). |
| Una sola conexión a MySQL: se podía **caer de madrugada**. | **Pool de conexiones** con reconexión; espera a MySQL al arrancar (útil al prender la PC). |
| Ventas, mesas y cobros **sin transacción**: si algo fallaba quedaban ventas sin detalle o stock descontado de más. | **Transacciones**: o se guarda todo o no se guarda nada. Verificado con una falla simulada. |
| El **precio y total los mandaba el navegador**. | El servidor usa **siempre el precio y el stock de la base de datos**. |
| Se podía vender **más del stock** (stock negativo). | Bloqueado (configurable con `PERMITIR_VENTA_SIN_STOCK`). |
| **Doble clic en "Cobrar" cobraba dos veces** la misma mesa. | La cuenta se bloquea: el segundo cobro es rechazado. |
| Pago **Mixto con vuelto** sumaba el vuelto como efectivo → la caja siempre "descuadraba". | El vuelto se descuenta del efectivo; los pagos suman exactamente el total. |
| Se podía vender con la **caja cerrada** (o a una caja vieja, `|| 1`). | Se exige caja abierta; el servidor usa la caja realmente abierta. |
| `.sql` desactualizado: faltaban columnas (`deuda_acumulada`, `descuadre`, `id_cliente`, `cliente_mesa`) → **fiados, cierre de caja y reportes fallaban en una instalación nueva**. | **Migraciones automáticas** al arrancar + `licoreria_db_limpia.sql` completo. |
| Editar un cliente en Configuración **borraba su documento y teléfono**. | El listado ahora trae esos datos. |
| El filtro de reportes por cliente/mesa fallaba (columna inexistente). | Corregido (ahora la venta guarda el nombre de la mesa/cliente). |
| El botón **Cobrar** de la lista de mesas era un aviso "falta integrar". | Abre directamente la ventana de pago. |
| Rutas duplicadas (`cobrar`, `abonar`): la segunda era código muerto. | Eliminadas. |
| `node_modules` subido a GitHub (el `.gitignore` estaba en UTF‑16 y no funcionaba). | `.gitignore` corregido. |

## ✨ Funciones nuevas
- **Mesas**: quitar producto ya guardado (parcial o total), **anular cuenta**, ambos con **motivo obligatorio**, devolución de stock y registro en auditoría.
- **Auditoría** (nueva pantalla): quién anuló, quitó, fió, ajustó stock, cambió precios o creó usuarios.
- **Respaldos**: automático diario (Programador de tareas), manual desde la pantalla, copia a USB/Drive, descarga.
- **Reglas de usuarios**: no se puede borrar/degradar al último administrador, ni borrarse a sí mismo; si borran a alguien, su sesión deja de servir de inmediato.
- **Límite de intentos de login** (5 fallos → espera 10 min).
- **Número de comprobante sin choques** (`NV-000123`) aunque cobren dos cajeros a la vez.
- **Sincronización de caja** entre celular y PC; sesión expirada → vuelve al login.
- **Reinicio automático** del servidor si se cae (`iniciar_sistema.bat`) y arranque con Windows.
- **Modo sin internet** opcional (`descargar_librerias.js`).
- Mensajes de error claros ("MySQL está apagado", "Stock insuficiente de X: quedan 2").

## 🧭 Decisiones que tomé (puedes cambiarlas)
1. **Mesas visibles para el Cajero.** Antes el menú la ocultaba, pero un bar necesita que quien cobra maneje mesas. Para ocultarla de nuevo: agrega `admin-only` a ese ítem en `frontend/menu.js` y `soloAdmin` en las rutas `/api/cuentas`.
2. **El Cajero puede quitar productos y anular cuentas**, pero con motivo obligatorio y quedando en Auditoría. **Solo el Administrador puede fiar y cobrar abonos.**
3. **Costos ocultos** al Cajero (el servidor ni los envía). Ajustes de inventario, compras y edición de productos: solo admin (así estaba diseñada tu pantalla).
4. Las **mesas ahora usan comprobante `NV-`** (antes `MESA-id-hora`). Los **abonos** entran a caja como `ABONO-…`.
5. El **rol "Vendedor"** se comporta como Cajero en la API.
6. Al cerrar caja ahora también se guardan los totales por método (`total_efectivo`, etc.) en la tabla `caja`.

## ⚠️ Limitaciones conocidas (honestas)
- **No emite boletas/facturas electrónicas (SUNAT)**: solo notas de venta internas. Sirve para negocios que hoy usan cuaderno; si el cliente está obligado a emitir comprobantes electrónicos, esto **no lo reemplaza**.
- La **sesión se guarda en el navegador** (localStorage). Se mitigó limpiando los textos que escriben los usuarios y escapándolos al mostrarlos, pero lo ideal a futuro es cookies `httpOnly` + HTTPS.
- Una sola caja abierta a la vez (un solo turno por vez).
- El POS vende por **unidad** (los precios de sixpack/caja existen en la base pero el POS no los usa).
- No hay división de cuentas ni mover productos entre mesas.
- Sin impresión térmica directa: el ticket se imprime desde el navegador.
- Sin internet, las pantallas pierden estilos **salvo** que ejecutes `descargar_librerias.js` una vez.

## ✅ Cómo se verificó
- **25 pruebas del servidor + 7 del navegador simulado** (`npm test`): login, permisos por rol, precios manipulados, stock, pago mixto, transacciones con fallo simulado, doble cobro simultáneo, mesas, fiados, compras, usuarios, reportes, cierre de caja, respaldos, entradas basura.
- Revisión automática de que **todas las columnas SQL existen en el esquema real** y que cada `INSERT` incluye las columnas obligatorias.
- Todos los scripts de las pantallas pasan validación de sintaxis.

## ❗ Lo que NO se pudo probar aquí (hazlo con `PRUEBA_RAPIDA.md`)
- Contra un **MySQL/MariaDB real** (las pruebas usan una base simulada con SQLite; el SQL es estándar pero conviene confirmarlo en XAMPP).
- Los archivos **`.bat`** (Windows) y las **tareas programadas**.
- La **descarga de librerías offline** (el entorno donde se armó no tenía internet; la lógica sí se probó con descargas simuladas).
- Uso en un **navegador real** y en el celular.

## Actualizar un sistema que ya está instalado
1. Haz un **respaldo** primero.
2. Copia las carpetas `backend` (sin tocar `.env`, `data` y `logs`) y `frontend` sobre las existentes.
3. Reinicia `iniciar_sistema.bat`. Las migraciones corren solas.
