// PDF generators: Prestaciones Sociales (Art. 142 LOTTT) e Intereses + Anticipo
// (Arts. 143/144). Estilo Konta: header naranja, cuerpo slate + naranja, footer
// Kontave compartido.

import jsPDF from "jspdf";
import { loadImageAsBase64 } from "./pdf-image-helper";
import {
    COLORS,
    drawHeader,
    drawFooter,
    fill,
    hline,
    rect,
    formatVES,
    loadKontaLogo,
    renderText,
    renderMono,
    renderLabel,
    safeFilename,
    fmtDateEs,
} from "@/src/shared/frontend/utils/pdf-chrome";

// ── Public types ──────────────────────────────────────────────────────────────

export interface SocialBenefitsPdfData {
    companyName:                 string;
    companyId?:                  string;
    employee:                    { name: string; idNumber: string; role?: string };
    hireDate:                    string;
    cutoffDate:                  string;
    yearsOfService:              number;
    completeMonths:              number;
    totalDays:                   number;
    salaryVES:                   number;
    dailySalary:                 number;
    profitSharingQuota:          number;
    vacationBonusQuota:          number;
    integratedDailySalary:       number;
    quarterlyDays:               number;
    extraDays:                   number;
    totalSeniorityDays:          number;
    accumulatedBalance:          number;
    seniorityIndemnityGuarantee: number;
    finalAmount:                 number;
    isGuaranteeApplied:          boolean;
    socialBenefitsAdvance:       number;
    accumulatedInterests:        number;
    immediatePayment:            number;
    balanceInFavor:              number;
    advancePercentage?:          number;
    interestRate?:               number;
    logoUrl?:                    string;
    showLogoInPdf?:              boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type Doc = jsPDF;

function drawSignatures(doc: Doc, x: number, w: number, y: number): number {
    const SIG_W = (w - 16) / 2;
    const SIG_H = 24;
    ["Empleador", "Trabajador"].forEach((role, i) => {
        const sx = x + i * (SIG_W + 16);
        rect(doc, sx, y, SIG_W, SIG_H, COLORS.borderStr, 0.3);
        hline(doc, sx + 8, y + SIG_H - 8, SIG_W - 16, COLORS.borderStr, 0.3);
        renderLabel(doc, role, sx + SIG_W / 2, y + SIG_H - 4, "center", COLORS.muted, 7.5);
    });
    return y + SIG_H + 6;
}

function renderDetailRow(
    doc: Doc, x: number, w: number, y: number,
    label: string, sub: string, value: string,
    valueColor = COLORS.ink, alt = false, formula?: string,
): number {
    const H = 10;
    if (alt) fill(doc, x, y, w, H, COLORS.rowAlt);
    hline(doc, x, y + H, w, COLORS.border, 0.2);

    renderText(doc, label, x + 3, y + 4.2, 9, true, COLORS.ink, "left", w * 0.5, "helvetica");
    if (sub) {
        renderText(doc, sub, x + 3, y + 8, 7.5, false, COLORS.muted, "left", w * 0.5, "helvetica");
    }
    if (formula) {
        renderMono(doc, formula, x + w * 0.5, y + 6, 7.8, false, COLORS.muted, "left");
    }
    renderMono(doc, value, x + w - 3, y + 6, 9.5, true, valueColor, "right");
    return y + H;
}

function drawIdentityCard(
    doc: Doc, x: number, w: number, y: number,
    employee: SocialBenefitsPdfData["employee"],
    rightTopLabel: string, rightTopValue: string, rightSub: string,
    midLabel: string, midValue: string, midSub: string,
): number {
    const H = 18;
    fill(doc, x, y, w, H, COLORS.rowAlt);
    fill(doc, x, y, 1.5, H, COLORS.orange);
    rect(doc, x, y, w, H, COLORS.border, 0.2);

    const c1 = x + 4;
    const c2 = x + w * 0.4;
    const c3 = x + w - 3;

    renderLabel(doc, "Trabajador", c1, y + 4, "left", COLORS.muted, 7);
    renderText(doc, employee.name.toUpperCase(), c1, y + 9, 10.5, true, COLORS.ink, "left", c2 - c1 - 4, "helvetica");
    if (employee.role) renderText(doc, employee.role, c1, y + 13.5, 7.8, false, COLORS.muted, "left", c2 - c1 - 4, "helvetica");
    renderMono(doc, "CI " + employee.idNumber, c1, y + 16.5, 7.8, false, COLORS.inkMed, "left");

    renderLabel(doc, midLabel, c2, y + 4, "left", COLORS.muted, 7);
    renderMono(doc, midValue, c2, y + 9, 10, true, COLORS.ink, "left");
    renderMono(doc, midSub,   c2, y + 13.5, 7.8, false, COLORS.muted, "left");

    renderLabel(doc, rightTopLabel, c3, y + 4, "right", COLORS.muted, 7);
    renderMono(doc, rightTopValue, c3, y + 9, 10, true, COLORS.ink, "right");
    renderMono(doc, rightSub,      c3, y + 13.5, 7.8, false, COLORS.muted, "right");

    return y + H + 5;
}

function drawSectionLabel(doc: Doc, x: number, w: number, y: number, label: string): number {
    renderLabel(doc, label, x, y + 3.5, "left", COLORS.inkMed, 8);
    hline(doc, x, y + 5, w, COLORS.border, 0.2);
    return y + 7;
}

// ── Prestaciones Sociales (Art. 142) ──────────────────────────────────────────

export async function generateSocialBenefitsPdf(data: SocialBenefitsPdfData): Promise<void> {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const ML = 12, W = PW - 2 * ML;

    const [companyLogo, kontaLogo] = await Promise.all([
        data.showLogoInPdf && data.logoUrl
            ? loadImageAsBase64(data.logoUrl).catch(() => null)
            : Promise.resolve(null),
        loadKontaLogo(),
    ]);

    drawHeader(doc, {
        companyName: data.companyName,
        companyRif:  data.companyId,
        reportTitle: "Prestaciones Sociales",
        periodLabel: `Corte ${fmtDateEs(data.cutoffDate)}`,
    });

    let y = 32;

    if (companyLogo) {
        try { doc.addImage(companyLogo, "JPEG", ML, y, 18, 7, undefined, "FAST"); y += 9; } catch { /* */ }
    }

    y = drawIdentityCard(doc, ML, W, y, data.employee,
        "Sal. Integral / Día", formatVES(data.integratedDailySalary), `Base ${formatVES(data.dailySalary)}`,
        "Antigüedad", `${data.yearsOfService}a ${data.completeMonths % 12}m`, `Ingreso ${fmtDateEs(data.hireDate)}`,
    );

    // ── Componente salarial ───────────────────────────────────────────────────
    y = drawSectionLabel(doc, ML, W, y, "Componente Salarial (Art. 122)");
    y = renderDetailRow(doc, ML, W, y, "Salario normal / día", "", formatVES(data.dailySalary), COLORS.ink, false, "Mensual ÷ 30");
    y = renderDetailRow(doc, ML, W, y, "Alícuota de utilidades", "", formatVES(data.profitSharingQuota), COLORS.ink, true, "Diario × días_util / 360");
    y = renderDetailRow(doc, ML, W, y, "Alícuota bono vacacional", "", formatVES(data.vacationBonusQuota), COLORS.ink, false, "Diario × días_bono / 360");

    fill(doc, ML, y, W, 0.4, COLORS.orange);
    y += 1;
    fill(doc, ML, y, W, 11, COLORS.bandHead);
    rect(doc, ML, y, W, 11, COLORS.border, 0.2);
    renderLabel(doc, "Salario Integral Diario", ML + 3, y + 7, "left", COLORS.inkMed, 8);
    renderMono(doc, formatVES(data.integratedDailySalary), ML + W - 3, y + 7.2, 11, true, COLORS.ink, "right");
    y += 11 + 6;

    // ── Prestaciones acumuladas ───────────────────────────────────────────────
    y = drawSectionLabel(doc, ML, W, y, "Prestaciones Acumuladas");
    y = renderDetailRow(doc, ML, W, y, "Días trimestrales", "5 días/mes × meses completos", `${data.quarterlyDays} días`, COLORS.ink, false);
    y = renderDetailRow(doc, ML, W, y, "Días adicionales", "Art. 142.b (desde año 2)", `${data.extraDays} días`, COLORS.ink, true);
    y = renderDetailRow(doc, ML, W, y, "Saldo acumulado", `${data.totalSeniorityDays} días × ${formatVES(data.integratedDailySalary)}`, formatVES(data.accumulatedBalance), COLORS.ink, false);
    y = renderDetailRow(doc, ML, W, y, "Garantía Art. 142.c", `30 d × Sal. Integral × ${data.yearsOfService} año(s)`, formatVES(data.seniorityIndemnityGuarantee), COLORS.ink, true);

    fill(doc, ML, y, W, 0.5, COLORS.orange);
    y += 1.2;
    fill(doc, ML, y, W, 13, COLORS.bandHead);
    rect(doc, ML, y, W, 13, COLORS.border, 0.2);
    renderLabel(doc, "Monto Total Prestaciones", ML + 3, y + 8.5, "left", COLORS.inkMed, 9);
    renderMono(doc, formatVES(data.finalAmount), ML + W - 3, y + 9, 14, true, COLORS.ink, "right");
    y += 13 + 6;

    // ── Pago inmediato ────────────────────────────────────────────────────────
    if (data.socialBenefitsAdvance > 0 || data.accumulatedInterests > 0) {
        const pct = data.advancePercentage ?? 75;
        y = drawSectionLabel(doc, ML, W, y, "Pago Inmediato");
        if (data.socialBenefitsAdvance > 0) {
            y = renderDetailRow(doc, ML, W, y, `Anticipo de Prestaciones (${pct}%)`, "Art. 144 LOTTT", formatVES(data.socialBenefitsAdvance), COLORS.ink, false);
        }
        if (data.accumulatedInterests > 0) {
            y = renderDetailRow(doc, ML, W, y, "Intereses de Fideicomiso", "Art. 143 LOTTT", formatVES(data.accumulatedInterests), COLORS.ink, true);
        }
        y = renderDetailRow(doc, ML, W, y, "Total anticipos entregados", "Anticipos + intereses", `- ${formatVES(data.immediatePayment)}`, COLORS.inkMed, false);

        fill(doc, ML, y, W, 0.5, COLORS.orange);
        y += 1.2;
        fill(doc, ML, y, W, 13, COLORS.bandHead);
        rect(doc, ML, y, W, 13, COLORS.border, 0.2);
        renderLabel(doc, "Saldo a Favor", ML + 3, y + 8.5, "left", COLORS.inkMed, 9);
        renderMono(doc, formatVES(data.balanceInFavor), ML + W - 3, y + 9, 14, true, COLORS.ink, "right");
        y += 13 + 6;
    }

    // ── Legal + firmas ────────────────────────────────────────────────────────
    const legal =
        "La presente constancia certifica el saldo de prestaciones sociales de conformidad con el Art. 142 " +
        "de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). " +
        "El monto corresponde al mayor valor entre el saldo acumulado (Art. 142.a y 142.b) y la garantía de 30 " +
        "días de salario integral por año de servicio (Art. 142.c).";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
    const lines = doc.splitTextToSize(legal, W) as string[];
    lines.forEach((ln, i) => doc.text(ln, ML, y + i * 3.5));
    y += lines.length * 3.5 + 6;

    drawSignatures(doc, ML, W, y);
    drawFooter(doc, kontaLogo);

    doc.save(`prestaciones-${safeFilename(data.employee.idNumber)}-${data.cutoffDate.replaceAll("-", "")}.pdf`);
}

// ── Intereses + Anticipo (Art. 143 / 144) ─────────────────────────────────────

export async function generateInterestsAndAdvancePdf(data: SocialBenefitsPdfData): Promise<void> {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const ML = 12, W = PW - 2 * ML;

    const [companyLogo, kontaLogo] = await Promise.all([
        data.showLogoInPdf && data.logoUrl
            ? loadImageAsBase64(data.logoUrl).catch(() => null)
            : Promise.resolve(null),
        loadKontaLogo(),
    ]);

    drawHeader(doc, {
        companyName: data.companyName,
        companyRif:  data.companyId,
        reportTitle: "Intereses y Anticipo",
        periodLabel: `Corte ${fmtDateEs(data.cutoffDate)}`,
    });

    let y = 32;

    if (companyLogo) {
        try { doc.addImage(companyLogo, "JPEG", ML, y, 18, 7, undefined, "FAST"); y += 9; } catch { /* */ }
    }

    y = drawIdentityCard(doc, ML, W, y, data.employee,
        "Saldo Acumulado", formatVES(data.accumulatedBalance), "Base de cálculo",
        "Antigüedad", `${data.yearsOfService}a ${data.completeMonths % 12}m`, `Ingreso ${fmtDateEs(data.hireDate)}`,
    );

    const pct  = data.advancePercentage ?? 75;
    const rate = data.interestRate ?? 0;

    y = drawSectionLabel(doc, ML, W, y, "Pago Inmediato");
    y = renderDetailRow(doc, ML, W, y, `Anticipo de Prestaciones (${pct}%)`, `Art. 144 — ${pct}% del saldo acumulado`, formatVES(data.socialBenefitsAdvance), COLORS.ink, false);
    y = renderDetailRow(doc, ML, W, y, "Intereses sobre Prestaciones", `Art. 143 — Tasa ${rate}%`, formatVES(data.accumulatedInterests), COLORS.ink, true);

    fill(doc, ML, y, W, 0.5, COLORS.orange);
    y += 1.2;
    fill(doc, ML, y, W, 12, COLORS.bandHead);
    rect(doc, ML, y, W, 12, COLORS.border, 0.2);
    renderLabel(doc, "Total anticipos e intereses", ML + 3, y + 7.8, "left", COLORS.inkMed, 9);
    renderMono(doc, formatVES(data.immediatePayment), ML + W - 3, y + 8.2, 13, true, COLORS.ink, "right");
    y += 12 + 6;

    y = drawSectionLabel(doc, ML, W, y, "Cuenta de Garantía");
    y = renderDetailRow(doc, ML, W, y, "Monto Prestaciones Acumuladas", data.isGuaranteeApplied ? "Garantía Art. 142.c" : "Días acumulados", formatVES(data.finalAmount), COLORS.ink, false);
    y = renderDetailRow(doc, ML, W, y, "Total Deducción", "Anticipos + Intereses ya entregados", `- ${formatVES(data.immediatePayment)}`, COLORS.inkMed, true);

    fill(doc, ML, y, W, 0.5, COLORS.orange);
    y += 1.2;
    fill(doc, ML, y, W, 13, COLORS.bandHead);
    rect(doc, ML, y, W, 13, COLORS.border, 0.2);
    renderLabel(doc, "Saldo Pendiente a Favor del Trabajador", ML + 3, y + 8.5, "left", COLORS.inkMed, 9);
    renderMono(doc, formatVES(data.balanceInFavor), ML + W - 3, y + 9, 14, true, COLORS.ink, "right");
    y += 13 + 6;

    const legal = "Los intereses son calculados conforme al Art. 143 LOTTT. El monto anticipado ha sido depositado y deducido proporcionalmente conforme al Art. 144 LOTTT.";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
    const lines = doc.splitTextToSize(legal, W) as string[];
    lines.forEach((ln, i) => doc.text(ln, ML, y + i * 3.5));
    y += lines.length * 3.5 + 6;

    drawSignatures(doc, ML, W, y);
    drawFooter(doc, kontaLogo);

    doc.save(`intereses-anticipo-${safeFilename(data.employee.idNumber)}-${data.cutoffDate.replaceAll("-", "")}.pdf`);
}
