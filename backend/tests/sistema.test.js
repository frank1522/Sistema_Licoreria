// ============================================================
// PRUEBAS AUTOMÁTICAS DEL SISTEMA (sin necesidad de MySQL)
// Ejecutar:  node --test tests/        (requiere Node 22 o superior, solo para desarrollo)
// ============================================================
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

// --- Entorno de prueba (ANTES de cargar el sistema) ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'licoreria-test-'));
process.env.JWT_SECRET = 'clave-de-prueba-'.padEnd(40, 'x');
process.env.LOG_A_ARCHIVO = '0';
process.env.BACKUP_DIR = path.join(tmp, 'respaldos');
const falsoDump = path.join(tmp, 'mysqldump_falso.sh');
fs.writeFileSync(falsoDump, '#!/bin/sh\necho "-- volcado de prueba"\nfor i in 1 2 3 4 5 6 7 8 9 10; do echo "-- linea de relleno para superar el tamano minimo de un respaldo real $i"; done\necho "CREATE TABLE x (id int);"\necho "-- Dump completed on 2026-11-08"\n', { mode: 0o755 });
process.env.MYSQLDUMP_PATH = falsoDump;

const { crearPool } = require('./shim_mysql');
const pool = crearPool(require('./esquema_sqlite'));
const dbRuta = require.resolve('../db');
require.cache[dbRuta] = { id: dbRuta, filename: dbRuta, loaded: true, exports: pool };

const { migrar } = require('../lib/migraciones');
const { app } = require('../index');
const silencio = { info() {}, aviso() {}, error() {} };

let base;
let server;
let tAdmin;
let tCajero;
const sq = pool.sqlite;
const uno = (sql, ...p) => sq.prepare(sql).get(...p);
const todos = (sql, ...p) => sq.prepare(sql).all(...p);

