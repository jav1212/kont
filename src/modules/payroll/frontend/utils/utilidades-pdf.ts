// PDF generators: Utilidades anuales (Art. 131 LOTTT) y utilidades fraccionadas
// (Art. 175). Estilo Konta — header naranja, footer Kontave compartido.

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

export interface ProfitSharingPdfEmployee {
    name: string;
    idNumber: string;
    role?: string;
}

export interface FullProfitSharingPdfData {
    companyName:       string;
    companyId?:        string;
    employee:          ProfitSharingPdfEmployee;
    fiscalYear:        number;
    salaryVES:         number;
    dailySalary:       number;
    profitSharingDays: number;
    amount:            number;
    logoUrl?:          string;
    showLogoInPdf?:    boolean;
}

export interface FractionalProfitSharingPdfData {
    companyName:       string;
    companyId?:        string;
    employee:          ProfitSharingPdfEmployee;
    fiscalYear:        number;
    hireDate:          string;
    cutoffDate:        string;
    fiscalStart:       string;
    periodStart:       string;
    monthsWorked:      number;
    profitSharingDays: number;
    fractionalDays:    number;
    salaryVES:         number;
    dailySalary:       number;
    amount:            number;
    logoUrl?:          string;
    showLogoInPdf?:    boolean;
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

function drawIdentityCard(
    doc: Doc, x: number, w: number, y: number,
    employee: ProfitSharingPdfEmployee,
    rightLabel: string, rightValue: string, rightSub?: string,
): number {
    const H = 18;
    fill(doc, x, y, w, H, COLORS.rowAlt);
    fill(doc, x, y, 1.5, H, COLORS.orange);
    rect(doc, x, y, w, H, COLORS.border, 0.2);

    const c1 = x + 4;
    const c2 = x + w * 0.45;
    const c3 = x + w - 3;

    renderLabel(doc, "Trabajador", c1, y + 4, "left", COLORS.muted, 7);
    renderText(doc, employee.name.toUpperCase(), c1, y + 9, 10.5, true, COLORS.ink, "left", c2 - c1 - 4, "helvetica");
    if (employee.role) renderText(doc, employee.role, c1, y + 13.5, 7.8, false, COLORS.muted, "left", c2 - c1 - 4, "helvetica");

    renderLabel(doc, "Cédula", c2, y + 4, "left", COLORS.muted, 7);
    renderMono(doc, employee.idNumber, c2, y + 9, 10.5, true, COLORS.ink, "left");

    renderLabel(doc, rightLabel, c3, y + 4, "right", COLORS.muted, 7);
    renderMono(doc, rightValue, c3, y + 9, 10, true, COLORS.ink, "right");
    if (rightSub) renderMono(doc, rightSub, c3, y + 13.5, 7.5, false, COLORS.muted, "right");

    return y + H + 5;
}

function drawTotalCard(doc: Doc, x: number, w: number, y: number, label: string, value: string): number {
    fill(doc, x, y, w, 0.5, COLORS.orange);
    y += 1.2;
    fill(doc, x, y, w, 14, COLORS.bandHead);
    rect(doc, x, y, w, 14, COLORS.border, 0.2);
    renderLabel(doc, label, x + 3, y + 8.5, "left", COLORS.inkMed, 9);
    renderMono(doc, value, x + w - 3, y + 9, 14, true, COLORS.ink, "right");
    return y + 14 + 6;
}

function drawLegal(doc: Doc, x: number, w: number, y: number, text: string): number {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
    const lines = doc.splitTextToSize(text, w) as string[];
    lines.forEach((ln, i) => doc.text(ln, x, y + i * 3.5));
    return y + lines.length * 3.5 + 6;
}

// ── Utilidades completas ──────────────────────────────────────────────────────

export async function generateFullProfitSharingPdf(data: FullProfitSharingPdfData): Promise<void> {
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
        reportTitle: "Constancia de Utilidades",
        periodLabel: `Año Fiscal ${data.fiscalYear}`,
    });

    let y = 32;

    if (companyLogo) {
        try { doc.addImage(companyLogo, "JPEG", ML, y, 18, 7, undefined, "FAST"); y += 9; } catch { /* */ }
    }

    y = drawIdentityCard(doc, ML, W, y, data.employee,
        "Sal. Mensual", formatVES(data.salaryVES), `Diario ${formatVES(data.dailySalary)}`);

    // Días base + fórmula
    fill(doc, ML, y, W, 11, COLORS.bandHead);
    rect(doc, ML, y, W, 11, COLORS.border, 0.2);
    renderLabel(doc, "Días de utilidades base · Art. 131 LOTTT", ML + 3, y + 7, "left", COLORS.inkMed, 8);
    renderMono(doc, `${data.profitSharingDays} días`, ML + W - 3, y + 7.2, 11, true, COLORS.ink, "right");
    y += 11 + 4;

    renderLabel(doc, "Fórmula", ML, y + 3.5, "left", COLORS.muted, 7);
    renderMono(doc,
        `${data.profitSharingDays} días × ${formatVES(data.dailySalary)} / día  =  ${formatVES(data.amount)}`,
        ML, y + 9, 9.5, true, COLORS.inkMed, "left");
    y += 14;

    y = drawTotalCard(doc, ML, W, y, "Monto a pagar (utilidades netas)", formatVES(data.amount));

    y = drawLegal(doc, ML, W, y,
        `La presente constancia certifica el pago de utilidades correspondientes al año fiscal ${data.fiscalYear}, ` +
        "de conformidad con los Arts. 131 y 174 de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). " +
        "El cálculo se realiza sobre el salario normal del trabajador. La firma de ambas partes confirma la recepción de dicho beneficio.",
    );

    drawSignatures(doc, ML, W, y);
    drawFooter(doc, kontaLogo);

    doc.save(`utilidades-${safeFilename(data.employee.idNumber)}-${data.fiscalYear}.pdf`);
}

