// ============================================================
// SERVIDOR PRINCIPAL - ERP LICORERÍA POS
// Express + MySQL. Sirve el frontend y la API (/api/...).
// Todas las rutas /api exigen sesión (token) salvo el login.
// Qué puede hacer cada rol: ver la sección "PERMISOS" en el README.
// ============================================================
const os = require('os');
const express = require('express');
const cors = require('cors');

const config = require('./lib/config');
const log = require('./lib/log');
const db = require('./db');
const audit = require('./lib/auditoria');
const { conTransaccion } = require('./lib/tx');
const { esperarBaseDeDatos, migrar } = require('./lib/migraciones');
const { hashear, verificar, esClaveDebil, firmarToken, crearAuth, crearLimiteLogin, HASH_FALSO } = require('./lib/seguridad');
const bcrypt = require('bcryptjs');
const respaldo = require('./lib/respaldo');
const {
    ErrorNegocio, limpiarTexto, entero, centavos, soles, aDecimal, fechaISO, repartirPagos,
} = require('./lib/validar');

const app = express();
app.disable('x-powered-by');
if (config.TRUST_PROXY) app.set('trust proxy', true);

// ---------- Cabeceras de seguridad básicas ----------
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
});
if (config.CORS_ORIGIN) {
    app.use(cors({ origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',').map((s) => s.trim()) }));
}
app.use(express.json({ limit: '1mb' }));
app.use(express.static(config.DIR_FRONTEND));

const q = () => db.promise();
const idParam = (v, nombre = 'El código') => {
    const n = entero(v);
    if (!(n > 0)) throw new ErrorNegocio(`${nombre} no es válido.`);
    return n;
};
const dineroObligatorio = (v, mensaje) => {
    if (v === undefined || v === null || v === '') throw new ErrorNegocio(mensaje);
    const c = centavos(v);
    if (Number.isNaN(c)) throw new ErrorNegocio(mensaje);
    return c;
};
const motivoObligatorio = (v, max = 150) => {
    const m = limpiarTexto(v, max);
    if (m.length < 3) throw new ErrorNegocio('Escribe el motivo (mínimo 3 letras).');
    return m;
};

// ============================================================
// RUTAS PÚBLICAS: salud y login
// ============================================================
app.get('/api/salud', (req, res) => res.json({ success: true }));

const limiteLogin = crearLimiteLogin();

app.post('/api/auth/login', async (req, res) => {
    const usuario = limpiarTexto((req.body || {}).usuario, 50);
    const contrasena = typeof (req.body || {}).contrasena === 'string' ? req.body.contrasena : '';
    if (!usuario || !contrasena) throw new ErrorNegocio('Por favor, ingrese usuario y contraseña.');

    const espera = limiteLogin.bloqueado(req, usuario);
    if (espera) {
        return res.status(429).json({ success: false, message: `Demasiados intentos fallidos. Espera ${espera} minuto(s) e inténtalo otra vez.` });
    }

    const [rows] = await q().query(
        `SELECT u.id_usuario, u.nombre, u.usuario, u.password, r.descripcion AS rol
         FROM usuarios u INNER JOIN roles r ON u.id_rol = r.id_rol WHERE u.usuario = ?`, [usuario]);
    const u = rows[0];
    let v = { ok: false, rehash: false };
    if (u) v = await verificar(contrasena, u.password);
    else await bcrypt.compare(contrasena, HASH_FALSO); // mismo tiempo de respuesta aunque no exista

    if (!u || !v.ok) {
        limiteLogin.fallo(req, usuario);
        log.aviso(`Login fallido para "${usuario}" desde ${req.ip}`);
        return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
    }
    limiteLogin.exito(req, usuario);
    if (v.rehash) await q().query('UPDATE usuarios SET password = ? WHERE id_usuario = ?', [await hashear(contrasena), u.id_usuario]);

    res.json({
        success: true,
        message: `¡Bienvenido, ${u.nombre}!`,
        token: firmarToken(u),
        usuario: { id_usuario: u.id_usuario, nombre: u.nombre, rol: u.rol },
        aviso: esClaveDebil(contrasena) ? 'Tu contraseña es muy simple o es la de fábrica. Cámbiala en Configuración → Usuarios.' : null,
    });
});

// ============================================================
// DESDE AQUÍ TODO EXIGE SESIÓN
// ============================================================
const { auth, soloAdmin, olvidar } = crearAuth(db);
app.use('/api', auth);

app.get('/api/auth/yo', (req, res) => {
    const { id_usuario, nombre, rol } = req.user;
    res.json({ success: true, usuario: { id_usuario, nombre, rol } });
});

// ============================================================
// DASHBOARD
// ============================================================
app.get('/api/dashboard', async (req, res) => {
    const [ventas] = await q().query(`
        SELECT IFNULL(SUM(pago_efectivo), 0) AS efectivo, IFNULL(SUM(pago_yape), 0) AS yape,
               IFNULL(SUM(pago_plin), 0) AS plin, IFNULL(SUM(pago_tarjeta), 0) AS tarjeta
        FROM ventas WHERE DATE(fecha_venta) = CURDATE()`);
    const pagos = {
        efectivo: Number(ventas[0].efectivo), yape: Number(ventas[0].yape),
        plin: Number(ventas[0].plin), tarjeta: Number(ventas[0].tarjeta),
    };
    const [mesas] = await q().query("SELECT COUNT(*) AS activas FROM cuentas WHERE estado = 'Abierta' OR estado = 'Pendiente'");
    const [caja] = await q().query("SELECT id_caja FROM caja WHERE estado = 'Abierta' LIMIT 1");
    const [criticos] = await q().query(`
        SELECT nombre, stock_unidades AS stock FROM productos
        WHERE stock_unidades <= stock_minimo ORDER BY stock_unidades ASC LIMIT 6`);
    res.json({
        success: true,
        ventas_hoy: pagos.efectivo + pagos.yape + pagos.plin + pagos.tarjeta,
        mesas_activas: mesas[0].activas,
        caja_abierta: caja.length > 0,
        pagos,
        stock_critico_count: criticos.length,
        productos_criticos: criticos,
    });
});

// ============================================================
// CAJA
// ============================================================
// Devuelve la caja abierta (solo hay una a la vez). Se usa en ventas, cobros y abonos.
async function resolverCaja(conn) {
    const [r] = await conn.query("SELECT id_caja FROM caja WHERE estado = 'Abierta' ORDER BY id_caja DESC LIMIT 1");
    if (!r.length) throw new ErrorNegocio('La caja está cerrada. Abre un turno de caja antes de cobrar.');
    return r[0].id_caja;
}

app.get('/api/caja/estado', async (req, res) => {
    const [r] = await q().query(`
        SELECT id_caja, id_usuario, fecha_apertura, monto_inicial FROM caja
        WHERE estado = 'Abierta' ORDER BY id_caja DESC LIMIT 1`);
    if (r.length > 0) return res.json({ success: true, cajaAbierta: true, id_caja: r[0].id_caja, datosCaja: r[0] });
    res.json({ success: true, cajaAbierta: false, message: 'La caja del día se encuentra cerrada. Debe realizar la apertura.' });
});

