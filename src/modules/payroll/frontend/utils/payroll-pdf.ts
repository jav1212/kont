import jsPDF from "jspdf";
import { loadImageAsBase64 } from "./pdf-image-helper";
import type { PdfVisibility } from "../../backend/domain/payroll-settings";

// ── Public types ──────────────────────────────────────────────────────────────

export interface PdfComputedLine {
    label:   string;
    formula: string;
    amount:  number;
}

export interface PdfEmployeeResult {
    cedula:          string;
    nombre:          string;
    cargo:           string;
    salarioMensual:  number;
    estado:          string;
    earningLines:    PdfComputedLine[];
    bonusLines:      PdfComputedLine[];
    deductionLines:  PdfComputedLine[];
    totalEarnings:   number;
    totalBonuses:    number;
    totalDeductions: number;
    gross:           number;
    net:             number;
    netUSD:          number;
    alicuotaUtil:    number;
    alicuotaBono:    number;
    salarioIntegral: number;
}

export interface PdfPayrollOptions {
    companyName:    string;
    companyId?:     string;
    payrollDate:    string;   // ISO end date
    periodStart?:   string;   // ISO start date
    periodLabel?:   string;   // "1ª Quincena — Marzo 2026"
    bcvRate?:       number;   // ya no se imprime en el recibo, pero puede usarse externamente
    mondaysInMonth: number;
    receiptSerial?: string;   // "NOM-2026-03-Q1"
    salaryMode?:    "mensual" | "integral";  // qué salario mostrar en la tarjeta del empleado
    logoUrl?:       string;
    showLogoInPdf?: boolean;
    // Per-company PDF segment visibility (REQ-005).
    // When absent, all segments are shown (backward-compatible default).
    pdfVisibility?: PdfVisibility;
}

// Genera el serial de nómina a partir del período
export function makePayrollSerial(periodStart: string): string {
    const [year, month, day] = periodStart.split("-");
    const q = parseInt(day) <= 15 ? 1 : 2;
    return `NOM-${year}-${month}-Q${q}`;
}

// ── Palette ───────────────────────────────────────────────────────────────────

type RGB = [number, number, number];
const COLORS = {
    ink:       [0,   0,   0]   as RGB,
    inkMed:    [0,   0,   0]   as RGB,
    muted:     [0,   0,   0]   as RGB,
    border:    [230, 230, 235] as RGB,
    borderStr: [190, 190, 200] as RGB,
    bg:        [255, 255, 255] as RGB,
    rowAlt:    [248, 248, 252] as RGB,
    white:     [255, 255, 255] as RGB,
    green:     [22,  101, 52]  as RGB,
    red:       [153, 27,  27]  as RGB,
    primary:   [8,   145, 178] as RGB,
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
    
    // Enforce single-line to avoid vertical overlap (wrapping)
    let str = text;
    if (maxW) {
        const lines = doc.splitTextToSize(text, maxW) as string[];
        str = lines[0] || "";
    }

    doc.text(str, x, y, { align });
};

const renderLabel = (doc: Doc, text: string, x: number, y: number, align: "left" | "right" | "center" = "left", color: RGB = COLORS.muted) =>
    renderText(doc, text.toUpperCase(), x, y, 8.5, true, color, align, undefined, "helvetica");

const renderMono = (doc: Doc, text: string, x: number, y: number, size: number, bold: boolean, c: RGB, align: "left" | "right" | "center" = "left") => 
    renderText(doc, text, x, y, size, bold, c, align, undefined, "courier");

