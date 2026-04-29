// PDF generator: Reporte de Período (monthly inventory report grouped by dept).
//
// One row per product, grouped by department with a subtotal band per group.
// Ends with a grand-total row. Eleven numeric columns are included — the
// fiscal-only ones (Salidas S/IVA, Costo Actual) are intentionally omitted to
// keep the page legible; the CSV export keeps the full schema.

import jsPDF from "jspdf";
import type { PeriodReportRow } from "../../backend/domain/period-report";
import {
    PAGE,
    COLORS,
    drawHeader,
    drawFooter,
    drawHeaderRow,
    drawRow,
    fill,
    formatN,
    formatQty,
    fmtPeriodMonth,
    loadKontaLogo,
    pageBounds,
    safeFilename,
    type KontaPdfHeaderOpts,
    type PdfCell,
} from "@/src/shared/frontend/utils/pdf-chrome";

// A3 landscape dimensions (420×297mm). Used because the report has 16
// columns total (5 text + 11 numeric) and would not fit comfortably on A4.
const PAGE_W = 420;

export interface PeriodReportPdfOpts {
    companyName: string;
    companyRif?: string;
    period:      string;     // YYYY-MM
}

interface NumColDef {
    key:   keyof PeriodReportRow;
    label: string;
    qty?:  boolean;          // true → formatQty (allow up to 4 decimals)
    pct?:  boolean;          // true → suffix " %", 2 decimals
}

const NUM_COLS: NumColDef[] = [
    { key: "openingInventory",   label: "Inv. Ini",     qty: true },
    { key: "averageCost",        label: "C. Prom",                 },
    { key: "inbound",            label: "Entradas",     qty: true },
    { key: "outbound",           label: "Salidas",      qty: true },
    { key: "currentStock",       label: "Stock",        qty: true },
    { key: "inboundCostBs",      label: "Ent. Bs",                 },
    { key: "outboundCostBs",     label: "C. Sal. Bs",              },
    { key: "selfConsumptionCost",label: "Autoconsumo",             },
    { key: "vatPercentage",      label: "IVA %",        pct: true },
    { key: "totalVatBs",         label: "IVA Bs",                  },
    { key: "totalWithVatBs",     label: "Tot. c/IVA",              },
];

const COLS = (() => {
    const codigo = 18;
    const dept   = 30;
    const prov   = 32;
    const iva    = 12;
    const numW   = 22;
    const numTotal = NUM_COLS.length * numW;
    const producto = PAGE_W - 2 * PAGE.marginX - codigo - dept - prov - iva - numTotal;
    let x = PAGE.marginX;
    const codX = x; x += codigo;
    const prdX = x; x += producto;
    const depX = x; x += dept;
    const supX = x; x += prov;
    const ivaX = x; x += iva;
    const numXs: number[] = [];
    for (let i = 0; i < NUM_COLS.length; i++) { numXs.push(x); x += numW; }
    return {
        codigo:   { x: codX, w: codigo,   label: "Código",  align: "left"  as const },
        producto: { x: prdX, w: producto, label: "Producto",align: "left"  as const },
        depto:    { x: depX, w: dept,     label: "Depto.",  align: "left"  as const },
        prov:     { x: supX, w: prov,     label: "Proveed.",align: "left"  as const },
        iva:      { x: ivaX, w: iva,      label: "IVA",     align: "left"  as const },
        numXs,
        numW,
    };
})();

const ROW_H = 5;
const HEADER_H = 6;

function drawTableHeader(doc: jsPDF, y: number): number {
    const cells = [
        { x: COLS.codigo.x,   w: COLS.codigo.w,   text: COLS.codigo.label,   align: COLS.codigo.align },
        { x: COLS.producto.x, w: COLS.producto.w, text: COLS.producto.label, align: COLS.producto.align },
        { x: COLS.depto.x,    w: COLS.depto.w,    text: COLS.depto.label,    align: COLS.depto.align },
        { x: COLS.prov.x,     w: COLS.prov.w,     text: COLS.prov.label,     align: COLS.prov.align },
        { x: COLS.iva.x,      w: COLS.iva.w,      text: COLS.iva.label,      align: COLS.iva.align },
        ...NUM_COLS.map((c, i) => ({
            x: COLS.numXs[i]!,
            w: COLS.numW,
            text: c.label,
            align: "right" as const,
        })),
    ];
    drawHeaderRow(doc, y, HEADER_H, cells);
    return y + HEADER_H;
}

function fmtNum(value: number, c: NumColDef): string {
    if (c.pct) return formatN(value) + "%";
    if (c.qty) return formatQty(value);
    return formatN(value);
}

function groupByDept(rows: PeriodReportRow[]): { name: string; rows: PeriodReportRow[] }[] {
    const map = new Map<string, PeriodReportRow[]>();
    for (const r of rows) {
        const key = r.departmentName || "Sin departamento";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(r);
    }
    return Array.from(map.entries()).map(([name, rs]) => ({ name, rows: rs }));
}

function sumCol(rows: PeriodReportRow[], key: keyof PeriodReportRow): number {
    return rows.reduce((acc, r) => acc + Number(r[key]), 0);
}

