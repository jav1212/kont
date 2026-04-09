import jsPDF from "jspdf";
import { loadImageAsBase64 } from "./pdf-image-helper";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LiquidationLine {
    label:      string;
    days?:      number;
    formula?:   string;   // Calculation formula (replaces daily salary column)
    salary?:    number;   // Daily salary used (shown if no formula)
    amount:     number;
    highlight?: "amber";  // Indemnity/Special highlight
}

export interface LiquidationEmployee {
    name:           string;
    idNumber:       string;
    role:           string;
    hireDate:       string;   // ISO YYYY-MM-DD
    terminationDate: string;  // ISO YYYY-MM-DD
    yearsOfService: number;
    daysOfService:  number;   // Days of the last partial year
    reason:         "renuncia" | "despido_justificado" | "despido_injustificado";
    lines:          LiquidationLine[];
    total:          number;
}

export interface LiquidationOptions {
    companyName:    string;
    companyId?:     string;
    documentDate:   string;   // ISO YYYY-MM-DD
    bcvRate?:       number;
    logoUrl?:       string;
    showLogoInPdf?: boolean;
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
    primary:   [217, 58,  16]  as RGB,  // Konta orange accents
    amber:     [220, 38,  38]  as RGB,  // Highlight
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
const REASON_LABELS: Record<string, string> = { renuncia: "Renuncia Voluntaria", despido_justificado: "Despido Justificado", despido_injustificado: "Despido Injustificado" };

// ── Receipt renderer ──────────────────────────────────────────────────────────
function drawReceipt(doc: Doc, emp: LiquidationEmployee, opts: LiquidationOptions, isFirst: boolean, logoBase64?: string | null) {
    if (!isFirst) doc.addPage();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 16;
    const marginRight = pageWidth - 16;
    const contentWidth  = marginRight - marginLeft;

    fill(doc, 0, 0, pageWidth, pageHeight, COLORS.bg);

    // ── HEADER ────────────────────────────────────────────────────────────
    const topY = 20;
    if (logoBase64) {
        try { doc.addImage(logoBase64, "JPEG", marginLeft, topY - 5, 28, 11); } catch { /* */ }
        renderText(doc, opts.companyName.toUpperCase(), marginLeft + 32, topY, 13, true, COLORS.ink);
        if (opts.companyId) renderMono(doc, `ID ${opts.companyId}`, marginLeft + 32, topY + 4, 7, false, COLORS.muted, "left");
    } else {
        renderText(doc, opts.companyName.toUpperCase(), marginLeft, topY, 13, true, COLORS.ink);
        if (opts.companyId) renderMono(doc, `ID ${opts.companyId}`, marginLeft, topY + 4, 7, false, COLORS.muted, "left");
    }

    renderText(doc, "CONSTANCIA DE LIQUIDACIÓN", marginRight, topY - 1, 9, true, COLORS.ink, "right");
    renderText(doc, "ART. 142 LOTTT — " + (REASON_LABELS[emp.reason] ?? emp.reason).toUpperCase(), marginRight, topY + 3, 6, false, COLORS.muted, "right");

    renderLabel(doc, "FECHA DE EGRESO", marginRight, topY + 11, "right");
    renderMono(doc, formatDate(emp.terminationDate), marginRight, topY + 15, 9, true, COLORS.inkMed, "right");
    
    renderLabel(doc, `EMITIDO: ${new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}`, marginRight, topY + 20, "right");

    let y = topY + 26;
    hline(doc, marginLeft, y, contentWidth, COLORS.border, 0.4);
    y += 8;

    // ── EMPLOYEE DATA POINTS ──────────────────────────────────────────────
    const col1X = marginLeft;
    const col2X = marginLeft + contentWidth * 0.40;
    const col3X = marginLeft + contentWidth * 0.70;

    renderLabel(doc, "Trabajador", col1X, y);
    renderText(doc, emp.name.toUpperCase(), col1X, y + 5, 9, true, COLORS.ink, "left", col2X - col1X - 4);
    if (emp.role) renderText(doc, emp.role.toUpperCase(), col1X, y + 9, 6.5, false, COLORS.muted);
    renderMono(doc, "CI " + emp.idNumber, col1X, y + 13.5, 7.5, true, COLORS.inkMed, "left");

    renderLabel(doc, "Antigüedad", col2X, y);
    const seniorityStr = `${emp.yearsOfService}a ${emp.daysOfService % 365}d`;
    renderMono(doc, seniorityStr, col2X, y + 5, 8.5, true, COLORS.ink, "left");
    renderMono(doc, `Ingreso: ${formatDate(emp.hireDate)}`, col2X, y + 9.5, 6.5, false, COLORS.inkMed, "left");

    renderLabel(doc, "Salario Base / Día", col3X, y);
    const dailySalary = emp.lines.length > 0 && emp.lines[0].salary && emp.lines[0].salary > 0
        ? emp.lines[0].salary
        : (emp.total > 0 ? emp.total / 30 : 0);
    renderMono(doc, dailySalary > 0 ? formatVES(dailySalary) : "—", col3X, y + 5, 8.5, true, COLORS.ink, "left");

    y += 18;
    hline(doc, marginLeft, y, contentWidth, COLORS.border, 0.3);
    y += 8;

    // ── TABLE HEADER ──────────────────────────────────────────────────────
    const COL_DIAS  = marginRight - 50;
    const COL_MONTO = marginRight;

    renderLabel(doc, "CONCEPTO / CÁLCULO", marginLeft, y, "left", COLORS.inkMed);
    renderLabel(doc, "DÍAS", COL_DIAS, y, "center", COLORS.inkMed);
    renderLabel(doc, "MONTO ASIGNADO", COL_MONTO, y, "right", COLORS.inkMed);

    y += 3;
    hline(doc, marginLeft, y, contentWidth, COLORS.borderStr, 0.4);
    y += 6;

    // ── CONCEPT ROWS ──────────────────────────────────────────────────────
    const ROW_HEIGHT = 10;
    emp.lines.forEach((line) => {
        const isAmber = line.highlight === "amber";
        const titleColor = isAmber ? COLORS.amber : COLORS.ink;

        renderText(doc, line.label.toUpperCase(), marginLeft, y, 7.5, true, titleColor);
        if (line.formula) {
            renderText(doc, line.formula.toUpperCase(), marginLeft, y + 3.5, 5.5, false, COLORS.muted);
        }

        if (line.days !== undefined) renderMono(doc, String(line.days), COL_DIAS, y + 1, 8, true, COLORS.muted, "center");
        renderMono(doc, formatVES(line.amount), COL_MONTO, y + 1, 8.5, true, titleColor, "right");

        y += ROW_HEIGHT;
        hline(doc, marginLeft, y - 4, contentWidth, COLORS.border, 0.2); // Faint line between concepts
    });

    y += 6;

    // ── TOTAL BAR ─────────────────────────────────────────────────────────
    fill(doc, marginLeft, y, contentWidth, 14, COLORS.rowAlt);
    hline(doc, marginLeft, y, contentWidth, COLORS.borderStr, 0.4);
    hline(doc, marginLeft, y + 14, contentWidth, COLORS.borderStr, 0.4);

    renderLabel(doc, "LÍQUIDO A RECIBIR", marginLeft + 4, y + 8, "left", COLORS.inkMed);
    renderMono(doc, formatVES(emp.total), marginRight - 4, y + 9.5, 12, true, COLORS.ink, "right");

    y += 24;

    // ── LEGAL NOTE ────────────────────────────────────────────────────────
    const legalNote =
        "El presente documento certifica la liquidación y pago de todas las acreencias laborales aplicables al trabajador indicado, calculadas conforme a la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). Incluye prestaciones sociales, utilidades, vacaciones y afines" +
        (emp.reason === "despido_injustificado" ? " e indemnización por despido injustificado (Art. 92)." : ".");
    
    renderText(doc, legalNote, marginLeft, y, 6, false, COLORS.muted, "left", contentWidth, "helvetica");

    // ── SIGNATURES ────────────────────────────────────────────────────────
    const signatureWidth = 60;
    const signatureY = pageHeight - 38;

    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.setDrawColor(COLORS.borderStr[0], COLORS.borderStr[1], COLORS.borderStr[2]);
    doc.setLineWidth(0.3);
    
    // Employer
    doc.line(marginLeft + 5, signatureY, marginLeft + 5 + signatureWidth, signatureY);
    renderLabel(doc, "REPRESENTANTE DEL EMPLEADOR", marginLeft + 5 + signatureWidth / 2, signatureY + 5, "center");
    if (opts.companyName) renderText(doc, opts.companyName.toUpperCase(), marginLeft + 5 + signatureWidth / 2, signatureY + 9, 6, false, COLORS.muted, "center", signatureWidth);

    // Employee
    const cxRight = marginRight - 5 - signatureWidth / 2;
    doc.line(marginRight - 5 - signatureWidth, signatureY, marginRight - 5, signatureY);

    renderLabel(doc, "FIRMA DEL TRABAJADOR", cxRight, signatureY + 5, "center");
    renderMono(doc, "CI " + emp.idNumber, cxRight, signatureY + 9, 7, false, COLORS.muted, "center");
    
    doc.setLineDashPattern([], 0);

    // ── FOOTER ────────────────────────────────────────────────────────────
    hline(doc, marginLeft, pageHeight - 14, contentWidth, COLORS.border, 0.4);
    renderLabel(doc, "DOCUMENTO DE CONFORMIDAD · ORIGINAL", marginLeft, pageHeight - 9, "left", COLORS.muted);
    
    const randomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    renderMono(doc, "ID " + randomId, marginRight, pageHeight - 9, 6, true, COLORS.muted, "right");
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function generateLiquidationPdf(employees: LiquidationEmployee[], opts: LiquidationOptions): Promise<void> {
    if (employees.length === 0) return;

    const logoBase64 = (opts.showLogoInPdf && opts.logoUrl)
        ? await loadImageAsBase64(opts.logoUrl).catch(() => null)
        : null;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    employees.forEach((emp, i) => drawReceipt(doc, emp, opts, i === 0, logoBase64));
    const slug = opts.documentDate.replaceAll("-", "");
    doc.save(`liquidaciones_${slug}.pdf`);
}
