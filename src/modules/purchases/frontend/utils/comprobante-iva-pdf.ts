// =============================================================================
// PDF generator — Comprobante de Retención de IVA
//
// Genera el comprobante que el agente de retención (contribuyente especial)
// debe entregar al proveedor por cada factura con retención IVA practicada.
//
// Base legal: Providencia Administrativa SNAT/2025/000054 (G.O. 43.171,
// 16/07/2025), Art. 16. Vigente desde 01/08/2025. Plazo de entrega: dentro de
// los primeros 2 días hábiles del período impositivo siguiente.
//
// Campos obligatorios listados en Art. 16:
//   * Numeración consecutiva (AAAAMMSSSSSSSS, asignado por DB)
//   * Nombre / RIF del agente de retención
//   * Datos de imprenta (omitidos — esta es factura digital)
//   * Fecha de emisión y fecha de entrega
//   * Nombre / RIF / dirección del sujeto retenido (proveedor)
//   * N° de factura + N° de control
//   * Monto total, base imponible, IVA causado, monto retenido
//
// Layout: A4 portrait, 1 página por comprobante, header/footer Konta estándar.
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
    fmtPeriodMonth,
    loadKontaLogo,
    safeFilename,
    pageBounds,
} from "@/src/shared/frontend/utils/pdf-chrome";

// ── Inputs ────────────────────────────────────────────────────────────────────

export interface ComprobanteIvaPdfData {
    /** Datos del agente retenedor (la empresa). */
    agent: {
        name:     string;
        rif:      string;
        address?: string;
    };
    /** Datos del sujeto retenido (el proveedor). */
    supplier: {
        name:     string;
        rif:      string;
        address?: string;
    };
    /** Datos de la operación retenida. */
    operation: {
        invoiceNumber: string;
        controlNumber: string;
        invoiceDate:   string;        // YYYY-MM-DD
        period:        string;        // YYYY-MM
    };
    /** Montos del comprobante (todos en Bs). */
    amounts: {
        invoiceTotal:    number;      // total facturado bruto (pre-retención)
        taxableBase:     number;      // base imponible total
        exemptBase:      number;      // base exenta (puede ser 0)
        ivaRate:         number;      // alícuota predominante (8/16)
        ivaCaused:       number;      // IVA causado
        retentionPct:    number;      // 75 o 100
        retentionAmount: number;      // monto retenido
    };
    /** N° de comprobante AAAAMMSSSSSSSS (asignado por DB al confirmar). */
    voucherNumber: string;
    /** Fecha de emisión del comprobante (YYYY-MM-DD). Default: hoy. */
    issueDate?: string;
}

// ── Layout ────────────────────────────────────────────────────────────────────

const PORTRAIT = { width: 210, height: 297 } as const;

/** Y inicial donde puedes empezar a dibujar contenido tras el header portrait. */
function drawPortraitHeader(
    doc: jsPDF,
    opts: { agentName: string; agentRif: string; voucherNumber: string },
): number {
    const xL = PAGE.marginX;
    const xR = PORTRAIT.width - PAGE.marginX;

    renderText(doc, opts.agentName, xL, 13, 12, true, COLORS.ink, "left", PORTRAIT.width / 2 - 20);
    renderMono(doc, `RIF ${opts.agentRif}`, xL, 18.5, 8.5, false, COLORS.muted, "left");

    renderText(doc, "COMPROBANTE DE RETENCIÓN DE IVA", xR, 13, 11, true, COLORS.ink, "right");
    renderMono(doc, `N° ${opts.voucherNumber}`, xR, 19, 11, true, COLORS.orange, "right");
    renderLabel(doc, "Providencia SNAT/2025/000054", xR, 23.5, "right", COLORS.muted, 6.5);

    fill(doc, xR - 36, 14.5, 36, 0.5, COLORS.orange);
    hline(doc, xL, 26, PORTRAIT.width - 2 * PAGE.marginX, COLORS.border, 0.2);

    return 32;
}

/** Recuadro etiqueta + valor (label arriba, valor abajo). */
function drawField(
    doc: jsPDF,
    x: number, y: number, w: number,
    label: string, value: string,
    opts?: { mono?: boolean; bold?: boolean; size?: number; color?: typeof COLORS.ink },
): number {
    renderLabel(doc, label, x, y + 3, "left", COLORS.muted, 6.5);
    const size  = opts?.size ?? 9;
    const color = opts?.color ?? COLORS.ink;
    const bold  = opts?.bold ?? true;
    if (opts?.mono) {
        renderMono(doc, value, x, y + 9, size, bold, color, "left");
    } else {
        renderText(doc, value, x, y + 9, size, bold, color, "left", w);
    }
    return y + 12;
}

