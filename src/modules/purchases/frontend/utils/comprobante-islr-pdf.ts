// =============================================================================
// PDF generator — Comprobante de Retención de ISLR
//
// Genera el comprobante que el agente de retención debe entregar al sujeto
// retenido (proveedor) por cada retención de ISLR practicada. Lo anexa a su
// declaración definitiva de rentas.
//
// Base legal: Decreto 1808 Art. 24 (G.O. 36.203, 12/05/1997). El catálogo de
// conceptos se resuelve a partir de `IslrConcept` para mostrar la descripción
// legal del concepto retenido (Anexo 6.1, manual SENIAT 60.40.40.039).
//
// Campos requeridos (Art. 24 + práctica venezolana):
//   * Numeración consecutiva del comprobante (AAAASSSSSSSS — 12 chars)
//   * Datos del agente: razón social, RIF, dirección
//   * Datos del sujeto retenido: razón social, RIF, dirección
//   * Fecha de emisión + período fiscal
//   * Por cada operación: fecha, N° factura, N° control, código concepto,
//     descripción, monto pagado, % retención, sustraendo, monto retenido
//   * Total pagado y total retenido
//
// Layout: A4 portrait, 1 página por comprobante, header/footer Konta.
// Reutiliza primitivas comunes de `pdf-chrome.ts`.
// =============================================================================

import type jsPDF from "jspdf";
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
import {
    getIslrConcept,
    TAXPAYER_TYPE_LABELS,
    type IslrConcept,
} from "@/src/modules/purchases/backend/domain/concepto-islr";

// ── Inputs ────────────────────────────────────────────────────────────────────

export interface ComprobanteIslrPdfData {
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
    /** Detalle de la retención (Bs). */
    retention: {
        conceptCode:        string;   // 3 chars Anexo 6.1
        operationAmount:    number;   // monto pagado / base de retención
        percentage:         number;   // alícuota aplicada (%)
        sustraendo:         number;   // 0 si no aplica fórmula PNR
        withheldAmount:     number;   // monto efectivamente retenido
        unidadTributaria?:  number;   // UT usada (sólo informativa)
    };
    /** N° de comprobante AAAASSSSSSSS (12 chars). */
    voucherNumber: string;
    /** Fecha de emisión (YYYY-MM-DD). Default: hoy. */
    issueDate?: string;
}

// ── Layout ────────────────────────────────────────────────────────────────────

const PORTRAIT = { width: 210, height: 297 } as const;

function drawPortraitHeader(
    doc: jsPDF,
    opts: { agentName: string; agentRif: string; voucherNumber: string },
): number {
    const xL = PAGE.marginX;
    const xR = PORTRAIT.width - PAGE.marginX;

    renderText(doc, opts.agentName, xL, 13, 12, true, COLORS.ink, "left", PORTRAIT.width / 2 - 20);
    renderMono(doc, `RIF ${opts.agentRif}`, xL, 18.5, 8.5, false, COLORS.muted, "left");

    renderText(doc, "COMPROBANTE DE RETENCIÓN DE ISLR", xR, 13, 11, true, COLORS.ink, "right");
    renderMono(doc, `N° ${opts.voucherNumber}`, xR, 19, 11, true, COLORS.orange, "right");
    renderLabel(doc, "Decreto 1808 — Art. 24", xR, 23.5, "right", COLORS.muted, 6.5);

    fill(doc, xR - 36, 14.5, 36, 0.5, COLORS.orange);
    hline(doc, xL, 26, PORTRAIT.width - 2 * PAGE.marginX, COLORS.border, 0.2);

    return 32;
}

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

function drawSectionTitle(doc: jsPDF, x: number, y: number, w: number, text: string): number {
    fill(doc, x, y, w, 4.5, COLORS.bandHead);
    fill(doc, x, y, 1, 4.5, COLORS.orange);
    renderLabel(doc, text, x + 3, y + 3.2, "left", COLORS.ink, 7);
    return y + 6;
}

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

