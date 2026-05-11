// =============================================================================
// PDF generator: Reporte "Retenciones por Mes - Año".
//
// Resumen mensual de retenciones de ISLR sobre sueldos (PNR — Persona Natural
// Residente). Una fila por empleado con base = bruto mensual acumulado y
// retención = base × %ISLR / 100. Layout fiel al formato estándar usado en
// sistemas contables venezolanos para conciliar contra el XML SENIAT.
//
// Llamado desde el modal IslrRetencionesModal en el historial de nómina.
// =============================================================================

import {
    COLORS,
    PAGE,
    pageBounds,
    drawHeader,
    drawFooter,
    drawHeaderRow,
    drawRow,
    fill,
    rect,
    formatN,
    loadKontaLogo,
    renderLabel,
    renderMono,
    renderText,
    safeFilename,
} from "@/src/shared/frontend/utils/pdf-chrome";
import type { IslrMonthlyRow } from "./islr-monthly-aggregator";

const MES_LABELS = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export interface IslrRetencionesPdfOptions {
    companyName: string;
    companyRif:  string | undefined;
    year:        number;
    month:       number;   // 1-12
}

interface ColumnSpec {
    key:    "tipo" | "codigo" | "rif" | "proveedor" | "fecha" | "fechaDoc" | "numDoc" | "numControl" | "totalFactura" | "totalBase" | "totalRetenido";
    title:  string;
    width:  number;
    align:  "left" | "center" | "right";
    mono?:  boolean;
    bold?:  boolean;
}

// Anchos en mm — suma exacta = 277mm (ancho útil A4 landscape con marginX=10).
const COLUMNS: ColumnSpec[] = [
    { key: "tipo",          title: "Tipo",            width: 11, align: "center" },
    { key: "codigo",        title: "Cód. Retención",  width: 18, align: "center" },
    { key: "rif",           title: "N° R.I.F.",       width: 22, align: "left",  mono: true },
    { key: "proveedor",     title: "Proveedor",       width: 56, align: "left" },
    { key: "fecha",         title: "Fecha",           width: 16, align: "center", mono: true },
    { key: "fechaDoc",      title: "Fecha Doc",       width: 18, align: "center", mono: true },
    { key: "numDoc",        title: "N° Documento",    width: 22, align: "center", mono: true },
    { key: "numControl",    title: "N° Control",      width: 22, align: "center", mono: true },
    { key: "totalFactura",  title: "Total Factura",   width: 30, align: "right",  mono: true },
    { key: "totalBase",     title: "Total Base",      width: 30, align: "right",  mono: true },
    { key: "totalRetenido", title: "Total Retenido",  width: 32, align: "right",  mono: true, bold: true },
];

/**
 * Normaliza la cédula al formato del reporte: prefijo "V" + dígitos sin
 * separadores (e.g. "V203273181"). Coincide con el formato del PDF estándar.
 * Si la cédula ya trae prefijo (V/E/J/P/G), respeta el prefijo y solo limpia.
 */
function formatRifReporte(cedula: string): string {
    const trimmed = (cedula ?? "").trim().toUpperCase();
    if (!trimmed) return "—";
    const first = trimmed[0];
    if (first && "VEJPG".includes(first)) {
        return first + trimmed.slice(1).replace(/[^0-9]/g, "");
    }
    return "V" + trimmed.replace(/[^0-9]/g, "");
}

/**
 * Último día calendario del mes (en zona local). Usado para Fecha, Fecha Doc,
 * N° Documento y N° Control de todas las filas.
 */
function lastDayOfMonth(year: number, month: number): Date {
    return new Date(year, month, 0);   // month 1-12 → day 0 = last day of previous-of-(month+1)
}

function pad2(n: number): string {
    return String(n).padStart(2, "0");
}