/** Sección con título tipo banda. */
function drawSectionTitle(doc: jsPDF, x: number, y: number, w: number, text: string): number {
    fill(doc, x, y, w, 4.5, COLORS.bandHead);
    fill(doc, x, y, 1, 4.5, COLORS.orange);
    renderLabel(doc, text, x + 3, y + 3.2, "left", COLORS.ink, 7);
    return y + 6;
}

/** Fila de la tabla de detalle (label izquierda, monto derecha). */
function drawAmountRow(
    doc: jsPDF,
    x: number, y: number, w: number,
    label: string, valueText: string,
    opts?: { highlight?: boolean; height?: number },
): number {
    const h = opts?.height ?? 6;
    if (opts?.highlight) {
        fill(doc, x, y, w, h, COLORS.amberLight);
    }
    const labelColor = opts?.highlight ? COLORS.amber : COLORS.ink;
    const valueColor = opts?.highlight ? COLORS.amber : COLORS.ink;
    const baseline = y + h - 1.7;
    renderText(doc, label, x + 3, baseline, opts?.highlight ? 9 : 8.5, opts?.highlight ?? false, labelColor, "left");
    renderMono(doc, valueText, x + w - 3, baseline, opts?.highlight ? 9.5 : 9, true, valueColor, "right");
    hline(doc, x, y + h, w, COLORS.border, 0.15);
    return y + h;
}

// ── Public entry ──────────────────────────────────────────────────────────────