app.post('/api/caja/apertura', async (req, res) => {
    const montoC = dineroObligatorio((req.body || {}).monto_inicial, 'Datos inválidos para apertura.');
    // Un solo INSERT atómico: si ya hay caja abierta no inserta nada (evita dos aperturas a la vez)
    let r;
    try {
        [r] = await q().query(
            `INSERT INTO caja (id_usuario, monto_inicial, estado)
             SELECT ?, ?, 'Abierta' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM caja WHERE estado = 'Abierta')`,
            [req.user.id_usuario, aDecimal(montoC)]);
    } catch (e) {
        // Plan B por si el motor de base de datos no acepta ese INSERT: revisar y luego insertar
        if (e.errno !== 1093 && e.code !== 'ER_UPDATE_TABLE_USED' && e.code !== 'ER_PARSE_ERROR') throw e;
        const [ya] = await q().query("SELECT id_caja FROM caja WHERE estado = 'Abierta' LIMIT 1");
        if (ya.length) throw new ErrorNegocio('Ya existe una sesión de caja abierta.');
        [r] = await q().query("INSERT INTO caja (id_usuario, monto_inicial, estado) VALUES (?, ?, 'Abierta')",
            [req.user.id_usuario, aDecimal(montoC)]);
    }
    if (r.affectedRows === 0) throw new ErrorNegocio('Ya existe una sesión de caja abierta.');
    await audit.registrar(db, req.user.id_usuario, `Abrió la caja #${r.insertId} con S/ ${soles(montoC)}`);
    res.json({ success: true, message: '¡Caja abierta exitosamente!', id_caja: r.insertId });
});

app.post('/api/caja/movimiento', async (req, res) => {
    const b = req.body || {};
    const tipo = b.tipo;
    if (!['Ingreso', 'Gasto'].includes(tipo)) throw new ErrorNegocio('El tipo de movimiento debe ser Ingreso o Gasto.');
    const montoC = dineroObligatorio(b.monto, 'Datos incompletos o monto inválido.');
    if (montoC <= 0) throw new ErrorNegocio('El monto debe ser mayor a cero.');
    const motivo = motivoObligatorio(b.motivo);

    const id = await conTransaccion(db, async (conn) => {
        const idCaja = await resolverCaja(conn).catch(() => { throw new ErrorNegocio('No se pueden registrar movimientos en una caja cerrada.'); });
        const [r] = await conn.query('INSERT INTO movimientos_caja (id_caja, tipo, monto, motivo) VALUES (?, ?, ?, ?)', [idCaja, tipo, aDecimal(montoC), motivo]);
        await audit.registrar(conn, req.user.id_usuario, `Caja #${idCaja}: registró ${tipo} de S/ ${soles(montoC)} (${motivo})`);
        return r.insertId;
    });
    res.json({ success: true, message: `¡Movimiento de [${tipo}] registrado con éxito!`, id_movimiento: id });
});

async function totalesCaja(conn, idCaja) {
    const [mov] = await conn.query(`
        SELECT IFNULL(SUM(CASE WHEN tipo = 'Gasto' THEN monto END), 0) AS gastos,
               IFNULL(SUM(CASE WHEN tipo = 'Ingreso' THEN monto END), 0) AS ingresos
        FROM movimientos_caja WHERE id_caja = ?`, [idCaja]);
    const [ven] = await conn.query(`
        SELECT IFNULL(SUM(pago_efectivo), 0) AS efectivo, IFNULL(SUM(pago_yape), 0) AS yape,
               IFNULL(SUM(pago_plin), 0) AS plin, IFNULL(SUM(pago_tarjeta), 0) AS tarjeta
        FROM ventas WHERE id_caja = ?`, [idCaja]);
    return {
        gastos: Number(mov[0].gastos), ingresos: Number(mov[0].ingresos),
        efectivo: Number(ven[0].efectivo), yape: Number(ven[0].yape),
        plin: Number(ven[0].plin), tarjeta: Number(ven[0].tarjeta),
    };
}

app.get('/api/caja/arqueo/:id_caja', async (req, res) => {
    const idCaja = idParam(req.params.id_caja, 'La caja');
    const [caja] = await q().query('SELECT monto_inicial, estado FROM caja WHERE id_caja = ?', [idCaja]);
    if (caja.length === 0) return res.status(404).json({ success: false, message: 'Caja no encontrada.' });
    const t = await totalesCaja(q(), idCaja);
    res.json({
        success: true,
        monto_inicial: Number(caja[0].monto_inicial),
        total_gastos: t.gastos, total_ingresos: t.ingresos,
        total_efectivo: t.efectivo, total_yape: t.yape, total_plin: t.plin, total_tarjeta: t.tarjeta,
    });
});

app.put('/api/caja/cierre/:id_caja', async (req, res) => {
    const idCaja = idParam(req.params.id_caja, 'La caja');
    const realC = dineroObligatorio((req.body || {}).monto_final_real, 'Por favor, ingrese un monto final real válido.');

    const mensaje = await conTransaccion(db, async (conn) => {
        const [caja] = await conn.query("SELECT monto_inicial FROM caja WHERE id_caja = ? AND estado = 'Abierta' FOR UPDATE", [idCaja]);
        if (caja.length === 0) throw new ErrorNegocio('La caja ya estaba cerrada o no existe.');
        const t = await totalesCaja(conn, idCaja);
        const esperadoC = centavos(caja[0].monto_inicial) + centavos(t.ingresos) + centavos(t.efectivo) - centavos(t.gastos);
        const descuadreC = realC - esperadoC;

        await conn.query(
            `UPDATE caja SET estado = 'Cerrada', monto_final_real = ?, descuadre = ?, fecha_cierre = CURRENT_TIMESTAMP,
                    total_efectivo = ?, total_yape = ?, total_plin = ?, total_tarjeta = ?, total_gastos = ?
             WHERE id_caja = ?`,
            [aDecimal(realC), aDecimal(descuadreC), t.efectivo, t.yape, t.plin, t.tarjeta, t.gastos, idCaja]);
        await audit.registrar(conn, req.user.id_usuario,
            `Cerró la caja #${idCaja}: esperado S/ ${soles(esperadoC)}, contado S/ ${soles(realC)}, diferencia S/ ${soles(descuadreC)}`);

        if (descuadreC === 0) return '¡Caja cuadrada perfectamente a cero!';
        if (descuadreC > 0) return `Sobran S/ ${soles(descuadreC)} en gaveta.`;
        return `Faltan S/ ${soles(Math.abs(descuadreC))} en gaveta.`;
    });
    res.json({ success: true, message: `Turno finalizado. ${mensaje}` });
});

// ============================================================
// PRODUCTOS E INVENTARIO
// ============================================================
app.get('/api/productos/buscar', async (req, res) => {
    const texto = limpiarTexto(req.query.q, 60);
    if (!texto) throw new ErrorNegocio('Por favor ingrese un nombre o código de barras.');
    const [rows] = await q().query(`
        SELECT id_producto, codigo_barras, nombre, precio_venta_unitario, stock_unidades
        FROM productos WHERE codigo_barras = ? OR nombre LIKE ? LIMIT 15`, [texto, `%${texto}%`]);
    res.json({ success: true, productos: rows });
});

app.get('/api/productos', async (req, res) => {
    const [rows] = await q().query(`
        SELECT p.id_producto, p.codigo_barras, p.nombre, c.nombre AS categoria, p.precio_venta_unitario, p.stock_unidades
        FROM productos p INNER JOIN categorias c ON p.id_categoria = c.id_categoria WHERE p.stock_unidades > 0`);
    res.json(rows);
});

app.get('/api/inventario', async (req, res) => {
    const [rows] = await q().query(`
        SELECT p.id_producto, p.codigo_barras, p.nombre, p.precio_costo_unitario,
               p.precio_venta_unitario, p.stock_unidades, p.stock_minimo,
               p.precio_venta_sixpack, p.precio_venta_caja, p.unidades_por_caja,
               c.nombre AS categoria,
               CASE WHEN p.stock_unidades <= 0 THEN 'Agotado'
                    WHEN p.stock_unidades <= p.stock_minimo THEN 'Bajo' ELSE 'Saludable' END AS estado_stock
        FROM productos p INNER JOIN categorias c ON p.id_categoria = c.id_categoria
        ORDER BY p.stock_unidades ASC`);
    // El costo (tu margen de ganancia) solo lo ve el administrador
    if (req.user.rol !== 'Administrador') rows.forEach((r) => { delete r.precio_costo_unitario; });
    res.json({ success: true, inventario: rows });
});

