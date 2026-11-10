// Uso:  node scripts/probar_conexion.js
// Comprueba que Node puede hablar con MySQL y que la base de datos está lista.
const config = require('../lib/config');
const db = require('../db');

(async () => {
    console.log(`Probando conexión a ${config.DB.user}@${config.DB.host}:${config.DB.port}/${config.DB.database} ...`);
    try {
        const [v] = await db.promise().query('SELECT VERSION() AS version');
        console.log(`✔ Conectado a MySQL/MariaDB ${v[0].version}`);
        for (const t of ['usuarios', 'productos', 'clientes', 'ventas', 'caja', 'cuentas']) {
            try {
                const [r] = await db.promise().query(`SELECT COUNT(*) AS c FROM \`${t}\``);
                console.log(`✔ Tabla ${t.padEnd(10)} → ${r[0].c} registro(s)`);
            } catch (e) {
                console.log(`✘ Tabla ${t}: ${e.code || e.message}  (¿importaste el .sql en phpMyAdmin?)`);
                process.exitCode = 1;
            }
        }
    } catch (e) {
        console.error(`✘ No se pudo conectar: ${e.code || ''} ${e.message}`);
        if (e.code === 'ECONNREFUSED') console.error('  → MySQL está apagado. Enciéndelo en el panel de XAMPP (botón Start de MySQL).');
        if (e.code === 'ER_ACCESS_DENIED_ERROR') console.error('  → Usuario o contraseña incorrectos. Revisa DB_USER y DB_PASSWORD en backend/.env');
        if (e.code === 'ER_BAD_DB_ERROR') console.error('  → La base de datos no existe. Créala e importa database/licoreria_db_limpia.sql en phpMyAdmin.');
        process.exitCode = 1;
    } finally {
        db.end(() => process.exit());
    }
})();
