// Uso:  node scripts/cambiar_password.js usuario "NuevaClave123"
// Sirve cuando el cliente olvida su contraseña y no puede entrar al sistema.
const db = require('../db');
const { hashear } = require('../lib/seguridad');

const [usuario, clave] = process.argv.slice(2);
if (!usuario || !clave) {
    console.log('Uso:  node scripts/cambiar_password.js <usuario> "<nueva clave>"');
    process.exit(1);
}
if (clave.length < 6 || clave.length > 72) {
    console.error('La clave debe tener entre 6 y 72 caracteres.');
    process.exit(1);
}

(async () => {
    try {
        const [r] = await db.promise().query('UPDATE usuarios SET password = ? WHERE usuario = ?', [await hashear(clave), usuario]);
        if (r.affectedRows === 0) {
            console.error(`✘ No existe ningún usuario llamado "${usuario}".`);
            process.exitCode = 1;
        } else {
            console.log(`✔ Contraseña de "${usuario}" cambiada. Ya puede entrar con la nueva.`);
        }
    } catch (e) {
        console.error('✘ Error:', e.message);
        process.exitCode = 1;
    } finally {
        db.end(() => process.exit());
    }
})();
