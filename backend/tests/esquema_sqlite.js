// Esquema "viejo" (como el .sql original: SIN deuda_acumulada, descuadre, id_cliente ni cliente_mesa)
// para comprobar también que las migraciones automáticas lo arreglan.
module.exports = `
CREATE TABLE roles (id_rol INTEGER PRIMARY KEY AUTOINCREMENT, descripcion TEXT NOT NULL);
CREATE TABLE usuarios (id_usuario INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, usuario TEXT NOT NULL UNIQUE, password TEXT NOT NULL, id_rol INTEGER NOT NULL REFERENCES roles(id_rol));
CREATE TABLE categorias (id_categoria INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL);
CREATE TABLE clientes (id_cliente INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, documento TEXT, telefono TEXT);
CREATE TABLE proveedores (id_proveedor INTEGER PRIMARY KEY AUTOINCREMENT, ruc_dni TEXT, razon_social TEXT NOT NULL, telefono TEXT);
CREATE TABLE productos (id_producto INTEGER PRIMARY KEY AUTOINCREMENT, codigo_barras TEXT UNIQUE, nombre TEXT NOT NULL, id_categoria INTEGER NOT NULL REFERENCES categorias(id_categoria),
  precio_costo_unitario DECIMAL(10,2) NOT NULL DEFAULT 0, precio_venta_unitario DECIMAL(10,2) NOT NULL, precio_venta_sixpack DECIMAL(10,2), precio_venta_caja DECIMAL(10,2),
  unidades_por_caja INTEGER DEFAULT 12, stock_unidades INTEGER NOT NULL DEFAULT 0, stock_minimo INTEGER NOT NULL DEFAULT 10);
CREATE TABLE caja (id_caja INTEGER PRIMARY KEY AUTOINCREMENT, id_usuario INTEGER NOT NULL REFERENCES usuarios(id_usuario), fecha_apertura TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, fecha_cierre TEXT,
  monto_inicial DECIMAL(10,2) NOT NULL, total_efectivo DECIMAL(10,2) DEFAULT 0, total_yape DECIMAL(10,2) DEFAULT 0, total_plin DECIMAL(10,2) DEFAULT 0, total_tarjeta DECIMAL(10,2) DEFAULT 0,
  total_gastos DECIMAL(10,2) DEFAULT 0, monto_final_real DECIMAL(10,2) DEFAULT 0, estado TEXT NOT NULL DEFAULT 'Abierta');
CREATE TABLE movimientos_caja (id_movimiento INTEGER PRIMARY KEY AUTOINCREMENT, id_caja INTEGER NOT NULL REFERENCES caja(id_caja), tipo TEXT NOT NULL, monto DECIMAL(10,2) NOT NULL, motivo TEXT NOT NULL, fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE ventas (id_venta INTEGER PRIMARY KEY AUTOINCREMENT, numero_comprobante TEXT NOT NULL UNIQUE, id_caja INTEGER NOT NULL REFERENCES caja(id_caja), id_usuario INTEGER NOT NULL REFERENCES usuarios(id_usuario),
  id_cliente INTEGER NOT NULL DEFAULT 1 REFERENCES clientes(id_cliente), fecha_venta TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, total DECIMAL(10,2) NOT NULL, pago_efectivo DECIMAL(10,2) DEFAULT 0,
  pago_yape DECIMAL(10,2) DEFAULT 0, pago_plin DECIMAL(10,2) DEFAULT 0, pago_tarjeta DECIMAL(10,2) DEFAULT 0, monto_recibido DECIMAL(10,2) NOT NULL, vuelto DECIMAL(10,2) NOT NULL DEFAULT 0);
CREATE TABLE detalle_ventas (id_detalle INTEGER PRIMARY KEY AUTOINCREMENT, id_venta INTEGER NOT NULL REFERENCES ventas(id_venta) ON DELETE CASCADE, id_producto INTEGER NOT NULL REFERENCES productos(id_producto),
  tipo_empaque TEXT NOT NULL DEFAULT 'Unidad', cantidad INTEGER NOT NULL, precio_unitario DECIMAL(10,2) NOT NULL, subtotal DECIMAL(10,2) NOT NULL);
CREATE TABLE cuentas (id_cuenta INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, identificador TEXT NOT NULL, estado TEXT DEFAULT 'Abierta', total DECIMAL(10,2) DEFAULT 0, fecha_apertura TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE cuentas_detalle (id_detalle INTEGER PRIMARY KEY AUTOINCREMENT, id_cuenta INTEGER REFERENCES cuentas(id_cuenta) ON DELETE CASCADE, id_producto INTEGER, cantidad INTEGER, precio_unitario DECIMAL(10,2), subtotal DECIMAL(10,2));
CREATE TABLE compras (id_compra INTEGER PRIMARY KEY AUTOINCREMENT, numero_comprobante TEXT, id_proveedor INTEGER NOT NULL REFERENCES proveedores(id_proveedor), id_usuario INTEGER NOT NULL REFERENCES usuarios(id_usuario), fecha_compra TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, total DECIMAL(10,2) NOT NULL);
CREATE TABLE detalle_compras (id_detalle INTEGER PRIMARY KEY AUTOINCREMENT, id_compra INTEGER NOT NULL REFERENCES compras(id_compra) ON DELETE CASCADE, id_producto INTEGER NOT NULL REFERENCES productos(id_producto), cantidad INTEGER NOT NULL, precio_compra_unitario DECIMAL(10,2) NOT NULL, subtotal DECIMAL(10,2) NOT NULL);
CREATE TABLE ajustes_inventario (id_ajuste INTEGER PRIMARY KEY AUTOINCREMENT, id_producto INTEGER NOT NULL REFERENCES productos(id_producto), id_usuario INTEGER NOT NULL REFERENCES usuarios(id_usuario), tipo_ajuste TEXT NOT NULL, cantidad INTEGER NOT NULL, motivo TEXT NOT NULL, fecha_ajuste TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE logs_auditoria (id_log INTEGER PRIMARY KEY AUTOINCREMENT, id_usuario INTEGER NOT NULL REFERENCES usuarios(id_usuario), accion TEXT NOT NULL, fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`;
