// =============================================================================
// SENIAT — Relación de Retenciones ISLR (Salarios y otras retenciones)
//
// Genera el XML mensual exigido por el portal del SENIAT para el código de
// concepto 001 (Sueldos y Salarios). El esquema oficial está en el manual
// técnico v2.3 (Feb 2010) "60.40.40.039". Este módulo replica el formato
// aceptado en producción por el portal en 2026, que añade <FechaOperacion>
// al detalle (no presente en el manual original pero exigido en la práctica).
//
// Estructura emitida:
//
//   <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//   <RelacionRetencionesISLR RifAgente="J408624478" Periodo="202603">
//     <DetalleRetencion>
//       <RifRetenido>V012345678</RifRetenido>
//       <NumeroFactura>31032026</NumeroFactura>
//       <NumeroControl>31032026</NumeroControl>
//       <FechaOperacion>31/03/2026</FechaOperacion>
//       <CodigoConcepto>001</CodigoConcepto>
//       <MontoOperacion>9000.00</MontoOperacion>
//       <PorcentajeRetencion>1.49</PorcentajeRetencion>
//     </DetalleRetencion>
//     ...
//   </RelacionRetencionesISLR>
//
// Reglas clave:
//   - RifAgente: 10 caracteres = letra + 9 dígitos, sin guiones. Si el RIF de
//     la empresa trae menos de 9 dígitos se rellena con ceros (es excepcional).
//   - RifRetenido: 10 caracteres = letra + 9 dígitos. Debe ser el RIF real del
//     empleado (cédula + dígito verificador). Si la cédula no tiene 9 dígitos
//     exactos se aborta con error: padding con ceros produciría un RIF falso.
//   - Periodo: AAAAMM (e.g. 202603 = marzo 2026).
//   - NumeroFactura / NumeroControl: DDMMYYYY del último día del mes (8 chars).
//   - FechaOperacion: DD/MM/YYYY del último periodEnd pagado en el mes.
//   - MontoOperacion: monto bruto mensual acumulado del empleado, 2 decimales,
//     punto como separador decimal.
//   - PorcentajeRetencion: % declarado en el AR-I del empleado, 2 decimales.
//   - CodigoConcepto: "001" para sueldos y salarios.
// =============================================================================

const CODIGO_CONCEPTO_SUELDOS = "001";

// ── Formateo de identificadores fiscales ─────────────────────────────────────

/**
 * Normaliza un RIF a formato SENIAT (10 chars: letra + 9 dígitos, sin guiones).
 * Acepta entradas como "J-12345678-9", "j123456789", "12345678-9", etc.
 *
 * @throws Error si no se puede derivar un RIF válido.
 */
export function formatRifAgente(rif: string): string {
    const raw = (rif ?? "").trim();
    if (!raw) throw new Error("El RIF de la empresa está vacío.");

    const letterMatch = raw.match(/^[VvEeJjPpGg]/);
    const letter = (letterMatch ? letterMatch[0] : "J").toUpperCase();
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits.length === 0) throw new Error(`RIF inválido: "${rif}"`);

    // Si supera 9 dígitos, recorta los primeros 9; si es menor, rellena con ceros.
    const padded = digits.length >= 9 ? digits.slice(0, 9) : digits.padStart(9, "0");
    return `${letter}${padded}`;
}

/**
 * Normaliza la cédula del empleado al RIF retenido (10 chars: letra + 9 dígitos).
 * Acepta entradas con letra y guiones ("V-12345678-9", "V123456789", "123456789").
 * Si no trae letra explícita, se asume "V" (venezolano).
 *
 * SENIAT exige los 9 dígitos del RIF real (cédula + dígito verificador). Si la
 * cédula no llega con 9 dígitos exactos se lanza un error claro indicando qué
 * empleado debe corregirse — rellenar con ceros producía un RIF falso que el
 * portal aceptaba pero que no pertenece al contribuyente.
 */
export function formatRifRetenido(cedula: string, nombre?: string): string {
    const raw = (cedula ?? "").trim();
    const empLabel = nombre ? ` (${nombre})` : "";
    if (!raw) throw new Error(`La cédula del empleado${empLabel} está vacía.`);

    const letterMatch = raw.match(/^[VvEeJjPpGg]/);
    const letter = (letterMatch ? letterMatch[0] : "V").toUpperCase();
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits.length !== 9) {
        throw new Error(
            `La cédula "${cedula}"${empLabel} no es un RIF válido para SENIAT: ` +
            `requiere 9 dígitos (cédula + dígito verificador) y llegó con ${digits.length}. ` +
            `Edita la cédula del empleado en /payroll/employees para incluir el dígito verificador antes de exportar el XML.`
        );
    }
    return `${letter}${digits}`;
}

// ── Formateo de fechas y montos ──────────────────────────────────────────────

/** "2026-03-31" → "31/03/2026" */
export function formatFechaOperacion(iso: string): string {
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) throw new Error(`Fecha inválida: "${iso}"`);
    return `${d}/${m}/${y}`;
}

/** "2026-03-31" → "31032026" */
export function formatNumeroFactura(iso: string): string {
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) throw new Error(`Fecha inválida: "${iso}"`);
    return `${d}${m}${y}`;
}