export async function generateComprobanteIslrPdf(data: ComprobanteIslrPdfData): Promise<void> {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const xL = PAGE.marginX;
    const contentW = PORTRAIT.width - 2 * PAGE.marginX;

    // Resolver concepto del catálogo (descripción + tipo de contribuyente).
    const concept: IslrConcept | undefined = getIslrConcept(data.retention.conceptCode);

    // Header
    let y = drawPortraitHeader(doc, {
        agentName:     data.agent.name,
        agentRif:      data.agent.rif,
        voucherNumber: data.voucherNumber,
    });

    const issueIso = data.issueDate ?? new Date().toISOString().split("T")[0];
    const colW = contentW / 2 - 2;

    // ── Fechas ────────────────────────────────────────────────────────────────
    y = drawSectionTitle(doc, xL, y, contentW, "Fechas e Identificación");
    rect(doc, xL, y, contentW, 24, COLORS.border, 0.2);
    drawField(doc, xL + 2,        y, colW, "Fecha de Emisión",      fmtDateEs(issueIso),                   { mono: true });
    drawField(doc, xL + colW + 4, y, colW, "Período Impositivo",    fmtPeriodMonth(data.operation.period), { mono: true });
    drawField(doc, xL + 2,        y + 12, colW, "Fecha de la Operación", fmtDateEs(data.operation.invoiceDate), { mono: true });
    drawField(doc, xL + colW + 4, y + 12, colW, "Base Legal", "Decreto 1808 Art. 24", { size: 8 });
    y += 28;

    // ── Agente ────────────────────────────────────────────────────────────────
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

    // ── Sujeto retenido ──────────────────────────────────────────────────────
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

    // ── Documento retenido ───────────────────────────────────────────────────
    y = drawSectionTitle(doc, xL, y, contentW, "Documento Objeto de la Retención");
    rect(doc, xL, y, contentW, 14, COLORS.border, 0.2);
    drawField(doc, xL + 2,                          y, colW * 2 / 3,  "Nº de Factura",  data.operation.invoiceNumber || "—",        { mono: true });
    drawField(doc, xL + (colW * 2 / 3) + 4,         y, colW * 2 / 3,  "Nº de Control",  data.operation.controlNumber || "—",        { mono: true });
    drawField(doc, xL + (colW * 4 / 3) + 8,         y, colW * 2 / 3,  "Tipo Documento", "01 - Factura",                              { size: 8 });
    y += 18;

    // ── Concepto ─────────────────────────────────────────────────────────────
    y = drawSectionTitle(doc, xL, y, contentW, "Concepto del Anexo 6.1");
    rect(doc, xL, y, contentW, 18, COLORS.border, 0.2);
    drawField(doc, xL + 2, y, 30, "Código", data.retention.conceptCode, { mono: true });
    drawField(doc, xL + 34, y, contentW - 36, "Descripción", concept?.description ?? "—", { bold: false, size: 8.5 });
    if (concept) {
        drawField(doc, xL + 2, y + 9, 60, "Categoría", TAXPAYER_TYPE_LABELS[concept.taxpayerType], { bold: false, size: 8 });
        if (concept.appliesSustraendo) {
            drawField(doc, xL + 64, y + 9, 80, "Aplica fórmula", "Sustraendo (Decreto 1808 Art. 9 §2)", { bold: false, size: 8 });
        } else if (concept.minThresholdBs != null) {
            drawField(doc, xL + 64, y + 9, 80, "Mínimo PJD", `Bs. ${formatN(concept.minThresholdBs)}`, { bold: false, size: 8 });
        }
    }
    y += 22;

    // ── Detalle de Montos ────────────────────────────────────────────────────
    y = drawSectionTitle(doc, xL, y, contentW, "Detalle de la Retención");
    const tableX = xL;
    const tableW = contentW;

    fill(doc, tableX, y, tableW, 5, COLORS.bandHead);
    renderLabel(doc, "Concepto", tableX + 3,           y + 3.5, "left",  COLORS.inkMed, 7);
    renderLabel(doc, "Bolívares", tableX + tableW - 3, y + 3.5, "right", COLORS.inkMed, 7);
    hline(doc, tableX, y + 5, tableW, COLORS.borderStr, 0.3);
    y += 5;

    y = drawAmountRow(doc, tableX, y, tableW, "Monto Pagado / Abonado",          "Bs. " + formatN(data.retention.operationAmount));
    y = drawAmountRow(doc, tableX, y, tableW, "Alícuota de Retención",           `${formatN(data.retention.percentage, 2)}%`);
    if (data.retention.sustraendo > 0) {
        const utLabel = data.retention.unidadTributaria
            ? `(UT Bs. ${formatN(data.retention.unidadTributaria)} × % × 83,3334)`
            : "(UT × % × 83,3334)";
        y = drawAmountRow(doc, tableX, y, tableW, `Sustraendo ${utLabel}`,        "Bs. " + formatN(data.retention.sustraendo));
    }
    y = drawAmountRow(doc, tableX, y, tableW, "MONTO RETENIDO (a enterar a SENIAT)", "Bs. " + formatN(data.retention.withheldAmount), { highlight: true, height: 8 });

    y += 6;

    // ── Pie legal + firma ────────────────────────────────────────────────────
    const legal = "El presente comprobante se emite conforme al Art. 24 del Decreto N° 1.808 sobre Retenciones del Impuesto Sobre la Renta (Gaceta Oficial N° 36.203 del 12/05/1997). El sujeto retenido podrá anexarlo a su declaración definitiva de rentas como crédito fiscal del ejercicio. El monto retenido será enterado al Fisco Nacional dentro de los plazos establecidos en el Art. 21 del citado Decreto.";
    const lines = doc.splitTextToSize(legal, contentW) as string[];
    let lineY = y;
    for (const ln of lines) {
        renderText(doc, ln, xL, lineY, 7.5, false, COLORS.muted, "left", contentW);
        lineY += 3.4;
    }
    y = lineY + 4;

    // Firma
    const sigW = 70;
    const sigX = PORTRAIT.width - PAGE.marginX - sigW;
    const sigY = Math.max(y + 14, 240);
    hline(doc, sigX, sigY, sigW, COLORS.muted, 0.3);
    renderLabel(doc, "Firma y sello del Agente de Retención", sigX + sigW / 2, sigY + 4, "center", COLORS.muted, 7);

    // Footer estándar Konta
    const logo = await loadKontaLogo();
    drawFooterPortrait(doc, logo);

    // Filename: comprobante-islr_{AAAAMM}_{N°}_{proveedor}.pdf
    const periodTag   = data.operation.period.replace("-", "");
    const supplierTag = safeFilename(data.supplier.name) || "proveedor";
    const filename    = `comprobante-islr_${periodTag}_${data.voucherNumber}_${supplierTag}.pdf`;
    doc.save(filename);
}

// ── Footer portrait local ────────────────────────────────────────────────────
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
