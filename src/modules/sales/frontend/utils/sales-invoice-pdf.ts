// =============================================================================
// PDF generator — Factura de Venta legal (Providencia 0071/2011)
//
// Emite la factura que el SPE entrega al cliente. Cumple los campos exigidos
// por la Providencia SNAT/2011/00071 sobre emisión de facturas:
//   * Razón social + RIF + dirección del emisor
//   * Razón social + RIF + dirección del receptor
//   * N° de factura (correlativo persistente, no se reinicia)
//   * N° de control (asignado por imprenta autorizada o forma libre)
//   * Fecha de emisión
//   * Descripción de bienes/servicios + cantidad + precio unitario + total
//   * Base imponible + alícuota IVA + monto IVA
//   * Total general
//   * Condiciones de pago + fecha de vencimiento si crédito
//
// Si la operación está sujeta a IGTF percepción (PA SNAT/2022/000013),
// muestra alícuota IGTF + monto IGTF discriminado y suma al total a cobrar.
//
// Layout: A4 portrait, header/footer Konta. PDF jsPDF puro.
// =============================================================================

import jsPDF from "jspdf";
import {
    PAGE,
    COLORS,
    fill,
    hline,
    rect,
    renderText,
    renderMono,
    renderLabel,
    formatN,
    fmtDateEs,
    loadKontaLogo,
    safeFilename,
    pageBounds,
} from "@/src/shared/frontend/utils/pdf-chrome";
import { IGTF_CONCEPT_LABELS, type IgtfConcept } from "@/src/modules/sales/backend/domain/sales-invoice";

const PORTRAIT = { width: 210, height: 297 } as const;

export interface SalesInvoicePdfData {
    issuer: { name: string; rif: string; address?: string; phone?: string };
    customer: { name: string; rif: string; address?: string };
    invoice: {
        number:        string;
        controlNumber: string;
        date:          string;          // YYYY-MM-DD
        dueDate?:      string | null;
        paymentTerms?: string;
        notes?:        string;
    };
    items: Array<{
        description:   string;
        quantity:      number;
        unitPrice:     number;
        totalLine:     number;
        vatRate:       'exenta' | 'reducida_8' | 'general_16';
    }>;
    totals: {
        subtotal:        number;       // base imponible (incluye exento + gravado)
        baseExempt:      number;
        baseTaxed8:      number;
        baseTaxed16:     number;
        iva8:            number;
        iva16:           number;
        ivaTotal:        number;
        total:           number;       // base + IVA + IGTF
    };
    igtf?: {
        concept:     IgtfConcept;
        percentage:  number;
        foreignBase: number;
        localBase:   number;
        amount:      number;
    } | null;
}