const formatVES = (n: number) => "Bs. " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) => {
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
    
    // Employer
    const sx1 = marginLeft;
    doc.setDrawColor(COLORS.borderStr[0], COLORS.borderStr[1], COLORS.borderStr[2]);
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([2, 1.5], 0);
    doc.rect(sx1, y, SIG_WIDTH, SIG_HEIGHT, "S");
    doc.setLineDashPattern([], 0); // reset
    hline(doc, sx1 + 8, y + SIG_HEIGHT - 8, SIG_WIDTH - 16, COLORS.borderStr, 0.4);
    renderLabel(doc, "EMPLEADOR", sx1 + SIG_WIDTH / 2, y + SIG_HEIGHT - 4.5, "center", COLORS.muted);

    // Employee
    const sx2 = marginLeft + (SIG_WIDTH + 16);
    doc.setDrawColor(COLORS.borderStr[0], COLORS.borderStr[1], COLORS.borderStr[2]);
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([2, 1.5], 0);
    doc.rect(sx2, y, SIG_WIDTH, SIG_HEIGHT, "S");
    doc.setLineDashPattern([], 0); // reset

    // Checkbox inside worker box
    const cbSize = 2.5; 
    const cbX = sx2 + 4;
    const cbY = y + 4;
    doc.setDrawColor(COLORS.borderStr[0], COLORS.borderStr[1], COLORS.borderStr[2]);
    doc.setLineWidth(0.35);
    doc.rect(cbX, cbY, cbSize, cbSize);          // empty checkbox
    renderText(doc, "Declaro haber recibido el pago en Bolívares (VES)", cbX + cbSize + 1.5, cbY + cbSize - 0.5, 7.5, false, COLORS.muted, "left", SIG_WIDTH - cbSize - 8, "helvetica");

    hline(doc, sx2 + 8, y + SIG_HEIGHT - 8, SIG_WIDTH - 16, COLORS.borderStr, 0.4);
    renderLabel(doc, "TRABAJADOR / CONFORME", sx2 + SIG_WIDTH / 2, y + SIG_HEIGHT - 4.5, "center", COLORS.muted);

    return y + SIG_HEIGHT + 8;
}

function drawSection(doc: Doc, x: number, y: number, w: number, title: string, lines: PdfComputedLine[], total: number, sign: "+" | "-", amtColor?: RGB): number {
    fill(doc, x, y, w, 6, COLORS.rowAlt);
    renderText(doc, title.toUpperCase(), x + 4, y + 4.2, 9, true, COLORS.ink);
    renderMono(doc, `${sign} ${formatVES(total)}`, x + w - 4, y + 4.2, 11, true, amtColor || COLORS.ink, "right");
    y += 6;
    hline(doc, x, y, w, COLORS.borderStr, 0.8);
    y += 6;

    if (lines.length === 0) {
        renderMono(doc, "Sin conceptos", x + 4, y + 2, 8.5, false, COLORS.muted, "left");
        y += 7;
        return y;
    }

    renderLabel(doc, "Concepto", x, y);
    renderLabel(doc, "Fórmula / Cálculo", x + w * 0.45, y);
    renderLabel(doc, "Monto", x + w, y, "right");
    y += 5;

    lines.forEach((line) => {
        renderText(doc, line.label, x, y + 2, 9, false, COLORS.inkMed, "left", w * 0.4);
        renderMono(doc, line.formula, x + w * 0.45, y + 2, 8.5, false, COLORS.muted, "left");
        renderMono(doc, formatVES(line.amount), x + w, y + 2, 10.5, true, amtColor || COLORS.inkMed, "right");
        y += 7.5;
    });

    y += 4;
    return y;
}

// ── Receipt ───────────────────────────────────────────────────────────────────

