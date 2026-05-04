// =============================================================================
// SENIAT — Constructor genérico del XML "RelacionRetencionesISLR"
//
// Spec técnica: Manual SENIAT 60.40.40.039 (DMT_01ESP_TEC v2.3, Feb 2010).
// Aplica al esquema "Salarios y Otras Retenciones" — admite los 86 códigos
// de concepto del Anexo 6.1 (sueldos 001, honorarios 002, fletes 071/072,
// alquileres 057-064, contratistas 053-056, etc.).
//
// Estructura emitida:
//
//   <?xml version="1.0" encoding="ISO-8859-1"?>
//   <RelacionRetencionesISLR RifAgente="J123456789" Periodo="202604">
//     <DetalleRetencion>
//       <RifRetenido>V012345678</RifRetenido>
//       <NumeroFactura>00012345</NumeroFactura>
//       <NumeroControl>00-00012345</NumeroControl>
//       <FechaOperacion>15/04/2026</FechaOperacion>
//       <CodigoConcepto>002</CodigoConcepto>
//       <MontoOperacion>10000.00</MontoOperacion>
//       <PorcentajeRetencion>3.00</PorcentajeRetencion>
//     </DetalleRetencion>
//     ...
//   </RelacionRetencionesISLR>
//
// Encoding: ISO-8859-1 (Latin-1) — el descargador convierte bytes para que el
// header del XML coincida con el archivo real (SENIAT rechaza UTF-8 con BOM).
// =============================================================================

// ── RIF helpers ──────────────────────────────────────────────────────────────

/**
 * Normaliza un RIF de empresa a 10 chars: letra + 9 dígitos, sin guiones.
 * Tolera entradas como "J-12345678-9", "j123456789", etc.
 */
export function formatRifAgente(rif: string): string {
    const raw = (rif ?? "").trim();
    if (!raw) throw new Error("El RIF de la empresa está vacío.");
    const letterMatch = raw.match(/^[VvEeJjPpGg]/);
    const letter = (letterMatch ? letterMatch[0] : "J").toUpperCase();
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits.length === 0) throw new Error(`RIF inválido: "${rif}"`);
    const padded = digits.length >= 9 ? digits.slice(0, 9) : digits.padStart(9, "0");
    return `${letter}${padded}`;
}

/**
 * Normaliza el RIF de un sujeto retenido (proveedor o empleado) a 10 chars.
 * Si no trae letra explícita, asume el `defaultLetter`. Lanza si los 9 dígitos
 * no se pueden derivar — preferimos fallar a producir un RIF falso.
 */
export function formatRifRetenido(
    rif: string,
    label?: string,
    defaultLetter: 'V' | 'J' | 'E' | 'P' | 'G' = 'V',
): string {
    const raw = (rif ?? "").trim();
    const empLabel = label ? ` (${label})` : "";
    if (!raw) throw new Error(`El RIF del sujeto retenido${empLabel} está vacío.`);
    const letterMatch = raw.match(/^[VvEeJjPpGg]/);
    const letter = (letterMatch ? letterMatch[0] : defaultLetter).toUpperCase();
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits.length !== 9) {
        throw new Error(
            `El RIF "${rif}"${empLabel} no es válido para SENIAT: ` +
            `requiere 9 dígitos y llegó con ${digits.length}.`
        );
    }
    return `${letter}${digits}`;
}

// ── Date / number helpers ────────────────────────────────────────────────────

/** "2026-03-31" → "31/03/2026" */
export function formatFechaOperacion(iso: string): string {
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) throw new Error(`Fecha inválida: "${iso}"`);
    return `${d}/${m}/${y}`;
}

/** "2026-03-31" → "31032026" — usado para NumeroFactura/Control en nómina. */
export function formatNumeroFactura(iso: string): string {
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) throw new Error(`Fecha inválida: "${iso}"`);
    return `${d}${m}${y}`;
}