export async function generateSalesInvoicePdf(data: SalesInvoicePdfData): Promise<void> {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const xL = PAGE.marginX;
    const xR = PORTRAIT.width - PAGE.marginX;
    const contentW = PORTRAIT.width - 2 * PAGE.marginX;

    // ── Header ───────────────────────────────────────────────────────────────
    renderText(doc, data.issuer.name, xL, 13, 12, true, COLORS.ink, "left", PORTRAIT.width / 2 - 20);
    renderMono(doc, `RIF ${data.issuer.rif}`, xL, 18.5, 8.5, false, COLORS.muted, "left");
    if (data.issuer.address) {
        renderText(doc, data.issuer.address, xL, 22.5, 7.5, false, COLORS.muted, "left", PORTRAIT.width / 2 - 20);
    }
    if (data.issuer.phone) {
        renderMono(doc, data.issuer.phone, xL, 26, 7.5, false, COLORS.muted, "left");
    }

    renderText(doc, "FACTURA", xR, 13, 13, true, COLORS.ink, "right");
    renderMono(doc, `Nº ${data.invoice.number}`, xR, 19, 11, true, COLORS.orange, "right");
    if (data.invoice.controlNumber) {
        renderLabel(doc, `N° Control ${data.invoice.controlNumber}`, xR, 23.5, "right", COLORS.muted, 7);
    }
    renderLabel(doc, fmtDateEs(data.invoice.date), xR, 27, "right", COLORS.inkMed, 8);

    fill(doc, xR - 36, 14.5, 36, 0.5, COLORS.orange);
    hline(doc, xL, 30, contentW, COLORS.border, 0.2);
    let y = 36;

    // ── Cliente ──────────────────────────────────────────────────────────────
    fill(doc, xL, y, contentW, 4.5, COLORS.bandHead);
    fill(doc, xL, y, 1, 4.5, COLORS.orange);
    renderLabel(doc, "Cliente", xL + 3, y + 3.2, "left", COLORS.ink, 7);
    y += 6;
    rect(doc, xL, y, contentW, data.customer.address ? 22 : 14, COLORS.border, 0.2);
    renderLabel(doc, "Razón Social", xL + 2, y + 3,   "left", COLORS.muted, 6.5);
    renderText(doc, data.customer.name, xL + 2, y + 9, 9, true, COLORS.ink, "left", contentW / 2 - 4);
    renderLabel(doc, "RIF", xL + contentW / 2 + 2, y + 3, "left", COLORS.muted, 6.5);
    renderMono(doc, data.customer.rif, xL + contentW / 2 + 2, y + 9, 9, true, COLORS.ink, "left");
    if (data.customer.address) {
        renderLabel(doc, "Dirección", xL + 2, y + 13, "left", COLORS.muted, 6.5);
        renderText(doc, data.customer.address, xL + 2, y + 19, 8.5, false, COLORS.ink, "left", contentW - 4);
        y += 26;
    } else {
        y += 18;
    }

    // ── Items ────────────────────────────────────────────────────────────────
    fill(doc, xL, y, contentW, 4.5, COLORS.bandHead);
    fill(doc, xL, y, 1, 4.5, COLORS.orange);
    renderLabel(doc, "Detalle", xL + 3, y + 3.2, "left", COLORS.ink, 7);
    y += 6;

    // Items table header
    const colDesc = xL + 2;
    const colQty  = xL + 110;
    const colPrice= xL + 135;
    const colVat  = xL + 165;
    const colTot  = xR - 2;
    fill(doc, xL, y, contentW, 5, COLORS.bandHead);
    renderLabel(doc, "Descripción",     colDesc,  y + 3.5, "left",  COLORS.inkMed, 7);
    renderLabel(doc, "Cant.",            colQty,   y + 3.5, "right", COLORS.inkMed, 7);
    renderLabel(doc, "Precio Unit.",     colPrice, y + 3.5, "right", COLORS.inkMed, 7);
    renderLabel(doc, "IVA",              colVat,   y + 3.5, "center", COLORS.inkMed, 7);
    renderLabel(doc, "Total",            colTot,   y + 3.5, "right", COLORS.inkMed, 7);
    hline(doc, xL, y + 5, contentW, COLORS.borderStr, 0.3);
    y += 5;

    const VAT_LABEL: Record<string, string> = {
        'exenta':     'EXE',
        'reducida_8': '8%',
        'general_16': '16%',
    };

    for (const item of data.items) {
        if (y + 6 > 240) { // page break safeguard
            doc.addPage();
            y = 20;
        }
        const lines = doc.splitTextToSize(item.description, 105) as string[];
        const rowH  = Math.max(6, lines.length * 4 + 1);
        renderText(doc, lines.join('\n'), colDesc, y + 4, 8.5, false, COLORS.ink, "left");
        renderMono(doc, formatN(item.quantity), colQty,   y + 4, 8.5, false, COLORS.inkMed, "right");
        renderMono(doc, formatN(item.unitPrice), colPrice, y + 4, 8.5, false, COLORS.inkMed, "right");
        renderMono(doc, VAT_LABEL[item.vatRate] ?? '—', colVat, y + 4, 8.5, false, COLORS.inkMed, "center");
        renderMono(doc, formatN(item.totalLine), colTot, y + 4, 9, true, COLORS.ink, "right");
        hline(doc, xL, y + rowH, contentW, COLORS.border, 0.15);
        y += rowH;
    }
    y += 4;

    // ── Totales ──────────────────────────────────────────────────────────────
    const totalsX = xL + contentW * 0.55;
    const totalsW = xR - totalsX;
    const trow = (label: string, value: string, opts?: { highlight?: boolean; bold?: boolean }) => {
        const h = opts?.highlight ? 8 : 6;
        if (opts?.highlight) fill(doc, totalsX, y, totalsW, h, COLORS.amberLight);
        const labelColor = opts?.highlight ? COLORS.amber : COLORS.ink;
        const valueColor = opts?.highlight ? COLORS.amber : COLORS.ink;
        renderText(doc, label,  totalsX + 2, y + h - 1.7, opts?.highlight ? 9 : 8.5, opts?.bold ?? !!opts?.highlight, labelColor, "left");
        renderMono(doc, value,  totalsX + totalsW - 2, y + h - 1.7, opts?.highlight ? 9.5 : 9, true, valueColor, "right");
        hline(doc, totalsX, y + h, totalsW, COLORS.border, 0.15);
        y += h;
    };

    if (data.totals.baseExempt > 0)  trow("Base exenta",        "Bs. " + formatN(data.totals.baseExempt));
    if (data.totals.baseTaxed8 > 0)  trow("Base 8%",            "Bs. " + formatN(data.totals.baseTaxed8));
    if (data.totals.iva8 > 0)        trow("IVA 8%",             "Bs. " + formatN(data.totals.iva8));
    if (data.totals.baseTaxed16 > 0) trow("Base 16%",           "Bs. " + formatN(data.totals.baseTaxed16));
    if (data.totals.iva16 > 0)       trow("IVA 16%",            "Bs. " + formatN(data.totals.iva16));

    if (data.igtf) {
        trow(
            `IGTF ${formatN(data.igtf.percentage, 2)}% (${IGTF_CONCEPT_LABELS[data.igtf.concept]})`,
            "Bs. " + formatN(data.igtf.amount),
        );
        renderText(
            doc,
            `Base USD ${formatN(data.igtf.foreignBase)} · Base Bs. ${formatN(data.igtf.localBase)}`,
            totalsX + 2, y + 3, 7, false, COLORS.muted, "left",
        );
        y += 5;
    }

    trow("TOTAL A PAGAR", "Bs. " + formatN(data.totals.total), { highlight: true, bold: true });
    y += 4;

    // ── Condiciones / notas ──────────────────────────────────────────────────
    if (data.invoice.paymentTerms || data.invoice.dueDate) {
        renderLabel(doc, "Condiciones de pago", xL, y + 3, "left", COLORS.muted, 6.5);
        const parts = [
            data.invoice.paymentTerms ?? '',
            data.invoice.dueDate ? `Vence ${fmtDateEs(data.invoice.dueDate)}` : '',
        ].filter(Boolean).join(' · ');
        renderText(doc, parts, xL, y + 9, 8.5, false, COLORS.ink, "left", contentW);
        y += 14;
    }

    if (data.invoice.notes) {
        renderLabel(doc, "Notas", xL, y + 3, "left", COLORS.muted, 6.5);
        const lines = doc.splitTextToSize(data.invoice.notes, contentW) as string[];
        let ny = y + 8;
        for (const ln of lines) {
            renderText(doc, ln, xL, ny, 7.5, false, COLORS.muted, "left", contentW);
            ny += 3.4;
        }
        y = ny + 4;
    }

    // ── Pie legal + firma ────────────────────────────────────────────────────
    const legal = "Factura emitida conforme a la Providencia Administrativa SNAT/2011/00071 sobre emisión de facturas y otros documentos. " +
        (data.igtf ? "El IGTF discriminado se entera al SENIAT mediante la Forma 99021 (PA SNAT/2022/000013, alícuota 3% sobre divisas/cripto)." : "");
    const lines = doc.splitTextToSize(legal, contentW) as string[];
    let ly = y + 4;
    for (const ln of lines) {
        renderText(doc, ln, xL, ly, 7, false, COLORS.muted, "left", contentW);
        ly += 3.2;
    }

    const sigW = 70;
    const sigX = xR - sigW;
    const sigY = Math.max(ly + 14, 250);
    hline(doc, sigX, sigY, sigW, COLORS.muted, 0.3);
    renderLabel(doc, "Firma autorizada", sigX + sigW / 2, sigY + 4, "center", COLORS.muted, 7);

    // Footer
    const logo = await loadKontaLogo();
    drawFooterPortrait(doc, logo);

    const customerTag = safeFilename(data.customer.name) || "cliente";
    doc.save(`factura-venta_${data.invoice.number}_${customerTag}.pdf`);
}

function drawFooterPortrait(doc: jsPDF, logoBase64: string | null): void {
    const total = doc.getNumberOfPages();
    const { width: pw, height: ph } = pageBounds(doc);
    for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        const yTop = ph - PAGE.footerHeight;
        const xL = PAGE.marginX;
        const xR = pw - PAGE.marginX;
        fill(doc, xL, yTop + 1, 8, 0.4, COLORS.orange);
        hline(doc, xL + 9, yTop + 1.2, pw - 2 * PAGE.marginX - 9, COLORS.border, 0.2);
        if (logoBase64) {
            try { doc.addImage(logoBase64, "PNG", xL, yTop + 4, 6, 6, undefined, "FAST"); } catch { /* ignore */ }
        }
        renderLabel(doc, "Made by · Hecho por · Kontave.", pw / 2, yTop + 8, "center", COLORS.muted, 7);
        renderMono(doc, `PÁG. ${i} / ${total}`, xR, yTop + 8, 7.5, true, COLORS.inkMed, "right");
    }
}