function leerProducto(b) {
    const nombre = limpiarTexto(b.nombre, 150);
    if (!nombre) throw new ErrorNegocio('El nombre del producto es obligatorio.');
    const idCat = entero(b.id_categoria);
    if (!(idCat > 0)) throw new ErrorNegocio('Selecciona una categoría.');
    const venta = dineroObligatorio(b.precio_venta, 'El precio de venta es obligatorio y debe ser un número válido.');
    const costo = (b.precio_costo === undefined || b.precio_costo === null || b.precio_costo === '') ? 0 : centavos(b.precio_costo);
    if (Number.isNaN(costo)) throw new ErrorNegocio('El precio de costo no es válido.');
    const opcional = (v, nombreCampo) => {
        if (v === undefined || v === null || v === '') return null;
        const c = centavos(v);
        if (Number.isNaN(c)) throw new ErrorNegocio(`El ${nombreCampo} no es válido.`);
        return aDecimal(c);
    };
    const unidades = (b.unidades_caja === undefined || b.unidades_caja === null || b.unidades_caja === '') ? 12 : entero(b.unidades_caja);
    const minimo = (b.stock_minimo === undefined || b.stock_minimo === null || b.stock_minimo === '') ? 10 : entero(b.stock_minimo);
    if (!(unidades > 0)) throw new ErrorNegocio('Las unidades por caja deben ser un número mayor a cero.');
    if (!(minimo >= 0)) throw new ErrorNegocio('El stock mínimo no es válido.');
    return {
        codigo: limpiarTexto(b.codigo_barras, 50) || null,
        nombre, idCat, costo: aDecimal(costo), venta: aDecimal(venta),
        sixpack: opcional(b.precio_sixpack, 'precio del sixpack'), caja: opcional(b.precio_caja, 'precio de la caja'),
        unidades, minimo,
    };
}
const errorDuplicado = (e) => {
    if (e && (e.code === 'ER_DUP_ENTRY' || e.errno === 1062)) throw new ErrorNegocio('Ya existe un producto con ese código de barras.', 409);
    throw e;
};

app.post('/api/productos/nuevo', soloAdmin, async (req, res) => {
    const b = req.body || {};
    const p = leerProducto(b);
    const stock = (b.stock_inicial === undefined || b.stock_inicial === '' || b.stock_inicial === null) ? 0 : entero(b.stock_inicial);
    if (!(stock >= 0)) throw new ErrorNegocio('El stock inicial no es válido.');
    try {
        await q().query(`
            INSERT INTO productos (codigo_barras, nombre, id_categoria, precio_costo_unitario, precio_venta_unitario,
                                   stock_unidades, stock_minimo, precio_venta_sixpack, precio_venta_caja, unidades_por_caja)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.codigo, p.nombre, p.idCat, p.costo, p.venta, stock, p.minimo, p.sixpack, p.caja, p.unidades]);
    } catch (e) { errorDuplicado(e); }
    await audit.registrar(db, req.user.id_usuario, `Creó el producto "${p.nombre}" (precio S/ ${p.venta.toFixed(2)}, stock inicial ${stock})`);
    res.json({ success: true, message: '¡Producto creado exitosamente!' });
});

app.put('/api/productos/editar/:id', soloAdmin, async (req, res) => {
    const id = idParam(req.params.id, 'El producto');
    const p = leerProducto(req.body || {});
    const [antes] = await q().query('SELECT nombre, precio_costo_unitario, precio_venta_unitario FROM productos WHERE id_producto = ?', [id]);
    if (!antes.length) throw new ErrorNegocio('El producto no existe.', 404);
    try {
        await q().query(`
            UPDATE productos SET codigo_barras = ?, nombre = ?, id_categoria = ?, precio_costo_unitario = ?, precio_venta_unitario = ?,
                   stock_minimo = ?, precio_venta_sixpack = ?, precio_venta_caja = ?, unidades_por_caja = ?
            WHERE id_producto = ?`,
        [p.codigo, p.nombre, p.idCat, p.costo, p.venta, p.minimo, p.sixpack, p.caja, p.unidades, id]);
    } catch (e) { errorDuplicado(e); }
    const a = antes[0];
    if (centavos(a.precio_venta_unitario) !== centavos(p.venta) || centavos(a.precio_costo_unitario) !== centavos(p.costo)) {
        await audit.registrar(db, req.user.id_usuario,
            `Cambió precios de "${p.nombre}": venta S/ ${Number(a.precio_venta_unitario).toFixed(2)} → S/ ${p.venta.toFixed(2)}, costo S/ ${Number(a.precio_costo_unitario).toFixed(2)} → S/ ${p.costo.toFixed(2)}`);
    }
    res.json({ success: true, message: '¡Producto actualizado correctamente!' });
});

app.post('/api/compras/registrar', soloAdmin, async (req, res) => {
    const b = req.body || {};
    const idProveedor = idParam(b.id_proveedor, 'El proveedor');
    if (!Array.isArray(b.detalles) || b.detalles.length === 0 || b.detalles.length > 300) throw new ErrorNegocio('Faltan datos de la compra.');
    const lineas = b.detalles.map((d) => {
        const id = entero(d && d.id_producto);
        const cant = entero(d && d.cantidad);
        const precioC = centavos(d && d.precio_compra);
        if (!(id > 0) || !(cant > 0) || cant > 100000 || Number.isNaN(precioC)) throw new ErrorNegocio('Hay un producto de la compra con datos inválidos.');
        return { id, cant, precioC };
    });
    const totalC = lineas.reduce((s, l) => s + l.precioC * l.cant, 0);
    const comprobante = limpiarTexto(b.numero_comprobante, 50) || null;

    await conTransaccion(db, async (conn) => {
        const [prov] = await conn.query('SELECT id_proveedor FROM proveedores WHERE id_proveedor = ?', [idProveedor]);
        if (!prov.length) throw new ErrorNegocio('El proveedor no existe.');
        const [c] = await conn.query('INSERT INTO compras (id_proveedor, id_usuario, numero_comprobante, total) VALUES (?, ?, ?, ?)',
            [idProveedor, req.user.id_usuario, comprobante, aDecimal(totalC)]);
        for (const l of lineas) {
            const [p] = await conn.query('SELECT id_producto FROM productos WHERE id_producto = ? FOR UPDATE', [l.id]);
            if (!p.length) throw new ErrorNegocio(`El producto ID ${l.id} ya no existe.`);
            await conn.query(`INSERT INTO detalle_compras (id_compra, id_producto, cantidad, precio_compra_unitario, subtotal) VALUES (?, ?, ?, ?, ?)`,
                [c.insertId, l.id, l.cant, aDecimal(l.precioC), aDecimal(l.precioC * l.cant)]);
            await conn.query('UPDATE productos SET stock_unidades = stock_unidades + ?, precio_costo_unitario = ? WHERE id_producto = ?',
                [l.cant, aDecimal(l.precioC), l.id]);
        }
        await audit.registrar(conn, req.user.id_usuario, `Registró compra #${c.insertId} por S/ ${soles(totalC)}`);
    });
    res.json({ success: true, message: '¡Compra registrada y stock actualizado!' });
});

