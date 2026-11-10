// Uso:  node scripts/respaldo.js      (o doble clic en hacer_respaldo.bat)
// Crea un respaldo de la base de datos en la carpeta "respaldos" (y una copia extra si configuraste BACKUP_COPY_DIR).
const config = require('../lib/config');
const { hacerRespaldo } = require('../lib/respaldo');

hacerRespaldo()
    .then((r) => {
        console.log(`✔ Respaldo creado: ${r.ruta} (${Math.max(1, Math.round(r.bytes / 1024))} KB)`);
        if (r.copiadoA) console.log(`✔ Copia guardada en: ${r.copiadoA}`);
        else if (config.BACKUP.copiarA) console.log(`⚠ No se pudo hacer la copia en ${config.BACKUP.copiarA} (¿USB desconectado?)`);
        process.exit(0);
    })
    .catch((e) => {
        console.error(`✘ No se pudo hacer el respaldo: ${e.message}`);
        process.exit(1);
    });
