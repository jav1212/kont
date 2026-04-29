// PDF generator: Reporte Art. 177 ISLR.
//
// One section per product: a coloured product header, an opening-balance row,
// each movement, and a product subtotal. Ends with a grand-total row across
// all products in the report.

import jsPDF from "jspdf";
import type { IslrProduct } from "../../backend/domain/islr-report";
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

export interface IslrReportPdfOpts {
    companyName: string;
    companyRif?: string;
    period:      string;     // YYYY-MM
}

const TIPO_LABEL: Record<string, string> = {
    entrada:            "Entrada / Compra",
    salida:             "Salida / Venta",
    ajuste_positivo:    "Ajuste Positivo",
    ajuste_negativo:    "Ajuste Negativo",
    devolucion_entrada: "Dev. / Compra",
    devolucion_salida:  "Dev. / Venta",
    autoconsumo:        "Autoconsumo",
};

const COLS = (() => {
    const fecha = 22;
    const ref   = 36;
    const tipo  = 36;
    const num   = 24;
    // sanity: 22+36+36+(6*24)=22+36+36+144=238 < 277 ✓ (excess reserved at edges)
    let x = PAGE.marginX + 1;
    const fechaX = x; x += fecha;
    const refX   = x; x += ref;
    const tipoX  = x; x += tipo;
    const inQx   = x; x += num;
    const outQx  = x; x += num;
    const balQx  = x; x += num;
    const inCx   = x; x += num;
    const outCx  = x; x += num;
    const balCx  = x; x += num;
    return {
        fecha: { x: fechaX, w: fecha, label: "Fecha",          align: "left"  as const },
        ref:   { x: refX,   w: ref,   label: "Referencia",     align: "left"  as const },
        tipo:  { x: tipoX,  w: tipo,  label: "Tipo movimiento",align: "left"  as const },
        inQ:   { x: inQx,   w: num,   label: "Cant. entrada",  align: "right" as const },
        outQ:  { x: outQx,  w: num,   label: "Cant. salida",   align: "right" as const },
        balQ:  { x: balQx,  w: num,   label: "Saldo cant.",    align: "right" as const },
        inC:   { x: inCx,   w: num,   label: "Costo entrada",  align: "right" as const },
        outC:  { x: outCx,  w: num,   label: "Costo salida",   align: "right" as const },
        balC:  { x: balCx,  w: num,   label: "Saldo costo",    align: "right" as const },
    };
})();

const ROW_H = 5.2;
const HEADER_H = 6;
const PROD_BAND_H = 6.5;

function drawTableHeader(doc: jsPDF, y: number): number {
    drawHeaderRow(doc, y, HEADER_H, [
        { x: COLS.fecha.x, w: COLS.fecha.w, text: COLS.fecha.label, align: COLS.fecha.align },
        { x: COLS.ref.x,   w: COLS.ref.w,   text: COLS.ref.label,   align: COLS.ref.align },
        { x: COLS.tipo.x,  w: COLS.tipo.w,  text: COLS.tipo.label,  align: COLS.tipo.align },
        { x: COLS.inQ.x,   w: COLS.inQ.w,   text: COLS.inQ.label,   align: COLS.inQ.align },
        { x: COLS.outQ.x,  w: COLS.outQ.w,  text: COLS.outQ.label,  align: COLS.outQ.align },
        { x: COLS.balQ.x,  w: COLS.balQ.w,  text: COLS.balQ.label,  align: COLS.balQ.align },
        { x: COLS.inC.x,   w: COLS.inC.w,   text: COLS.inC.label,   align: COLS.inC.align },
        { x: COLS.outC.x,  w: COLS.outC.w,  text: COLS.outC.label,  align: COLS.outC.align },
        { x: COLS.balC.x,  w: COLS.balC.w,  text: COLS.balC.label,  align: COLS.balC.align },
    ]);
    return y + HEADER_H;
}

function drawProductBand(doc: jsPDF, y: number, p: IslrProduct, movCount: number): number {
    fill(doc, PAGE.marginX, y, PAGE.width - 2 * PAGE.marginX, PROD_BAND_H, COLORS.bandHead);
    drawRow(doc, y, PROD_BAND_H, [
        { x: PAGE.marginX + 2, w: 28, text: p.productCode, align: "left", mono: true, size: 8, bold: true, color: COLORS.orange },
        { x: PAGE.marginX + 32, w: PAGE.width - 2 * PAGE.marginX - 80, text: p.productName, align: "left", size: 9, bold: true, color: COLORS.ink },
        { x: PAGE.width - PAGE.marginX - 50, w: 48, text: `${movCount} ${movCount === 1 ? "movimiento" : "movimientos"}`, align: "right", size: 7, color: COLORS.muted },
    ]);
    return y + PROD_BAND_H;
}