export async function generatePeriodReportPdf(
    rows: PeriodReportRow[],
    opts: PeriodReportPdfOpts,
): Promise<void> {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    const bounds = pageBounds(doc);

    const headerOpts: KontaPdfHeaderOpts = {
        companyName: opts.companyName,
        companyRif:  opts.companyRif,
        reportTitle: "Reporte de Período",
        periodLabel: fmtPeriodMonth(opts.period),
    };

    drawHeader(doc, headerOpts);
    let y = drawTableHeader(doc, PAGE.contentTop);

    const groups = groupByDept(rows);

    for (const g of groups) {
        // Department band
        if (y + 6 > bounds.contentBot) {
            doc.addPage();
            drawHeader(doc, headerOpts);
            y = drawTableHeader(doc, PAGE.contentTop);
        }
        fill(doc, PAGE.marginX, y, bounds.width - 2 * PAGE.marginX, 4.5, COLORS.bandHead);
        drawRow(doc, y, 4.5, [
            { x: PAGE.marginX + 1, w: bounds.width - 2 * PAGE.marginX - 2, text: g.name.toUpperCase(), align: "left", size: 7.5, bold: true, color: COLORS.ink },
        ]);
        y += 4.5;

        let zebra = false;
        for (const r of g.rows) {
            if (y + ROW_H > bounds.contentBot) {
                doc.addPage();
                drawHeader(doc, headerOpts);
                y = drawTableHeader(doc, PAGE.contentTop);
                zebra = false;
            }

            const cells: PdfCell[] = [
                { x: COLS.codigo.x,   w: COLS.codigo.w,   text: r.code,                                  align: "left", mono: true, size: 6.5 },
                { x: COLS.producto.x, w: COLS.producto.w, text: r.name,                                  align: "left", size: 7,    bold: true, color: COLORS.ink },
                { x: COLS.depto.x,    w: COLS.depto.w,    text: r.departmentName || "—",                 align: "left", size: 6.5,  color: COLORS.muted },
                { x: COLS.prov.x,     w: COLS.prov.w,     text: r.supplierName || "—",                   align: "left", size: 6.5,  color: COLORS.muted },
                { x: COLS.iva.x,      w: COLS.iva.w,      text: r.vatType === "exento" ? "Exento" : "Gen.", align: "left", size: 6.5, color: COLORS.muted },
                ...NUM_COLS.map((c, i) => ({
                    x: COLS.numXs[i]!,
                    w: COLS.numW,
                    text: fmtNum(Number(r[c.key]), c),
                    align: "right" as const,
                    mono: true,
                    size: 6.4,
                })),
            ];
            drawRow(doc, y, ROW_H, cells, { zebra });
            zebra = !zebra;
            y += ROW_H;
        }

        // Subtotal row (skip percentage column — it's not summable)
        if (y + ROW_H + 1 > bounds.contentBot) {
            doc.addPage();
            drawHeader(doc, headerOpts);
            y = drawTableHeader(doc, PAGE.contentTop);
        }
        const subCells: PdfCell[] = [
            { x: COLS.codigo.x, w: COLS.codigo.w + COLS.producto.w + COLS.depto.w + COLS.prov.w + COLS.iva.w, text: `Subtotal · ${g.name}`, align: "left", size: 7, bold: true, color: COLORS.ink },
            ...NUM_COLS.map((c, i) => ({
                x: COLS.numXs[i]!,
                w: COLS.numW,
                text: c.pct ? "" : fmtNum(sumCol(g.rows, c.key), c),
                align: "right" as const,
                mono: true,
                size: 6.4,
                bold: true,
                color: COLORS.ink,
            })),
        ];
        drawRow(doc, y, ROW_H + 0.5, subCells, { zebra: true, band: COLORS.rowAlt });
        y += ROW_H + 1;
    }

    // Grand total
    if (y + ROW_H + 4 > bounds.contentBot) {
        doc.addPage();
        drawHeader(doc, headerOpts);
        y = drawTableHeader(doc, PAGE.contentTop);
    }
    y += 1;
    fill(doc, PAGE.marginX, y, bounds.width - 2 * PAGE.marginX, 0.4, COLORS.orange);
    y += 1.5;
    drawRow(doc, y, ROW_H + 1.5, [
        { x: COLS.codigo.x, w: COLS.codigo.w + COLS.producto.w + COLS.depto.w + COLS.prov.w + COLS.iva.w, text: "Total general", align: "left", size: 8, bold: true, color: COLORS.ink },
        ...NUM_COLS.map((c, i) => ({
            x: COLS.numXs[i]!,
            w: COLS.numW,
            text: c.pct ? "" : fmtNum(sumCol(rows, c.key), c),
            align: "right" as const,
            mono: true,
            size: 6.6,
            bold: true,
            color: COLORS.ink,
        })),
    ]);

    const logo = await loadKontaLogo();
    drawFooter(doc, logo);

    const company = safeFilename(opts.companyName) || "empresa";
    doc.save(`reporte-periodo_${opts.period}_${company}.pdf`);
}