app.post('/api/inventario/ajuste', soloAdmin, async (req, res) => {
    const b = req.body || {};
    const idProducto = idParam(b.id_producto, 'El producto');
    const tipo = b.tipo_ajuste;
    if (!['Entrada', 'Salida'].includes(tipo)) throw new ErrorNegocio('El tipo de ajuste debe ser Entrada o Salida.');
    const cantidad = entero(b.cantidad);
    if (!(cantidad > 0) || cantidad > 100000) throw new ErrorNegocio('Ingrese una cantidad válida mayor a cero.');
    const motivo = motivoObligatorio(b.motivo, 200);

    await conTransaccion(db, async (conn) => {
        const [p] = await conn.query('SELECT nombre, stock_unidades FROM productos WHERE id_producto = ? FOR UPDATE', [idProducto]);
        if (!p.length) throw new ErrorNegocio('El producto no existe.', 404);
        if (tipo === 'Salida' && p[0].stock_unidades < cantidad) {
            throw new ErrorNegocio(`No puedes sacar ${cantidad}: solo hay ${p[0].stock_unidades} en stock.`);
        }
        await conn.query('INSERT INTO ajustes_inventario (id_producto, id_usuario, tipo_ajuste, cantidad, motivo) VALUES (?, ?, ?, ?, ?)',
            [idProducto, req.user.id_usuario, tipo, cantidad, motivo]);
        await conn.query(`UPDATE productos SET stock_unidades = stock_unidades ${tipo === 'Entrada' ? '+' : '-'} ? WHERE id_producto = ?`, [cantidad, idProducto]);
        await audit.registrar(conn, req.user.id_usuario, `Ajuste de inventario (${tipo}): ${cantidad} uds de "${p[0].nombre}". Motivo: ${motivo}`);
    });
    res.json({ success: true, message: '¡Inventario ajustado correctamente!' });
});

// ============================================================
// CATÁLOGOS: categorías y proveedores (ver: todos / modificar: admin)
// ============================================================
app.get('/api/proveedores', async (req, res) => {
    const [proveedores] = await q().query('SELECT * FROM proveedores');
    res.json({ success: true, proveedores });
});
app.get('/api/categorias', async (req, res) => {
    const [categorias] = await q().query('SELECT * FROM categorias');
    res.json({ success: true, categorias });
});
app.post('/api/categorias/nuevo', soloAdmin, async (req, res) => {
    const nombre = limpiarTexto((req.body || {}).nombre, 50);
    if (!nombre) throw new ErrorNegocio('El nombre es obligatorio.');
    await q().query('INSERT INTO categorias (nombre) VALUES (?)', [nombre]);
    res.json({ success: true, message: 'Categoría agregada con éxito.' });
});
app.put('/api/categorias/editar/:id', soloAdmin, async (req, res) => {
    const nombre = limpiarTexto((req.body || {}).nombre, 50);
    if (!nombre) throw new ErrorNegocio('El nombre es obligatorio.');
    await q().query('UPDATE categorias SET nombre = ? WHERE id_categoria = ?', [nombre, idParam(req.params.id)]);
    res.json({ success: true, message: 'Categoría actualizada.' });
});
app.post('/api/proveedores/nuevo', soloAdmin, async (req, res) => {
    const b = req.body || {};
    const razon = limpiarTexto(b.razon_social, 150);
    if (!razon) throw new ErrorNegocio('La razón social es obligatoria.');
    await q().query('INSERT INTO proveedores (razon_social, ruc_dni, telefono) VALUES (?, ?, ?)',
        [razon, limpiarTexto(b.ruc_dni, 15) || null, limpiarTexto(b.telefono, 20) || null]);
    res.json({ success: true, message: 'Proveedor registrado.' });
});
app.put('/api/proveedores/editar/:id', soloAdmin, async (req, res) => {
    const b = req.body || {};
    const razon = limpiarTexto(b.razon_social, 150);
    if (!razon) throw new ErrorNegocio('La razón social es obligatoria.');
    await q().query('UPDATE proveedores SET razon_social = ?, ruc_dni = ?, telefono = ? WHERE id_proveedor = ?',
        [razon, limpiarTexto(b.ruc_dni, 15) || null, limpiarTexto(b.telefono, 20) || null, idParam(req.params.id)]);
    res.json({ success: true, message: 'Proveedor actualizado.' });
});

// ============================================================
// VENTAS (PUNTO DE VENTA)
// El servidor SIEMPRE usa los precios y el stock de la base de datos;
// lo que mande el navegador (precio/total) se ignora.
// ============================================================
function normalizarCarrito(arr) {
    if (!Array.isArray(arr) || arr.length === 0) throw new ErrorNegocio('El carrito está vacío.');
    if (arr.length > 200) throw new ErrorNegocio('Demasiados productos en una sola operación.');
    const juntos = new Map();
    for (const x of arr) {
        const id = entero(x && x.id_producto);
        const cant = entero(x && x.cantidad);
        if (!(id > 0) || !(cant > 0) || cant > 9999) throw new ErrorNegocio('Hay un producto con datos inválidos en el carrito.');
        juntos.set(id, (juntos.get(id) || 0) + cant);
    }
    // Orden fijo por ID: evita bloqueos cruzados cuando dos personas venden a la vez
    return [...juntos].map(([id, cant]) => ({ id, cant })).sort((a, b) => a.id - b.id);
}

// Toma y bloquea cada producto, valida stock y devuelve las líneas con el precio REAL
async function prepararLineas(conn, items) {
    const lineas = [];
    for (const it of items) {
        const [p] = await conn.query(
            'SELECT id_producto, nombre, precio_venta_unitario, stock_unidades FROM productos WHERE id_producto = ? FOR UPDATE', [it.id]);
        if (!p.length) throw new ErrorNegocio(`Un producto del carrito ya no existe (ID ${it.id}). Actualiza la pantalla.`);
        const prod = p[0];
        if (!config.PERMITIR_VENTA_SIN_STOCK && Number(prod.stock_unidades) < it.cant) {
            throw new ErrorNegocio(`Stock insuficiente de "${prod.nombre}": quedan ${prod.stock_unidades} y se intentan ${it.cant}.`);
        }
        const precioC = centavos(prod.precio_venta_unitario);
        lineas.push({ id: it.id, nombre: prod.nombre, cant: it.cant, precioC, subC: precioC * it.cant });
    }
    return lineas;
}