async function api(metodo, ruta, cuerpo, token) {
    const r = await fetch(base + ruta, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    let json = null;
    try { json = await r.json(); } catch (e) { /* sin cuerpo JSON */ }
    return { status: r.status, json };
}
const stock = (id) => uno('SELECT stock_unidades AS s FROM productos WHERE id_producto = ?', id).s;
const ventas = () => uno('SELECT COUNT(*) AS c FROM ventas').c;

test.before(async () => {
    sq.exec(`
        INSERT INTO roles (id_rol, descripcion) VALUES (1,'Administrador'),(2,'Cajero'),(3,'Vendedor');
        INSERT INTO usuarios (nombre, usuario, password, id_rol) VALUES ('Admin','admin','123',1),('Caja Uno','cajero','cajero2026',2);
        INSERT INTO categorias (nombre) VALUES ('Cervezas'),('Licores');
        INSERT INTO clientes (nombre) VALUES ('Cliente Varios (Público General)'),('Carlos Gómez');
        INSERT INTO proveedores (razon_social) VALUES ('Backus');
        INSERT INTO productos (codigo_barras, nombre, id_categoria, precio_costo_unitario, precio_venta_unitario, stock_unidades, stock_minimo)
        VALUES ('111','Cerveza Cristal',1,3.5,5.50,10,5),('222','Ron Cartavio',2,25,40,3,2),('333','Hielo 2kg',2,1,2,100,10);
    `);
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

// ------------------------------------------------------------
test('1. Migraciones: agregan columnas faltantes y cifran contraseñas', async () => {
    assert.equal(todos('PRAGMA table_info(clientes)').some((c) => c.name === 'deuda_acumulada'), false);
    await migrar(pool, silencio);
    await migrar(pool, silencio); // correrla dos veces no debe romper nada
    assert.ok(todos('PRAGMA table_info(clientes)').some((c) => c.name === 'deuda_acumulada'));
    assert.ok(todos('PRAGMA table_info(cuentas)').some((c) => c.name === 'id_cliente'));
    assert.ok(todos('PRAGMA table_info(caja)').some((c) => c.name === 'descuadre'));
    assert.ok(todos('PRAGMA table_info(ventas)').some((c) => c.name === 'cliente_mesa'));
    for (const u of todos('SELECT usuario, password FROM usuarios')) assert.match(u.password, /^\$2[aby]\$/, `${u.usuario} debe estar cifrado`);
});

test('2. Login: correcto, incorrecto, aviso de clave débil y migración de clave antigua', async () => {
    let r = await api('POST', '/api/auth/login', { usuario: 'admin', contrasena: 'mala' });
    assert.equal(r.status, 401);
    r = await api('POST', '/api/auth/login', { usuario: 'noexiste', contrasena: 'x' });
    assert.equal(r.status, 401);
    r = await api('POST', '/api/auth/login', { usuario: 'admin', contrasena: '123' });
    assert.equal(r.status, 200);
    assert.ok(r.json.token);
    assert.equal(r.json.usuario.rol, 'Administrador');
    assert.ok(r.json.aviso, 'clave simple debe generar aviso');
    tAdmin = r.json.token;
    r = await api('POST', '/api/auth/login', { usuario: 'cajero', contrasena: 'cajero2026' });
    assert.equal(r.json.aviso, null);
    tCajero = r.json.token;
    // usuario con clave antigua en texto plano (como venía en el .sql original)
    sq.prepare("INSERT INTO usuarios (nombre, usuario, password, id_rol) VALUES ('Viejo','viejo','clavevieja',2)").run();
    r = await api('POST', '/api/auth/login', { usuario: 'viejo', contrasena: 'clavevieja' });
    assert.equal(r.status, 200);
    assert.match(uno("SELECT password FROM usuarios WHERE usuario='viejo'").password, /^\$2[aby]\$/);
    sq.prepare("DELETE FROM usuarios WHERE usuario='viejo'").run();
});

test('3. Sin sesión o con token falso no se puede usar la API', async () => {
    assert.equal((await api('GET', '/api/inventario')).status, 401);
    assert.equal((await api('GET', '/api/inventario', undefined, 'token.falso.aqui')).status, 401);
    assert.equal((await api('POST', '/api/usuarios/nuevo', { nombre: 'x', usuario: 'hack', password: '123456', id_rol: 1 })).status, 401);
});

test('4. Permisos por rol (el cajero NO puede hacer cosas de administrador)', async () => {
    const prohibidas = [
        ['GET', '/api/usuarios'], ['GET', '/api/roles'], ['GET', '/api/fiados'], ['GET', '/api/auditoria'], ['GET', '/api/respaldo/lista'],
        ['GET', '/api/reportes/avanzado?inicio=2026-01-01&fin=2026-12-31'],
        ['POST', '/api/usuarios/nuevo', { nombre: 'x', usuario: 'hack1', password: '123456', id_rol: 1 }],
        ['POST', '/api/productos/nuevo', { nombre: 'x', id_categoria: 1, precio_venta: 1 }],
        ['POST', '/api/inventario/ajuste', { id_producto: 1, tipo_ajuste: 'Entrada', cantidad: 5, motivo: 'robo' }],
        ['POST', '/api/compras/registrar', { id_proveedor: 1, detalles: [{ id_producto: 1, cantidad: 1, precio_compra: 1 }] }],
        ['POST', '/api/cuentas/pasar-a-fiado', { id_cuenta: 1 }],
        ['POST', '/api/fiados/abonar', { id_cliente: 2, monto_total: 1 }],
        ['POST', '/api/clientes/nuevo', { nombre: 'x' }],
        ['POST', '/api/categorias/nuevo', { nombre: 'x' }],
    ];
    for (const [m, ruta, cuerpo] of prohibidas) {
        const r = await api(m, ruta, cuerpo, tCajero);
        assert.equal(r.status, 403, `${m} ${ruta} debería ser 403 para el cajero`);
    }
    for (const ruta of ['/api/inventario', '/api/cuentas', '/api/caja/estado', '/api/categorias', '/api/clientes']) {
        assert.equal((await api('GET', ruta, undefined, tCajero)).status, 200, ruta);
    }
});

test('5. El costo (margen) solo lo ve el administrador', async () => {
    const c = await api('GET', '/api/inventario', undefined, tCajero);
    assert.equal('precio_costo_unitario' in c.json.inventario[0], false);
    const a = await api('GET', '/api/inventario', undefined, tAdmin);
    assert.equal('precio_costo_unitario' in a.json.inventario[0], true);
    const cli = await api('GET', '/api/clientes', undefined, tCajero);
    assert.equal('documento' in cli.json.clientes[0], false);
});

test('6. Caja: no se vende con la caja cerrada; solo una caja abierta a la vez', async () => {
    let r = await api('POST', '/api/ventas/procesar', { carrito: [{ id_producto: 1, cantidad: 1 }], pago_efectivo: 5.5 }, tCajero);
    assert.equal(r.status, 400);
    assert.match(r.json.message, /caja está cerrada/i);
    assert.equal((await api('POST', '/api/caja/apertura', { monto_inicial: -5 }, tCajero)).status, 400);
    r = await api('POST', '/api/caja/apertura', { monto_inicial: 100 }, tCajero);
    assert.equal(r.status, 200);
    assert.equal((await api('POST', '/api/caja/apertura', { monto_inicial: 50 }, tAdmin)).status, 400);
    r = await api('GET', '/api/caja/estado', undefined, tCajero);
    assert.equal(r.json.cajaAbierta, true);
});

test('7. Venta: el servidor ignora el precio/total que manda el navegador', async () => {
    // El navegador "hackeado" dice que cada cerveza cuesta S/ 0.01
    let r = await api('POST', '/api/ventas/procesar', {
        carrito: [{ id_producto: 1, cantidad: 2, precio: 0.01 }], total: 0.02, pago_efectivo: 0.02, monto_recibido: 0.02,
    }, tCajero);
    assert.equal(r.status, 400);
    assert.match(r.json.message, /total real/i);
    assert.equal(stock(1), 10);
    assert.equal(ventas(), 0);
    // Venta correcta: 2 x 5.50 = 11.00, paga con 20 -> vuelto 9
    r = await api('POST', '/api/ventas/procesar', {
        carrito: [{ id_producto: 1, cantidad: 2, precio: 0.01 }], total: 11, pago_efectivo: 11, monto_recibido: 20,
    }, tCajero);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.numero_comprobante, 'NV-000001');
    assert.equal(r.json.total, 11);
    assert.equal(r.json.vuelto, 9);
    assert.equal(stock(1), 8);
    const d = uno('SELECT precio_unitario, subtotal FROM detalle_ventas WHERE id_venta = 1');
    assert.equal(Number(d.precio_unitario), 5.5);
    assert.equal(Number(d.subtotal), 11);
    const v = uno('SELECT * FROM ventas WHERE id_venta = 1');
    assert.equal(Number(v.pago_efectivo), 11);
    assert.equal(Number(v.vuelto), 9);
    assert.equal(v.id_usuario, 2, 'la venta se asigna al usuario de la sesión');
});

test('8. Pago mixto con vuelto: el vuelto se descuenta del efectivo (la caja cuadra)', async () => {
    // Ron 40: paga 30 efectivo + 20 yape = 50 -> vuelto 10 que sale del efectivo
    const r = await api('POST', '/api/ventas/procesar', {
        carrito: [{ id_producto: 2, cantidad: 1 }], pago_efectivo: 30, pago_yape: 20, monto_recibido: 50,
    }, tCajero);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const v = uno('SELECT * FROM ventas WHERE id_venta = 2');
    assert.equal(Number(v.pago_efectivo), 20);
    assert.equal(Number(v.pago_yape), 20);
    assert.equal(Number(v.pago_efectivo) + Number(v.pago_yape), Number(v.total));
    assert.equal(Number(v.vuelto), 10);
    // Vuelto imposible: pagó todo en yape de más
    const r2 = await api('POST', '/api/ventas/procesar', { carrito: [{ id_producto: 3, cantidad: 1 }], pago_yape: 50 }, tCajero);
    assert.equal(r2.status, 400);
});

test('9. Sin stock no se vende y no queda nada a medias', async () => {
    assert.equal(stock(2), 2);
    const r = await api('POST', '/api/ventas/procesar', { carrito: [{ id_producto: 2, cantidad: 3 }], pago_efectivo: 120 }, tCajero);
    assert.equal(r.status, 400);
    assert.match(r.json.message, /Stock insuficiente/);
    assert.equal(stock(2), 2);
    assert.equal(ventas(), 2);
});

test('10. Si algo falla a mitad de una venta, se deshace TODO (transacción)', async () => {
    pool.fallarSiguiente(/UPDATE productos SET stock_unidades = stock_unidades - /, 1); // falla en el 2º producto
    const r = await api('POST', '/api/ventas/procesar', {
        carrito: [{ id_producto: 1, cantidad: 1 }, { id_producto: 3, cantidad: 1 }], pago_efectivo: 7.5,
    }, tCajero);
    assert.equal(r.status, 500);
    assert.equal(stock(1), 8, 'el stock de la cerveza no debe cambiar');
    assert.equal(stock(3), 100);
    assert.equal(ventas(), 2, 'no debe quedar una venta fantasma');
    assert.equal(uno('SELECT COUNT(*) AS c FROM detalle_ventas').c, 2);
});

test('11. Mesas: abrir, agregar, corregir (quitar) y anular con stock correcto', async () => {
    let r = await api('POST', '/api/cuentas/nueva', { tipo: 'mesa', identificador: 'Mesa 5' }, tCajero);
    assert.equal(r.status, 200);
    const mesa5 = r.json.id_cuenta;
    assert.equal((await api('POST', '/api/cuentas/nueva', { tipo: 'mesa', identificador: 'mesa 5' }, tCajero)).status, 409, 'mesa duplicada (sin importar mayúsculas)');

    // nombre malicioso: se limpia
    r = await api('POST', '/api/cuentas/nueva', { tipo: 'mesa', identificador: '<img src=x onerror=alert(1)>Mesa X' }, tCajero);
    assert.equal(r.status, 200);
    assert.equal(uno('SELECT identificador FROM cuentas WHERE id_cuenta = ?', r.json.id_cuenta).identificador.includes('<'), false);
    await api('POST', '/api/cuentas/anular', { id_cuenta: r.json.id_cuenta }, tCajero);

    // agregar 3 cervezas (el precio que mande el navegador se ignora)
    r = await api('POST', '/api/cuentas/guardar', { id_cuenta: mesa5, productos: [{ id_producto: 1, cantidad: 3, precio: 0.01 }] }, tCajero);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(stock(1), 5);
    assert.equal(Number(uno('SELECT total FROM cuentas WHERE id_cuenta = ?', mesa5).total), 16.5);

    // el mozo se equivocó: quitar 1 (exige motivo)
    const det = (await api('GET', `/api/cuentas/${mesa5}/detalle`, undefined, tCajero)).json;
    assert.equal(det.detalles.length, 1);
    const idDet = det.detalles[0].id_detalle;
    assert.equal((await api('POST', '/api/cuentas/quitar-item', { id_detalle: idDet, cantidad: 1 }, tCajero)).status, 400);
    r = await api('POST', '/api/cuentas/quitar-item', { id_detalle: idDet, cantidad: 1, motivo: 'Se anotó de más' }, tCajero);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.total, 11);
    assert.equal(stock(1), 6);
    assert.equal((await api('POST', '/api/cuentas/quitar-item', { id_detalle: idDet, cantidad: 9, motivo: 'prueba' }, tCajero)).status, 400);

    // anular una mesa completa devuelve todo el stock
    r = await api('POST', '/api/cuentas/nueva', { tipo: 'mesa', identificador: 'Mesa 6' }, tCajero);
    const mesa6 = r.json.id_cuenta;
    await api('POST', '/api/cuentas/guardar', { id_cuenta: mesa6, productos: [{ id_producto: 3, cantidad: 5 }] }, tCajero);
    assert.equal(stock(3), 95);
    assert.equal((await api('POST', '/api/cuentas/anular', { id_cuenta: mesa6 }, tCajero)).status, 400, 'con consumo exige motivo');
    r = await api('POST', '/api/cuentas/anular', { id_cuenta: mesa6, motivo: 'El cliente se fue' }, tCajero);
    assert.equal(r.status, 200);
    assert.equal(stock(3), 100);
    assert.equal(uno('SELECT estado FROM cuentas WHERE id_cuenta = ?', mesa6).estado, 'Anulada');
    const lista = (await api('GET', '/api/cuentas', undefined, tCajero)).json.cuentas;
    assert.equal(lista.some((c) => c.id_cuenta === mesa6), false);
    // una cuenta anulada ya no se puede modificar
    assert.equal((await api('POST', '/api/cuentas/guardar', { id_cuenta: mesa6, productos: [{ id_producto: 3, cantidad: 1 }] }, tCajero)).status, 409);
});

test('12. Cobrar mesa: valida pagos, registra la venta y no permite cobrar dos veces', async () => {
    const mesa5 = uno("SELECT id_cuenta FROM cuentas WHERE identificador = 'Mesa 5'").id_cuenta;
    let r = await api('POST', '/api/cuentas/cobrar', { id_cuenta: mesa5, pago_efectivo: 5, pago_yape: 5 }, tCajero);
    assert.equal(r.status, 400); // suma 10, el total es 11
    r = await api('POST', '/api/cuentas/cobrar', { id_cuenta: mesa5, monto: 1, pago_efectivo: 6, pago_yape: 5 }, tCajero);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const v = uno('SELECT * FROM ventas WHERE id_venta = ?', r.json.id_venta);
    assert.equal(v.cliente_mesa, 'Mesa 5');
    assert.equal(Number(v.total), 11);
    assert.equal(uno('SELECT COUNT(*) AS c FROM detalle_ventas WHERE id_venta = ?', v.id_venta).c, 1);
    assert.equal(uno('SELECT estado FROM cuentas WHERE id_cuenta = ?', mesa5).estado, 'Cerrada');
    r = await api('POST', '/api/cuentas/cobrar', { id_cuenta: mesa5, pago_efectivo: 11 }, tCajero);
    assert.equal(r.status, 409);
    assert.equal(ventas(), 3);
});

test('13. Doble clic en "Cobrar": solo se cobra UNA vez', async () => {
    const r = await api('POST', '/api/cuentas/nueva', { tipo: 'mesa', identificador: 'Mesa 7' }, tCajero);
    const mesa7 = r.json.id_cuenta;
    await api('POST', '/api/cuentas/guardar', { id_cuenta: mesa7, productos: [{ id_producto: 3, cantidad: 2 }] }, tCajero);
    const antes = ventas();
    const res = await Promise.all([
        api('POST', '/api/cuentas/cobrar', { id_cuenta: mesa7, pago_efectivo: 4 }, tCajero),
        api('POST', '/api/cuentas/cobrar', { id_cuenta: mesa7, pago_efectivo: 4 }, tCajero),
    ]);
    const estados = res.map((x) => x.status).sort();
    assert.deepEqual(estados, [200, 409]);
    assert.equal(ventas(), antes + 1);
});

test('14. Fiados: solo admin fía y cobra; la deuda cuadra y el abono entra a caja', async () => {
    let r = await api('POST', '/api/cuentas/nueva', { tipo: 'cliente', identificador: 'cualquiera', id_cliente: 2 }, tCajero);
    assert.equal(r.status, 200);
    const cta = r.json.id_cuenta;
    assert.equal(uno('SELECT identificador FROM cuentas WHERE id_cuenta = ?', cta).identificador, 'Carlos Gómez');
    assert.equal((await api('POST', '/api/cuentas/nueva', { tipo: 'cliente', id_cliente: 2 }, tCajero)).status, 409);
    await api('POST', '/api/cuentas/guardar', { id_cuenta: cta, productos: [{ id_producto: 1, cantidad: 2 }] }, tCajero);

    assert.equal((await api('POST', '/api/cuentas/pasar-a-fiado', { id_cuenta: cta, monto_total: 0.01 }, tCajero)).status, 403);
    r = await api('POST', '/api/cuentas/pasar-a-fiado', { id_cuenta: cta, id_cliente: 2, monto_total: 0.01 }, tAdmin); // monto del navegador se ignora
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(Number(uno('SELECT deuda_acumulada AS d FROM clientes WHERE id_cliente = 2').d), 11);

    r = await api('GET', '/api/fiados', undefined, tAdmin);
    assert.equal(r.json.clientes.length, 1);
    assert.equal(Number(r.json.clientes[0].deuda_acumulada), 11);

    assert.equal((await api('POST', '/api/fiados/abonar', { id_cliente: 2, monto_total: 5, pago_efectivo: 4 }, tAdmin)).status, 400);
    assert.equal((await api('POST', '/api/fiados/abonar', { id_cliente: 2, monto_total: 20, pago_efectivo: 20 }, tAdmin)).status, 400);
    r = await api('POST', '/api/fiados/abonar', { id_cliente: 2, monto_total: 5, pago_efectivo: 5 }, tAdmin);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(Number(uno('SELECT deuda_acumulada AS d FROM clientes WHERE id_cliente = 2').d), 6);
    const ab = uno("SELECT * FROM ventas WHERE numero_comprobante LIKE 'ABONO-%'");
    assert.equal(ab.cliente_mesa, 'ABONO - Carlos Gómez');
    assert.equal(Number(ab.pago_efectivo), 5);
    // no se puede eliminar un cliente que debe dinero
    assert.equal((await api('DELETE', '/api/clientes/eliminar/2', undefined, tAdmin)).status, 400);
});

test('15. Compras: el total lo calcula el servidor y sube el stock y el costo', async () => {
    const antesHielo = stock(3);
    const antesCerveza = stock(1);
    const r = await api('POST', '/api/compras/registrar', {
        id_proveedor: 1, total: 1, numero_comprobante: 'F001-123',
        detalles: [{ id_producto: 3, cantidad: 10, precio_compra: 1.2 }, { id_producto: 1, cantidad: 5, precio_compra: 3.6 }],
    }, tAdmin);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(Number(uno('SELECT total FROM compras').total), 30);
    assert.equal(stock(3), antesHielo + 10);
    assert.equal(stock(1), antesCerveza + 5);
    assert.equal(Number(uno('SELECT precio_costo_unitario AS c FROM productos WHERE id_producto = 1').c), 3.6);
    assert.equal((await api('POST', '/api/compras/registrar', { id_proveedor: 99, detalles: [{ id_producto: 1, cantidad: 1, precio_compra: 1 }] }, tAdmin)).status, 400);
});

test('16. Ajustes de inventario: no deja stock negativo y queda en auditoría', async () => {
    let r = await api('POST', '/api/inventario/ajuste', { id_producto: 2, tipo_ajuste: 'Salida', cantidad: 1000, motivo: 'Rotura' }, tAdmin);
    assert.equal(r.status, 400);
    r = await api('POST', '/api/inventario/ajuste', { id_producto: 2, tipo_ajuste: 'Salida', cantidad: 1, motivo: 'Botella rota' }, tAdmin);
    assert.equal(r.status, 200);
    assert.equal(stock(2), 1);
    assert.equal((await api('POST', '/api/inventario/ajuste', { id_producto: 2, tipo_ajuste: 'Salida', cantidad: 1 }, tAdmin)).status, 400, 'sin motivo');
    const logs = (await api('GET', '/api/auditoria', undefined, tAdmin)).json.logs.map((l) => l.accion).join('\n');
    for (const palabra of ['Quitó', 'Anuló', 'Fió', 'abono', 'Ajuste de inventario', 'Registró compra', 'Abrió la caja']) {
        assert.ok(logs.includes(palabra), `la auditoría debe incluir "${palabra}"`);
    }
});

test('17. Productos: validaciones y cambios de precio auditados', async () => {
    assert.equal((await api('POST', '/api/productos/nuevo', { nombre: '', id_categoria: 1, precio_venta: 5 }, tAdmin)).status, 400);
    assert.equal((await api('POST', '/api/productos/nuevo', { nombre: 'X', id_categoria: 1, precio_venta: -5 }, tAdmin)).status, 400);
    let r = await api('POST', '/api/productos/nuevo', { nombre: 'Pisco', id_categoria: 2, precio_venta: 30, precio_costo: 18, stock_inicial: 6, codigo_barras: '444' }, tAdmin);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    r = await api('POST', '/api/productos/nuevo', { nombre: 'Pisco 2', id_categoria: 2, precio_venta: 30, codigo_barras: '444' }, tAdmin);
    assert.equal(r.status, 409);
    const id = uno("SELECT id_producto AS i FROM productos WHERE nombre = 'Pisco'").i;
    r = await api('PUT', `/api/productos/editar/${id}`, { nombre: 'Pisco', id_categoria: 2, precio_venta: 35, precio_costo: 18, codigo_barras: '444' }, tAdmin);
    assert.equal(r.status, 200);
    const logs = (await api('GET', '/api/auditoria?texto=Cambi%C3%B3', undefined, tAdmin)).json.logs;
    assert.ok(logs.some((l) => l.accion.includes('Pisco') && l.accion.includes('35.00')));
});

test('18. Usuarios: reglas de seguridad (clave mínima, último admin, borrado y sesión)', async () => {
    assert.equal((await api('POST', '/api/usuarios/nuevo', { nombre: 'Mozo', usuario: 'mozo1', password: '12345', id_rol: 2 }, tAdmin)).status, 400);
    assert.equal((await api('POST', '/api/usuarios/nuevo', { nombre: 'Mozo', usuario: 'a b', password: 'mozo2026', id_rol: 2 }, tAdmin)).status, 400);
    let r = await api('POST', '/api/usuarios/nuevo', { nombre: 'Mozo Uno', usuario: 'mozo1', password: 'mozo2026', id_rol: 2 }, tAdmin);
    assert.equal(r.status, 200);
    assert.match(uno("SELECT password FROM usuarios WHERE usuario = 'mozo1'").password, /^\$2[aby]\$/);
    assert.equal((await api('POST', '/api/usuarios/nuevo', { nombre: 'Otro', usuario: 'mozo1', password: 'mozo2026', id_rol: 2 }, tAdmin)).status, 409);
    // no se puede dejar el sistema sin administrador ni borrarse a sí mismo
    assert.equal((await api('PUT', '/api/usuarios/editar/1', { nombre: 'Admin', usuario: 'admin', id_rol: 2 }, tAdmin)).status, 400);
    assert.equal((await api('DELETE', '/api/usuarios/eliminar/1', undefined, tAdmin)).status, 400);
    // si borran a un usuario, su sesión deja de servir de inmediato
    const mozo = (await api('POST', '/api/auth/login', { usuario: 'mozo1', contrasena: 'mozo2026' })).json.token;
    assert.equal((await api('GET', '/api/cuentas', undefined, mozo)).status, 200);
    const idMozo = uno("SELECT id_usuario AS i FROM usuarios WHERE usuario = 'mozo1'").i;
    assert.equal((await api('DELETE', `/api/usuarios/eliminar/${idMozo}`, undefined, tAdmin)).status, 200);
    assert.equal((await api('GET', '/api/cuentas', undefined, mozo)).status, 401);
    // el usuario con ventas registradas no se puede borrar
    const idCajero = uno("SELECT id_usuario AS i FROM usuarios WHERE usuario = 'cajero'").i;
    assert.equal((await api('DELETE', `/api/usuarios/eliminar/${idCajero}`, undefined, tAdmin)).status, 400);
});

test('19. Cambiar la contraseña de un usuario funciona (y la anterior deja de servir)', async () => {
    const id = uno("SELECT id_usuario AS i FROM usuarios WHERE usuario = 'cajero'").i;
    const r = await api('PUT', `/api/usuarios/editar/${id}`, { nombre: 'Caja Uno', usuario: 'cajero', id_rol: 2, password: 'nuevaClave9' }, tAdmin);
    assert.equal(r.status, 200);
    assert.equal((await api('POST', '/api/auth/login', { usuario: 'cajero', contrasena: 'cajero2026' })).status, 401);
    const ok = await api('POST', '/api/auth/login', { usuario: 'cajero', contrasena: 'nuevaClave9' });
    assert.equal(ok.status, 200);
    tCajero = ok.json.token;
});

test('20. Reportes: fechas válidas, totales correctos y filtro por mesa/cliente', async () => {
    assert.equal((await api('GET', '/api/reportes/avanzado?inicio=hola&fin=2026-01-01', undefined, tAdmin)).status, 400);
    let r = await api('GET', '/api/reportes/avanzado?inicio=2000-01-01&fin=2100-01-01&cliente=', undefined, tAdmin);
    assert.equal(r.status, 200);
    // efectivo: 11 + 20 + 6 + 4 + 5(abono) = 46 ; digital: 20 + 5 = 25
    assert.equal(r.json.totales.efectivo, 46);
    assert.equal(r.json.totales.digital, 25);
    assert.equal(r.json.totales.general, 71);
    r = await api('GET', '/api/reportes/avanzado?inicio=2000-01-01&fin=2100-01-01&cliente=Mesa%205', undefined, tAdmin);
    assert.equal(r.json.ventas.length, 1);
    assert.equal(r.json.ventas[0].cajero, 'Caja Uno');
});

test('21. Arqueo y cierre de caja: el descuadre se calcula bien', async () => {
    const idCaja = uno('SELECT id_caja AS i FROM caja').i;
    let r = await api('POST', '/api/caja/movimiento', { tipo: 'Gasto', monto: 10, motivo: 'Compra de hielo' }, tCajero);
    assert.equal(r.status, 200);
    assert.equal((await api('POST', '/api/caja/movimiento', { tipo: 'Robo', monto: 10, motivo: 'x' }, tCajero)).status, 400);
    assert.equal((await api('POST', '/api/caja/movimiento', { tipo: 'Gasto', monto: 10, motivo: '' }, tCajero)).status, 400);
    r = await api('GET', `/api/caja/arqueo/${idCaja}`, undefined, tCajero);
    assert.equal(r.json.total_efectivo, 46);
    assert.equal(r.json.total_yape, 25);
    assert.equal(r.json.total_gastos, 10);
    // esperado = 100 + 46 - 10 = 136 ; cuenta 135 -> falta 1
    r = await api('PUT', `/api/caja/cierre/${idCaja}`, { monto_final_real: 135 }, tCajero);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.match(r.json.message, /Faltan S\/ 1\.00/);
    const c = uno('SELECT * FROM caja WHERE id_caja = ?', idCaja);
    assert.equal(c.estado, 'Cerrada');
    assert.equal(Number(c.descuadre), -1);
    assert.equal(Number(c.total_efectivo), 46);
    assert.equal((await api('PUT', `/api/caja/cierre/${idCaja}`, { monto_final_real: 135 }, tCajero)).status, 400, 'no se cierra dos veces');
    // con la caja cerrada ya no se cobra
    assert.equal((await api('POST', '/api/ventas/procesar', { carrito: [{ id_producto: 3, cantidad: 1 }], pago_efectivo: 2 }, tCajero)).status, 400);
});

test('22. Límite de intentos de login (anti adivinar claves)', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await api('POST', '/api/auth/login', { usuario: 'victima', contrasena: `mala${i}` })).status, 401);
    const r = await api('POST', '/api/auth/login', { usuario: 'victima', contrasena: 'otra' });
    assert.equal(r.status, 429);
});

