// ============================================================
// SOLO PARA PRUEBAS (no se usa en producción).
// Imita la API de mysql2 (pool, promise, getConnection, transacciones) usando SQLite
// para poder ejecutar las rutas del sistema sin tener MySQL instalado. Requiere Node 22+.
// ============================================================
const { DatabaseSync } = require('node:sqlite');

function traducir(sql) {
    return sql
        .replace(/\bFOR UPDATE\b/gi, '')
        .replace(/\bFROM DUAL\b/gi, '')
        .replace(/\bNOW\(\)/gi, "datetime('now','localtime')")
        .replace(/\bCURDATE\(\)/gi, "date('now','localtime')");
}

function crearPool(esquemaSql) {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('PRAGMA foreign_keys = ON');
    sqlite.exec(esquemaSql);

    let fallos = []; // [{ patron, restantes, saltar }]
    let cola = Promise.resolve(); // exclusión mutua de transacciones (simula los bloqueos FOR UPDATE)

    function ejecutar(sqlOriginal, params = []) {
        for (const f of fallos) {
            if (f.patron.test(sqlOriginal)) {
                if (f.saltar > 0) { f.saltar--; continue; }
                fallos = fallos.filter((x) => x !== f);
                throw Object.assign(new Error('Fallo simulado de prueba'), { code: 'FALLO_SIMULADO' }, f.props || {});
            }
        }
        const sql = traducir(sqlOriginal);

        // INFORMATION_SCHEMA (usado por las migraciones)
        if (/INFORMATION_SCHEMA\.COLUMNS/i.test(sql)) {
            const [tabla, columna] = params;
            const cols = sqlite.prepare(`PRAGMA table_info(${tabla})`).all();
            const c = cols.find((x) => x.name === columna);
            return [c ? [{ largo: columna === 'password' ? 255 : null }] : [], undefined];
        }
        if (/^\s*ALTER TABLE .* MODIFY /i.test(sql)) return [{ affectedRows: 0 }, undefined];

        const limpios = params.map((p) => {
            if (p === undefined) throw new Error('Bind parameters must not contain undefined. To pass SQL NULL specify JS null');
            if (typeof p === 'boolean') return p ? 1 : 0;
            return p;
        });
        try {
            const st = sqlite.prepare(sql);
            if (/^\s*(SELECT|WITH|PRAGMA)/i.test(sql)) {
                return [st.all(...limpios).map((r) => ({ ...r })), undefined];
            }
            const r = st.run(...limpios);
            return [{ insertId: Number(r.lastInsertRowid), affectedRows: Number(r.changes) }, undefined];
        } catch (e) {
            if (/UNIQUE constraint failed/i.test(e.message)) { e.code = 'ER_DUP_ENTRY'; e.errno = 1062; }
            else if (/FOREIGN KEY constraint failed/i.test(e.message)) {
                e.code = /^\s*DELETE/i.test(sql) ? 'ER_ROW_IS_REFERENCED_2' : 'ER_NO_REFERENCED_ROW_2';
                e.errno = /^\s*DELETE/i.test(sql) ? 1451 : 1452;
            }
            throw e;
        }
    }

    const promesa = {
        query: async (sql, params) => ejecutar(sql, params),
        getConnection: async () => {
            const anterior = cola;
            let liberar;
            cola = new Promise((r) => { liberar = r; });
            await anterior; // espera su turno
            let abierta = false;
            return {
                query: async (sql, params) => ejecutar(sql, params),
                beginTransaction: async () => { sqlite.exec('BEGIN'); abierta = true; },
                commit: async () => { sqlite.exec('COMMIT'); abierta = false; },
                rollback: async () => { if (abierta) { sqlite.exec('ROLLBACK'); abierta = false; } },
                release: () => { if (abierta) { try { sqlite.exec('ROLLBACK'); } catch (e) { /* nada */ } } liberar(); },
            };
        },
    };

    const pool = {
        promise: () => promesa,
        query: (sql, params, cb) => {
            if (typeof params === 'function') { cb = params; params = []; }
            try { const [r] = ejecutar(sql, params); cb(null, r); } catch (e) { cb(e); }
        },
        sqlite,
        // Hace fallar la próxima consulta que coincida con el patrón (después de "saltar" coincidencias)
        fallarSiguiente: (patron, saltar = 0, props = null) => fallos.push({ patron, saltar, props }),
    };
    return pool;
}

module.exports = { crearPool };
