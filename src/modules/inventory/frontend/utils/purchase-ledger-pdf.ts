// PDF generator: Libro de Entradas (purchase / inbound movements ledger).
//
// Renders a landscape A4 PDF listing every "entrada" / "devolucion_salida"
// movement for the selected month, plus a totals row. Shares the Konta header
// + footer/watermark with every other inventory PDF (see shared pdf-chrome.ts).

import jsPDF from "jspdf";
import type { Movement } from "../../backend/domain/movement";
import {
    PAGE,
    COLORS,
    drawHeader,
    drawFooter,
    drawHeaderRow,
    drawRow,
    fill,
    fmtDateEs,
    fmtPeriodMonth,
    formatN,
    formatQty,
    loadKontaLogo,
    safeFilename,
    type KontaPdfHeaderOpts,
    type PdfCell,
} from "@/src/shared/frontend/utils/pdf-chrome";

export interface PurchaseLedgerPdfOpts {
    companyName:       string;
    companyRif?:       string;
    period:            string;                 // YYYY-MM
    productNameById:   Map<string, string>;
}

const TYPE_LABEL: Record<string, string> = {
    entrada:           "Entrada",
    devolucion_salida: "Dev. cliente",
};

const COLS = (() => {
    const xL = PAGE.marginX;
    const fecha = 20;
    const tipo  = 26;
    const ref   = 55;
    const num   = 22;
    const totalNum = 4 * num;
    const producto = PAGE.width - 2 * PAGE.marginX - fecha - tipo - ref - totalNum;
    let x = xL;
    const fechaX = x; x += fecha;
    const tipoX  = x; x += tipo;
    const prodX  = x; x += producto;
    const refX   = x; x += ref;
    const qtyX   = x; x += num;
    const cuX    = x; x += num;
    const ctX    = x; x += num;
    const saldoX = x;
    return {
        fecha:    { x: fechaX, w: fecha,    label: "Fecha",       align: "left"  as const },
        tipo:     { x: tipoX,  w: tipo,     label: "Tipo",        align: "left"  as const },
        producto: { x: prodX,  w: producto, label: "Producto",    align: "left"  as const },
        referencia: { x: refX, w: ref,      label: "Referencia",  align: "left"  as const },
        cantidad: { x: qtyX,   w: num,      label: "Cantidad",    align: "right" as const },
        costoUnit:{ x: cuX,    w: num,      label: "Costo unit.", align: "right" as const },
        costoTotal:{x: ctX,    w: num,      label: "Costo total", align: "right" as const },
        saldo:    { x: saldoX, w: num,      label: "Saldo",       align: "right" as const },
    };
})();

const ROW_H = 5.5;
const HEADER_H = 6;

function drawTableHeader(doc: jsPDF, y: number): number {
    drawHeaderRow(doc, y, HEADER_H, [
        { x: COLS.fecha.x,      w: COLS.fecha.w,      text: COLS.fecha.label,      align: COLS.fecha.align },
        { x: COLS.tipo.x,       w: COLS.tipo.w,       text: COLS.tipo.label,       align: COLS.tipo.align },
        { x: COLS.producto.x,   w: COLS.producto.w,   text: COLS.producto.label,   align: COLS.producto.align },
        { x: COLS.referencia.x, w: COLS.referencia.w, text: COLS.referencia.label, align: COLS.referencia.align },
        { x: COLS.cantidad.x,   w: COLS.cantidad.w,   text: COLS.cantidad.label,   align: COLS.cantidad.align },
        { x: COLS.costoUnit.x,  w: COLS.costoUnit.w,  text: COLS.costoUnit.label,  align: COLS.costoUnit.align },
        { x: COLS.costoTotal.x, w: COLS.costoTotal.w, text: COLS.costoTotal.label, align: COLS.costoTotal.align },
        { x: COLS.saldo.x,      w: COLS.saldo.w,      text: COLS.saldo.label,      align: COLS.saldo.align },
    ]);
    return y + HEADER_H;
}

