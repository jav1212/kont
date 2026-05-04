// =============================================================================
// SENIAT — Archivo TXT de Retenciones de IVA
//
// Construye el archivo plano que los Sujetos Pasivos Especiales suben al
// portal SENIAT como declaración informativa mensual de retenciones IVA.
// Base normativa: Providencia SNAT/2025/000054 (G.O. 43.171, 16/07/2025),
// vigente desde 01/08/2025 — supersede SNAT/2015/0049 sin cambios al formato.
//
// Estructura del archivo:
//   * Encoding: ISO-8859-1 (Latin-1), sin BOM
//   * Separador: TAB
//   * Una línea por (factura, alícuota IVA con base > 0)
//   * Decimales con punto, formato `NNN…N.NN` (13 enteros + 2 decimales)
//   * "TXT en cero" si no hubo operaciones: una sola línea con RIF + período +
//     14 ceros tab-separados (declaración igualmente obligatoria)
//
// Tokens por línea (17, índice + 16 columnas A-P):
//   0: índice secuencial de fila
//   A: RIF agente   B: período AAAAMM   C: fecha AAAA-MM-DD
//   D: tipo op (C/V)   E: tipo doc (01/02/03)   F: RIF proveedor
//   G: número factura   H: número control   I: monto total
//   J: base imponible   K: IVA retenido   L: documento afectado
//   M: N° comprobante (AAAAMMSSSSSSSS, 14 chars)   N: monto exento
//   O: alícuota (NN.NN)   P: N° expediente
// =============================================================================

import type { IvaRetentionExportRow } from '../../backend/domain/iva-retention-export';

// ── Formateo de campos ───────────────────────────────────────────────────────

/** Normaliza un RIF a 10 chars: letra + 9 dígitos, sin guiones. */
function formatRif(rif: string): string {
    const raw = (rif ?? '').trim();
    if (!raw) return '';
    const letterMatch = raw.match(/^[VvEeJjPpGg]/);
    const letter = (letterMatch ? letterMatch[0] : 'J').toUpperCase();
    const digits = raw.replace(/[^0-9]/g, '');
    if (digits.length === 0) return letter;
    const padded = digits.length >= 9 ? digits.slice(0, 9) : digits.padStart(9, '0');
    return `${letter}${padded}`;
}

/** Monto con 2 decimales y "." como separador (locale-independent). */
function fmtAmount(n: number): string {
    if (!Number.isFinite(n) || n < 0) return '0.00';
    return n.toFixed(2);
}

/** Alícuota con 2 decimales, formato NN.NN (16 → "16.00"). */
function fmtRate(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return '0.00';
    return n.toFixed(2);
}

/** Sanitiza string a una sola línea, sin TABs ni saltos. */
function safeText(s: string | null | undefined, max: number): string {
    return (s ?? '')
        .replace(/[\t\r\n]/g, ' ')
        .trim()
        .slice(0, max);
}

// ── Construcción del TXT ─────────────────────────────────────────────────────

export interface BuildIvaRetentionTxtInput {
    agentRif:     string;
    periodYyyymm: string;
    rows:         IvaRetentionExportRow[];
}

/**
 * Construye el contenido textual del TXT. Si `rows` está vacío, emite el
 * "TXT en cero" — una sola línea con índice 1, RIF, período y 14 ceros.
 *
 * El número de comprobante (col M) viene asignado por la base de datos al
 * confirmar la factura — esta función NO genera correlativos.
 */
export function buildIvaRetentionTxt(input: BuildIvaRetentionTxtInput): string {
    const { agentRif, periodYyyymm, rows } = input;

    if (!agentRif) {
        throw new Error('La empresa no tiene RIF — requerido por SENIAT.');
    }
    if (!/^\d{6}$/.test(periodYyyymm)) {
        throw new Error(`Período inválido: "${periodYyyymm}" (esperado AAAAMM).`);
    }

    const rifAgent = formatRif(agentRif);

    // ── Caso "TXT en cero" ─────────────────────────────────────────────────
    if (rows.length === 0) {
        // Spec: una línea con índice 1 + RIF + período + 14 ceros
        const tokens = ['1', rifAgent, periodYyyymm, ...Array.from({ length: 14 }, () => '0')];
        return tokens.join('\t') + '\n';
    }

    // ── Una línea por fila ────────────────────────────────────────────────
    const lines = rows.map((r, i) => {
        const tokens = [
            String(i + 1),                         // 0: índice
            rifAgent,                              // A: RIF agente
            periodYyyymm,                          // B: período
            r.date,                                // C: fecha AAAA-MM-DD
            r.operationType,                       // D: C/V
            r.documentType,                        // E: 01/02/03
            formatRif(r.supplierRif),              // F: RIF proveedor
            safeText(r.invoiceNumber, 20) || '0',  // G: número factura
            safeText(r.controlNumber, 20) || '0',  // H: número control
            fmtAmount(r.lineTotal),                // I: monto total
            fmtAmount(r.taxableBase),              // J: base imponible
            fmtAmount(r.vatWithheld),              // K: IVA retenido
            r.affectedDocument || '0',             // L: documento afectado
            r.voucherNumber,                       // M: N° comprobante
            fmtAmount(r.exemptAmount),             // N: monto exento
            fmtRate(r.vatRate),                    // O: alícuota
            r.fileNumber || '0',                   // P: N° expediente
        ];
        return tokens.join('\t');
    });

    return lines.join('\n') + '\n';
}

// ── Encoding ISO-8859-1 + descarga ───────────────────────────────────────────

/**
 * Codifica un string a bytes ISO-8859-1 (Latin-1). Caracteres fuera de rango
 * (>0xFF) se sustituyen por '?' — los acentos latinos comunes (ñ, á, é, í, ó,
 * ú, ü) sí caben en Latin-1, así que en práctica no se pierde nada.
 */
function encodeLatin1(input: string): ArrayBuffer {
    const buffer = new ArrayBuffer(input.length);
    const view   = new Uint8Array(buffer);
    for (let i = 0; i < input.length; i++) {
        const code = input.charCodeAt(i);
        view[i] = code <= 0xff ? code : 0x3f;
    }
    return buffer;
}

/** Descarga el TXT como archivo en el navegador con encoding Latin-1. */
export function downloadIvaRetentionTxt(content: string, filename: string): void {
    const blob = new Blob([encodeLatin1(content)], {
        type: 'text/plain;charset=ISO-8859-1',
    });
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Genera un nombre de archivo siguiendo la convención común de
 * contadores venezolanos: `RetIVA_{RIF}_{AAAAMM}.txt`. SENIAT no exige un
 * patrón específico — identifica el archivo por el contenido (col A y B).
 */
export function defaultIvaRetentionTxtFilename(agentRif: string, periodYyyymm: string): string {
    const rif = formatRif(agentRif);
    return `RetIVA_${rif}_${periodYyyymm}.txt`;
}
