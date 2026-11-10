// ============================================================
// TRANSACCIONES: o se guarda TODO o no se guarda NADA.
// Uso:  await conTransaccion(db, async (conn) => { await conn.query(...); });
// ============================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function conTransaccion(db, fn, intentos = 3) {
    for (let i = 1; ; i++) {
        const conn = await db.promise().getConnection();
        try {
            await conn.beginTransaction();
            const resultado = await fn(conn);
            await conn.commit();
            return resultado;
        } catch (e) {
            try { await conn.rollback(); } catch (_) { /* ya estaba cerrada */ }
            // Si MySQL detecta un "choque" entre dos operaciones simultáneas, se reintenta
            if ((e.code === 'ER_LOCK_DEADLOCK' || e.errno === 1213) && i < intentos) {
                await sleep(60 * i);
                continue;
            }
            throw e;
        } finally {
            conn.release();
        }
    }
}

module.exports = { conTransaccion };