// Crea la cabecera de venta con número de comprobante único (NV-000123) sin choques entre cajeros
async function crearVenta(conn, d) {
    const temporal = 'T' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const [r] = await conn.query(
        `INSERT INTO ventas (numero_comprobante, id_caja, id_usuario, id_cliente, total, pago_efectivo, pago_yape,
                             pago_plin, pago_tarjeta, monto_recibido, vuelto, cliente_mesa)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [temporal, d.idCaja, d.idUsuario, d.idCliente, aDecimal(d.totalC), aDecimal(d.pagos.ef), aDecimal(d.pagos.ya),
            aDecimal(d.pagos.pl), aDecimal(d.pagos.ta), aDecimal(d.pagos.recibido), aDecimal(d.pagos.vuelto), d.clienteMesa || null]);
    const numero = d.prefijo + String(r.insertId).padStart(6, '0');
    await conn.query('UPDATE ventas SET numero_comprobante = ? WHERE id_venta = ?', [numero, r.insertId]);
    return { id: r.insertId, numero };
}

const pagosDe = (b) => ({ ef: b.pago_efectivo, ya: b.pago_yape, pl: b.pago_plin, ta: b.pago_tarjeta });

app.post('/api/ventas/procesar', async (req, res) => {
    const b = req.body || {};
    const items = normalizarCarrito(b.carrito);

    const r = await conTransaccion(db, async (conn) => {
        const idCaja = await resolverCaja(conn);
        const lineas = await prepararLineas(conn, items);
        const totalC = lineas.reduce((s, l) => s + l.subC, 0);
        const pagos = repartirPagos(pagosDe(b), totalC, { permiteVuelto: true, recibidoCliente: centavos(b.monto_recibido) });

        const { id, numero } = await crearVenta(conn, {
            idCaja, idUsuario: req.user.id_usuario, idCliente: 1, totalC, pagos, clienteMesa: null, prefijo: 'NV-',
        });
        for (const l of lineas) {
            await conn.query(
                `INSERT INTO detalle_ventas (id_venta, id_producto, tipo_empaque, cantidad, precio_unitario, subtotal) VALUES (?, ?, 'Unidad', ?, ?, ?)`,
                [id, l.id, l.cant, aDecimal(l.precioC), aDecimal(l.subC)]);
            await conn.query('UPDATE productos SET stock_unidades = stock_unidades - ? WHERE id_producto = ?', [l.cant, l.id]);
        }
        return { id, numero, totalC, vuelto: pagos.vuelto };
    });

    const extra = r.vuelto > 0 ? ` Vuelto: S/ ${soles(r.vuelto)}.` : '';
    res.json({
        success: true,
        message: `¡Venta ${r.numero} registrada! Total S/ ${soles(r.totalC)}.${extra}`,
        id_venta: r.id, numero_comprobante: r.numero, total: aDecimal(r.totalC), vuelto: aDecimal(r.vuelto),
    });
});

app.get('/api/ventas/ticket/:id_venta', async (req, res) => {
    const id = idParam(req.params.id_venta, 'La venta');
    const [venta] = await q().query(
        `SELECT v.*, u.nombre AS cajero FROM ventas v LEFT JOIN usuarios u ON u.id_usuario = v.id_usuario WHERE v.id_venta = ?`, [id]);
    if (venta.length === 0) return res.status(404).json({ success: false, message: 'Venta no encontrada' });
    const [detalles] = await q().query(
        `SELECT dv.cantidad, dv.tipo_empaque, dv.precio_unitario, dv.subtotal, p.nombre AS producto_nombre
         FROM detalle_ventas dv JOIN productos p ON dv.id_producto = p.id_producto WHERE dv.id_venta = ?`, [id]);
    res.json({ success: true, venta: venta[0], detalles });
});

// ============================================================
// MESAS Y CUENTAS
// ============================================================
async function cuentaAbiertaBloqueada(conn, idCuenta) {
    const [r] = await conn.query('SELECT * FROM cuentas WHERE id_cuenta = ? FOR UPDATE', [idCuenta]);
    if (!r.length) throw new ErrorNegocio('La cuenta no existe.', 404);
    if (r[0].estado !== 'Abierta') {
        throw new ErrorNegocio(`Esta cuenta ya está en estado "${r[0].estado}". Actualiza la pantalla.`, 409);
    }
    return r[0];
}
async function totalCuenta(conn, idCuenta) {
    const [s] = await conn.query('SELECT COALESCE(SUM(subtotal), 0) AS t, COUNT(*) AS n FROM cuentas_detalle WHERE id_cuenta = ?', [idCuenta]);
    return { totalC: centavos(s[0].t), n: Number(s[0].n) };
}
async function recalcularCuenta(conn, idCuenta) {
    const t = await totalCuenta(conn, idCuenta);
    await conn.query('UPDATE cuentas SET total = ? WHERE id_cuenta = ?', [aDecimal(t.totalC), idCuenta]);
    return t.totalC;
}

app.get('/api/cuentas', async (req, res) => {
    const [cuentas] = await q().query("SELECT * FROM cuentas WHERE estado = 'Abierta' ORDER BY fecha_apertura DESC");
    res.json({ success: true, cuentas });
});

app.post('/api/cuentas/nueva', async (req, res) => {
    const b = req.body || {};
    const tipo = String(b.tipo || '').toLowerCase().startsWith('cli') ? 'cliente' : 'mesa';
    let identificador = limpiarTexto(b.identificador, 100);
    let idCliente = null;

    if (tipo === 'cliente') {
        idCliente = entero(b.id_cliente);
        if (!(idCliente > 1)) throw new ErrorNegocio('Selecciona un cliente registrado.');
        const [c] = await q().query('SELECT nombre FROM clientes WHERE id_cliente = ?', [idCliente]);
        if (!c.length) throw new ErrorNegocio('El cliente no existe.');
        identificador = limpiarTexto(c[0].nombre, 100);
    }
    if (!identificador) throw new ErrorNegocio('Faltan datos de la cuenta.');

    const [dup] = tipo === 'cliente'
        ? await q().query("SELECT id_cuenta FROM cuentas WHERE estado = 'Abierta' AND id_cliente = ? LIMIT 1", [idCliente])
        : await q().query("SELECT id_cuenta FROM cuentas WHERE estado = 'Abierta' AND tipo = 'mesa' AND LOWER(identificador) = LOWER(?) LIMIT 1", [identificador]);
    if (dup.length) {
        throw new ErrorNegocio(tipo === 'cliente' ? 'Ese cliente ya tiene una cuenta abierta.' : `Ya hay una cuenta abierta con el nombre "${identificador}".`, 409);
    }

    const [r] = await q().query('INSERT INTO cuentas (tipo, identificador, id_cliente) VALUES (?, ?, ?)', [tipo, identificador, idCliente]);
    res.json({ success: true, message: '¡Cuenta aperturada con éxito!', id_cuenta: r.insertId });
});

app.get('/api/cuentas/:id/detalle', async (req, res) => {
    const id = idParam(req.params.id, 'La cuenta');
    const [c] = await q().query('SELECT id_cuenta, tipo, identificador, estado, total FROM cuentas WHERE id_cuenta = ?', [id]);
    if (!c.length) return res.status(404).json({ success: false, message: 'La cuenta no existe.' });
    const [detalles] = await q().query(
        `SELECT cd.id_detalle, cd.id_producto, p.nombre, cd.cantidad, cd.precio_unitario AS precio, cd.subtotal
         FROM cuentas_detalle cd JOIN productos p ON cd.id_producto = p.id_producto
         WHERE cd.id_cuenta = ? ORDER BY cd.id_detalle`, [id]);
    res.json({ success: true, detalles, cuenta: c[0] });
});

// Agregar productos a la mesa: descuenta stock y recalcula el total en una sola operación
app.post('/api/cuentas/guardar', async (req, res) => {
    const b = req.body || {};
    const idCuenta = idParam(b.id_cuenta, 'La cuenta');
    const items = normalizarCarrito(b.productos);

    await conTransaccion(db, async (conn) => {
        await cuentaAbiertaBloqueada(conn, idCuenta);
        const lineas = await prepararLineas(conn, items);
        for (const l of lineas) {
            await conn.query('INSERT INTO cuentas_detalle (id_cuenta, id_producto, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)',
                [idCuenta, l.id, l.cant, aDecimal(l.precioC), aDecimal(l.subC)]);
            await conn.query('UPDATE productos SET stock_unidades = stock_unidades - ? WHERE id_producto = ?', [l.cant, l.id]);
        }
        await recalcularCuenta(conn, idCuenta);
    });
    res.json({ success: true, message: '¡Mesa guardada y stock actualizado!' });
});

// NUEVO: corregir un error del mozo (quitar un producto ya guardado). Devuelve el stock y deja huella.
app.post('/api/cuentas/quitar-item', async (req, res) => {
    const b = req.body || {};
    const idDetalle = idParam(b.id_detalle, 'El producto de la cuenta');
    const motivo = motivoObligatorio(b.motivo);

    const total = await conTransaccion(db, async (conn) => {
        const [previo] = await conn.query('SELECT id_cuenta FROM cuentas_detalle WHERE id_detalle = ?', [idDetalle]);
        if (!previo.length) throw new ErrorNegocio('Ese producto ya no está en la cuenta. Actualiza la pantalla.', 404);
        const cuenta = await cuentaAbiertaBloqueada(conn, previo[0].id_cuenta);

        const [d] = await conn.query(
            `SELECT cd.id_detalle, cd.id_producto, cd.cantidad, cd.precio_unitario, p.nombre
             FROM cuentas_detalle cd JOIN productos p ON p.id_producto = cd.id_producto WHERE cd.id_detalle = ? FOR UPDATE`, [idDetalle]);
        if (!d.length) throw new ErrorNegocio('Ese producto ya no está en la cuenta. Actualiza la pantalla.', 404);
        const fila = d[0];

        const quitar = (b.cantidad === undefined || b.cantidad === null || b.cantidad === '') ? fila.cantidad : entero(b.cantidad);
        if (!(quitar > 0) || quitar > fila.cantidad) throw new ErrorNegocio(`La cantidad a quitar debe estar entre 1 y ${fila.cantidad}.`);

        if (quitar === fila.cantidad) {
            await conn.query('DELETE FROM cuentas_detalle WHERE id_detalle = ?', [idDetalle]);
        } else {
            const nueva = fila.cantidad - quitar;
            await conn.query('UPDATE cuentas_detalle SET cantidad = ?, subtotal = ? WHERE id_detalle = ?',
                [nueva, aDecimal(centavos(fila.precio_unitario) * nueva), idDetalle]);
        }
        await conn.query('UPDATE productos SET stock_unidades = stock_unidades + ? WHERE id_producto = ?', [quitar, fila.id_producto]);
        const nuevoTotal = await recalcularCuenta(conn, cuenta.id_cuenta);
        await audit.registrar(conn, req.user.id_usuario,
            `Quitó ${quitar} x "${fila.nombre}" (S/ ${soles(centavos(fila.precio_unitario) * quitar)}) de "${cuenta.identificador}" (#${cuenta.id_cuenta}). Motivo: ${motivo}`);
        return nuevoTotal;
    });
    res.json({ success: true, message: 'Producto quitado de la cuenta y stock devuelto.', total: aDecimal(total) });
});

