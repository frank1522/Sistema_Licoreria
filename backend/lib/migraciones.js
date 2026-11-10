// ============================================================
// MIGRACIONES AUTOMÁTICAS (se ejecutan solas cada vez que arranca el servidor)
// Son "idempotentes": si ya están aplicadas, no hacen nada.
// Sirven para que CUALQUIER base de datos (vieja o nueva) quede con las
// columnas que el código necesita, sin tener que correr scripts a mano.
// ============================================================
const { hashear, esHash } = require('./seguridad');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperarBaseDeDatos(db, log, maxSeg = 90) {
    const inicio = Date.now();
    let avisado = false;
    for (;;) {
        try {
            await db.promise().query('SELECT 1');
            return;
        } catch (e) {
            if (e.code === 'ER_ACCESS_DENIED_ERROR') throw new Error('MySQL rechazó el usuario/contraseña. Revisa DB_USER y DB_PASSWORD en backend/.env');
            if (e.code === 'ER_BAD_DB_ERROR') throw new Error('La base de datos no existe. Impórtala primero (database/licoreria_db_limpia.sql) y revisa DB_NAME en backend/.env');
            if (Date.now() - inicio > maxSeg * 1000) throw new Error(`No se pudo conectar a MySQL (${e.code || e.message}). ¿Está encendido en XAMPP?`);
            if (!avisado) { log.aviso(`Esperando a MySQL (${e.code || e.message})... ¿está encendido en XAMPP?`); avisado = true; }
            await sleep(3000);
        }
    }
}

async function columnaInfo(db, tabla, columna) {
    const [r] = await db.promise().query(
        `SELECT CHARACTER_MAXIMUM_LENGTH AS largo FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [tabla, columna]);
    return r.length ? { largo: r[0].largo === null ? null : Number(r[0].largo) } : null;
}

async function asegurarColumna(db, log, tabla, columna, definicion) {
    if (await columnaInfo(db, tabla, columna)) return false;
    await db.promise().query(`ALTER TABLE \`${tabla}\` ADD COLUMN \`${columna}\` ${definicion}`);
    log.info(`Migración: se agregó la columna ${tabla}.${columna}`);
    return true;
}

async function migrar(db, log) {
    const paso = async (nombre, fn) => {
        try { await fn(); } catch (e) { log.error(`Migración "${nombre}" falló: ${e.message}`); }
    };

    // 1) Columnas que el código usa y que faltaban en el .sql original
    await paso('columnas', async () => {
        await asegurarColumna(db, log, 'clientes', 'deuda_acumulada', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00');
        await asegurarColumna(db, log, 'cuentas', 'id_cliente', 'INT(11) NULL DEFAULT NULL');
        await asegurarColumna(db, log, 'caja', 'descuadre', 'DECIMAL(10,2) NULL DEFAULT 0.00');
        await asegurarColumna(db, log, 'ventas', 'cliente_mesa', 'VARCHAR(120) NULL DEFAULT NULL');
    });

    // 2) La columna password debe poder guardar un hash bcrypt (60 caracteres)
    let passwordLista = true;
    await paso('largo de password', async () => {
        const info = await columnaInfo(db, 'usuarios', 'password');
        if (info && info.largo !== null && info.largo < 100) {
            await db.promise().query('ALTER TABLE `usuarios` MODIFY `password` VARCHAR(255) NOT NULL');
            log.info('Migración: columna usuarios.password ampliada a 255 caracteres');
        }
    });
    await paso('verificar largo de password', async () => {
        const info = await columnaInfo(db, 'usuarios', 'password');
        passwordLista = !info || info.largo === null || info.largo >= 100;
    });

    // 3) Datos base imprescindibles
    await paso('datos base', async () => {
        const q = db.promise();
        const [roles] = await q.query('SELECT COUNT(*) AS c FROM roles');
        if (Number(roles[0].c) === 0) {
            await q.query("INSERT INTO roles (id_rol, descripcion) VALUES (1, 'Administrador'), (2, 'Cajero'), (3, 'Vendedor')");
            log.info('Migración: se crearon los roles base');
        }
        // Las ventas usan por defecto al cliente #1 ("Público General"); si no existe, la venta falla
        const [cli] = await q.query('SELECT COUNT(*) AS c FROM clientes WHERE id_cliente = 1');
        if (Number(cli[0].c) === 0) {
            await q.query("INSERT INTO clientes (id_cliente, nombre) VALUES (1, 'Cliente Varios (Público General)')");
            log.info('Migración: se creó el cliente general (id 1)');
        }
        const [us] = await q.query('SELECT COUNT(*) AS c FROM usuarios');
        if (Number(us[0].c) === 0) {
            await q.query('INSERT INTO usuarios (nombre, usuario, password, id_rol) VALUES (?, ?, ?, 1)', ['Administrador', 'admin', await hashear('admin123')]);
            log.aviso('No había usuarios: se creó  admin / admin123  → CÁMBIALA apenas entres.');
        }
    });

    // 4) Contraseñas en texto plano -> bcrypt
    if (passwordLista) {
        await paso('cifrar contraseñas', async () => {
            const q = db.promise();
            const [us] = await q.query('SELECT id_usuario, password FROM usuarios');
            let n = 0;
            for (const u of us) {
                if (u.password && !esHash(u.password)) {
                    const h = await hashear(u.password);
                    const [r] = await q.query('UPDATE usuarios SET password = ? WHERE id_usuario = ? AND password = ?', [h, u.id_usuario, u.password]);
                    if (r.affectedRows === 1) n++;
                }
            }
            if (n > 0) log.info(`Seguridad: ${n} contraseña(s) estaban en texto plano y ahora están cifradas.`);
        });
    } else {
        log.error('No se pudieron cifrar las contraseñas porque la columna usuarios.password es muy corta. Dale permiso ALTER al usuario de MySQL.');
    }
}

module.exports = { esperarBaseDeDatos, migrar };
