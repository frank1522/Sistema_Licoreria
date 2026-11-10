// ============================================================
// CONEXIÓN A MYSQL / MARIADB (con pool de conexiones)
// Un pool reconecta solo: si MySQL se reinicia o la conexión se
// duerme de noche, el sistema sigue funcionando sin reiniciar Node.
// Las credenciales salen de backend/.env (ver .env.example)
// ============================================================
const mysql = require('mysql2');
const config = require('./lib/config');

const pool = mysql.createPool({
    host: config.DB.host,
    port: config.DB.port,
    user: config.DB.user,
    password: config.DB.password,
    database: config.DB.database,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
});

module.exports = pool;
