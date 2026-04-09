import jsPDF from "jspdf";
import { loadImageAsBase64 } from "./pdf-image-helper";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SocialBenefitsPdfData {
    companyName:            string;
    employee:               { name: string; idNumber: string; role?: string };
    hireDate:               string;
    cutoffDate:             string;
    yearsOfService:         number;
    completeMonths:         number;
    totalDays:              number;
    salaryVES:              number;
    dailySalary:            number;
    profitSharingQuota:     number;
    vacationBonusQuota:     number;
    integratedDailySalary:  number;
    quarterlyDays:          number;
    extraDays:              number;
    totalSeniorityDays:     number;
    accumulatedBalance:     number;
    seniorityIndemnityGuarantee: number;
    finalAmount:            number;
    isGuaranteeApplied:     boolean;
    socialBenefitsAdvance:  number;
    accumulatedInterests:   number;
    immediatePayment:       number;
    balanceInFavor:         number;
    advancePercentage?:     number;
    interestRate?:          number;
    logoUrl?:               string;
    showLogoInPdf?:         boolean;
}

// ── Palette (Clean Monochrome) ────────────────────────────────────────────────
type RGB = [number, number, number];
const COLORS = {
    ink:       [32,  32,  40]  as RGB,
    inkMed:    [70,  70,  80]  as RGB,
    muted:     [140, 140, 150] as RGB,
    border:    [230, 230, 235] as RGB,
    borderStr: [190, 190, 200] as RGB,
    bg:        [255, 255, 255] as RGB,
    rowAlt:    [248, 248, 252] as RGB,
    white:     [255, 255, 255] as RGB,
    primary:   [217, 58,  16]  as RGB,
    amber:     [220, 38,  38]  as RGB,
    green:     [22,  101, 52]  as RGB,
};

// ── Primitives ────────────────────────────────────────────────────────────────
type Doc = jsPDF;

const fill = (doc: Doc, x: number, y: number, w: number, h: number, c: RGB) => {
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(x, y, w, h, "F");
};

const hline = (doc: Doc, x: number, y: number, w: number, c: RGB = COLORS.border, lw = 0.25) => {
    doc.setLineDashPattern([], 0);
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(lw);
    doc.line(x, y, x + w, y);
};

