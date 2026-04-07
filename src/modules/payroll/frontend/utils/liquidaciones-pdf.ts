// liquidaciones-pdf.ts
// Genera recibos individuales de liquidación laboral (LOTTT Art. 92, 142 y ss.)
// Paleta visual unificada con payroll-pdf.ts

import jsPDF from "jspdf";
import { loadImageAsBase64 } from "./pdf-image-helper";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LiquidacionLine {
    label:      string;
    dias?:      number;
    formula?:   string;   // fórmula de cálculo (reemplaza la columna salario diario)
    salario?:   number;   // salario diario usado (se muestra si no hay formula)
    monto:      number;
    highlight?: "amber";  // indemnización
}

export interface LiquidacionEmployee {
    nombre:          string;
    cedula:          string;
    cargo:           string;
    fechaIngreso:    string;   // ISO YYYY-MM-DD
    fechaEgreso:     string;   // ISO YYYY-MM-DD
    antiguedadAnios: number;
    antiguedadDias:  number;   // días del último año parcial
    motivo:          "renuncia" | "despido_justificado" | "despido_injustificado";
    lines:           LiquidacionLine[];
    total:           number;
}

export interface LiquidacionOptions {
    companyName:    string;
    companyId?:     string;
    fechaDoc:       string;   // ISO YYYY-MM-DD
    bcvRate?:       number;
    logoUrl?:       string;
    showLogoInPdf?: boolean;
}

// ── Palette (Clean Monochromo) ────────────────────────────────────────────────
type RGB = [number, number, number];
const C = {
    ink:       [32,  32,  40]  as RGB,
    inkMed:    [70,  70,  80]  as RGB,
    muted:     [140, 140, 150] as RGB,
    border:    [230, 230, 235] as RGB,
    borderStr: [190, 190, 200] as RGB,
    bg:        [255, 255, 255] as RGB,
    rowAlt:    [248, 248, 252] as RGB,
    white:     [255, 255, 255] as RGB,
    primary:   [217, 58,  16]  as RGB,  // Konta orange accents
    amber:     [220, 38,  38]  as RGB,  // Error/Amber Highlight
};

// ── Primitives ────────────────────────────────────────────────────────────────
type Doc = jsPDF;

const fill = (doc: Doc, x: number, y: number, w: number, h: number, c: RGB) => {
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(x, y, w, h, "F");
};

const hline = (doc: Doc, x: number, y: number, w: number, c: RGB = C.border, lw = 0.25) => {
    doc.setLineDashPattern([], 0);
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(lw);
    doc.line(x, y, x + w, y);
};

const t = (doc: Doc, text: string, x: number, y: number, size: number, bold: boolean, color: RGB, align: "left" | "center" | "right" = "left", maxW?: number, font: "helvetica" | "courier" = "helvetica") => {
    doc.setFont(font, bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const opts: Record<string, unknown> = { align };
    if (maxW) opts.maxWidth = maxW;
    doc.text(text, x, y, opts);
};

const lbl = (doc: Doc, text: string, x: number, y: number, align: "left" | "right" | "center" = "left", color: RGB = C.muted) =>
    t(doc, text.toUpperCase(), x, y, 6, true, color, align, undefined, "helvetica");

const tm = (doc: Doc, text: string, x: number, y: number, size: number, bold: boolean, c: RGB, align: "left" | "right" | "center" = "left") => 
    t(doc, text, x, y, size, bold, c, align, undefined, "courier");

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtVES = (n: number) => "Bs. " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    return `${parseInt(d)} ${meses[parseInt(m) - 1]} ${y}`.toUpperCase();
};
const MOTIVO_LABEL: Record<string, string> = { renuncia: "Renuncia Voluntaria", despido_justificado: "Despido Justificado", despido_injustificado: "Despido Injustificado" };