// NUEVO: anular una cuenta completa (devuelve todo el stock). Queda en auditoría.
app.post('/api/cuentas/anular', async (req, res) => {
    const b = req.body || {};
    const idCuenta = idParam(b.id_cuenta, 'La cuenta');

    const resumen = await conTransaccion(db, async (conn) => {
        const cuenta = await cuentaAbiertaBloqueada(conn, idCuenta);
        const [items] = await conn.query('SELECT id_producto, cantidad FROM cuentas_detalle WHERE id_cuenta = ?', [idCuenta]);
        const t = await totalCuenta(conn, idCuenta);
        const motivo = items.length ? motivoObligatorio(b.motivo) : (limpiarTexto(b.motivo, 150) || 'Cuenta sin consumo');
        for (const it of items) {
            await conn.query('UPDATE productos SET stock_unidades = stock_unidades + ? WHERE id_producto = ?', [it.cantidad, it.id_producto]);
        }
        await conn.query("UPDATE cuentas SET estado = 'Anulada' WHERE id_cuenta = ?", [idCuenta]);
        await audit.registrar(conn, req.user.id_usuario,
            `Anuló la cuenta "${cuenta.identificador}" (#${idCuenta}) de S/ ${soles(t.totalC)} con ${items.length} producto(s) devueltos al stock. Motivo: ${motivo}`);
        return { n: items.length };
    });
    res.json({ success: true, message: resumen.n ? 'Cuenta anulada y stock devuelto.' : 'Cuenta cancelada.' });
});

app.post('/api/cuentas/cobrar', async (req, res) => {
    const b = req.body || {};
    const idCuenta = idParam(b.id_cuenta, 'La cuenta');

    const r = await conTransaccion(db, async (conn) => {
        // Bloquea la cuenta: si hacen doble clic, el segundo cobro falla (ya no está "Abierta")
        const cuenta = await cuentaAbiertaBloqueada(conn, idCuenta);
        const { totalC, n } = await totalCuenta(conn, idCuenta);
        if (n === 0 || totalC <= 0) throw new ErrorNegocio('No hay nada que cobrar en esta cuenta.');
        const idCaja = await resolverCaja(conn);
        const pagos = repartirPagos(pagosDe(b), totalC, { permiteVuelto: false });

        const { id, numero } = await crearVenta(conn, {
            idCaja, idUsuario: req.user.id_usuario, idCliente: cuenta.id_cliente || 1, totalC, pagos,
            clienteMesa: cuenta.identificador, prefijo: 'NV-',
        });
        await conn.query(
            `INSERT INTO detalle_ventas (id_venta, id_producto, tipo_empaque, cantidad, precio_unitario, subtotal)
             SELECT ?, id_producto, 'Unidad', cantidad, precio_unitario, subtotal FROM cuentas_detalle WHERE id_cuenta = ?`, [id, idCuenta]);
        await conn.query("UPDATE cuentas SET estado = 'Cerrada', total = ? WHERE id_cuenta = ?", [aDecimal(totalC), idCuenta]);
        return { id, numero };
    });
    res.json({ success: true, message: '¡Cobro procesado con éxito!', id_venta: r.id, numero_comprobante: r.numero });
});

// Solo el administrador puede dar crédito (fiar)
app.post('/api/cuentas/pasar-a-fiado', soloAdmin, async (req, res) => {
    const b = req.body || {};
    const idCuenta = idParam(b.id_cuenta, 'La cuenta');

    await conTransaccion(db, async (conn) => {
        const cuenta = await cuentaAbiertaBloqueada(conn, idCuenta);
        const idCliente = cuenta.id_cliente || entero(b.id_cliente);
        if (!(idCliente > 1)) throw new ErrorNegocio('Esta cuenta no tiene un cliente registrado a quien fiar.');
        const [cli] = await conn.query('SELECT nombre FROM clientes WHERE id_cliente = ? FOR UPDATE', [idCliente]);
        if (!cli.length) throw new ErrorNegocio('El cliente no existe.');
        const { totalC, n } = await totalCuenta(conn, idCuenta);
        if (n === 0 || totalC <= 0) throw new ErrorNegocio('Datos incompletos o monto en cero para fiar.');

        await conn.query("UPDATE cuentas SET estado = 'Fiado', total = ? WHERE id_cuenta = ?", [aDecimal(totalC), idCuenta]);
        await conn.query('UPDATE clientes SET deuda_acumulada = deuda_acumulada + ? WHERE id_cliente = ?', [aDecimal(totalC), idCliente]);
        await audit.registrar(conn, req.user.id_usuario, `Fió S/ ${soles(totalC)} a "${cli[0].nombre}" (cuenta #${idCuenta})`);
    });
    res.json({ success: true, message: 'Cuenta pasada a crédito exitosamente.' });
});

// ============================================================
// FIADOS (solo administrador)
// ============================================================
app.get('/api/fiados', soloAdmin, async (req, res) => {
    const [clientes] = await q().query(
        'SELECT id_cliente, nombre, telefono, deuda_acumulada FROM clientes WHERE deuda_acumulada > 0 ORDER BY deuda_acumulada DESC');
    res.json({ success: true, clientes });
});

