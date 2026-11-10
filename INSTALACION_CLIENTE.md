# Instalación en la computadora del cliente (paso a paso)

Tiempo estimado: 30–40 minutos. Necesitas internet **solo durante la instalación**.

## 0. Qué necesitas llevar
- Esta carpeta completa (en una USB).
- La computadora del local debe ser **la que siempre está prendida** cuando el negocio atiende (Windows 10/11).

## 1. Programas
1. **XAMPP** → https://www.apachefriends.org → instalar. Abrir el *XAMPP Control Panel*.
   - En la fila de **MySQL** marcar la casilla **Svc** (se instala como servicio y se enciende solo) y pulsar **Start**.
2. **Node.js (versión LTS)** → https://nodejs.org → instalar con todo por defecto.

## 2. Copiar el sistema
Copiar la carpeta a `C:\LicoreriaPOS` (cualquier ruta sin tildes ni espacios raros).

## 3. Crear la base de datos
1. Abrir `http://localhost/phpmyadmin`.
2. Pestaña **Importar** → elegir `database\licoreria_db_limpia.sql` → **Importar**.
3. (Recomendado) Pestaña **SQL** → pegar el contenido de `database\crear_usuario_mysql.sql` (cambiando la clave) y luego poner ese usuario y clave en `backend\.env`.

## 4. Instalar y encender
1. Doble clic en **`instalar.bat`** → debe mostrar ✔ en todas las tablas.
2. Doble clic en **`iniciar_sistema.bat`** → deja la ventana abierta (minimizada).
3. En el navegador: `http://localhost:3000` → entrar con **admin / admin123**.
4. **Lo primero:** Configuración → Usuarios → cambiar la clave del admin.

## 5. Acceso desde celulares
1. Doble clic en **`ver_ip.bat`** → anotar la IP (ej. `192.168.1.50`).
2. En el router, **reservar esa IP** para la PC (para que no cambie) — o ponerla fija en Windows.
3. Clic derecho en **`abrir_firewall.bat`** → *Ejecutar como administrador*.
4. En el celular (mismo WiFi): `http://192.168.1.50:3000` → *Agregar a pantalla de inicio*.
5. Si no abre: en Windows marcar el WiFi como **Red privada**.

## 6. Que se encienda solo y se respalde solo
- Clic derecho en **`programar_inicio_automatico.bat`** → *Ejecutar como administrador*.
- Clic derecho en **`programar_respaldo.bat`** → *Ejecutar como administrador* (respaldo diario 11:30 pm).
- En `backend\.env` poner `BACKUP_COPY_DIR=E:\Respaldos` (USB o carpeta de Drive) para tener una copia fuera de la PC.
- **Prueba el respaldo una vez:** `hacer_respaldo.bat` → debe aparecer un `.sql` en la carpeta `respaldos`.

## 7. Dejarlo listo para el cliente
1. Configuración → **Usuarios**: crear un usuario por cada persona (rol **Cajero** para quien cobra).
2. Configuración → **Categorías** y **Proveedores**.
3. Inventario → **Nuevo producto**: cargar los productos con su **stock real contado** (haz un conteo físico).
   *(Si prefieres no bloquear ventas los primeros días: `PERMITIR_VENTA_SIN_STOCK=true` en `.env`.)*
4. Hacer las pruebas de `PRUEBA_RAPIDA.md` con el cliente presente.
5. Dejarle el `MANUAL_RAPIDO.md` impreso.

## Si algo falla
| Síntoma | Qué hacer |
|---|---|
| `instalar.bat` dice que no encuentra Node | Instalar Node.js LTS y repetir |
| "No se pudo conectar" / ECONNREFUSED | Encender MySQL en XAMPP |
| "Access denied" | Revisar `DB_USER` y `DB_PASSWORD` en `backend\.env` |
| "La base de datos no existe" | Importar `licoreria_db_limpia.sql` |
| El celular no abre la página | `abrir_firewall.bat`, mismo WiFi, red privada, IP correcta |
| El cliente olvidó su clave | `node scripts/cambiar_password.js usuario "ClaveNueva1"` (en `backend`) |
| Quiero ver errores | Carpeta `backend\logs` (un archivo por día) |
