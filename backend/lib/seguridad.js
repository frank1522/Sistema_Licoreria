// ============================================================
// SEGURIDAD: contraseñas cifradas (bcrypt), sesiones (JWT), roles y límite de intentos
// ============================================================
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');

const RE_HASH = /^\$2[aby]\$\d{2}\$/;
const CLAVES_DEBILES = ['1', '12', '123', '1234', '12345', '123456', 'admin', 'admin123', 'password', 'contrasena', 'clave', 'cajero', 'cajero123'];

const hashear = (plano) => bcrypt.hash(String(plano), 10);
const esHash = (txt) => RE_HASH.test(String(txt || ''));
const esClaveDebil = (plano) => String(plano).length < 6 || CLAVES_DEBILES.includes(String(plano).toLowerCase());

// Hash falso para que "usuario inexistente" tarde lo mismo que "clave incorrecta"
const HASH_FALSO = bcrypt.hashSync('no-existe-este-usuario', 10);

async function verificar(plano, guardado) {
    if (!guardado) return { ok: false, rehash: false };
    if (esHash(guardado)) return { ok: await bcrypt.compare(String(plano), guardado), rehash: false };
    // Formato antiguo (texto plano): se acepta UNA vez y se convierte a hash
    const a = Buffer.from(String(plano));
    const b = Buffer.from(String(guardado));
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    return { ok, rehash: ok };
}

const firmarToken = (u) => jwt.sign({ sub: u.id_usuario }, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: config.JWT_EXPIRES });

function crearAuth(db) {
    const cache = new Map(); // id_usuario -> { user, hasta }

    async function cargarUsuario(id) {
        const c = cache.get(id);
        if (c && c.hasta > Date.now()) return c.user;
        const [rows] = await db.promise().query(
            `SELECT u.id_usuario, u.nombre, u.usuario, u.id_rol, r.descripcion AS rol
             FROM usuarios u INNER JOIN roles r ON r.id_rol = u.id_rol WHERE u.id_usuario = ?`, [id]);
        const user = rows[0] || null;
        cache.set(id, { user, hasta: Date.now() + 15000 });
        return user;
    }

    // Exige sesión válida. El rol se lee SIEMPRE de la base de datos (no del navegador).
    const auth = async (req, res, next) => {
        const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
        if (!m) return res.status(401).json({ success: false, message: 'Debes iniciar sesión.' });
        let payload;
        try {
            payload = jwt.verify(m[1], config.JWT_SECRET, { algorithms: ['HS256'] });
        } catch (e) {
            return res.status(401).json({ success: false, message: 'Tu sesión expiró. Vuelve a iniciar sesión.' });
        }
        const user = await cargarUsuario(payload.sub);
        if (!user) return res.status(401).json({ success: false, message: 'Tu usuario ya no existe. Inicia sesión de nuevo.' });
        req.user = user;
        next();
    };

    const soloAdmin = (req, res, next) => {
        if (req.user && req.user.rol === 'Administrador') return next();
        return res.status(403).json({ success: false, message: '⛔ Esta acción es solo para el Administrador.' });
    };

    const olvidar = (id) => { if (id === undefined) cache.clear(); else cache.delete(Number(id)); };

    return { auth, soloAdmin, olvidar };
}

// Límite de intentos de login (anti "adivinar claves")
function crearLimiteLogin(max = config.LOGIN_MAX_INTENTOS, ventanaMin = config.LOGIN_VENTANA_MIN) {
    const ventana = ventanaMin * 60000;
    const intentos = new Map();
    const claves = (req, usuario) => [`ip:${req.ip}`, `u:${req.ip}|${String(usuario || '').toLowerCase()}`];
    const limiteDe = (k) => (k.startsWith('ip:') ? max * 4 : max);

    setInterval(() => {
        const ahora = Date.now();
        for (const [k, v] of intentos) if (ahora - v.desde > ventana) intentos.delete(k);
    }, 60000).unref();

    return {
        // devuelve minutos de espera (0 = puede intentar)
        bloqueado(req, usuario) {
            let espera = 0;
            for (const k of claves(req, usuario)) {
                const e = intentos.get(k);
                if (!e) continue;
                if (Date.now() - e.desde > ventana) { intentos.delete(k); continue; }
                if (e.n >= limiteDe(k)) espera = Math.max(espera, Math.ceil((e.desde + ventana - Date.now()) / 60000));
            }
            return espera;
        },
        fallo(req, usuario) {
            for (const k of claves(req, usuario)) {
                const e = intentos.get(k);
                if (!e || Date.now() - e.desde > ventana) intentos.set(k, { n: 1, desde: Date.now() });
                else e.n++;
            }
        },
        exito(req, usuario) { intentos.delete(`u:${req.ip}|${String(usuario || '').toLowerCase()}`); },
    };
}

module.exports = { hashear, verificar, esHash, esClaveDebil, firmarToken, crearAuth, crearLimiteLogin, HASH_FALSO };
