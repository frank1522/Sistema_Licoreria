# Manual rápido — ERP Licorería POS

## Cada día
**1. Abrir el turno** — *Control de Caja* → "Abrir caja" → escribe el efectivo inicial de la gaveta.
> Sin caja abierta el sistema **no deja cobrar**.

**2. Vender en mostrador** — *Punto de Venta*
1. Busca el producto por nombre o código de barras y tócalo para agregarlo.
2. Elige el pago: Efectivo, Yape, Tarjeta o **Mixto** (reparte el monto entre varios métodos).
3. En Efectivo escribe cuánto te dieron: el sistema te dice el **vuelto**.
4. **Confirmar venta.**

**3. Mesas / cuentas** — *Gestión de mesas*
- **Nueva cuenta**: una mesa ("Mesa 5") o un cliente registrado.
- **Ver / Editar**: busca productos, agrégalos y pulsa **Guardar y seguir tomando**. Eso descuenta el stock.
- **Cobrar**: elige el pago. Con **Mixto** el desglose debe sumar exactamente el total.
- **¿Te equivocaste?** Junto a cada producto ya guardado hay una **✖**: quita el producto (o parte de las unidades), escribe el motivo y el stock vuelve al inventario.
- **🗑️ Anular cuenta**: cancela toda la cuenta (con motivo). *Todo queda registrado en Auditoría con tu nombre.*

**4. Gastos e ingresos de caja** — *Control de Caja* → "Registrar movimiento" (ej. "Gasto — compra de hielo S/ 10").

**5. Cerrar el turno** — *Control de Caja* → "Cerrar caja" → cuenta el efectivo de la gaveta y escríbelo.
El sistema te dice si **sobra o falta** dinero comparado con lo esperado.

## Solo para el Administrador
- **Fiados**: en una cuenta a nombre de cliente, botón **Pasar a Fiado**. En *Clientes con Fiado* se cobran los **abonos**.
- **Inventario**: nuevo producto, editar precios, **registrar compras** (suben el stock) y **ajustes** (roturas, mermas).
- **Reportes**: ventas por fechas, por mesa o cliente, totales en efectivo y digital.
- **Auditoría y respaldos**: revisa anulaciones, cambios de precio y ajustes; descarga respaldos.
- **Configuración**: usuarios (crear, cambiar clave), clientes, categorías, proveedores.

## Reglas de oro
- Cada persona entra con **su propio usuario**. No compartir claves.
- Cierra la caja **todos los días**.
- Una vez por semana copia un respaldo a una USB (Auditoría y respaldos → ⬇️).
- Si algo se ve raro, **no apagues la PC a la fuerza**: avisa a soporte.

## Acceso desde el celular
Conéctate al WiFi del local y abre `http://IP-DE-LA-PC:3000` (te la da quien instaló el sistema).
