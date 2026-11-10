// Registro simple en consola + archivo (backend/logs/AAAA-MM-DD.log)
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'logs');
let dirOk = false;

function ahora() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return {
        dia: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
        hora: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
    };
}

function escribir(nivel, args) {
    const { dia, hora } = ahora();
    const texto = args.map((a) => (a instanceof Error ? (a.stack || a.message) : (typeof a === 'string' ? a : JSON.stringify(a)))).join(' ');
    const linea = `[${dia} ${hora}] ${nivel} ${texto}`;
    (nivel === 'ERROR' ? console.error : nivel === 'AVISO' ? console.warn : console.log)(linea);
    if (process.env.LOG_A_ARCHIVO === '0') return;
    try {
        if (!dirOk) { fs.mkdirSync(DIR, { recursive: true }); dirOk = true; }
        fs.appendFileSync(path.join(DIR, `${dia}.log`), linea + '\n');
    } catch (e) { /* si no se puede escribir el archivo, seguimos igual */ }
}

// Borra logs de más de 30 días
function limpiarViejos(dias = 30) {
    try {
        const limite = Date.now() - dias * 86400000;
        for (const f of fs.readdirSync(DIR)) {
            const ruta = path.join(DIR, f);
            if (/^\d{4}-\d{2}-\d{2}\.log$/.test(f) && fs.statSync(ruta).mtimeMs < limite) fs.unlinkSync(ruta);
        }
    } catch (e) { /* nada */ }
}

module.exports = {
    info: (...a) => escribir('INFO', a),
    aviso: (...a) => escribir('AVISO', a),
    error: (...a) => escribir('ERROR', a),
    limpiarViejos,
};
