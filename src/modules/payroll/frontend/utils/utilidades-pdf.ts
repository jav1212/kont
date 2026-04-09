import jsPDF from "jspdf";
import { loadImageAsBase64 } from "./pdf-image-helper";

export interface ProfitSharingPdfEmployee {
    name: string;
    idNumber: string;
    role?: string;
}

export interface FullProfitSharingPdfData {
    companyName:       string;
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
    employee:          ProfitSharingPdfEmployee;
    fiscalYear:        number;
    hireDate:          string;   // ISO
    cutoffDate:        string;   // ISO
    fiscalStart:       string;   // ISO
    periodStart:       string;   // ISO
    monthsWorked:      number;
    profitSharingDays: number;
    fractionalDays:    number;
    salaryVES:         number;
    dailySalary:       number;
    amount:            number;
    logoUrl?:          string;
    showLogoInPdf?:    boolean;
}

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
};

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

const formatVES = (n: number) => "Bs. " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (iso: string) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`.toUpperCase();
};

function drawFooter(doc: Doc, pageWidth: number, pageHeight: number, companyName: string, subtitle: string) {
    fill(doc, 0, pageHeight - 14, pageWidth, 14, COLORS.white);
    hline(doc, 0, pageHeight - 14, pageWidth, COLORS.border, 0.4);
    renderLabel(doc, `${companyName.toUpperCase()}  |  ${subtitle}  |  DOCUMENTO CONFIDENCIAL`, pageWidth / 2, pageHeight - 7, "center", COLORS.muted);
}

function drawSignatures(doc: Doc, marginLeft: number, contentWidth: number, y: number): number {
    const SIG_WIDTH = (contentWidth - 16) / 2;
    const SIG_HEIGHT = 24;
    ["EMPLEADOR", "TRABAJADOR"].forEach((role, i) => {
        const sx = marginLeft + i * (SIG_WIDTH + 16);
        doc.setDrawColor(COLORS.borderStr[0], COLORS.borderStr[1], COLORS.borderStr[2]);
        doc.setLineWidth(0.4);
        doc.setLineDashPattern([2, 1.5], 0);
        doc.rect(sx, y, SIG_WIDTH, SIG_HEIGHT, "S");
        doc.setLineDashPattern([], 0); // reset
        
        hline(doc, sx + 8, y + SIG_HEIGHT - 8, SIG_WIDTH - 16, COLORS.borderStr, 0.4);
        renderLabel(doc, role, sx + SIG_WIDTH / 2, y + SIG_HEIGHT - 4.5, "center", COLORS.muted);
    });
    return y + SIG_HEIGHT + 8;
}

export async function generateFullProfitSharingPdf(data: FullProfitSharingPdfData): Promise<void> {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 16, marginRight = pageWidth - 16, contentWidth = marginRight - marginLeft;

    let logoBase64 = null;
    if (data.showLogoInPdf && data.logoUrl) {
        logoBase64 = await loadImageAsBase64(data.logoUrl).catch(() => null);
    }

    fill(doc, 0, 0, pageWidth, pageHeight, COLORS.bg);

    const topY = 20;
    if (logoBase64) {
        try { doc.addImage(logoBase64, "JPEG", marginLeft, topY - 5, 28, 11); } catch { /* */ }
    }
    
    renderText(doc, data.companyName.toUpperCase(), marginLeft + 32, topY, 13, true, COLORS.ink);
    renderText(doc, "CONSTANCIA DE UTILIDADES ANUALES", marginLeft + 32, topY + 5.5, 7, false, COLORS.muted);

    renderLabel(doc, "AÑO FISCAL", marginRight, topY, "right");
    renderMono(doc, String(data.fiscalYear), marginRight, topY + 6, 12, true, COLORS.ink, "right");

    let y = 38;
    hline(doc, marginLeft, y, contentWidth, COLORS.borderStr, 0.5);
    y += 12;

    const column1X = marginLeft;
    const column2X = marginLeft + contentWidth * 0.40;
    const column3X = marginLeft + contentWidth * 0.70;

    renderLabel(doc, "Trabajador", column1X, y);
    renderText(doc, data.employee.name.toUpperCase(), column1X, y + 5, 9, true, COLORS.ink, "left", column2X - column1X - 4);
    if (data.employee.role) renderText(doc, data.employee.role.toUpperCase(), column1X, y + 9, 6.5, false, COLORS.muted);

    renderLabel(doc, "Cédula", column2X, y);
    renderMono(doc, data.employee.idNumber, column2X, y + 5, 9, true, COLORS.ink, "left");

    renderLabel(doc, "Sal. Mensual", column3X, y);
    renderMono(doc, formatVES(data.salaryVES), column3X, y + 5, 8.5, true, COLORS.ink, "left");
    renderMono(doc, `Diario: ${formatVES(data.dailySalary)}`, column3X, y + 9.5, 6.5, false, COLORS.muted, "left");

    y += 18;
    
    fill(doc, marginLeft, y, contentWidth, 8, COLORS.rowAlt);
    renderText(doc, "DÍAS DE UTILIDADES BASE (Art. 131)", marginLeft + 4, y + 5.5, 7, true, COLORS.ink);
    renderMono(doc, `${data.profitSharingDays} DÍAS`, marginRight - 4, y + 5.5, 9, true, COLORS.ink, "right");
    y += 8;
    hline(doc, marginLeft, y, contentWidth, COLORS.borderStr, 0.8);
    y += 8;

    renderLabel(doc, "Fórmula", marginLeft, y);
    renderMono(doc, `${data.profitSharingDays} días × ${formatVES(data.dailySalary)} / día  =  ${formatVES(data.amount)}`, marginLeft, y + 6, 8, true, COLORS.inkMed, "left");

    y += 14;

    fill(doc, marginLeft, y, contentWidth, 12, COLORS.rowAlt);
    renderText(doc, "MONTO A PAGAR (UTILIDADES NETAS)", marginLeft + 4, y + 7.5, 8, true, COLORS.ink);
    renderMono(doc, formatVES(data.amount), marginRight - 4, y + 8, 12, true, COLORS.ink, "right");
    y += 12;
    hline(doc, marginLeft, y, contentWidth, COLORS.borderStr, 0.8);
    y += 8;

    const legal = `La presente constancia certifica el pago de utilidades correspondientes al año fiscal ${data.fiscalYear}, de conformidad con los Arts. 131 y 174 de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). El cálculo se realiza sobre el salario normal del trabajador. La firma de ambas partes confirma la recepción de dicho beneficio.`;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
    (doc.splitTextToSize(legal, contentWidth) as string[]).forEach((line: string, i: number) => {
        doc.text(line, marginLeft, y + i * 4);
    });

    y += 24;
    y = drawSignatures(doc, marginLeft, contentWidth, y);

    drawFooter(doc, pageWidth, pageHeight, data.companyName, `UTILIDADES ${data.fiscalYear}`);
    doc.save(`utilidades_${data.employee.idNumber}_${data.fiscalYear}.pdf`);
}

export async function generateFractionalProfitSharingPdf(data: FractionalProfitSharingPdfData): Promise<void> {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 16, marginRight = pageWidth - 16, contentWidth = marginRight - marginLeft;

    let logoBase64 = null;
    if (data.showLogoInPdf && data.logoUrl) {
        logoBase64 = await loadImageAsBase64(data.logoUrl).catch(() => null);
    }

    fill(doc, 0, 0, pageWidth, pageHeight, COLORS.bg);

    const topY = 20;
    if (logoBase64) {
        try { doc.addImage(logoBase64, "JPEG", marginLeft, topY - 5, 28, 11); } catch { /* */ }
    }
    
    renderText(doc, data.companyName.toUpperCase(), marginLeft + 32, topY, 13, true, COLORS.ink);
    renderText(doc, "CONSTANCIA DE UTILIDADES FRACCIONADAS", marginLeft + 32, topY + 5.5, 7, false, COLORS.muted);

    renderLabel(doc, "AÑO FISCAL", marginRight, topY, "right");
    renderMono(doc, String(data.fiscalYear), marginRight, topY + 6, 12, true, COLORS.ink, "right");

    let y = 38;
    hline(doc, marginLeft, y, contentWidth, COLORS.borderStr, 0.5);
    y += 12;

    const column1X = marginLeft;
    const column2X = marginLeft + contentWidth * 0.45;
    const column3X = marginLeft + contentWidth * 0.70;

    renderLabel(doc, "Trabajador", column1X, y);
    renderText(doc, data.employee.name.toUpperCase(), column1X, y + 5, 9, true, COLORS.ink, "left", column2X - column1X - 4);
    if (data.employee.role) renderText(doc, data.employee.role.toUpperCase(), column1X, y + 9, 6.5, false, COLORS.muted);

    renderLabel(doc, "Cédula", column2X, y);
    renderMono(doc, data.employee.idNumber, column2X, y + 5, 9, true, COLORS.ink, "left");

    renderLabel(doc, "Meses Trabajados", column3X, y);
    renderMono(doc, `${data.monthsWorked} MES${data.monthsWorked !== 1 ? "ES" : ""}`, column3X, y + 5, 8.5, true, COLORS.ink, "left");
    renderMono(doc, `Período: ${formatDate(data.periodStart)} al ${formatDate(data.cutoffDate)}`, column3X, y + 9.5, 5.5, false, COLORS.muted, "left");

    y += 18;
    
    fill(doc, marginLeft, y, contentWidth, 8, COLORS.rowAlt);
    renderText(doc, "DÍAS FRACCIONADOS (Art. 175)", marginLeft + 4, y + 5.5, 7, true, COLORS.ink);
    renderMono(doc, `${data.fractionalDays} DÍAS`, marginRight - 4, y + 5.5, 9, true, COLORS.ink, "right");
    y += 8;
    hline(doc, marginLeft, y, contentWidth, COLORS.borderStr, 0.8);
    y += 8;

    renderLabel(doc, "Fórmula", marginLeft, y);
    renderMono(doc, `⌈ ${data.profitSharingDays} d / 12 m × ${data.monthsWorked} meses ⌉ = ${data.fractionalDays} d`, marginLeft, y + 6, 7, true, COLORS.inkMed, "left");
    renderMono(doc, `${data.fractionalDays} días × ${formatVES(data.dailySalary)} / día  =  ${formatVES(data.amount)}`, marginLeft, y + 12, 8, true, COLORS.inkMed, "left");

    y += 20;

    fill(doc, marginLeft, y, contentWidth, 12, COLORS.rowAlt);
    renderText(doc, "MONTO FRACCIONADO", marginLeft + 4, y + 7.5, 8, true, COLORS.ink);
    renderMono(doc, formatVES(data.amount), marginRight - 4, y + 8, 12, true, COLORS.ink, "right");
    y += 12;
    hline(doc, marginLeft, y, contentWidth, COLORS.borderStr, 0.8);
    y += 8;

    const legal = `La presente constancia certifica el pago de utilidades fraccionadas correspondientes al período trabajado en el año fiscal ${data.fiscalYear}, de conformidad con el Art. 175 de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). El cálculo es proporcional a los meses completos laborados desde el inicio del año fiscal o de la relación laboral (lo que ocurra después).`;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
    (doc.splitTextToSize(legal, contentWidth) as string[]).forEach((line: string, i: number) => {
        doc.text(line, marginLeft, y + i * 4);
    });

    y += 24;
    y = drawSignatures(doc, marginLeft, contentWidth, y);

    drawFooter(doc, pageWidth, pageHeight, data.companyName, `UTILIDADES FRACCIONADAS ${data.fiscalYear}`);
    doc.save(`utilidades_fraccionadas_${data.employee.idNumber}_${data.fiscalYear}.pdf`);
}
