// PDF generator: Libro de Inventarios (annual product inventory ledger).
//
// Renders one row per product with opening / inbound / outbound / closing
// quantity + value for the selected fiscal year. Ends with a totals row
// (subtotal when filtered, grand total otherwise).

import jsPDF from "jspdf";
import type { InventoryLedgerRow } from "../../backend/domain/inventory-ledger";
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
    loadKontaLogo,
    safeFilename,
    type KontaPdfHeaderOpts,
    type PdfCell,
} from "./pdf-chrome";

export interface InventoryLedgerPdfOpts {
    companyName:    string;
    companyRif?:    string;
    year:           number;
    typeFilterLabel?: string;   // e.g. "Mercancía" — appended to title when filtered
}

const TYPE_LABEL: Record<string, string> = {
    mercancia:          "Mercancía",
    materia_prima:      "M. prima",
    producto_terminado: "Terminado",
};

const COLS = (() => {
    const codigo = 18;
    const tipo   = 22;
    const unidad = 14;
    const num    = 18;     // qty cols
    const value  = 22;     // value cols
    const finalV = 24;
    const totalNumCols = 4 * num + 3 * value + finalV; // 4 qty + 3 value + final value
    const producto = PAGE.width - 2 * PAGE.marginX - codigo - tipo - unidad - totalNumCols;
    let x = PAGE.marginX;
    const codigoX = x; x += codigo;
    const prodX   = x; x += producto;
    const tipoX   = x; x += tipo;
    const unidadX = x; x += unidad;
    const qIniX   = x; x += num;
    const vIniX   = x; x += value;
    const qInX    = x; x += num;
    const vInX    = x; x += value;
    const qOutX   = x; x += num;
    const vOutX   = x; x += value;
    const qFinX   = x; x += num;
    const vFinX   = x; x += finalV;
    return {
        codigo:  { x: codigoX, w: codigo,   label: "Código",      align: "left"  as const },
        producto:{ x: prodX,   w: producto, label: "Producto",    align: "left"  as const },
        tipo:    { x: tipoX,   w: tipo,     label: "Tipo",        align: "left"  as const },
        unidad:  { x: unidadX, w: unidad,   label: "Unidad",      align: "left"  as const },
        qIni:    { x: qIniX,   w: num,      label: "Cant. ini.",  align: "right" as const },
        vIni:    { x: vIniX,   w: value,    label: "Valor ini.",  align: "right" as const },
        qIn:     { x: qInX,    w: num,      label: "Entradas",    align: "right" as const },
        vIn:     { x: vInX,    w: value,    label: "Valor ent.",  align: "right" as const },
        qOut:    { x: qOutX,   w: num,      label: "Salidas",     align: "right" as const },
        vOut:    { x: vOutX,   w: value,    label: "Valor sal.",  align: "right" as const },
        qFin:    { x: qFinX,   w: num,      label: "Cant. fin.",  align: "right" as const },
        vFin:    { x: vFinX,   w: finalV,   label: "Valor final", align: "right" as const },
    };
})();

const ROW_H = 5.2;
const HEADER_H = 6;

function drawTableHeader(doc: jsPDF, y: number): number {
    drawHeaderRow(doc, y, HEADER_H, [
        { x: COLS.codigo.x,   w: COLS.codigo.w,   text: COLS.codigo.label,   align: COLS.codigo.align },
        { x: COLS.producto.x, w: COLS.producto.w, text: COLS.producto.label, align: COLS.producto.align },
        { x: COLS.tipo.x,     w: COLS.tipo.w,     text: COLS.tipo.label,     align: COLS.tipo.align },
        { x: COLS.unidad.x,   w: COLS.unidad.w,   text: COLS.unidad.label,   align: COLS.unidad.align },
        { x: COLS.qIni.x,     w: COLS.qIni.w,     text: COLS.qIni.label,     align: COLS.qIni.align },
        { x: COLS.vIni.x,     w: COLS.vIni.w,     text: COLS.vIni.label,     align: COLS.vIni.align },
        { x: COLS.qIn.x,      w: COLS.qIn.w,      text: COLS.qIn.label,      align: COLS.qIn.align },
        { x: COLS.vIn.x,      w: COLS.vIn.w,      text: COLS.vIn.label,      align: COLS.vIn.align },
        { x: COLS.qOut.x,     w: COLS.qOut.w,     text: COLS.qOut.label,     align: COLS.qOut.align },
        { x: COLS.vOut.x,     w: COLS.vOut.w,     text: COLS.vOut.label,     align: COLS.vOut.align },
        { x: COLS.qFin.x,     w: COLS.qFin.w,     text: COLS.qFin.label,     align: COLS.qFin.align },
        { x: COLS.vFin.x,     w: COLS.vFin.w,     text: COLS.vFin.label,     align: COLS.vFin.align },
    ]);
    return y + HEADER_H;
}

