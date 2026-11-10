// ============================================================
// RESPALDOS DE LA BASE DE DATOS (mysqldump)
// - Se usa desde el botón "Hacer respaldo ahora" (pantalla Auditoría y respaldos)
// - y desde el respaldo diario automático (scripts/respaldo.js / hacer_respaldo.bat)
// ============================================================
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const config = require('./config');
const log = require('./log');

const RE_ARCHIVO = /^respaldo_\d{4}-\d{2}-\d{2}_\d{4}\.sql$/;

function ubicarMysqldump() {
    if (config.BACKUP.mysqldump) return config.BACKUP.mysqldump;
    if (process.platform === 'win32') {
        const candidatos = [
            'C:\\xampp\\mysql\\bin\\mysqldump.exe',
            'D:\\xampp\\mysql\\bin\\mysqldump.exe',
            'C:\\Program Files\\MariaDB 10.4\\bin\\mysqldump.exe',
            'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe',
        ];
        for (const c of candidatos) if (fs.existsSync(c)) return c;
    }
    return 'mysqldump';
}

function sello() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function escribirLog(texto) {
    try {
        fs.mkdirSync(config.BACKUP.dir, { recursive: true });
        fs.appendFileSync(path.join(config.BACKUP.dir, 'respaldo.log'), `[${new Date().toISOString()}] ${texto}\n`);
    } catch (e) { /* sin permiso: no pasa nada */ }
}

function terminaCompleto(ruta) {
    // mysqldump escribe "-- Dump completed" al final; si no está, el archivo quedó cortado
    const fd = fs.openSync(ruta, 'r');
    try {
        const { size } = fs.fstatSync(fd);
        const largo = Math.min(size, 400);
        const buf = Buffer.alloc(largo);
        fs.readSync(fd, buf, 0, largo, size - largo);
        return buf.toString('utf8').includes('Dump completed');
    } finally { fs.closeSync(fd); }
}

function rotar(dir, dias) {
    try {
        const limite = Date.now() - dias * 86400000;
        const archivos = fs.readdirSync(dir).filter((f) => RE_ARCHIVO.test(f))
            .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
        // Siempre se conservan los 3 más nuevos, aunque sean "viejos"
        archivos.slice(3).filter((a) => a.t < limite).forEach((a) => fs.unlinkSync(path.join(dir, a.f)));
    } catch (e) { /* nada */ }
}

function hacerRespaldo() {
    return new Promise((resolve, reject) => {
        const dir = config.BACKUP.dir;
        try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { return reject(new Error(`No se pudo crear la carpeta de respaldos: ${e.message}`)); }

        const nombre = `respaldo_${sello()}.sql`;
        const destino = path.join(dir, nombre);
        const temporal = destino + '.tmp';
        const bin = ubicarMysqldump();
        const { host, port, user, password, database } = config.DB;
        const args = ['--host', host, '--port', String(port), '--user', user,
            '--single-transaction', '--skip-lock-tables', '--default-character-set=utf8mb4', database];

        let salida;
        try { salida = fs.createWriteStream(temporal); } catch (e) { return reject(e); }
        let errores = '';
        let terminado = false;
        const fallar = (msg) => {
            if (terminado) return;
            terminado = true;
            try { salida.destroy(); fs.unlinkSync(temporal); } catch (e) { /* ya no existe */ }
            escribirLog(`ERROR: ${msg}`);
            reject(new Error(msg));
        };

        let proc;
        try {
            proc = spawn(bin, args, { env: { ...process.env, MYSQL_PWD: password }, windowsHide: true });
        } catch (e) { return fallar(`No se pudo ejecutar mysqldump (${bin}): ${e.message}`); }

        const reloj = setTimeout(() => { try { proc.kill(); } catch (e) { /* ya terminó */ } fallar('El respaldo tardó demasiado y se canceló.'); }, 5 * 60 * 1000);

        proc.stdout.pipe(salida);
        proc.stderr.on('data', (d) => { if (errores.length < 2000) errores += d.toString(); });
        proc.on('error', (e) => { clearTimeout(reloj); fallar(`No se encontró mysqldump (${bin}). Revisa MYSQLDUMP_PATH en backend/.env. Detalle: ${e.message}`); });
        proc.on('close', (codigo) => {
            clearTimeout(reloj);
            if (terminado) return;
            salida.end(() => {
                if (codigo !== 0) return fallar(`mysqldump terminó con error (${codigo}): ${errores.trim() || 'sin detalle'}`);
                let ok = false;
                try { ok = fs.statSync(temporal).size > 200 && terminaCompleto(temporal); } catch (e) { ok = false; }
                if (!ok) return fallar('El respaldo quedó incompleto y se descartó.');
                try { fs.renameSync(temporal, destino); } catch (e) { return fallar(`No se pudo guardar el respaldo: ${e.message}`); }
                terminado = true;

                const bytes = fs.statSync(destino).size;
                let copia = '';
                if (config.BACKUP.copiarA) {
                    try {
                        fs.mkdirSync(config.BACKUP.copiarA, { recursive: true });
                        fs.copyFileSync(destino, path.join(config.BACKUP.copiarA, nombre));
                        rotar(config.BACKUP.copiarA, config.BACKUP.dias);
                        copia = config.BACKUP.copiarA;
                    } catch (e) {
                        copia = '';
                        escribirLog(`AVISO: no se pudo copiar a ${config.BACKUP.copiarA} (${e.message}). ¿Está conectado el USB / la carpeta?`);
                        log.aviso(`Respaldo: no se pudo copiar a ${config.BACKUP.copiarA}`);
                    }
                }
                rotar(dir, config.BACKUP.dias);
                escribirLog(`OK ${nombre} (${bytes} bytes)${copia ? ` copiado a ${copia}` : ''}`);
                resolve({ archivo: nombre, ruta: destino, bytes, copiadoA: copia });
            });
        });
    });
}

function listar() {
    try {
        return fs.readdirSync(config.BACKUP.dir).filter((f) => RE_ARCHIVO.test(f)).map((f) => {
            const s = fs.statSync(path.join(config.BACKUP.dir, f));
            return { archivo: f, bytes: s.size, fecha: s.mtime.toISOString() };
        }).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    } catch (e) { return []; }
}

// Devuelve la ruta SOLO si el nombre tiene el formato exacto de un respaldo nuestro
function rutaSegura(nombre) {
    if (!RE_ARCHIVO.test(String(nombre))) return null;
    const ruta = path.join(config.BACKUP.dir, nombre);
    return fs.existsSync(ruta) ? ruta : null;
}

module.exports = { hacerRespaldo, listar, rutaSegura };
