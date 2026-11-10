// ============================================================
// auth.js  -  SESIÓN Y PERMISOS DEL LADO DEL NAVEGADOR
// Se carga en el <head> de todas las pantallas (menos login.html).
//  - Agrega automáticamente el "token" de sesión a cada llamada /api/...
//  - Si la sesión expiró o no existe, manda al login.
//  - Bloquea las pantallas de administrador a quien no lo es
//    (la seguridad REAL está en el servidor; esto solo mejora la experiencia).
//  - Mantiene sincronizada la caja abierta entre celular y computadora.
// ============================================================
(function () {
    'use strict';

    var PAGINAS_ADMIN = ['reporte.html', 'fiados.html', 'configuracion.html', 'auditoria.html'];
    var pagina = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    var redirigiendo = false;

    var Sesion = {
        token: function () { return localStorage.getItem('token'); },
        rol: function () { return localStorage.getItem('rol'); },
        nombre: function () { return localStorage.getItem('nombre_usuario'); },
        esAdmin: function () { return localStorage.getItem('rol') === 'Administrador'; },
        cerrar: function (mensaje) {
            if (redirigiendo) return;
            redirigiendo = true;
            try { localStorage.clear(); } catch (e) { /* nada */ }
            if (mensaje) { try { sessionStorage.setItem('aviso_login', mensaje); } catch (e) { /* nada */ } }
            location.replace('login.html');
        }
    };
    window.Sesion = Sesion;

    // Escapa texto antes de ponerlo dentro de innerHTML (evita que un nombre con código se ejecute)
    window.esc = function (valor) {
        return String(valor === undefined || valor === null ? '' : valor).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    };

    // ---- Todas las llamadas a /api llevan el token; si el servidor dice 401, se vuelve al login ----
    var fetchOriginal = window.fetch.bind(window);
    window.fetch = function (entrada, opciones) {
        var url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
        var esApi = url.indexOf('/api/') === 0 || url.indexOf(location.origin + '/api/') === 0;
        var esLogin = url.indexOf('/api/auth/login') !== -1;
        if (esApi && !esLogin) {
            opciones = Object.assign({}, opciones);
            var cabeceras = new Headers(opciones.headers || {});
            var token = Sesion.token();
            if (token) cabeceras.set('Authorization', 'Bearer ' + token);
            opciones.headers = cabeceras;
        }
        return fetchOriginal(entrada, opciones).then(function (respuesta) {
            if (esApi && !esLogin && respuesta.status === 401) {
                Sesion.cerrar('Tu sesión expiró. Inicia sesión de nuevo.');
            }
            return respuesta;
        });
    };

    // ---- 1) Sin sesión: al login ----
    if (!Sesion.token()) { Sesion.cerrar(); return; }

    // ---- 2) Pantallas solo para administrador ----
    if (PAGINAS_ADMIN.indexOf(pagina) !== -1 && !Sesion.esAdmin()) {
        alert('⛔ Esta pantalla es solo para el Administrador.');
        location.replace('venta.html');
        return;
    }

    // ---- 3) Verificar la sesión con el servidor y sincronizar la caja ----
    document.addEventListener('DOMContentLoaded', function () {
        fetch('/api/auth/yo').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
            if (!d || !d.success) return;
            if (d.usuario.rol !== Sesion.rol()) {          // le cambiaron el rol: refrescar permisos
                localStorage.setItem('rol', d.usuario.rol);
                location.reload();
                return;
            }
            localStorage.setItem('nombre_usuario', d.usuario.nombre);
            localStorage.setItem('id_usuario', d.usuario.id_usuario);
        }).catch(function () { /* sin conexión: se verá el error en la pantalla */ });

        fetch('/api/caja/estado').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
            if (!d || !d.success) return;
            if (d.cajaAbierta) localStorage.setItem('id_caja_activa', d.id_caja);
            else localStorage.removeItem('id_caja_activa');
        }).catch(function () { /* nada */ });
    });
})();