/** Devuelve el último día del mes en formato ISO (YYYY-MM-DD). */
export function lastDayOfMonth(year: number, month: number): string {
    // month: 1-12. Date(year, month, 0) → último día del mes anterior +1
    const d = new Date(Date.UTC(year, month, 0));
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function formatMonto(n: number): string {
    if (!Number.isFinite(n) || n < 0) return "0.00";
    return n.toFixed(2);
}

function formatPorcentaje(p: number | undefined): string {
    if (p == null || !Number.isFinite(p) || p < 0) return "0.00";
    return p.toFixed(2);
}

// ── Tipos públicos ───────────────────────────────────────────────────────────

export interface IslrXmlItem {
    cedula:           string;   // tal como viene del empleado (ej. "V-12345678-9")
    nombre?:          string;   // opcional, sólo para identificar al empleado en mensajes de error
    montoOperacion:   number;   // bruto mensual acumulado (VES)
    porcentajeIslr:   number;   // % declarado en AR-I (0-100)
}

export interface BuildIslrXmlInput {
    companyRif:    string;       // RIF de la empresa, cualquier formato
    year:          number;       // ej. 2026
    month:         number;       // 1-12
    /** ISO date YYYY-MM-DD del último periodEnd pagado en el mes; default: último día del mes. */
    fechaOperacion?: string;
    items:         IslrXmlItem[];
}

// ── Generador del XML ────────────────────────────────────────────────────────

/**
 * Construye el XML "RelacionRetencionesISLR" mensual aceptado por el portal
 * fiscal del SENIAT. La salida es texto plano compacto, listo para descargar
 * como archivo .xml.
 */
export function buildIslrXml(input: BuildIslrXmlInput): string {
    const { companyRif, year, month, items } = input;

    if (!Number.isInteger(year) || year < 2000 || year > 2999) {
        throw new Error(`Año inválido: ${year}`);
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error(`Mes inválido: ${month}`);
    }
    if (!items.length) {
        throw new Error("No hay empleados con pagos en el período seleccionado.");
    }

    const rifAgente = formatRifAgente(companyRif);
    const periodo   = `${year}${String(month).padStart(2, "0")}`;
    const fechaIso  = input.fechaOperacion ?? lastDayOfMonth(year, month);
    const numeroRef = formatNumeroFactura(fechaIso);
    const fechaOp   = formatFechaOperacion(fechaIso);

    const detalles = items
        .map((it) => {
            const rifRet = formatRifRetenido(it.cedula, it.nombre);
            const monto  = formatMonto(it.montoOperacion);
            const pct    = formatPorcentaje(it.porcentajeIslr);
            return [
                `<DetalleRetencion>`,
                `<RifRetenido>${rifRet}</RifRetenido>`,
                `<NumeroFactura>${numeroRef}</NumeroFactura>`,
                `<NumeroControl>${numeroRef}</NumeroControl>`,
                `<FechaOperacion>${fechaOp}</FechaOperacion>`,
                `<CodigoConcepto>${CODIGO_CONCEPTO_SUELDOS}</CodigoConcepto>`,
                `<MontoOperacion>${monto}</MontoOperacion>`,
                `<PorcentajeRetencion>${pct}</PorcentajeRetencion>`,
                `</DetalleRetencion>`,
            ].join("");
        })
        .join("");

    return [
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
        `<RelacionRetencionesISLR RifAgente="${rifAgente}" Periodo="${periodo}">${detalles}</RelacionRetencionesISLR>`,
        ``,
    ].join("\n");
}

/**
 * Indenta el XML compacto que produce buildIslrXml para mostrarlo en preview.
 * No altera el contenido — sólo añade saltos de línea y dos espacios por nivel.
 *
 * El download sigue usando el XML compacto original (mismo bytes que ya enviaba
 * el portal). Esta función existe sólo para el panel "XML" del modal.
 */
export function prettifyIslrXml(xml: string): string {
    // Tokens reconocidos, en orden de prioridad:
    //   1) declaración    <?xml ... ?>
    //   2) cierre         </Tag>
    //   3) leaf con texto <Tag>contenido</Tag>
    //   4) apertura       <Tag ...>
    const tokenRe = /<\?[^?]+\?>|<\/[^>]+>|<[^>]+>[^<]*<\/[^>]+>|<[^>]+>/g;
    const tokens = xml.match(tokenRe);
    if (!tokens) return xml;

    const INDENT = "  ";
    const lines: string[] = [];
    let depth = 0;

    for (const tok of tokens) {
        if (tok.startsWith("<?")) {
            lines.push(tok);
            continue;
        }
        if (tok.startsWith("</")) {
            depth = Math.max(0, depth - 1);
            lines.push(INDENT.repeat(depth) + tok);
            continue;
        }
        // Leaf: <Tag>x</Tag> — un único token que ya contiene cierre
        if (/<\/[^>]+>$/.test(tok) && tok.lastIndexOf("<") > 0) {
            lines.push(INDENT.repeat(depth) + tok);
            continue;
        }
        // Apertura: <Tag ...>
        lines.push(INDENT.repeat(depth) + tok);
        depth++;
    }

    return lines.join("\n");
}

/** Helper para descargar el XML generado en el navegador. */
export function downloadXmlFile(xml: string, filename: string): void {
    const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