/** Devuelve el último día del mes en formato ISO (YYYY-MM-DD). */
export function lastDayOfMonth(year: number, month: number): string {
    const d = new Date(Date.UTC(year, month, 0));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function formatMonto(n: number): string {
    if (!Number.isFinite(n) || n < 0) return "0.00";
    return n.toFixed(2);
}

function formatPorcentaje(p: number | undefined): string {
    if (p == null || !Number.isFinite(p) || p < 0) return "0.00";
    return p.toFixed(2);
}

/**
 * Reglas SENIAT para NumeroFactura: hasta 10 chars, alfanumérico. Si excede
 * 10 chars usar los últimos 10. Si está vacío, "0".
 */
function sanitizeNumeroFactura(v: string): string {
    const cleaned = (v ?? "").replace(/[^a-zA-Z0-9]/g, "");
    if (!cleaned) return "0";
    return cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
}

/**
 * Reglas SENIAT para NumeroControl: hasta 8 dígitos. Vacío o no numérico → "NA".
 */
function sanitizeNumeroControl(v: string): string {
    const cleaned = (v ?? "").replace(/[^0-9]/g, "");
    if (!cleaned) return "NA";
    return cleaned.length > 8 ? cleaned.slice(-8) : cleaned;
}

// ── Public types ─────────────────────────────────────────────────────────────

export interface IslrXmlGenericItem {
    /** RIF retenido — ya normalizado (10 chars). */
    rifRetenido:        string;
    /** N° de factura. Sanitizado por la función al emitir. */
    numeroFactura:      string;
    /** N° de control. Sanitizado por la función al emitir. */
    numeroControl:      string;
    /** Fecha de la operación en formato DD/MM/YYYY. */
    fechaOperacion:     string;
    /** Código de 3 dígitos del Anexo 6.1 (ej. "001", "002", "071"). */
    codigoConcepto:     string;
    /** Monto base de la operación en Bs. */
    montoOperacion:     number;
    /** % de retención aplicado (0-100). */
    porcentajeRetencion: number;
}

export interface BuildIslrXmlInput {
    companyRif: string;
    year:       number;          // ej. 2026
    month:      number;          // 1-12
    items:      IslrXmlGenericItem[];
}

// ── XML builder ──────────────────────────────────────────────────────────────

/**
 * Construye el XML "RelacionRetencionesISLR" mensual aceptado por el portal
 * fiscal del SENIAT. Salida en texto plano compacto, listo para descargar
 * como archivo .xml. Encoding header: ISO-8859-1.
 */
export function buildIslrXmlGeneric(input: BuildIslrXmlInput): string {
    const { companyRif, year, month, items } = input;

    if (!Number.isInteger(year) || year < 2000 || year > 2999) {
        throw new Error(`Año inválido: ${year}`);
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error(`Mes inválido: ${month}`);
    }
    if (!items.length) {
        throw new Error("No hay retenciones de ISLR en el período seleccionado.");
    }

    const rifAgente = formatRifAgente(companyRif);
    const periodo   = `${year}${String(month).padStart(2, "0")}`;

    const detalles = items
        .map((it) => {
            const numFac = sanitizeNumeroFactura(it.numeroFactura);
            const numCtl = sanitizeNumeroControl(it.numeroControl);
            return [
                `<DetalleRetencion>`,
                `<RifRetenido>${it.rifRetenido}</RifRetenido>`,
                `<NumeroFactura>${numFac}</NumeroFactura>`,
                `<NumeroControl>${numCtl}</NumeroControl>`,
                `<FechaOperacion>${it.fechaOperacion}</FechaOperacion>`,
                `<CodigoConcepto>${it.codigoConcepto}</CodigoConcepto>`,
                `<MontoOperacion>${formatMonto(it.montoOperacion)}</MontoOperacion>`,
                `<PorcentajeRetencion>${formatPorcentaje(it.porcentajeRetencion)}</PorcentajeRetencion>`,
                `</DetalleRetencion>`,
            ].join("");
        })
        .join("");

    return [
        `<?xml version="1.0" encoding="ISO-8859-1"?>`,
        `<RelacionRetencionesISLR RifAgente="${rifAgente}" Periodo="${periodo}">${detalles}</RelacionRetencionesISLR>`,
        ``,
    ].join("\n");
}

/**
 * Indenta el XML compacto que produce buildIslrXmlGeneric — sólo para preview.
 */
export function prettifyIslrXml(xml: string): string {
    const tokenRe = /<\?[^?]+\?>|<\/[^>]+>|<[^>]+>[^<]*<\/[^>]+>|<[^>]+>/g;
    const tokens = xml.match(tokenRe);
    if (!tokens) return xml;

    const INDENT = "  ";
    const lines: string[] = [];
    let depth = 0;
    for (const tok of tokens) {
        if (tok.startsWith("<?")) { lines.push(tok); continue; }
        if (tok.startsWith("</")) {
            depth = Math.max(0, depth - 1);
            lines.push(INDENT.repeat(depth) + tok);
            continue;
        }
        if (/<\/[^>]+>$/.test(tok) && tok.lastIndexOf("<") > 0) {
            lines.push(INDENT.repeat(depth) + tok);
            continue;
        }
        lines.push(INDENT.repeat(depth) + tok);
        depth++;
    }
    return lines.join("\n");
}

// ── Latin-1 download ─────────────────────────────────────────────────────────

function encodeLatin1(input: string): ArrayBuffer {
    const buffer = new ArrayBuffer(input.length);
    const view   = new Uint8Array(buffer);
    for (let i = 0; i < input.length; i++) {
        const code = input.charCodeAt(i);
        view[i] = code <= 0xff ? code : 0x3f;
    }
    return buffer;
}

/** Descarga el XML como archivo en el navegador con encoding ISO-8859-1. */
export function downloadXmlFile(xml: string, filename: string): void {
    const blob = new Blob([encodeLatin1(xml)], { type: "application/xml;charset=ISO-8859-1" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