export async function generateInventoryLedgerPdf(
    rows: InventoryLedgerRow[],
    opts: InventoryLedgerPdfOpts,
): Promise<void> {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    const headerOpts: KontaPdfHeaderOpts = {
        companyName: opts.companyName,
        companyRif:  opts.companyRif,
        reportTitle: "Libro de Inventarios",
        periodLabel: `Año ${opts.year}${opts.typeFilterLabel ? ` · ${opts.typeFilterLabel}` : ""}`,
    };

    drawHeader(doc, headerOpts);
    let y = drawTableHeader(doc, PAGE.contentTop);

    let openValue = 0, inValue = 0, outValue = 0, finValue = 0;
    let zebra = false;

    for (const r of rows) {
        if (y + ROW_H > PAGE.contentBot) {
            doc.addPage();
            drawHeader(doc, headerOpts);
            y = drawTableHeader(doc, PAGE.contentTop);
            zebra = false;
        }

        const cells: PdfCell[] = [
            { x: COLS.codigo.x,   w: COLS.codigo.w,   text: r.code,                       align: "left",  mono: true,  size: 7 },
            { x: COLS.producto.x, w: COLS.producto.w, text: r.name,                       align: "left",  size: 7.5, color: COLORS.ink, bold: true },
            { x: COLS.tipo.x,     w: COLS.tipo.w,     text: TYPE_LABEL[r.type] ?? r.type, align: "left",  size: 7,   color: COLORS.muted },
            { x: COLS.unidad.x,   w: COLS.unidad.w,   text: r.measureUnit,                align: "left",  size: 7,   color: COLORS.muted },
            { x: COLS.qIni.x,     w: COLS.qIni.w,     text: formatQty(r.openingQuantity), align: "right", mono: true, size: 7.5 },
            { x: COLS.vIni.x,     w: COLS.vIni.w,     text: formatN(r.openingValue),      align: "right", mono: true, size: 7.5, color: COLORS.muted },
            { x: COLS.qIn.x,      w: COLS.qIn.w,      text: formatQty(r.inboundQuantity), align: "right", mono: true, size: 7.5 },
            { x: COLS.vIn.x,      w: COLS.vIn.w,      text: formatN(r.inboundValue),      align: "right", mono: true, size: 7.5, color: COLORS.muted },
            { x: COLS.qOut.x,     w: COLS.qOut.w,     text: formatQty(r.outboundQuantity),align: "right", mono: true, size: 7.5 },
            { x: COLS.vOut.x,     w: COLS.vOut.w,     text: formatN(r.outboundValue),     align: "right", mono: true, size: 7.5, color: COLORS.muted },
            { x: COLS.qFin.x,     w: COLS.qFin.w,     text: formatQty(r.closingQuantity), align: "right", mono: true, size: 8, bold: true },
            { x: COLS.vFin.x,     w: COLS.vFin.w,     text: formatN(r.closingValue),      align: "right", mono: true, size: 8, bold: true, color: COLORS.ink },
        ];
        drawRow(doc, y, ROW_H, cells, { zebra });
        zebra = !zebra;
        y += ROW_H;

        openValue += r.openingValue;
        inValue   += r.inboundValue;
        outValue  += r.outboundValue;
        finValue  += r.closingValue;
    }

    if (y + ROW_H + 2 > PAGE.contentBot) {
        doc.addPage();
        drawHeader(doc, headerOpts);
        y = drawTableHeader(doc, PAGE.contentTop);
    }
    y += 1;
    fill(doc, PAGE.marginX, y, PAGE.width - 2 * PAGE.marginX, 0.4, COLORS.orange);
    y += 1.5;

    const totalLabel = opts.typeFilterLabel ? `Subtotal · ${opts.typeFilterLabel}` : "Total general";
    drawRow(doc, y, ROW_H + 1, [
        { x: COLS.codigo.x, w: COLS.codigo.w + COLS.producto.w + COLS.tipo.w + COLS.unidad.w + COLS.qIni.w, text: totalLabel, align: "left", size: 8.5, bold: true, color: COLORS.ink },
        { x: COLS.vIni.x, w: COLS.vIni.w, text: formatN(openValue), align: "right", mono: true, size: 8.5, bold: true, color: COLORS.ink },
        { x: COLS.qIn.x,  w: COLS.qIn.w,  text: "",                  align: "right" },
        { x: COLS.vIn.x,  w: COLS.vIn.w,  text: formatN(inValue),    align: "right", mono: true, size: 8.5, bold: true, color: COLORS.ink },
        { x: COLS.qOut.x, w: COLS.qOut.w, text: "",                  align: "right" },
        { x: COLS.vOut.x, w: COLS.vOut.w, text: formatN(outValue),   align: "right", mono: true, size: 8.5, bold: true, color: COLORS.ink },
        { x: COLS.qFin.x, w: COLS.qFin.w, text: "",                  align: "right" },
        { x: COLS.vFin.x, w: COLS.vFin.w, text: formatN(finValue),   align: "right", mono: true, size: 8.5, bold: true, color: COLORS.ink },
    ]);

    const logo = await loadKontaLogo();
    drawFooter(doc, logo);

    const company = safeFilename(opts.companyName) || "empresa";
    doc.save(`libro-inventarios_${opts.year}_${company}.pdf`);
}