export async function generateIslrReportPdf(
    products: IslrProduct[],
    opts: IslrReportPdfOpts,
): Promise<void> {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    const headerOpts: KontaPdfHeaderOpts = {
        companyName: opts.companyName,
        companyRif:  opts.companyRif,
        reportTitle: "Reporte Art. 177 ISLR",
        periodLabel: fmtPeriodMonth(opts.period),
    };

    drawHeader(doc, headerOpts);
    let y: number = PAGE.contentTop;

    let gtInQty = 0, gtOutQty = 0, gtInCost = 0, gtOutCost = 0, gtBalQty = 0, gtBalCost = 0;

    for (const p of products) {
        // Estimate the height needed for this product (band + table header + opening + rows + subtotal)
        const blockNeeded = PROD_BAND_H + HEADER_H + ROW_H * (p.movements.length + 2) + 2;
        if (y + Math.min(blockNeeded, 60) > PAGE.contentBot) {
            doc.addPage();
            drawHeader(doc, headerOpts);
            y = PAGE.contentTop;
        }

        y = drawProductBand(doc, y, p, p.movements.length);
        y = drawTableHeader(doc, y);

        // Opening balance row
        if (y + ROW_H > PAGE.contentBot) {
            doc.addPage();
            drawHeader(doc, headerOpts);
            y = PAGE.contentTop;
            y = drawProductBand(doc, y, p, p.movements.length);
            y = drawTableHeader(doc, y);
        }
        const openCells: PdfCell[] = [
            { x: COLS.fecha.x, w: COLS.fecha.w, text: "—",            align: "left", color: COLORS.muted, size: 7 },
            { x: COLS.ref.x,   w: COLS.ref.w,   text: "Saldo inicial", align: "left", size: 7, bold: true, color: COLORS.inkMed },
            { x: COLS.tipo.x,  w: COLS.tipo.w,  text: "—",            align: "left", color: COLORS.muted, size: 7 },
            { x: COLS.inQ.x,   w: COLS.inQ.w,   text: "—",            align: "right", color: COLORS.muted, size: 7 },
            { x: COLS.outQ.x,  w: COLS.outQ.w,  text: "—",            align: "right", color: COLORS.muted, size: 7 },
            { x: COLS.balQ.x,  w: COLS.balQ.w,  text: formatQty(p.openingQuantity), align: "right", mono: true, size: 7.5, bold: true },
            { x: COLS.inC.x,   w: COLS.inC.w,   text: "—",            align: "right", color: COLORS.muted, size: 7 },
            { x: COLS.outC.x,  w: COLS.outC.w,  text: "—",            align: "right", color: COLORS.muted, size: 7 },
            { x: COLS.balC.x,  w: COLS.balC.w,  text: formatN(p.openingCost), align: "right", mono: true, size: 7.5, bold: true, color: COLORS.ink },
        ];
        drawRow(doc, y, ROW_H, openCells, { zebra: true, band: COLORS.rowAlt });
        y += ROW_H;

        let zebra = false;
        let totalIn = 0, totalOut = 0, totalInCost = 0, totalOutCost = 0;
        for (const m of p.movements) {
            if (y + ROW_H > PAGE.contentBot) {
                doc.addPage();
                drawHeader(doc, headerOpts);
                y = PAGE.contentTop;
                y = drawProductBand(doc, y, p, p.movements.length);
                y = drawTableHeader(doc, y);
                zebra = false;
            }

            const cells: PdfCell[] = [
                { x: COLS.fecha.x, w: COLS.fecha.w, text: fmtDateEs(m.date),                     align: "left",  mono: true, size: 7 },
                { x: COLS.ref.x,   w: COLS.ref.w,   text: m.reference || "—",                     align: "left",  size: 7,   color: COLORS.muted },
                { x: COLS.tipo.x,  w: COLS.tipo.w,  text: TIPO_LABEL[m.type] ?? m.type,           align: "left",  size: 7 },
                { x: COLS.inQ.x,   w: COLS.inQ.w,   text: m.inboundQuantity > 0 ? formatQty(m.inboundQuantity) : "—",  align: "right", mono: true, size: 7.5 },
                { x: COLS.outQ.x,  w: COLS.outQ.w,  text: m.outboundQuantity > 0 ? formatQty(m.outboundQuantity) : "—", align: "right", mono: true, size: 7.5 },
                { x: COLS.balQ.x,  w: COLS.balQ.w,  text: formatQty(m.balanceQuantity),           align: "right", mono: true, size: 7.5, bold: true },
                { x: COLS.inC.x,   w: COLS.inC.w,   text: m.inboundCost > 0 ? formatN(m.inboundCost) : "—",     align: "right", mono: true, size: 7.5 },
                { x: COLS.outC.x,  w: COLS.outC.w,  text: m.outboundCost > 0 ? formatN(m.outboundCost) : "—",   align: "right", mono: true, size: 7.5 },
                { x: COLS.balC.x,  w: COLS.balC.w,  text: formatN(m.balanceCost),                 align: "right", mono: true, size: 7.5, bold: true, color: COLORS.ink },
            ];
            drawRow(doc, y, ROW_H, cells, { zebra });
            zebra = !zebra;
            y += ROW_H;

            totalIn      += m.inboundQuantity;
            totalOut     += m.outboundQuantity;
            totalInCost  += m.inboundCost;
            totalOutCost += m.outboundCost;
        }

        const last = p.movements[p.movements.length - 1];
        const finalQty  = last ? last.balanceQuantity : p.openingQuantity;
        const finalCost = last ? last.balanceCost     : p.openingCost;

        // Product subtotal row
        if (y + ROW_H + 1 > PAGE.contentBot) {
            doc.addPage();
            drawHeader(doc, headerOpts);
            y = PAGE.contentTop;
        }
        const subCells: PdfCell[] = [
            { x: COLS.fecha.x, w: COLS.fecha.w + COLS.ref.w + COLS.tipo.w, text: "Subtotal del producto", align: "left", size: 7.5, bold: true, color: COLORS.ink },
            { x: COLS.inQ.x,   w: COLS.inQ.w,   text: formatQty(totalIn),       align: "right", mono: true, size: 7.5, bold: true },
            { x: COLS.outQ.x,  w: COLS.outQ.w,  text: formatQty(totalOut),      align: "right", mono: true, size: 7.5, bold: true },
            { x: COLS.balQ.x,  w: COLS.balQ.w,  text: formatQty(finalQty),      align: "right", mono: true, size: 7.5, bold: true },
            { x: COLS.inC.x,   w: COLS.inC.w,   text: formatN(totalInCost),     align: "right", mono: true, size: 7.5, bold: true },
            { x: COLS.outC.x,  w: COLS.outC.w,  text: formatN(totalOutCost),    align: "right", mono: true, size: 7.5, bold: true },
            { x: COLS.balC.x,  w: COLS.balC.w,  text: formatN(finalCost),       align: "right", mono: true, size: 8,   bold: true, color: COLORS.orange },
        ];
        drawRow(doc, y, ROW_H + 0.5, subCells, { zebra: true, band: COLORS.bandHead });
        y += ROW_H + 2;

        gtInQty   += totalIn;
        gtOutQty  += totalOut;
        gtInCost  += totalInCost;
        gtOutCost += totalOutCost;
        gtBalQty  += finalQty;
        gtBalCost += finalCost;
    }

    // Grand total
    if (y + ROW_H + 4 > PAGE.contentBot) {
        doc.addPage();
        drawHeader(doc, headerOpts);
        y = PAGE.contentTop;
    }
    fill(doc, PAGE.marginX, y, PAGE.width - 2 * PAGE.marginX, 0.4, COLORS.orange);
    y += 1.5;
    drawRow(doc, y, ROW_H + 1.5, [
        { x: COLS.fecha.x, w: COLS.fecha.w + COLS.ref.w + COLS.tipo.w, text: "TOTAL GENERAL", align: "left", size: 8.5, bold: true, color: COLORS.ink },
        { x: COLS.inQ.x,   w: COLS.inQ.w,   text: formatQty(gtInQty),    align: "right", mono: true, size: 8, bold: true, color: COLORS.ink },
        { x: COLS.outQ.x,  w: COLS.outQ.w,  text: formatQty(gtOutQty),   align: "right", mono: true, size: 8, bold: true, color: COLORS.ink },
        { x: COLS.balQ.x,  w: COLS.balQ.w,  text: formatQty(gtBalQty),   align: "right", mono: true, size: 8, bold: true, color: COLORS.ink },
        { x: COLS.inC.x,   w: COLS.inC.w,   text: formatN(gtInCost),     align: "right", mono: true, size: 8, bold: true, color: COLORS.ink },
        { x: COLS.outC.x,  w: COLS.outC.w,  text: formatN(gtOutCost),    align: "right", mono: true, size: 8, bold: true, color: COLORS.ink },
        { x: COLS.balC.x,  w: COLS.balC.w,  text: formatN(gtBalCost),    align: "right", mono: true, size: 9, bold: true, color: COLORS.orange },
    ]);

    const logo = await loadKontaLogo();
    drawFooter(doc, logo);

    const company = safeFilename(opts.companyName) || "empresa";
    doc.save(`reporte-islr-art177_${opts.period}_${company}.pdf`);
}