// ── Receipt renderer ──────────────────────────────────────────────────────────
function drawReceipt(doc: Doc, emp: LiquidacionEmployee, opts: LiquidacionOptions, isFirst: boolean, logoBase64?: string | null) {
    if (!isFirst) doc.addPage();
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 16;
    const MR = PW - 16;
    const W  = MR - ML;

    fill(doc, 0, 0, PW, PH, C.bg);

    // ── HEADER ────────────────────────────────────────────────────────────
    let topY = 20;
    if (logoBase64) {
        try { doc.addImage(logoBase64, "JPEG", ML, topY - 5, 28, 11); } catch { /* */ }
        t(doc, opts.companyName.toUpperCase(), ML + 32, topY, 13, true, C.ink);
        if (opts.companyId) tm(doc, `ID ${opts.companyId}`, ML + 32, topY + 4, 7, false, C.muted, "left");
    } else {
        t(doc, opts.companyName.toUpperCase(), ML, topY, 13, true, C.ink);
        if (opts.companyId) tm(doc, `ID ${opts.companyId}`, ML, topY + 4, 7, false, C.muted, "left");
    }

    t(doc, "CONSTANCIA DE LIQUIDACIÓN", MR, topY - 1, 9, true, C.ink, "right");
    t(doc, "ART. 142 LOTTT — " + (MOTIVO_LABEL[emp.motivo] ?? emp.motivo).toUpperCase(), MR, topY + 3, 6, false, C.muted, "right");

    lbl(doc, "FECHA DE EGRESO", MR, topY + 11, "right");
    tm(doc, fmtDate(emp.fechaEgreso), MR, topY + 15, 9, true, C.inkMed, "right");
    
    lbl(doc, `EMITIDO: ${new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}`, MR, topY + 20, "right");

    let y = topY + 26;
    hline(doc, ML, y, W, C.border, 0.4);
    y += 8;

    // ── EMPLOYEE DATA POINTS ──────────────────────────────────────────────
    const c1x = ML;
    const c2x = ML + W * 0.40;
    const c3x = ML + W * 0.70;

    lbl(doc, "Trabajador", c1x, y);
    t(doc, emp.nombre.toUpperCase(), c1x, y + 5, 9, true, C.ink, "left", c2x - c1x - 4);
    if (emp.cargo) t(doc, emp.cargo.toUpperCase(), c1x, y + 9, 6.5, false, C.muted);
    tm(doc, "CI " + emp.cedula, c1x, y + 13.5, 7.5, true, C.inkMed, "left");

    lbl(doc, "Antigüedad", c2x, y);
    const antStr = `${emp.antiguedadAnios}a ${emp.antiguedadDias % 365}d`;
    tm(doc, antStr, c2x, y + 5, 8.5, true, C.ink, "left");
    tm(doc, `Ingreso: ${fmtDate(emp.fechaIngreso)}`, c2x, y + 9.5, 6.5, false, C.inkMed, "left");

    lbl(doc, "Salario Base / Día", c3x, y);
    const salDiario = emp.lines.length > 0 && emp.lines[0].salario && emp.lines[0].salario > 0
        ? emp.lines[0].salario
        : (emp.total > 0 ? emp.total / 30 : 0);
    tm(doc, salDiario > 0 ? fmtVES(salDiario) : "—", c3x, y + 5, 8.5, true, C.ink, "left");

    y += 18;
    hline(doc, ML, y, W, C.border, 0.3);
    y += 8;

    // ── TABLE HEADER ──────────────────────────────────────────────────────
    const COL_DIAS  = MR - 50;
    const COL_MONTO = MR;

    lbl(doc, "CONCEPTO / CÁLCULO", ML, y, "left", C.inkMed);
    lbl(doc, "DÍAS", COL_DIAS, y, "center", C.inkMed);
    lbl(doc, "MONTO ASIGNADO", COL_MONTO, y, "right", C.inkMed);

    y += 3;
    hline(doc, ML, y, W, C.borderStr, 0.4);
    y += 6;

    // ── CONCEPT ROWS ──────────────────────────────────────────────────────
    const ROW_H = 10;
    emp.lines.forEach((line) => {
        const isAmber = line.highlight === "amber";
        const cTitle  = isAmber ? C.amber : C.ink;

        t(doc, line.label.toUpperCase(), ML, y, 7.5, true, cTitle);
        if (line.formula) {
            t(doc, line.formula.toUpperCase(), ML, y + 3.5, 5.5, false, C.muted);
        }

        if (line.dias !== undefined) tm(doc, String(line.dias), COL_DIAS, y + 1, 8, true, C.muted, "center");
        tm(doc, fmtVES(line.monto), COL_MONTO, y + 1, 8.5, true, cTitle, "right");

        y += ROW_H;
        hline(doc, ML, y - 4, W, C.border, 0.2); // Faint line between concepts
    });

    y += 6;

    // ── TOTAL BAR ─────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 14, C.rowAlt);
    hline(doc, ML, y, W, C.borderStr, 0.4);
    hline(doc, ML, y + 14, W, C.borderStr, 0.4);

    lbl(doc, "LÍQUIDO A RECIBIR", ML + 4, y + 8, "left", C.inkMed);
    tm(doc, fmtVES(emp.total), MR - 4, y + 9.5, 12, true, C.ink, "right");

    y += 24;

    // ── LEGAL NOTE ────────────────────────────────────────────────────────
    const nota =
        "El presente documento certifica la liquidación y pago de todas las acreencias laborales aplicables al trabajador indicado, calculadas conforme a la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). Incluye prestaciones sociales, utilidades, vacaciones y afines" +
        (emp.motivo === "despido_injustificado" ? " e indemnización por despido injustificado (Art. 92)." : ".");
    
    t(doc, nota, ML, y, 6, false, C.muted, "left", W, "helvetica");

    // ── SIGNATURES ────────────────────────────────────────────────────────
    const sigW = 60;
    const sigY = PH - 38;

    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.setDrawColor(C.borderStr[0], C.borderStr[1], C.borderStr[2]);
    doc.setLineWidth(0.3);
    
    // Employer
    doc.line(ML + 5, sigY, ML + 5 + sigW, sigY);
    lbl(doc, "REPRESENTANTE DEL EMPLEADOR", ML + 5 + sigW / 2, sigY + 5, "center");
    if (opts.companyName) t(doc, opts.companyName.toUpperCase(), ML + 5 + sigW / 2, sigY + 9, 6, false, C.muted, "center", sigW);

    // Employee
    const cxRight = MR - 5 - sigW / 2;
    doc.line(MR - 5 - sigW, sigY, MR - 5, sigY);

    lbl(doc, "FIRMA DEL TRABAJADOR", cxRight, sigY + 5, "center");
    tm(doc, "CI " + emp.cedula, cxRight, sigY + 9, 7, false, C.muted, "center");
    
    doc.setLineDashPattern([], 0);

    // ── FOOTER ────────────────────────────────────────────────────────────
    hline(doc, ML, PH - 14, W, C.border, 0.4);
    lbl(doc, "DOCUMENTO DE CONFORMIDAD · ORIGINAL", ML, PH - 9, "left", C.muted);
    
    const rnd = Math.random().toString(36).substring(2, 6).toUpperCase();
    tm(doc, "ID " + rnd, MR, PH - 9, 6, true, C.muted, "right");
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function generateLiquidacionPdf(employees: LiquidacionEmployee[], opts: LiquidacionOptions): Promise<void> {
    if (employees.length === 0) return;

    const logoBase64 = (opts.showLogoInPdf && opts.logoUrl)
        ? await loadImageAsBase64(opts.logoUrl).catch(() => null)
        : null;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    employees.forEach((emp, i) => drawReceipt(doc, emp, opts, i === 0, logoBase64));
    const slug = opts.fechaDoc.replaceAll("-", "");
    doc.save(`liquidaciones_${slug}.pdf`);
}
