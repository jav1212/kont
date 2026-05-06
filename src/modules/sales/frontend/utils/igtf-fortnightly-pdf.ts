// =============================================================================
// PDF generator — Reporte IGTF Quincenal (Forma 99021)
//
// Resumen del IGTF percibido en una quincena, agrupado por concepto. El
// contador usa este PDF como referencia para llenar el portal SENIAT
// (Forma 99021) — la declaración quincenal es 100% web manual, no hay
// TXT/XML público.
//
// Base legal: PA SNAT/2022/000013 (G.O. 42.339, 17/03/2022) + Reforma IGTF
// G.O. Extraordinaria 6.687 (25/02/2022).
// =============================================================================

import type jsPDF from "jspdf";
import {
    PAGE,
    COLORS,
    fill,
    hline,
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
    IGTF_CONCEPTS,
    IGTF_CONCEPT_LABELS,
    type IgtfConcept,
} from "@/src/modules/sales/backend/domain/sales-invoice";
import type { IgtfFortnightlyReport } from "@/src/modules/sales/backend/domain/igtf-fortnightly-report";

const PORTRAIT = { width: 210, height: 297 } as const;

export async function generateIgtfFortnightlyPdf(
    data: IgtfFortnightlyReport,
    company: { name: string; rif: string; address?: string },
): Promise<void> {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const xL = PAGE.marginX;
    const xR = PORTRAIT.width - PAGE.marginX;
    const contentW = PORTRAIT.width - 2 * PAGE.marginX;

    // ── Header ───────────────────────────────────────────────────────────────
    renderText(doc, company.name, xL, 13, 12, true, COLORS.ink, "left", PORTRAIT.width / 2 - 20);
    renderMono(doc, `RIF ${data.agentRif}`, xL, 18.5, 8.5, false, COLORS.muted, "left");

    renderText(doc, "REPORTE IGTF QUINCENAL", xR, 13, 11, true, COLORS.ink, "right");
    renderMono(doc, `Forma 99021`, xR, 19, 10, true, COLORS.orange, "right");
    renderLabel(doc, "PA SNAT/2022/000013", xR, 23.5, "right", COLORS.muted, 6.5);

    fill(doc, xR - 36, 14.5, 36, 0.5, COLORS.orange);
    hline(doc, xL, 30, contentW, COLORS.border, 0.2);
    let y = 36;

    // ── Período ──────────────────────────────────────────────────────────────
    fill(doc, xL, y, contentW, 4.5, COLORS.bandHead);
    fill(doc, xL, y, 1, 4.5, COLORS.orange);
    renderLabel(doc, "Período de Imposición", xL + 3, y + 3.2, "left", COLORS.ink, 7);
    y += 6;
    const colW = contentW / 3;
    renderLabel(doc, "Mes", xL + 2, y + 3, "left", COLORS.muted, 6.5);
    renderText(doc, fmtPeriodMonth(data.period), xL + 2, y + 9, 9, true, COLORS.ink, "left");
    renderLabel(doc, "Quincena", xL + colW + 2, y + 3, "left", COLORS.muted, 6.5);
    renderText(doc, data.quincena === 1 ? "1ª Quincena (días 1-15)" : "2ª Quincena (días 16-fin)", xL + colW + 2, y + 9, 9, true, COLORS.ink, "left");
    renderLabel(doc, "Rango", xL + 2 * colW + 2, y + 3, "left", COLORS.muted, 6.5);
    renderMono(doc, `${fmtDateEs(data.dateStart)} → ${fmtDateEs(data.dateEnd)}`, xL + 2 * colW + 2, y + 9, 8, false, COLORS.ink, "left");
    y += 16;

    // ── Detalle por concepto ─────────────────────────────────────────────────
    fill(doc, xL, y, contentW, 4.5, COLORS.bandHead);
    fill(doc, xL, y, 1, 4.5, COLORS.orange);
    renderLabel(doc, "Detalle por Concepto", xL + 3, y + 3.2, "left", COLORS.ink, 7);
    y += 6;

    // Table header
    const cConcepto = xL + 2;
    const cCount   = xL + 90;
    const cBase    = xL + 120;
    const cIgtf    = xR - 2;
    fill(doc, xL, y, contentW, 5, COLORS.bandHead);
    renderLabel(doc, "Concepto",         cConcepto, y + 3.5, "left",  COLORS.inkMed, 7);
    renderLabel(doc, "Operaciones",      cCount,    y + 3.5, "right", COLORS.inkMed, 7);
    renderLabel(doc, "Base Imp. Bs.",    cBase,     y + 3.5, "right", COLORS.inkMed, 7);
    renderLabel(doc, "IGTF Bs.",         cIgtf,     y + 3.5, "right", COLORS.inkMed, 7);
    hline(doc, xL, y + 5, contentW, COLORS.borderStr, 0.3);
    y += 5;

    // Render every concept (even with 0 ops) for the auditor to see
    let totalCount = 0;
    let totalBase  = 0;
    let totalIgtf  = 0;

    for (const concepto of IGTF_CONCEPTS) {
        const stat = data.byConcept[concepto as IgtfConcept];
        const count = stat?.operationCount ?? 0;
        const base  = stat?.baseAmountBs ?? 0;
        const igtf  = stat?.igtfAmountBs ?? 0;
        const empty = count === 0;
        const color = empty ? COLORS.muted : COLORS.ink;
        renderText(doc, IGTF_CONCEPT_LABELS[concepto], cConcepto, y + 4, 8.5, !empty, color, "left");
        renderMono(doc, count.toLocaleString("es-VE"), cCount, y + 4, 8.5, !empty, color, "right");
        renderMono(doc, formatN(base), cBase, y + 4, 8.5, !empty, color, "right");
        renderMono(doc, formatN(igtf), cIgtf, y + 4, 9, !empty, color, "right");
        hline(doc, xL, y + 6, contentW, COLORS.border, 0.15);
        y += 6;
        totalCount += count;
        totalBase  += base;
        totalIgtf  += igtf;
    }

    // Totals row
    y += 1;
    fill(doc, xL, y, contentW, 1, COLORS.orange);
    y += 2;
    fill(doc, xL, y, contentW, 8, COLORS.amberLight);
    renderText(doc, "TOTAL A ENTERAR", cConcepto, y + 6, 9.5, true, COLORS.amber, "left");
    renderMono(doc, totalCount.toLocaleString("es-VE"), cCount, y + 6, 9.5, true, COLORS.amber, "right");
    renderMono(doc, formatN(totalBase),                  cBase,  y + 6, 9.5, true, COLORS.amber, "right");
    renderMono(doc, "Bs. " + formatN(data.totalIgtfBs),  cIgtf,  y + 6, 10,  true, COLORS.amber, "right");
    y += 12;

    // ── Pie legal ────────────────────────────────────────────────────────────
    const legal = "Este reporte agrega el IGTF percibido por el agente designado bajo la PA SNAT/2022/000013 sobre los pagos en divisas o criptomonedas recibidos en el período sin mediación financiera. El monto total se entera al SENIAT mediante la Forma 99021 dentro del plazo del calendario quincenal de Sujetos Pasivos Especiales.";
    const lines = doc.splitTextToSize(legal, contentW) as string[];
    let ly = y + 2;
    for (const ln of lines) {
        renderText(doc, ln, xL, ly, 7.5, false, COLORS.muted, "left", contentW);
        ly += 3.3;
    }

    const logo = await loadKontaLogo();
    drawFooterPortrait(doc, logo);

    const periodTag = data.period.replace("-", "");
    const tag = safeFilename(company.name) || "empresa";
    doc.save(`igtf-fortnightlyl_${periodTag}_q${data.quincena}_${tag}.pdf`);
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