export async function generateIslrRetencionesPdf(
    rows: IslrMonthlyRow[],
    opts: IslrRetencionesPdfOptions,
): Promise<void> {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const ML = PAGE.marginX;
    const W  = PW - 2 * ML;

    const kontaLogo = await loadKontaLogo();

    const periodLabel = `${MES_LABELS[opts.month - 1] ?? ""} ${opts.year}`.trim();
    const headerOpts = {
        companyName: opts.companyName,
        companyRif:  opts.companyRif,
        reportTitle: "Retenciones por Mes - Año",
        periodLabel,
    };

    // ── Chrome (header) ──────────────────────────────────────────────────────
    drawHeader(doc, headerOpts);
    let y: number = PAGE.contentTop;

    // ── Sub-cabecera con el subtítulo estilo SENIAT ──────────────────────────
    const subKpiH = 11;
    fill(doc, ML, y, W, subKpiH, COLORS.rowAlt);
    fill(doc, ML, y, 1.5, subKpiH, COLORS.orange);
    rect(doc, ML, y, W, subKpiH, COLORS.border, 0.2);

    renderText(
        doc,
        `Mes ${opts.month} / Año ${opts.year} — Todos(as)`,
        ML + 4, y + 4.5,
        9, true, COLORS.ink, "left",
    );
    renderText(
        doc,
        `${rows.length} empleado${rows.length !== 1 ? "s" : ""} · PNR (Persona Natural Residente) · Concepto 001: Sueldos y salarios`,
        ML + 4, y + 9,
        7.5, false, COLORS.muted, "left",
    );

    y += subKpiH + 5;

    // ── Pre-cómputo de columnas con x ────────────────────────────────────────
    const colsWithX: (ColumnSpec & { x: number })[] = [];
    {
        let cursor = ML;
        for (const c of COLUMNS) {
            colsWithX.push({ ...c, x: cursor });
            cursor += c.width;
        }
    }

    function drawTH(yy: number): number {
        drawHeaderRow(
            doc, yy, 6,
            colsWithX.map((c) => ({ x: c.x, w: c.width, text: c.title, align: c.align })),
        );
        return yy + 6;
    }

    y = drawTH(y);

    // ── Valores constantes por fila ──────────────────────────────────────────
    const lastDay = lastDayOfMonth(opts.year, opts.month);
    const dd      = pad2(lastDay.getDate());
    const mm      = pad2(opts.month);
    const yyyy    = String(opts.year);
    const yy      = yyyy.slice(-2);
    const fecha     = `${dd}/${mm}/${yy}`;
    const fechaDoc  = `${dd}/${mm}/${yyyy}`;
    const numDoc    = `${dd}${mm}${yyyy}`;   // DDMMYYYY
    const numCtrl   = numDoc;

    // ── Filas ────────────────────────────────────────────────────────────────
    const ROW_H = 5.6;
    let totalFactura  = 0;
    let totalBase     = 0;
    let totalRetenido = 0;

    rows.forEach((row, i) => {
        if (y + ROW_H > pageBounds(doc).contentBot) {
            doc.addPage();
            drawHeader(doc, headerOpts);
            y = drawTH(PAGE.contentTop as number);
        }

        totalFactura  += row.baseImponible;
        totalBase     += row.baseImponible;
        totalRetenido += row.retencion;

        drawRow(
            doc, y, ROW_H,
            colsWithX.map((c) => {
                let text: string;
                switch (c.key) {
                    case "tipo":          text = "PNR"; break;
                    case "codigo":        text = "SUELDO"; break;
                    case "rif":           text = formatRifReporte(row.cedula); break;
                    case "proveedor":     text = row.nombre.toUpperCase(); break;
                    case "fecha":         text = fecha; break;
                    case "fechaDoc":      text = fechaDoc; break;
                    case "numDoc":        text = numDoc; break;
                    case "numControl":    text = numCtrl; break;
                    case "totalFactura":  text = formatN(row.baseImponible); break;
                    case "totalBase":     text = formatN(row.baseImponible); break;
                    case "totalRetenido": text = formatN(row.retencion); break;
                }
                return {
                    x:     c.x,
                    w:     c.width,
                    text,
                    align: c.align,
                    mono:  c.mono,
                    bold:  c.bold,
                    size:  c.bold ? 8.5 : 8,
                    color: c.bold ? COLORS.ink : COLORS.inkMed,
                };
            }),
            { zebra: i % 2 === 1 },
        );
        y += ROW_H;
    });

    // ── Fila de totales (regla naranja superior + banda gris) ────────────────
    if (y + 10 > pageBounds(doc).contentBot) {
        doc.addPage();
        drawHeader(doc, headerOpts);
        y = drawTH(PAGE.contentTop as number);
    }

    fill(doc, ML, y, W, 0.5, COLORS.orange);
    y += 1.2;

    // Las primeras 8 columnas se fusionan en "TOTAL"; las últimas 3 muestran sumas.
    const labelW = colsWithX.slice(0, 8).reduce((a, c) => a + c.width, 0);
    fill(doc, ML, y, W, 8, COLORS.bandHead);
    rect(doc, ML, y, W, 8, COLORS.border, 0.2);

    renderLabel(doc, "Total", ML + labelW - 3, y + 5.6, "right", COLORS.inkMed, 8);

    const sumsByKey: Record<string, number> = {
        totalFactura,
        totalBase,
        totalRetenido,
    };
    colsWithX.slice(8).forEach((c) => {
        const value = sumsByKey[c.key];
        renderMono(
            doc,
            formatN(value ?? 0),
            c.x + c.width - 1, y + 5.6,
            c.bold ? 9 : 8.5,
            true,
            COLORS.ink,
            "right",
        );
    });

    drawFooter(doc, kontaLogo);

    const filename = `retenciones-islr-${safeFilename(opts.companyName)}-${opts.year}-${pad2(opts.month)}.pdf`;
    doc.save(filename);
}
