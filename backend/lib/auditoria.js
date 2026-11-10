// Deja huella en logs_auditoria (quién hizo qué). Funciona con el pool o dentro de una transacción.
async function registrar(conexion, idUsuario, accion) {
    const texto = String(accion).replace(/\s+/g, ' ').trim().slice(0, 250);
    const q = conexion.promise ? conexion.promise() : conexion;
    await q.query('INSERT INTO logs_auditoria (id_usuario, accion) VALUES (?, ?)', [idUsuario, texto]);
}
module.exports = { registrar };