app.post('/api/fiados/abonar', soloAdmin, async (req, res) => {
    const b = req.body || {};
    const idCliente = idParam(b.id_cliente, 'El cliente');
    const montoC = dineroObligatorio(b.monto_total, 'Ingresa un monto válido para abonar.');
    if (montoC <= 0) throw new ErrorNegocio('Ingresa un monto válido para abonar.');

    await conTransaccion(db, async (conn) => {
        const [cli] = await conn.query('SELECT nombre, deuda_acumulada FROM clientes WHERE id_cliente = ? FOR UPDATE', [idCliente]);
        if (!cli.length) throw new ErrorNegocio('El cliente no existe.', 404);
        const deudaC = centavos(cli[0].deuda_acumulada);
        if (montoC > deudaC) throw new ErrorNegocio(`El abono (S/ ${soles(montoC)}) no puede ser mayor a la deuda actual (S/ ${soles(deudaC)}).`);
        const idCaja = await resolverCaja(conn);
        const pagos = repartirPagos(pagosDe(b), montoC, { permiteVuelto: false });

        await conn.query('UPDATE clientes SET deuda_acumulada = deuda_acumulada - ? WHERE id_cliente = ?', [aDecimal(montoC), idCliente]);
        // El abono entra a la caja como un ingreso (queda registrado en ventas para el arqueo y el reporte)
        await crearVenta(conn, {
            idCaja, idUsuario: req.user.id_usuario, idCliente, totalC: montoC, pagos,
            clienteMesa: limpiarTexto(`ABONO - ${cli[0].nombre}`, 120), prefijo: 'ABONO-',
        });
        await audit.registrar(conn, req.user.id_usuario, `Registró abono de S/ ${soles(montoC)} de "${cli[0].nombre}" (deuda restante S/ ${soles(deudaC - montoC)})`);
    });
    res.json({ success: true, message: 'Abono guardado.' });
});

// ============================================================
// CLIENTES (ver: todos / administrar: admin)
// ============================================================
app.get('/api/clientes', async (req, res) => {
    const cols = req.user.rol === 'Administrador' ? 'id_cliente, nombre, documento, telefono, deuda_acumulada' : 'id_cliente, nombre';
    const [clientes] = await q().query(`SELECT ${cols} FROM clientes ORDER BY nombre ASC`);
    res.json({ success: true, clientes });
});
app.post('/api/clientes/nuevo', soloAdmin, async (req, res) => {
    const b = req.body || {};
    const nombre = limpiarTexto(b.nombre, 100);
    if (!nombre) throw new ErrorNegocio('El nombre es obligatorio.');
    await q().query('INSERT INTO clientes (nombre, documento, telefono) VALUES (?, ?, ?)',
        [nombre, limpiarTexto(b.documento, 15) || null, limpiarTexto(b.telefono, 20) || null]);
    res.json({ success: true, message: 'Cliente registrado.' });
});
app.put('/api/clientes/editar/:id', soloAdmin, async (req, res) => {
    const b = req.body || {};
    const nombre = limpiarTexto(b.nombre, 100);
    if (!nombre) throw new ErrorNegocio('El nombre es obligatorio.');
    await q().query('UPDATE clientes SET nombre = ?, documento = ?, telefono = ? WHERE id_cliente = ?',
        [nombre, limpiarTexto(b.documento, 15) || null, limpiarTexto(b.telefono, 20) || null, idParam(req.params.id)]);
    res.json({ success: true, message: 'Cliente actualizado.' });
});
app.delete('/api/clientes/eliminar/:id', soloAdmin, async (req, res) => {
    const id = idParam(req.params.id);
    if (id === 1) throw new ErrorNegocio('No puedes eliminar al Cliente General.');
    const [c] = await q().query('SELECT deuda_acumulada FROM clientes WHERE id_cliente = ?', [id]);
    if (c.length && centavos(c[0].deuda_acumulada) > 0) throw new ErrorNegocio('Este cliente tiene una deuda pendiente. Primero cóbrasela.');
    try {
        await q().query('DELETE FROM clientes WHERE id_cliente = ?', [id]);
    } catch (e) {
        if (e.errno === 1451 || e.code === 'ER_ROW_IS_REFERENCED_2') throw new ErrorNegocio('No se puede eliminar porque tiene ventas registradas.');
        throw e;
    }
    res.json({ success: true, message: 'Cliente eliminado.' });
});

// ============================================================
// REPORTES (solo administrador)
// ============================================================
app.get('/api/reportes/avanzado', soloAdmin, async (req, res) => {
    const { inicio, fin } = req.query;
    if (!fechaISO(inicio) || !fechaISO(fin)) throw new ErrorNegocio('Elige una fecha de inicio y una de fin válidas.');
    const cliente = limpiarTexto(req.query.cliente, 60);

    let donde = 'WHERE DATE(v.fecha_venta) BETWEEN ? AND ?';
    const params = [inicio, fin];
    if (cliente) { donde += ' AND v.cliente_mesa LIKE ?'; params.push(`%${cliente}%`); }

    const [ventas] = await q().query(
        `SELECT v.*, u.nombre AS cajero FROM ventas v LEFT JOIN usuarios u ON u.id_usuario = v.id_usuario
         ${donde} ORDER BY v.fecha_venta DESC LIMIT 5000`, params);
    const [t] = await q().query(
        `SELECT IFNULL(SUM(v.pago_efectivo), 0) AS ef,
                IFNULL(SUM(v.pago_yape), 0) + IFNULL(SUM(v.pago_plin), 0) + IFNULL(SUM(v.pago_tarjeta), 0) AS dig
         FROM ventas v ${donde}`, params);
    const efectivo = Number(t[0].ef);
    const digital = Number(t[0].dig);
    res.json({ success: true, totales: { efectivo, digital, general: efectivo + digital }, ventas });
});

// ============================================================
// USUARIOS Y ROLES (solo administrador)
// ============================================================
const RE_USUARIO = /^[\p{L}\p{N}._@-]{3,50}$/u;

function leerUsuario(b, creando) {
    const nombre = limpiarTexto(b.nombre, 100);
    if (!nombre) throw new ErrorNegocio('Falta el nombre del usuario.');
    const usuario = limpiarTexto(b.usuario, 50);
    if (!RE_USUARIO.test(usuario)) throw new ErrorNegocio('El usuario debe tener de 3 a 50 caracteres (letras, números, punto, guion), sin espacios.');
    const idRol = entero(b.id_rol);
    if (!(idRol > 0)) throw new ErrorNegocio('Selecciona un rol.');
    let password = null;
    if (b.password !== undefined && b.password !== null && b.password !== '') {
        password = String(b.password);
        if (password.length < 6) throw new ErrorNegocio('La contraseña debe tener al menos 6 caracteres.');
        if (password.length > 72) throw new ErrorNegocio('La contraseña es demasiado larga (máximo 72 caracteres).');
    } else if (creando) {
        throw new ErrorNegocio('Faltan datos.');
    }
    return { nombre, usuario, idRol, password };
}
async function cantidadAdmins(conn, exceptoId = 0) {
    const [r] = await conn.query(
        "SELECT COUNT(*) AS c FROM usuarios u INNER JOIN roles r ON r.id_rol = u.id_rol WHERE r.descripcion = 'Administrador' AND u.id_usuario <> ?", [exceptoId]);
    return Number(r[0].c);
}

app.get('/api/roles', soloAdmin, async (req, res) => {
    const [roles] = await q().query('SELECT * FROM roles');
    res.json({ success: true, roles });
});

app.get('/api/usuarios', soloAdmin, async (req, res) => {
    const [usuarios] = await q().query(
        'SELECT u.id_usuario, u.nombre, u.usuario, u.id_rol, r.descripcion AS rol FROM usuarios u INNER JOIN roles r ON u.id_rol = r.id_rol');
    res.json({ success: true, usuarios });
});

