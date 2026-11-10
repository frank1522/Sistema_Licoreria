# Prueba rápida antes de entregar (≈ 20 minutos)

> Las pruebas automáticas (`npm test`) verifican la lógica con una base de datos simulada.
> **Esta lista confirma lo mismo en TU instalación real** (MySQL, tu PC, tu WiFi). Hazla una vez por cliente.

Marca ✔ cada punto. Si uno falla, mira `backend\logs` o avisa a soporte.

## A. Arranque
- [ ] `instalar.bat` muestra ✔ en todas las tablas.
- [ ] `iniciar_sistema.bat` abre sin errores y muestra la IP para el celular.
- [ ] Abre `http://localhost:3000` → login. **Entra con admin/admin123** → aparece el aviso de "contraseña simple".
- [ ] Cambia la clave del admin (Configuración → Usuarios) y vuelve a entrar con la nueva.
- [ ] Crea un usuario **cajero** (rol Cajero) con clave de 6+ caracteres.

## B. Permisos (entra como cajero)
- [ ] El menú NO muestra Reportes, Fiados, Auditoría ni Configuración.
- [ ] Escribir `http://localhost:3000/reporte.html` en la barra → te saca con aviso.
- [ ] En Inventario no aparece la columna de costos ni los botones de editar.

## C. Caja y ventas (como cajero)
- [ ] Sin caja abierta, una venta es rechazada con el mensaje "La caja está cerrada".
- [ ] Abrir caja con S/ 100.
- [ ] Vender 2 productos en **Efectivo** pagando con un billete mayor → el vuelto sale bien y el stock baja.
- [ ] Vender en **Mixto** (ej. total 40: efectivo 30 + Yape 20) → ticket correcto.
- [ ] Intentar vender más unidades que el stock → mensaje de stock insuficiente.

## D. Mesas
- [ ] Crear "Mesa 1", agregar 3 productos, **Guardar** → el stock baja.
- [ ] Quitar 1 producto con motivo (✖) → el stock sube y el total baja.
- [ ] Crear "Mesa 2", agregar algo y **🗑️ Anular** con motivo → el stock vuelve.
- [ ] **Cobrar** Mesa 1 → aparece en ventas; hacer doble clic rápido en Cobrar NO cobra dos veces.
- [ ] En *Gestión de mesas*, el botón **Cobrar** de una tarjeta abre la ventana de pago.

## E. Fiados (como admin)
- [ ] Cuenta a nombre de un cliente registrado → **Pasar a Fiado** → aparece en *Clientes con Fiado*.
- [ ] Registrar un **abono** parcial → la deuda baja y el dinero entra a la caja abierta.
- [ ] Como cajero, "Pasar a Fiado" es rechazado.

## F. Cierre y reportes
- [ ] Registrar un gasto de S/ 10 (Control de Caja).
- [ ] Cerrar caja contando el efectivo → el descuadre coincide con lo esperado
      (= S/ 100 + efectivo cobrado + abonos en efectivo − gastos).
- [ ] Reportes → rango de hoy → los totales coinciden con lo vendido.
- [ ] Auditoría → se ven las anulaciones, productos quitados, el fiado, el gasto y el cierre.

## G. Respaldos y celular
- [ ] `hacer_respaldo.bat` crea un `.sql` en `respaldos\` (y copia al USB si lo configuraste).
- [ ] Auditoría y respaldos → ⬇️ descarga el archivo.
- [ ] Desde el **celular** (mismo WiFi): abrir `http://IP:3000`, entrar y hacer una venta de prueba.
- [ ] Reiniciar la PC → el sistema vuelve a encenderse solo (si activaste `programar_inicio_automatico.bat`).

## H. Limpiar las pruebas
Al terminar, la base tendrá ventas, cajas y mesas de prueba. Para entregar el sistema limpio:
1. phpMyAdmin → base `licoreria_db` → pestaña **Operaciones** → **Eliminar la base de datos** (⚠️ borra TODO).
2. Pestaña **Importar** → `database\licoreria_db_limpia.sql` (vuelve a crear la base desde cero).
3. Entra con `admin / admin123`, cambia la clave, crea los usuarios y **recién ahí** carga el inventario real.
*(Tip: haz estas pruebas ANTES de cargar los productos reales para no tener que repetir la carga.)*
