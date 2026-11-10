// Prueba de frontend/auth.js en un "navegador falso" (sin necesitar navegador real).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const codigo = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'auth.js'), 'utf8');

function navegador({ pagina = '/venta.html', storage = {}, respuestas = {} } = {}) {
    const ls = { ...storage };
    const llamadas = [];
    const eventos = {};
    const estado = { redirigido: null, alertas: [], recargado: false };
    const localStorage = {
        getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); },
        removeItem: (k) => { delete ls[k]; }, clear: () => { for (const k of Object.keys(ls)) delete ls[k]; },
    };
    const ss = {};
    const fetchFalso = async (url, opciones = {}) => {
        const cab = opciones.headers instanceof Headers ? Object.fromEntries(opciones.headers.entries()) : (opciones.headers || {});
        llamadas.push({ url, cab });
        const r = respuestas[url] || { status: 200, json: { success: true } };
        return { ok: r.status < 400, status: r.status, json: async () => r.json };
    };
    const window = { fetch: fetchFalso };
    window.fetch.bind = () => fetchFalso;
    const contexto = {
        window, Headers, Object, String, Date, Promise, setTimeout, console,
        localStorage, sessionStorage: { getItem: (k) => ss[k] || null, setItem: (k, v) => { ss[k] = v; }, removeItem: (k) => delete ss[k] },
        location: { pathname: pagina, origin: 'http://192.168.1.50:3000', replace: (u) => { estado.redirigido = u; }, reload: () => { estado.recargado = true; } },
        document: { addEventListener: (n, f) => { eventos[n] = f; } },
        alert: (m) => estado.alertas.push(m),
        fetch: fetchFalso,
    };
    contexto.window.fetch = fetchFalso;
    vm.createContext(contexto);
    vm.runInContext(codigo, contexto);
    return { ctx: contexto, ls, llamadas, eventos, estado, ss };
}

test('sin sesión manda al login', () => {
    const n = navegador({ pagina: '/caja.html' });
    assert.equal(n.estado.redirigido, 'login.html');
});

test('un cajero no puede abrir pantallas de administrador', () => {
    for (const p of ['/reporte.html', '/fiados.html', '/configuracion.html', '/auditoria.html']) {
        const n = navegador({ pagina: p, storage: { token: 'abc', rol: 'Cajero' } });
        assert.equal(n.estado.redirigido, 'venta.html', p);
        assert.equal(n.estado.alertas.length, 1);
    }
});

test('el administrador sí entra a pantallas de administrador y las llamadas /api llevan el token', async () => {
    const n = navegador({ pagina: '/reporte.html', storage: { token: 'TOKEN123', rol: 'Administrador' } });
    assert.equal(n.estado.redirigido, null);
    await n.ctx.window.fetch('/api/inventario');
    await n.ctx.window.fetch('https://cdn.jsdelivr.net/x.js');
    await n.ctx.window.fetch('/api/auth/login', { method: 'POST' });
    assert.equal(n.llamadas[0].cab.authorization, 'Bearer TOKEN123');
    assert.equal(n.llamadas[1].cab.authorization, undefined, 'no se envía el token a otros sitios');
    assert.equal(n.llamadas[2].cab.authorization, undefined, 'el login no lleva token');
});

test('si el servidor responde 401 se cierra la sesión y se vuelve al login (una sola vez)', async () => {
    const n = navegador({ storage: { token: 'vencido', rol: 'Cajero' }, respuestas: { '/api/ventas/procesar': { status: 401, json: { success: false } } } });
    await n.ctx.window.fetch('/api/ventas/procesar', { method: 'POST' });
    assert.equal(n.estado.redirigido, 'login.html');
    assert.equal(n.ls.token, undefined);
    assert.match(n.ss.aviso_login, /sesión expiró/i);
});

test('al cargar la página sincroniza caja abierta y datos del usuario', async () => {
    const n = navegador({
        storage: { token: 't', rol: 'Cajero', id_caja_activa: '99' },
        respuestas: {
            '/api/auth/yo': { status: 200, json: { success: true, usuario: { id_usuario: 7, nombre: 'Ana', rol: 'Cajero' } } },
            '/api/caja/estado': { status: 200, json: { success: true, cajaAbierta: true, id_caja: 12 } },
        },
    });
    n.eventos.DOMContentLoaded();
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(n.ls.id_caja_activa, '12');
    assert.equal(n.ls.nombre_usuario, 'Ana');
    assert.equal(n.estado.recargado, false);
});

test('caja cerrada en el servidor borra la caja guardada en el celular; cambio de rol recarga la pantalla', async () => {
    const n = navegador({
        storage: { token: 't', rol: 'Administrador', id_caja_activa: '5' },
        respuestas: {
            '/api/auth/yo': { status: 200, json: { success: true, usuario: { id_usuario: 1, nombre: 'Jefe', rol: 'Cajero' } } },
            '/api/caja/estado': { status: 200, json: { success: true, cajaAbierta: false } },
        },
    });
    n.eventos.DOMContentLoaded();
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(n.ls.id_caja_activa, undefined);
    assert.equal(n.ls.rol, 'Cajero');
    assert.equal(n.estado.recargado, true);
});

test('esc() neutraliza código en nombres', () => {
    const n = navegador({ storage: { token: 't', rol: 'Cajero' } });
    assert.equal(n.ctx.window.esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    assert.equal(n.ctx.window.esc(null), '');
});
