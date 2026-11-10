// ============================================================
// CONFIGURACIÓN CENTRAL
// Todo se lee del archivo backend/.env (copia de .env.example).
// Si una variable no existe, se usa un valor seguro por defecto.
// ============================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const bool = (v, def = false) => {
    if (v === undefined || v === null || v === '') return def;
    return ['1', 'true', 'si', 'sí', 'yes', 'y'].includes(String(v).trim().toLowerCase());
};
const int = (v, def) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
};

const RAIZ = path.join(__dirname, '..', '..');
const DIR_DATOS = path.join(__dirname, '..', 'data');

// La llave que firma las sesiones. Si no la pones en .env se crea una sola vez
// y se guarda en backend/data/.jwt_secret (no se sube a GitHub).
function obtenerJwtSecret() {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16) return process.env.JWT_SECRET;
    const archivo = path.join(DIR_DATOS, '.jwt_secret');
    try {
        const guardado = fs.readFileSync(archivo, 'utf8').trim();
        if (guardado.length >= 32) return guardado;
    } catch (e) { /* no existe todavía */ }
    fs.mkdirSync(DIR_DATOS, { recursive: true });
    const nuevo = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(archivo, nuevo, { mode: 0o600 });
    return nuevo;
}

let _secret = null;

module.exports = {
    RAIZ,
    DIR_DATOS,
    DIR_FRONTEND: path.join(RAIZ, 'frontend'),
    PORT: int(process.env.PORT, 3000),
    HOST: process.env.HOST || '0.0.0.0',

    DB: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: int(process.env.DB_PORT, 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD === undefined ? '' : process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'licoreria_db',
    },

    get JWT_SECRET() {
        if (!_secret) _secret = obtenerJwtSecret();
        return _secret;
    },
    JWT_EXPIRES: process.env.JWT_EXPIRES || '14h',

    // true = permite vender aunque el sistema crea que no hay stock (útil los primeros días).
    PERMITIR_VENTA_SIN_STOCK: bool(process.env.PERMITIR_VENTA_SIN_STOCK, false),

    // Pon TRUST_PROXY=true solo si lo publicas detrás de Cloudflare Tunnel / Nginx.
    TRUST_PROXY: bool(process.env.TRUST_PROXY, false),
    // Solo para desarrollo con el frontend en otro puerto. Vacío = mismo origen (recomendado).
    CORS_ORIGIN: process.env.CORS_ORIGIN || '',

    LOGIN_MAX_INTENTOS: int(process.env.LOGIN_MAX_INTENTOS, 5),
    LOGIN_VENTANA_MIN: int(process.env.LOGIN_VENTANA_MIN, 10),

    BACKUP: {
        dir: process.env.BACKUP_DIR || path.join(RAIZ, 'respaldos'),
        copiarA: process.env.BACKUP_COPY_DIR || '',
        dias: int(process.env.BACKUP_KEEP_DAYS, 30),
        mysqldump: process.env.MYSQLDUMP_PATH || '',
    },
};
