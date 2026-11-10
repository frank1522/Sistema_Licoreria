// ============================================================
// VALIDACIONES Y UTILIDADES (dinero en céntimos para evitar errores de decimales)
// ============================================================

class ErrorNegocio extends Error {
    constructor(mensaje, status = 400) {
        super(mensaje);
        this.name = 'ErrorNegocio';
        this.status = status;
    }
}

// Quita caracteres de control y < > (evita que alguien meta código HTML en nombres/motivos)
function limpiarTexto(v, max = 100) {
    if (v === undefined || v === null) return '';
    let s = String(v).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
    if (s.length > max) s = s.slice(0, max).trim();
    return s;
}

// Entero estricto: devuelve NaN si no es un entero válido
function entero(v) {
    if (v === '' || v === null || v === undefined || typeof v === 'boolean') return NaN;
    const n = Number(v);
    return Number.isInteger(n) ? n : NaN;
}

// Dinero -> céntimos (entero). Vacío/undefined = 0. Inválido o negativo = NaN
function centavos(v) {
    if (v === '' || v === null || v === undefined) return 0;
    if (typeof v === 'boolean') return NaN;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 10000000) return NaN;
    return Math.round(n * 100);
}

const soles = (c) => (c / 100).toFixed(2);
const aDecimal = (c) => Math.round(c) / 100;

// Fecha YYYY-MM-DD válida
function fechaISO(v) {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + 'T00:00:00').getTime());
}

/**
 * Reparte los pagos de una venta.
 *  - permiteVuelto = true  (punto de venta): si pagan de más, el exceso es VUELTO y se descuenta del efectivo.
 *  - permiteVuelto = false (mesas, abonos): la suma debe coincidir con el total (tolerancia de 5 céntimos).
 * Devuelve céntimos { ef, ya, pl, ta, recibido, vuelto } donde ef+ya+pl+ta == total exactamente.
 */
function repartirPagos(p, totalC, { permiteVuelto = false, recibidoCliente = 0 } = {}) {
    let ef = centavos(p.ef), ya = centavos(p.ya), pl = centavos(p.pl), ta = centavos(p.ta);
    if ([ef, ya, pl, ta].some(Number.isNaN)) throw new ErrorNegocio('Los montos de pago no son válidos.');
    const bruto = ef + ya + pl + ta;

    if (bruto === 0) throw new ErrorNegocio('Falta indicar el pago.');

    if (permiteVuelto) {
        if (bruto < totalC) {
            throw new ErrorNegocio(`El pago (S/ ${soles(bruto)}) es menor al total real de la venta (S/ ${soles(totalC)}). Si el precio cambió, vuelve a cargar los productos.`);
        }
        const exceso = bruto - totalC;
        if (exceso > 0) {
            if (ef < exceso) throw new ErrorNegocio('El vuelto solo se puede dar del efectivo recibido. Revisa los montos.');
            ef -= exceso;
        }
        const recibido = Math.max(bruto, Number.isNaN(recibidoCliente) ? 0 : recibidoCliente);
        return { ef, ya, pl, ta, recibido, vuelto: recibido - totalC };
    }

    const dif = bruto - totalC;
    if (Math.abs(dif) > 5) {
        throw new ErrorNegocio(`La suma de los pagos (S/ ${soles(bruto)}) no coincide con el total (S/ ${soles(totalC)}).`);
    }
    if (dif !== 0) {
        // Ajusta el redondeo (máx. 5 céntimos) en el método de pago más grande
        const partes = { ef, ya, pl, ta };
        const mayor = Object.keys(partes).sort((a, b) => partes[b] - partes[a])[0];
        partes[mayor] -= dif;
        ({ ef, ya, pl, ta } = partes);
    }
    return { ef, ya, pl, ta, recibido: totalC, vuelto: 0 };
}

module.exports = { ErrorNegocio, limpiarTexto, entero, centavos, soles, aDecimal, fechaISO, repartirPagos };