export async function generatePurchaseLedgerPdf(
    rows: Movement[],
    opts: PurchaseLedgerPdfOpts,
): Promise<void> {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    const headerOpts: KontaPdfHeaderOpts = {
        companyName: opts.companyName,
        companyRif:  opts.companyRif,
        reportTitle: "Libro de Entradas",
        periodLabel: fmtPeriodMonth(opts.period),
        legalCaption: "Reporte Art. 177 ISLR",
    };

    drawHeader(doc, headerOpts);
    let y = drawTableHeader(doc, PAGE.contentTop);

    let totalQty = 0;
    let totalCost = 0;
    let zebra = false;

    for (const m of rows) {
        if (y + ROW_H > PAGE.contentBot) {
            doc.addPage();
            drawHeader(doc, headerOpts);
            y = drawTableHeader(doc, PAGE.contentTop);
            zebra = false;
        }

        const productName = opts.productNameById.get(m.productId) ?? m.productId;
        const cells: PdfCell[] = [
            { x: COLS.fecha.x,      w: COLS.fecha.w,      text: fmtDateEs(m.date),                align: "left",  mono: true,  size: 7.5 },
            { x: COLS.tipo.x,       w: COLS.tipo.w,       text: TYPE_LABEL[m.type] ?? m.type,     align: "left",  size: 7.5 },
            { x: COLS.producto.x,   w: COLS.producto.w,   text: productName,                      align: "left",  size: 7.5, color: COLORS.ink, bold: true },
            { x: COLS.referencia.x, w: COLS.referencia.w, text: m.reference || m.notes || "—",    align: "left",  size: 7,   color: COLORS.muted },
            { x: COLS.cantidad.x,   w: COLS.cantidad.w,   text: formatQty(m.quantity),            align: "right", mono: true, size: 8,   bold: true, color: COLORS.ink },
            { x: COLS.costoUnit.x,  w: COLS.costoUnit.w,  text: formatN(m.unitCost),              align: "right", mono: true, size: 7.5, bold: true, color: COLORS.ink },
            { x: COLS.costoTotal.x, w: COLS.costoTotal.w, text: formatN(m.totalCost),             align: "right", mono: true, size: 8,   bold: true, color: COLORS.ink },
            { x: COLS.saldo.x,      w: COLS.saldo.w,      text: formatQty(m.balanceQuantity),     align: "right", mono: true, size: 7.5, bold: true, color: COLORS.ink },
        ];
        drawRow(doc, y, ROW_H, cells, { zebra });
        zebra = !zebra;
        y += ROW_H;

        totalQty  += m.quantity;
        totalCost += m.totalCost;
    }

    // Totals row
    if (y + ROW_H + 2 > PAGE.contentBot) {
        doc.addPage();
        drawHeader(doc, headerOpts);
        y = drawTableHeader(doc, PAGE.contentTop);
    }
    y += 1;
    fill(doc, PAGE.marginX, y, PAGE.width - 2 * PAGE.marginX, 0.4, COLORS.orange);
    y += 1.5;
    drawRow(doc, y, ROW_H + 1, [
        { x: COLS.fecha.x,      w: COLS.fecha.w + COLS.tipo.w + COLS.producto.w + COLS.referencia.w, text: "Total del período", align: "left", size: 8.5, bold: true, color: COLORS.ink },
        { x: COLS.cantidad.x,   w: COLS.cantidad.w,   text: formatQty(totalQty),  align: "right", mono: true, size: 9, bold: true, color: COLORS.ink },
        { x: COLS.costoUnit.x,  w: COLS.costoUnit.w,  text: "",                   align: "right" },
        { x: COLS.costoTotal.x, w: COLS.costoTotal.w, text: formatN(totalCost),   align: "right", mono: true, size: 9, bold: true, color: COLORS.ink },
        { x: COLS.saldo.x,      w: COLS.saldo.w,      text: "",                   align: "right" },
    ]);

    // Stamp footer/watermark on every page
    const logo = await loadKontaLogo();
    drawFooter(doc, logo);

    const company = safeFilename(opts.companyName) || "empresa";
    doc.save(`libro-entradas_${opts.period}_${company}.pdf`);
}