function drawReceipt(doc: Doc, emp: PdfEmployeeResult, opts: PdfPayrollOptions, isFirst: boolean, empIdx = 0, logoBase64?: string | null) {
    if (!isFirst) doc.addPage();

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 16, marginRight = pageWidth - 16, contentWidth = marginRight - marginLeft;

    fill(doc, 0, 0, pageWidth, pageHeight, COLORS.bg);

    const periodStr = opts.periodLabel ? opts.periodLabel.toUpperCase() : fmtDate(opts.payrollDate);
    const empSerial = opts.receiptSerial ? `${opts.receiptSerial}-${String(empIdx + 1).padStart(4, "0")}` : "RECIBO DE NÓMINA";

    const topY = 20;
    if (logoBase64) {
        try { doc.addImage(logoBase64, "JPEG", marginLeft, topY - 5, 28, 11); } catch { /* */ }
    }
    
    renderText(doc, opts.companyName.toUpperCase(), marginLeft + 32, topY, 15, true, COLORS.ink);
    renderText(doc, "RECIBO DE PAGO DE NÓMINA", marginLeft + 32, topY + 6.5, 9.5, false, COLORS.muted);

    renderLabel(doc, "PERÍODO", marginRight, topY, "right");
    renderMono(doc, periodStr, marginRight, topY + 7, 12, true, COLORS.ink, "right");

    let y = 38;
    hline(doc, marginLeft, y, contentWidth, COLORS.borderStr, 0.5);
    y += 12;

    const column1X = marginLeft;
    const column2X = marginLeft + contentWidth * 0.38;

    renderLabel(doc, "Trabajador", column1X, y);
    renderText(doc, emp.nombre.toUpperCase(), column1X, y + 5.5, 11, true, COLORS.ink, "left", column2X - column1X - 4);
    if (emp.cargo) renderText(doc, emp.cargo.toUpperCase(), column1X, y + 11, 8.5, false, COLORS.muted);

    renderLabel(doc, "Cédula", column2X, y);
    renderMono(doc, emp.cedula, column2X, y + 5.5, 11, true, COLORS.ink, "left");
    renderMono(doc, `ID Recibo: ${empSerial}`, column2X, y + 11, 8, false, COLORS.muted, "left");

    renderLabel(doc, "Salario", marginRight, y, "right");
    
    const effectiveSalaryMode = opts.pdfVisibility?.showAlicuotaBreakdown === false ? "mensual" : opts.salaryMode;
    if (effectiveSalaryMode === "integral") {
        renderMono(doc, formatVES(emp.salarioIntegral), marginRight, y + 5.5, 10.5, true, COLORS.ink, "right");
        renderMono(doc, `Base: ${formatVES(emp.salarioMensual)}`, marginRight, y + 11, 8, false, COLORS.muted, "right");
    } else {
        renderMono(doc, formatVES(emp.salarioMensual), marginRight, y + 5.5, 10.5, true, COLORS.ink, "right");
        renderMono(doc, "Salario Base Mensual", marginRight, y + 11, 8, false, COLORS.muted, "right");
    }

    y += 18;

    // ── SECTIONS ──────────────────────────────────────────────────────────
    const vis = opts.pdfVisibility;

    // Filter earning lines by visibility flags before rendering
    const filteredEarningLines = vis
        ? emp.earningLines.filter((l) => {
              const isOvertime = l.label.startsWith("H.E.");
              if (isOvertime && vis.showOvertime === false) return false;
              return true;
          })
        : emp.earningLines;

    if (!vis || vis.showEarnings !== false) {
        y = drawSection(doc, marginLeft, y, contentWidth, "Asignaciones", filteredEarningLines, emp.totalEarnings, "+", COLORS.ink);
    }

    if (!vis || vis.showBonuses !== false) {
        y = drawSection(doc, marginLeft, y, contentWidth, "Bonificaciones", emp.bonusLines, emp.totalBonuses, "+", COLORS.ink);
    }

    if (!vis || vis.showDeductions !== false) {
        y = drawSection(doc, marginLeft, y, contentWidth, "Deducciones", emp.deductionLines, emp.totalDeductions, "-", COLORS.inkMed);
    }

    y += 6;

    // ── NET SUMMARY ───────────────────────────────────────────────────────
    fill(doc, marginLeft, y, contentWidth, 16, COLORS.rowAlt);
    
    // Neto VES — prominent
    renderText(doc, "NETO A COBRAR (VES)", marginLeft + 4, y + 9.5, 11, true, COLORS.ink);
    renderMono(doc, formatVES(emp.net), marginRight - 4, y + 10, 17, true, COLORS.ink, "right");
    y += 16;
    hline(doc, marginLeft, y, contentWidth, COLORS.borderStr, 0.8);
    y += 8;

    // ── LEGAL NOTE ────────────────────────────────────────────────────────
    const legal =
        "El presente recibo acredita el pago de los haberes correspondientes al período indicado, " +
        "de conformidad con la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). " +
        "Ambas partes declaran su conformidad con los montos reflejados en este documento.";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
    const legalLines: string[] = doc.splitTextToSize(legal, contentWidth);
    legalLines.forEach((line: string, i: number) => {
        doc.text(line, marginLeft, y + i * 4);
    });

    y += 20;

    // ── SIGNATURES ────────────────────────────────────────────────────────
    y = drawSignatures(doc, marginLeft, contentWidth, y);

    drawFooter(doc, pageWidth, pageHeight, opts.companyName, opts.periodLabel ?? fmtDate(opts.payrollDate));
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function generatePayrollPdf(employees: PdfEmployeeResult[], opts: PdfPayrollOptions): Promise<void> {
    const active = employees.filter((e) => e.estado === "activo");
    if (active.length === 0) return;

    // Auto-generar serial si no se pasó uno
    const optsWithSerial: PdfPayrollOptions = {
        ...opts,
        receiptSerial: opts.receiptSerial ?? makePayrollSerial(opts.periodStart ?? opts.payrollDate),
    };

    const logoBase64 = (opts.showLogoInPdf && opts.logoUrl)
        ? await loadImageAsBase64(opts.logoUrl).catch(() => null)
        : null;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    active.forEach((emp, i) => drawReceipt(doc, emp, optsWithSerial, i === 0, i, logoBase64));
    doc.save(`nomina_${opts.payrollDate.replaceAll("-", "")}.pdf`);
}
