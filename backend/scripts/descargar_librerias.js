// ============================================================
// OPCIONAL pero recomendado: hace que el sistema funcione SIN INTERNET.
// Descarga Bootstrap, Chart.js, Font Awesome y la letra Poppins a frontend/vendor
// y cambia los enlaces de las páginas para usar esas copias locales.
//
// Ejecútalo UNA vez, con internet, en la PC donde está el sistema:
//     node scripts/descargar_librerias.js
// Si algo falla, no cambia nada (las páginas siguen usando internet como antes).
// ============================================================
const fs = require('fs');
const path = require('path');

const FRONT = process.env.FRONTEND_DIR || path.join(__dirname, '..', '..', 'frontend');
const VENDOR = path.join(FRONT, 'vendor');
const TEMP = path.join(FRONT, 'vendor.tmp');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const FA_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0';
const ARCHIVOS = [
    { url: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css', destino: 'bootstrap.min.css' },
    { url: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js', destino: 'bootstrap.bundle.min.js' },
    { url: 'https://cdn.jsdelivr.net/npm/chart.js', destino: 'chart.umd.min.js' },
    { url: `${FA_BASE}/css/all.min.css`, destino: 'fontawesome/css/all.min.css' },
    { url: `${FA_BASE}/webfonts/fa-solid-900.woff2`, destino: 'fontawesome/webfonts/fa-solid-900.woff2' },
    { url: `${FA_BASE}/webfonts/fa-regular-400.woff2`, destino: 'fontawesome/webfonts/fa-regular-400.woff2' },
    { url: `${FA_BASE}/webfonts/fa-brands-400.woff2`, destino: 'fontawesome/webfonts/fa-brands-400.woff2' },
];
const URL_POPPINS = 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap';

// Cambios que se hacen en los .html
const REEMPLAZOS = [
    [/https:\/\/cdn\.jsdelivr\.net\/npm\/bootstrap@5\.3\.0\/dist\/css\/bootstrap\.min\.css/g, 'vendor/bootstrap.min.css'],
    [/https:\/\/cdn\.jsdelivr\.net\/npm\/bootstrap@5\.3\.0\/dist\/js\/bootstrap\.bundle\.min\.js/g, 'vendor/bootstrap.bundle.min.js'],
    [/https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js(?=["'])/g, 'vendor/chart.umd.min.js'],
    [/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\/6\.4\.0\/css\/all\.min\.css/g, 'vendor/fontawesome/css/all.min.css'],
    [/https:\/\/fonts\.googleapis\.com\/css2\?family=Poppins[^"']*/g, 'vendor/poppins.css'],
];

function reescribirHtml(texto) {
    return REEMPLAZOS.reduce((t, [re, nuevo]) => t.replace(re, nuevo), texto);
}

async function bajar(url, conUA = false) {
    const r = await fetch(url, { headers: conUA ? { 'User-Agent': UA } : {} });
    if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 100) throw new Error(`${url} → respuesta vacía`);
    return buf;
}

// Convierte el CSS de Google Fonts en un CSS local (solo alfabeto latino) y descarga las fuentes
async function prepararPoppins(css, descargar) {
    const bloques = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)];
    const usados = bloques.filter((b) => b[1] === 'latin' || b[1] === 'latin-ext');
    if (usados.length === 0) throw new Error('No se pudo leer el CSS de la fuente Poppins.');
    const fuentes = {};
    let salida = '';
    let n = 0;
    for (const [, subconjunto, bloque] of usados) {
        const m = /url\((https:[^)]+\.woff2)\)/.exec(bloque);
        if (!m) continue;
        const peso = (/font-weight:\s*(\d+)/.exec(bloque) || [, '400'])[1];
        const nombre = `fonts/poppins-${peso}-${subconjunto}.woff2`;
        fuentes[nombre] = await descargar(m[1]);
        salida += `/* ${subconjunto} */\n${bloque.replace(m[1], nombre.replace('fonts/', 'fonts/'))}\n`;
        n++;
    }
    if (n === 0) throw new Error('No se encontraron archivos de la fuente Poppins.');
    return { css: salida, fuentes };
}

async function main() {
    console.log('Descargando librerías (necesita internet)...');
    fs.rmSync(TEMP, { recursive: true, force: true });
    fs.mkdirSync(TEMP, { recursive: true });
    try {
        for (const a of ARCHIVOS) {
            const destino = path.join(TEMP, a.destino);
            fs.mkdirSync(path.dirname(destino), { recursive: true });
            fs.writeFileSync(destino, await bajar(a.url));
            console.log(`  ✔ ${a.destino}`);
        }
        const css = (await bajar(URL_POPPINS, true)).toString('utf8');
        const poppins = await prepararPoppins(css, (u) => bajar(u, true));
        fs.writeFileSync(path.join(TEMP, 'poppins.css'), poppins.css);
        for (const [nombre, datos] of Object.entries(poppins.fuentes)) {
            const destino = path.join(TEMP, nombre);
            fs.mkdirSync(path.dirname(destino), { recursive: true });
            fs.writeFileSync(destino, datos);
        }
        console.log(`  ✔ poppins.css (${Object.keys(poppins.fuentes).length} archivos de letra)`);
    } catch (e) {
        fs.rmSync(TEMP, { recursive: true, force: true });
        console.error(`\n✘ No se pudo descargar todo: ${e.message}`);
        console.error('  No se cambió nada. Las páginas siguen funcionando con internet como antes.');
        process.exit(1);
    }

    // Todo bajó bien: recién ahora se reemplaza y se cambian las páginas
    fs.rmSync(VENDOR, { recursive: true, force: true });
    fs.renameSync(TEMP, VENDOR);
    let cambiadas = 0;
    for (const f of fs.readdirSync(FRONT).filter((x) => x.endsWith('.html'))) {
        const ruta = path.join(FRONT, f);
        const antes = fs.readFileSync(ruta, 'utf8');
        const despues = reescribirHtml(antes);
        if (despues !== antes) { fs.writeFileSync(ruta, despues); cambiadas++; }
    }
    console.log(`\n✔ Listo. ${cambiadas} página(s) ahora usan copias locales (carpeta frontend/vendor).`);
    console.log('  Abre el sistema y revisa que se vea igual. Ya no depende del internet para los estilos.');
}

module.exports = { reescribirHtml, prepararPoppins, main };
if (require.main === module) main();