// ── Utilidades fraccionadas ───────────────────────────────────────────────────

export async function generateFractionalProfitSharingPdf(data: FractionalProfitSharingPdfData): Promise<void> {
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
        reportTitle: "Utilidades Fraccionadas",
        periodLabel: `Año Fiscal ${data.fiscalYear}`,
    });

    let y = 32;

    if (companyLogo) {
        try { doc.addImage(companyLogo, "JPEG", ML, y, 18, 7, undefined, "FAST"); y += 9; } catch { /* */ }
    }

    y = drawIdentityCard(doc, ML, W, y, data.employee,
        "Meses Trabajados",
        `${data.monthsWorked} mes${data.monthsWorked !== 1 ? "es" : ""}`,
        `${fmtDateEs(data.periodStart)} → ${fmtDateEs(data.cutoffDate)}`,
    );

    // Días fraccionados
    fill(doc, ML, y, W, 11, COLORS.bandHead);
    rect(doc, ML, y, W, 11, COLORS.border, 0.2);
    renderLabel(doc, "Días fraccionados · Art. 175 LOTTT", ML + 3, y + 7, "left", COLORS.inkMed, 8);
    renderMono(doc, `${data.fractionalDays} días`, ML + W - 3, y + 7.2, 11, true, COLORS.ink, "right");
    y += 11 + 4;

    renderLabel(doc, "Fórmula", ML, y + 3.5, "left", COLORS.muted, 7);
    renderMono(doc,
        `(${data.profitSharingDays} d / 12 m) × ${data.monthsWorked} meses = ${data.fractionalDays} d`,
        ML, y + 9, 9.5, true, COLORS.inkMed, "left");
    renderMono(doc,
        `${data.fractionalDays} días × ${formatVES(data.dailySalary)} / día = ${formatVES(data.amount)}`,
        ML, y + 14.5, 9.5, true, COLORS.inkMed, "left");
    y += 20;

    y = drawTotalCard(doc, ML, W, y, "Monto fraccionado", formatVES(data.amount));

    y = drawLegal(doc, ML, W, y,
        `La presente constancia certifica el pago de utilidades fraccionadas correspondientes al período trabajado en el año fiscal ${data.fiscalYear}, ` +
        "de conformidad con el Art. 175 de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). " +
        "El cálculo es proporcional a los meses completos laborados desde el inicio del año fiscal o de la relación laboral (lo que ocurra después).",
    );

    drawSignatures(doc, ML, W, y);
    drawFooter(doc, kontaLogo);

    doc.save(`utilidades-fraccionadas-${safeFilename(data.employee.idNumber)}-${data.fiscalYear}.pdf`);
}