test('23. Respaldos: crear, listar, descargar y rechazar rutas peligrosas', async () => {
    assert.equal((await api('POST', '/api/respaldo/ahora', {}, tCajero)).status, 403);
    let r = await api('POST', '/api/respaldo/ahora', {}, tAdmin);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.match(r.json.archivo, /^respaldo_\d{4}-\d{2}-\d{2}_\d{4}\.sql$/);
    r = await api('GET', '/api/respaldo/lista', undefined, tAdmin);
    assert.equal(r.json.respaldos.length, 1);
    const d = await fetch(`${base}/api/respaldo/descargar/${r.json.respaldos[0].archivo}`, { headers: { Authorization: `Bearer ${tAdmin}` } });
    assert.equal(d.status, 200);
    assert.ok((await d.text()).includes('Dump completed'));
    assert.equal((await fetch(`${base}/api/respaldo/descargar/..%2F..%2Fetc%2Fpasswd`, { headers: { Authorization: `Bearer ${tAdmin}` } })).status, 404);
    assert.equal((await fetch(`${base}/api/respaldo/descargar/respaldo_x.sql`, { headers: { Authorization: `Bearer ${tAdmin}` } })).status, 404);
});

test('24. Datos basura no tumban el servidor', async () => {
    const raros = [
        ['POST', '/api/ventas/procesar', { carrito: 'hola' }], ['POST', '/api/ventas/procesar', { carrito: [{ id_producto: 'x', cantidad: -1 }] }],
        ['POST', '/api/ventas/procesar', {}], ['POST', '/api/cuentas/guardar', { id_cuenta: 'abc', productos: [] }],
        ['GET', '/api/cuentas/abc/detalle'], ['GET', '/api/ventas/ticket/99999'], ['POST', '/api/caja/apertura', { monto_inicial: 'mucho' }],
    ];
    for (const [m, ruta, cuerpo] of raros) {
        const r = await api(m, ruta, cuerpo, tAdmin);
        assert.ok([400, 404].includes(r.status), `${m} ${ruta} -> ${r.status}`);
    }
    const mal = await fetch(`${base}/api/ventas/procesar`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tAdmin}` }, body: '{no es json' });
    assert.equal(mal.status, 400);
    assert.equal((await api('GET', '/api/salud')).status, 200);
});

test('25. Apertura de caja: si el motor rechaza el INSERT atómico, funciona el plan B', async () => {
    // La caja anterior ya se cerró en la prueba 21, así que se puede abrir otra
    pool.fallarSiguiente(/FROM DUAL/, 0, { errno: 1093, code: 'ER_UPDATE_TABLE_USED' });
    let r = await api('POST', '/api/caja/apertura', { monto_inicial: 50 }, tAdmin);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(uno("SELECT COUNT(*) AS c FROM caja WHERE estado = 'Abierta'").c, 1);
    // con el plan B también se respeta "solo una caja abierta"
    pool.fallarSiguiente(/FROM DUAL/, 0, { errno: 1093, code: 'ER_UPDATE_TABLE_USED' });
    r = await api('POST', '/api/caja/apertura', { monto_inicial: 50 }, tAdmin);
    assert.equal(r.status, 400);
});