app.post('/api/usuarios/nuevo', soloAdmin, async (req, res) => {
    const u = leerUsuario(req.body || {}, true);
    const [rol] = await q().query('SELECT id_rol FROM roles WHERE id_rol = ?', [u.idRol]);
    if (!rol.length) throw new ErrorNegocio('El rol no existe.');
    try {
        await q().query('INSERT INTO usuarios (nombre, usuario, password, id_rol) VALUES (?, ?, ?, ?)',
            [u.nombre, u.usuario, await hashear(u.password), u.idRol]);
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) throw new ErrorNegocio('Error (El usuario ya existe).', 409);
        throw e;
    }
    await audit.registrar(db, req.user.id_usuario, `Creó el usuario "${u.usuario}" (${u.nombre})`);
    res.json({ success: true, message: 'Usuario creado.' });
});

app.put('/api/usuarios/editar/:id', soloAdmin, async (req, res) => {
    const id = idParam(req.params.id, 'El usuario');
    const u = leerUsuario(req.body || {}, false);

    await conTransaccion(db, async (conn) => {
        const [actual] = await conn.query(
            'SELECT u.id_usuario, r.descripcion AS rol FROM usuarios u INNER JOIN roles r ON r.id_rol = u.id_rol WHERE u.id_usuario = ? FOR UPDATE', [id]);
        if (!actual.length) throw new ErrorNegocio('El usuario no existe.', 404);
        const [rolNuevo] = await conn.query('SELECT descripcion FROM roles WHERE id_rol = ?', [u.idRol]);
        if (!rolNuevo.length) throw new ErrorNegocio('El rol no existe.');
        // Nunca puede quedar el sistema sin administrador
        if (actual[0].rol === 'Administrador' && rolNuevo[0].descripcion !== 'Administrador' && (await cantidadAdmins(conn, id)) === 0) {
            throw new ErrorNegocio('No puedes quitar el rol de Administrador al único administrador que existe.');
        }
        try {
            if (u.password) {
                await conn.query('UPDATE usuarios SET nombre = ?, usuario = ?, password = ?, id_rol = ? WHERE id_usuario = ?',
                    [u.nombre, u.usuario, await hashear(u.password), u.idRol, id]);
            } else {
                await conn.query('UPDATE usuarios SET nombre = ?, usuario = ?, id_rol = ? WHERE id_usuario = ?', [u.nombre, u.usuario, u.idRol, id]);
            }
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) throw new ErrorNegocio('Ese nombre de usuario ya existe.', 409);
            throw e;
        }
        await audit.registrar(conn, req.user.id_usuario, `Editó el usuario "${u.usuario}"${u.password ? ' (cambió su contraseña)' : ''}`);
    });
    olvidar(id);
    res.json({ success: true, message: 'Usuario actualizado.' });
});

app.delete('/api/usuarios/eliminar/:id', soloAdmin, async (req, res) => {
    const id = idParam(req.params.id, 'El usuario');
    if (id === 1) throw new ErrorNegocio('¡No puedes borrar al Administrador principal!');
    if (id === req.user.id_usuario) throw new ErrorNegocio('No puedes eliminar tu propio usuario.');
    const [u] = await q().query('SELECT usuario FROM usuarios WHERE id_usuario = ?', [id]);
    try {
        await q().query('DELETE FROM usuarios WHERE id_usuario = ?', [id]);
    } catch (e) {
        if (e.errno === 1451 || e.code === 'ER_ROW_IS_REFERENCED_2') {
            throw new ErrorNegocio('No se puede eliminar porque este usuario tiene ventas o cajas registradas. Mejor cámbiale la contraseña.');
        }
        throw e;
    }
    olvidar(id);
    await audit.registrar(db, req.user.id_usuario, `Eliminó el usuario "${u.length ? u[0].usuario : id}"`);
    res.json({ success: true, message: 'Usuario eliminado.' });
});

// ============================================================
// AUDITORÍA Y RESPALDOS (solo administrador)
// ============================================================
app.get('/api/auditoria', soloAdmin, async (req, res) => {
    const limite = Math.min(Math.max(entero(req.query.limite) || 200, 1), 500);
    const texto = limpiarTexto(req.query.texto, 60);
    const params = [];
    let donde = '';
    if (texto) { donde = 'WHERE l.accion LIKE ? OR u.nombre LIKE ?'; params.push(`%${texto}%`, `%${texto}%`); }
    const [logs] = await q().query(
        `SELECT l.id_log, l.fecha, u.nombre AS usuario, l.accion FROM logs_auditoria l
         LEFT JOIN usuarios u ON u.id_usuario = l.id_usuario ${donde} ORDER BY l.id_log DESC LIMIT ${limite}`, params);
    res.json({ success: true, logs });
});

app.get('/api/respaldo/lista', soloAdmin, (req, res) => {
    res.json({ success: true, respaldos: respaldo.listar() });
});
app.post('/api/respaldo/ahora', soloAdmin, async (req, res) => {
    let r;
    try { r = await respaldo.hacerRespaldo(); } catch (e) { throw new ErrorNegocio(e.message, 500); }
    await audit.registrar(db, req.user.id_usuario, `Hizo un respaldo manual (${r.archivo})`);
    res.json({ success: true, message: 'Respaldo creado correctamente.', archivo: r.archivo, bytes: r.bytes, copiadoA: r.copiadoA });
});
app.get('/api/respaldo/descargar/:archivo', soloAdmin, (req, res) => {
    const ruta = respaldo.rutaSegura(req.params.archivo);
    if (!ruta) return res.status(404).json({ success: false, message: 'Respaldo no encontrado.' });
    res.download(ruta, req.params.archivo);
});

// ============================================================
// ERRORES
// ============================================================
app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Ruta no encontrada.' }));

const ERRORES_CONEXION = ['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'EHOSTUNREACH', 'ER_CON_COUNT_ERROR'];
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err instanceof ErrorNegocio) return res.status(err.status).json({ success: false, message: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Datos inválidos.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'Los datos enviados son demasiado grandes.' });
    log.error(`${req.method} ${req.originalUrl}`, err);
    if (ERRORES_CONEXION.includes(err.code)) {
        return res.status(503).json({ success: false, message: 'No hay conexión con la base de datos. Verifica que MySQL (XAMPP) esté encendido.' });
    }
    res.status(500).json({ success: false, message: 'Ocurrió un error interno. Si se repite, avisa a soporte.' });
});

// ============================================================
// ARRANQUE
// ============================================================
function direccionesLAN() {
    const out = [];
    for (const lista of Object.values(os.networkInterfaces())) {
        for (const i of lista || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
    return out;
}

async function iniciar() {
    log.limpiarViejos();
    await esperarBaseDeDatos(db, log);
    await migrar(db, log);
    return new Promise((resolve, reject) => {
        const server = app.listen(config.PORT, config.HOST, () => {
            log.info('==============================================');
            log.info(' ERP LICORERÍA POS - servidor encendido');
            log.info(`  En esta computadora:  http://localhost:${config.PORT}`);
            direccionesLAN().forEach((ip) => log.info(`  Desde el celular/otra PC (mismo WiFi):  http://${ip}:${config.PORT}`));
            log.info('==============================================');
            resolve(server);
        });
        server.on('error', (e) => {
            if (e.code === 'EADDRINUSE') log.error(`El puerto ${config.PORT} ya está en uso. ¿El sistema ya está abierto en otra ventana?`);
            reject(e);
        });
    });
}

if (require.main === module) {
    process.on('unhandledRejection', (e) => log.error('Promesa sin manejar:', e));
    process.on('uncaughtException', (e) => { log.error('Error fatal:', e); process.exit(1); });
    iniciar().catch((e) => { log.error('No se pudo iniciar el sistema:', e.message); process.exit(1); });
}

module.exports = { app, iniciar };