export async function generateComprobanteIvaPdf(data: ComprobanteIvaPdfData): Promise<void> {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const xL = PAGE.marginX;
    const contentW = PORTRAIT.width - 2 * PAGE.marginX;

    // Header
    let y = drawPortraitHeader(doc, {
        agentName:     data.agent.name,
        agentRif:      data.agent.rif,
        voucherNumber: data.voucherNumber,
    });

    // Issue/delivery info — derecha bajo el header
    const issueIso = data.issueDate ?? new Date().toISOString().split("T")[0];
    const colW = contentW / 2 - 2;

    // ── Fechas ────────────────────────────────────────────────────────────────
    y = drawSectionTitle(doc, xL, y, contentW, "Fechas e Identificación");
    rect(doc, xL, y, contentW, 24, COLORS.border, 0.2);
    drawField(doc, xL + 2,        y, colW, "Fecha de Emisión",   fmtDateEs(issueIso),                  { mono: true });
    drawField(doc, xL + colW + 4, y, colW, "Período Impositivo", fmtPeriodMonth(data.operation.period), { mono: true });
    drawField(doc, xL + 2,        y + 12, colW, "Fecha de la Operación", fmtDateEs(data.operation.invoiceDate), { mono: true });
    drawField(doc, xL + colW + 4, y + 12, colW, "Vigencia desde", "01/08/2025 (Prov. 000054)",          { size: 8 });
    y += 28;

    // ── Agente de Retención ──────────────────────────────────────────────────
    y = drawSectionTitle(doc, xL, y, contentW, "Agente de Retención");
    rect(doc, xL, y, contentW, data.agent.address ? 24 : 14, COLORS.border, 0.2);
    drawField(doc, xL + 2,        y, colW, "Razón Social", data.agent.name);
    drawField(doc, xL + colW + 4, y, colW, "RIF",          data.agent.rif, { mono: true });
    if (data.agent.address) {
        drawField(doc, xL + 2, y + 12, contentW - 4, "Dirección Fiscal", data.agent.address, { bold: false, size: 8.5 });
        y += 28;
    } else {
        y += 18;
    }

    // ── Sujeto Retenido (Proveedor) ──────────────────────────────────────────
    y = drawSectionTitle(doc, xL, y, contentW, "Sujeto Retenido (Proveedor)");
    rect(doc, xL, y, contentW, data.supplier.address ? 24 : 14, COLORS.border, 0.2);
    drawField(doc, xL + 2,        y, colW, "Razón Social", data.supplier.name);
    drawField(doc, xL + colW + 4, y, colW, "RIF",          data.supplier.rif, { mono: true });
    if (data.supplier.address) {
        drawField(doc, xL + 2, y + 12, contentW - 4, "Dirección", data.supplier.address, { bold: false, size: 8.5 });
        y += 28;
    } else {
        y += 18;
    }

    // ── Documento Retenido ───────────────────────────────────────────────────
    y = drawSectionTitle(doc, xL, y, contentW, "Documento Objeto de la Retención");
    rect(doc, xL, y, contentW, 14, COLORS.border, 0.2);
    drawField(doc, xL + 2,                          y, colW * 2 / 3,  "Nº de Factura",  data.operation.invoiceNumber || "—",        { mono: true });
    drawField(doc, xL + (colW * 2 / 3) + 4,         y, colW * 2 / 3,  "Nº de Control",  data.operation.controlNumber || "—",        { mono: true });
    drawField(doc, xL + (colW * 4 / 3) + 8,         y, colW * 2 / 3,  "Tipo Documento", "01 - Factura",                              { size: 8 });
    y += 18;

    // ── Detalle de Montos ────────────────────────────────────────────────────
    y = drawSectionTitle(doc, xL, y, contentW, "Detalle de Montos");
    const tableX = xL;
    const tableW = contentW;

    // Header de la tabla
    fill(doc, tableX, y, tableW, 5, COLORS.bandHead);
    renderLabel(doc, "Concepto", tableX + 3,            y + 3.5, "left",  COLORS.inkMed, 7);
    renderLabel(doc, "Bolívares", tableX + tableW - 3,  y + 3.5, "right", COLORS.inkMed, 7);
    hline(doc, tableX, y + 5, tableW, COLORS.borderStr, 0.3);
    y += 5;

    y = drawAmountRow(doc, tableX, y, tableW, "Total Documento (bruto)",            "Bs. " + formatN(data.amounts.invoiceTotal));
    y = drawAmountRow(doc, tableX, y, tableW, "Base Imponible Gravada",             "Bs. " + formatN(data.amounts.taxableBase));
    if (data.amounts.exemptBase > 0) {
        y = drawAmountRow(doc, tableX, y, tableW, "Monto Exento de IVA",            "Bs. " + formatN(data.amounts.exemptBase));
    }
    y = drawAmountRow(doc, tableX, y, tableW, `Alícuota IVA aplicada`,              `${formatN(data.amounts.ivaRate, 2)}%`);
    y = drawAmountRow(doc, tableX, y, tableW, "IVA Causado",                        "Bs. " + formatN(data.amounts.ivaCaused));
    y = drawAmountRow(doc, tableX, y, tableW, "Porcentaje de Retención",            `${data.amounts.retentionPct}%`);
    y = drawAmountRow(doc, tableX, y, tableW, "MONTO RETENIDO (a enterar a SENIAT)", "Bs. " + formatN(data.amounts.retentionAmount), { highlight: true, height: 8 });

    y += 6;

    // ── Pie legal + firma ────────────────────────────────────────────────────
    const legal = "El presente comprobante se emite conforme al Art. 16 de la Providencia Administrativa SNAT/2025/000054 publicada en G.O. Nº 43.171 del 16/07/2025. Vigente desde el 01/08/2025. El monto retenido será enterado al Fisco Nacional dentro de los plazos del calendario de Sujetos Pasivos Especiales (Forma 99035).";
    const lines = doc.splitTextToSize(legal, contentW) as string[];
    let lineY = y;
    for (const ln of lines) {
        renderText(doc, ln, xL, lineY, 7.5, false, COLORS.muted, "left", contentW);
        lineY += 3.4;
    }
    y = lineY + 4;

    // Firma del agente — bloque a la derecha
    const sigW = 70;
    const sigX = PORTRAIT.width - PAGE.marginX - sigW;
    const sigY = Math.max(y + 14, 240);
    hline(doc, sigX, sigY, sigW, COLORS.muted, 0.3);
    renderLabel(doc, "Firma y sello del Agente de Retención", sigX + sigW / 2, sigY + 4, "center", COLORS.muted, 7);

    // Footer estándar Konta
    const logo = await loadKontaLogo();
    drawFooterPortrait(doc, logo);

    // Nombre del archivo: comprobante-iva_{periodoYYYYMM}_{N°}_{proveedor}.pdf
    const periodTag   = data.operation.period.replace("-", "");
    const supplierTag = safeFilename(data.supplier.name) || "proveedor";
    const filename    = `comprobante-iva_${periodTag}_${data.voucherNumber}_${supplierTag}.pdf`;
    doc.save(filename);
}

// ── Footer portrait (versión local — pdf-chrome.drawFooter usa pageBounds) ───
// Reutilizamos drawFooter de pdf-chrome — funciona para cualquier orientación
// porque lee width/height del propio doc.
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
            try { doc.addImage(logoBase64, "PNG", xL, yTop + 4, 6, 6, undefined, "FAST"); }
            catch { /* fallthrough */ }
        }

        renderLabel(doc, "Made by · Hecho por · Kontave.", pw / 2, yTop + 8, "center", COLORS.muted, 7);
        renderMono(doc, `PÁG. ${i} / ${total}`, xR, yTop + 8, 7.5, true, COLORS.inkMed, "right");
    }
}