const renderText = (doc: Doc, text: string, x: number, y: number, size: number, bold: boolean, color: RGB, align: "left" | "center" | "right" = "left", maxW?: number, font: "helvetica" | "courier" = "helvetica") => {
    doc.setFont(font, bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const opts: Record<string, unknown> = { align };
    if (maxW) opts.maxWidth = maxW;
    doc.text(text, x, y, opts);
};

const renderLabel = (doc: Doc, text: string, x: number, y: number, align: "left" | "right" | "center" = "left", color: RGB = COLORS.muted) =>
    renderText(doc, text.toUpperCase(), x, y, 6, true, color, align, undefined, "helvetica");

const renderMono = (doc: Doc, text: string, x: number, y: number, size: number, bold: boolean, c: RGB, align: "left" | "right" | "center" = "left") => 
    renderText(doc, text, x, y, size, bold, c, align, undefined, "courier");

// ── Formatters ────────────────────────────────────────────────────────────────
const formatVES = (n: number) => "Bs. " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (iso: string) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`.toUpperCase();
};

function drawFooter(doc: Doc, PW: number, PH: number, companyName: string, sub: string) {
    fill(doc, 0, PH - 14, PW, 14, COLORS.white);
    hline(doc, 0, PH - 14, PW, COLORS.border, 0.4);
    renderLabel(doc, `${companyName.toUpperCase()}  |  ${sub}  |  DOCUMENTO CONFIDENCIAL`, PW / 2, PH - 7, "center", COLORS.muted);
}

function drawSignatures(doc: Doc, ML: number, W: number, y: number): number {
    const SIG_W = (W - 16) / 2;
    const SIG_H = 24;
    ["EMPLEADOR", "TRABAJADOR"].forEach((role, i) => {
        const sx = ML + i * (SIG_W + 16);
        doc.setDrawColor(COLORS.borderStr[0], COLORS.borderStr[1], COLORS.borderStr[2]);
        doc.setLineWidth(0.4);
        doc.setLineDashPattern([2, 1.5], 0);
        doc.rect(sx, y, SIG_W, SIG_H, "S");
        doc.setLineDashPattern([], 0); // reset
        
        hline(doc, sx + 8, y + SIG_H - 8, SIG_W - 16, COLORS.borderStr, 0.4);
        renderLabel(doc, role, sx + SIG_W / 2, y + SIG_H - 4.5, "center", COLORS.muted);
    });
    return y + SIG_H + 8;
}

function renderDetailRow(
    doc: Doc, ML: number, MR: number, W: number, y: number,
    label: string, sub: string, value: string, color: RGB, alt: boolean, formula?: string
): number {
    const H = 10;
    if (alt) fill(doc, ML, y, W, H, COLORS.rowAlt);
    hline(doc, ML, y + H, W, COLORS.border, 0.25);
    
    renderText(doc, label, ML + 4,  y + 4.5, 7, true, COLORS.ink);
    if (sub) renderText(doc, sub, ML + 4,  y + 8.5, 5, false, COLORS.muted, "left", W * 0.5);
    
    if (formula) {
        renderMono(doc, formula, ML + W * 0.5, y + 6.5, 6, false, COLORS.muted, "left");
    }
    
    renderMono(doc, value, MR - 4, y + 6.5, 8, true, color, "right");
    return y + H;
}

// ── Exported PDF Generators ───────────────────────────────────────────────────

export async function generateSocialBenefitsPdf(data: SocialBenefitsPdfData): Promise<void> {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 16, MR = PW - 16, W = MR - ML;

    let logoBase64 = null;
    if (data.showLogoInPdf && data.logoUrl) {
        logoBase64 = await loadImageAsBase64(data.logoUrl).catch(() => null);
    }

    fill(doc, 0, 0, PW, PH, COLORS.bg);

    // ── Header ────────────────────────────────────────────────────────────
    const topY = 20;
    if (logoBase64) {
        try { doc.addImage(logoBase64, "JPEG", ML, topY - 5, 28, 11); } catch { /* */ }
        renderText(doc, data.companyName.toUpperCase(), ML + 32, topY, 13, true, COLORS.ink);
    } else {
        renderText(doc, data.companyName.toUpperCase(), ML, topY, 13, true, COLORS.ink);
    }

    renderText(doc, "PRESTACIONES SOCIALES", MR, topY - 1, 9, true, COLORS.ink, "right");
    renderText(doc, "ART. 142 LOTTT — GARANTÍA Y ACUMULADOS", MR, topY + 3, 6, false, COLORS.muted, "right");

    renderLabel(doc, "FECHA CORTE", MR, topY + 11, "right");
    renderMono(doc, formatDate(data.cutoffDate), MR, topY + 15, 9, true, COLORS.inkMed, "right");
    
    renderLabel(doc, `EMITIDO: ${new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}`, MR, topY + 20, "right");

    let y = topY + 26;
    hline(doc, ML, y, W, COLORS.border, 0.4);
    y += 8;

    // ── Employee data ──────────────────────────────────────────────
    const c1x = ML;
    const c2x = ML + W * 0.40;
    const c3x = ML + W * 0.70;

    renderLabel(doc, "Trabajador", c1x, y);
    renderText(doc, data.employee.name.toUpperCase(), c1x, y + 5, 9, true, COLORS.ink, "left", c2x - c1x - 4);
    if (data.employee.role) renderText(doc, data.employee.role.toUpperCase(), c1x, y + 9, 6.5, false, COLORS.muted);
    renderMono(doc, "CI " + data.employee.idNumber, c1x, y + 13.5, 7.5, true, COLORS.inkMed, "left");

    renderLabel(doc, "Antigüedad", c2x, y);
    const antStr = `${data.yearsOfService}a ${data.completeMonths % 12}m`;
    renderMono(doc, antStr, c2x, y + 5, 8.5, true, COLORS.ink, "left");
    renderMono(doc, `Ingreso: ${formatDate(data.hireDate)}`, c2x, y + 9.5, 6.5, false, COLORS.inkMed, "left");

    renderLabel(doc, "Sal. Integral / Día", c3x, y);
    renderMono(doc, formatVES(data.integratedDailySalary), c3x, y + 5, 8.5, true, COLORS.ink, "left");
    renderMono(doc, `Base: ${formatVES(data.dailySalary)}`, c3x, y + 9.5, 6.5, false, COLORS.muted, "left");

    y += 18;
    hline(doc, ML, y, W, COLORS.border, 0.4);
    y += 6;

    // ── Salary Components ─────────────────────────────────────────────────
    renderLabel(doc, "COMPONENTE SALARIAL", ML, y + 2, "left");
    y += 5;
    hline(doc, ML, y, W, COLORS.borderStr, 0.8);
    y = renderDetailRow(doc, ML, MR, W, y, "Salario normal / día", "", formatVES(data.dailySalary), COLORS.inkMed, false, "Salario mensual ÷ 30");
    y = renderDetailRow(doc, ML, MR, W, y, "Alícuota de utilidades", "", formatVES(data.profitSharingQuota), COLORS.inkMed, true, "Sal. Diario × días_util / 360");
    y = renderDetailRow(doc, ML, MR, W, y, "Alícuota bono vacacional", "", formatVES(data.vacationBonusQuota), COLORS.inkMed, false, "Sal. Diario × días_bono / 360");
    
    fill(doc, ML, y, W, 8, COLORS.rowAlt);
    renderText(doc, "SALARIO INTEGRAL DIARIO (Art. 122)", ML + 4, y + 5.5, 7, true, COLORS.ink);
    renderMono(doc, formatVES(data.integratedDailySalary), MR - 4, y + 5.5, 9, true, COLORS.ink, "right");
    y += 8;
    hline(doc, ML, y, W, COLORS.borderStr, 0.8);
    y += 8;

    // ── Accumulated Days ──────────────────────────────────────────────────
    renderLabel(doc, "PRESTACIONES ACUMULADAS", ML, y + 2, "left");
    y += 5;
    hline(doc, ML, y, W, COLORS.borderStr, 0.8);
    y = renderDetailRow(doc, ML, MR, W, y, "Días trimestrales", "5 días/mes × meses completos", `${data.quarterlyDays} días`, COLORS.ink, false);
    y = renderDetailRow(doc, ML, MR, W, y, "Días adicionales", "Art. 142.b (desde año 2)", `${data.extraDays} días`, COLORS.ink, true);
    
    fill(doc, ML, y, W, 12, COLORS.white);
    renderText(doc, `SALDO ACUMULADO`, ML + 4, y + 5.5, 7, true, COLORS.ink);
    renderText(doc, `${data.totalSeniorityDays} días × ${formatVES(data.integratedDailySalary)}`, ML + 4, y + 9.5, 6, false, COLORS.muted);
    renderMono(doc, formatVES(data.accumulatedBalance), MR - 4, y + 7.5, 10, true, COLORS.inkMed, "right");
    y += 12;
    hline(doc, ML, y, W, COLORS.border, 0.25);
    fill(doc, ML, y, W, 12, COLORS.white);
    renderText(doc, `GARANTÍA ART. 142.C`, ML + 4, y + 5.5, 7, true, COLORS.ink);
    renderText(doc, `30 días × Sal. Integral × ${data.yearsOfService} año(s)`, ML + 4, y + 9.5, 6, false, COLORS.muted);
    renderMono(doc, formatVES(data.seniorityIndemnityGuarantee), MR - 4, y + 7.5, 10, true, COLORS.inkMed, "right");
    y += 12;

    // Final social benefits amount
    fill(doc, ML, y, W, 12, COLORS.rowAlt);
    renderText(doc, "MONTO TOTAL PRESTACIONES", ML + 4, y + 7.5, 8, true, COLORS.ink);
    renderMono(doc, formatVES(data.finalAmount), MR - 4, y + 8, 12, true, COLORS.ink, "right");
    y += 12;
    hline(doc, ML, y, W, COLORS.borderStr, 0.8);
    y += 8;

    // ── Payment Details (Advances) ────────────────────────────────────────
    if (data.socialBenefitsAdvance > 0 || data.accumulatedInterests > 0) {
        const pct = data.advancePercentage ?? 75;
        renderLabel(doc, "PAGO INMEDIATO", ML, y + 2, "left");
        y += 5;
        hline(doc, ML, y, W, COLORS.borderStr, 0.8);
        
        let localAlt = false;
        if (data.socialBenefitsAdvance > 0) {
            y = renderDetailRow(doc, ML, MR, W, y, `Anticipo de Prestaciones (${pct}%)`, "Art. 144 LOTTT", formatVES(data.socialBenefitsAdvance), COLORS.amber, localAlt);
            localAlt = !localAlt;
        }
        if (data.accumulatedInterests > 0) {
            y = renderDetailRow(doc, ML, MR, W, y, "Intereses de Fideicomiso", "Art. 143 LOTTT", formatVES(data.accumulatedInterests), COLORS.ink, localAlt);
        }

        fill(doc, ML, y, W, 12, COLORS.white);
        renderText(doc, "Monto total acumulado (Garantía o Saldo)", ML + 4, y + 5.5, 7, false, COLORS.inkMed);
        renderMono(doc, formatVES(data.finalAmount), MR - 4, y + 5.5, 9, false, COLORS.inkMed, "right");
        renderText(doc, "TOTAL ANTICIPOS ENTREGADOS", ML + 4, y + 9.5, 7, true, COLORS.inkMed);
        renderMono(doc, `- ${formatVES(data.immediatePayment)}`, MR - 4, y + 9.5, 9, false, COLORS.inkMed, "right");
        y += 12;

        fill(doc, ML, y, W, 12, COLORS.rowAlt);
        renderText(doc, "SALDO A FAVOR (PRESTACIONES NETAS)", ML + 4, y + 7.5, 8, true, COLORS.ink);
        renderMono(doc, formatVES(data.balanceInFavor), MR - 4, y + 8, 12, true, COLORS.ink, "right");
        y += 12;
        hline(doc, ML, y, W, COLORS.borderStr, 0.8);
        y += 8;
    }

    // ── Legal & Signatures ──────────────────────────────────────────────
    if (y > PH - 45) {
        doc.addPage();
        y = 30;
    } else {
        y += 4;
    }

    const legal = "La presente constancia certifica el saldo de prestaciones sociales de conformidad con el Art. 142 de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). El monto corresponde al mayor valor entre el saldo acumulado (Art. 142.a y 142.b) y la garantía de 30 días de salario integral por año de servicio (Art. 142.c).";
    renderText(doc, legal, ML, y, 6, false, COLORS.muted, "left", W);
    
    y += 16;
    y = drawSignatures(doc, ML, W, y);

    drawFooter(doc, PW, PH, data.companyName, `PRESTACIONES SOCIALES AL ${formatDate(data.cutoffDate)}`);
    doc.save(`prestaciones_${data.employee.idNumber}_${data.cutoffDate.replaceAll("-", "")}.pdf`);
}

export async function generateInterestsAndAdvancePdf(data: SocialBenefitsPdfData): Promise<void> {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 16, MR = PW - 16, W = MR - ML;

    const logoBase64 = (data.showLogoInPdf && data.logoUrl)
        ? await loadImageAsBase64(data.logoUrl).catch(() => null)
        : null;

    fill(doc, 0, 0, PW, PH, COLORS.bg);

    // ── Header ────────────────────────────────────────────────────────────
    const topY = 20;
    if (logoBase64) {
        try { doc.addImage(logoBase64, "JPEG", ML, topY - 5, 28, 11); } catch { /* */ }
        renderText(doc, data.companyName.toUpperCase(), ML + 32, topY, 13, true, COLORS.ink);
    } else {
        renderText(doc, data.companyName.toUpperCase(), ML, topY, 13, true, COLORS.ink);
    }

    renderText(doc, "INTERESES Y ANTICIPO", MR, topY - 1, 9, true, COLORS.ink, "right");
    renderText(doc, "ART. 143/144 LOTTT", MR, topY + 3, 6, false, COLORS.muted, "right");

    renderLabel(doc, "FECHA CORTE", MR, topY + 11, "right");
    renderMono(doc, formatDate(data.cutoffDate), MR, topY + 15, 9, true, COLORS.inkMed, "right");
    
    renderLabel(doc, `EMITIDO: ${new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}`, MR, topY + 20, "right");

    let y = topY + 26;
    hline(doc, ML, y, W, COLORS.border, 0.4);
    y += 8;

    // ── Employee data ──────────────────────────────────────────────
    const c1x = ML;
    const c2x = ML + W * 0.40;
    const c3x = ML + W * 0.70;

    renderLabel(doc, "Trabajador", c1x, y);
    renderText(doc, data.employee.name.toUpperCase(), c1x, y + 5, 9, true, COLORS.ink, "left", c2x - c1x - 4);
    if (data.employee.role) renderText(doc, data.employee.role.toUpperCase(), c1x, y + 9, 6.5, false, COLORS.muted);
    renderMono(doc, "CI " + data.employee.idNumber, c1x, y + 13.5, 7.5, true, COLORS.inkMed, "left");

    renderLabel(doc, "Antigüedad", c2x, y);
    const antStr = `${data.yearsOfService}a ${data.completeMonths % 12}m`;
    renderMono(doc, antStr, c2x, y + 5, 8.5, true, COLORS.ink, "left");
    renderMono(doc, `Ingreso: ${formatDate(data.hireDate)}`, c2x, y + 9.5, 6.5, false, COLORS.inkMed, "left");

    renderLabel(doc, "Base de Cálculo", c3x, y);
    renderMono(doc, "Saldo Acumulado", c3x, y + 5, 7, false, COLORS.muted, "left");
    renderMono(doc, formatVES(data.accumulatedBalance), c3x, y + 9.5, 8.5, true, COLORS.inkMed, "left");

    y += 18;
    hline(doc, ML, y, W, COLORS.border, 0.4);
    y += 6;

    // ── Advance & Interests Details ───────────────────────────────────────
    const pct = data.advancePercentage ?? 75;
    const rate = data.interestRate ?? 0;
    renderLabel(doc, "PAGO INMEDIATO", ML, y + 2, "left");
    y += 5;
    hline(doc, ML, y, W, COLORS.borderStr, 0.8);

    y = renderDetailRow(doc, ML, MR, W, y, `Anticipo de Prestaciones (${pct}%)`, `Art. 144 — ${pct}% del saldo acumulado`, formatVES(data.socialBenefitsAdvance), COLORS.amber, false);
    y = renderDetailRow(doc, ML, MR, W, y, "Intereses sobre Prestaciones", `Art. 143 — Tasa aplicada ${rate}%`, formatVES(data.accumulatedInterests), COLORS.green, true);
    
    fill(doc, ML, y, W, 12, COLORS.rowAlt);
    renderText(doc, "TOTAL ANTICIPOS E INTERESES", ML + 4, y + 7.5, 8, true, COLORS.ink);
    renderMono(doc, formatVES(data.immediatePayment), MR - 4, y + 8, 12, true, COLORS.ink, "right");
    y += 12;
    hline(doc, ML, y, W, COLORS.borderStr, 0.8);
    y += 8;

    // Account Summary
    renderLabel(doc, "RESUMEN DE CUENTA DE GARANTÍA", ML, y + 2, "left");
    y += 5;
    hline(doc, ML, y, W, COLORS.borderStr, 0.8);
    y = renderDetailRow(doc, ML, MR, W, y, "Monto Prestaciones Acumuladas", data.isGuaranteeApplied ? "Se aplicó Garantía Art. 142.c" : "Por días acumulados", formatVES(data.finalAmount), COLORS.inkMed, false);
    y = renderDetailRow(doc, ML, MR, W, y, "Total Deducción (Pago actual)", "Anticipos + Intereses ya entregados", `- ${formatVES(data.immediatePayment)}`, COLORS.inkMed, true);

    fill(doc, ML, y, W, 12, COLORS.rowAlt);
    renderText(doc, "SALDO PENDIENTE A FAVOR DEL TRABAJADOR", ML + 4, y + 7.5, 8, true, COLORS.ink);
    renderMono(doc, formatVES(data.balanceInFavor), MR - 4, y + 8, 12, true, COLORS.green, "right");
    y += 12;
    hline(doc, ML, y, W, COLORS.borderStr, 0.8);
    y += 8;

    // ── Signatures ──────────────────────────────────────────────
    if (y > PH - 45) {
        doc.addPage();
        y = 30;
    } else {
        y += 4;
    }

    const legal = `Los intereses son calculados conforme al Art. 143 LOTTT. El monto anticipado ha sido depositado y deducido proporcionalmente conforme al Art. 144 LOTTT.`;
    renderText(doc, legal, ML, y, 6, false, COLORS.muted, "left", W);
    
    y += 12;
    y = drawSignatures(doc, ML, W, y);

    drawFooter(doc, PW, PH, data.companyName, `INTERESES Y ANTICIPO AL ${formatDate(data.cutoffDate)}`);
    doc.save(`intereses_anticipo_${data.employee.idNumber}_${data.cutoffDate.replaceAll("-", "")}.pdf`);
}
