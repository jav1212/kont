// src/frontend/utils/payroll-pdf.ts
//
// Recibos de nómina — layout vertical por sección.
// Requiere: npm install jspdf

import jsPDF from "jspdf";

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
}

export interface PdfPayrollOptions {
    companyName:    string;
    companyId?:     string;
    payrollDate:    string;   // ISO end date
    periodStart?:   string;   // ISO start date
    periodLabel?:   string;   // "1–15 de Marzo 2026"
    bcvRate:        number;
    mondaysInMonth: number;
}

// ── Palette ───────────────────────────────────────────────────────────────────

type RGB = [number, number, number];

const C = {
    ink:       [15,  15,  20]  as RGB,
    inkMed:    [50,  50,  60]  as RGB,
    muted:     [120, 120, 132] as RGB,
    border:    [218, 218, 226] as RGB,
    borderMed: [175, 175, 185] as RGB,
    bg:        [246, 246, 250] as RGB,
    rowAlt:    [240, 240, 245] as RGB,
    white:     [255, 255, 255] as RGB,
    primary:   [88,  86,  214] as RGB,
    primaryLt: [232, 232, 252] as RGB,
    primaryBd: [175, 173, 238] as RGB,
    green:     [22,  101, 52]  as RGB,
    greenLt:   [240, 253, 244] as RGB,
    greenBd:   [187, 235, 200] as RGB,
    red:       [153, 27,  27]  as RGB,
    redLt:     [254, 242, 242] as RGB,
    redBd:     [254, 202, 202] as RGB,
    headerBg:  [18,  18,  26]  as RGB,
    headerSub: [30,  30,  42]  as RGB,
    netBg:     [18,  18,  26]  as RGB,
    accent:    [110, 108, 230] as RGB,
};

// ── Primitives ────────────────────────────────────────────────────────────────

type Doc = jsPDF;

const fill = (doc: Doc, x: number, y: number, w: number, h: number, c: RGB) => {
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(x, y, w, h, "F");
};

const box = (doc: Doc, x: number, y: number, w: number, h: number, fc: RGB, sc: RGB, lw = 0.2) => {
    doc.setFillColor(fc[0], fc[1], fc[2]);
    doc.setDrawColor(sc[0], sc[1], sc[2]);
    doc.setLineWidth(lw);
    doc.rect(x, y, w, h, "FD");
};

const hline = (doc: Doc, x: number, y: number, w: number, c: RGB = C.border, lw = 0.25) => {
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(lw);
    doc.line(x, y, x + w, y);
};

const vline = (doc: Doc, x: number, y1: number, y2: number, c: RGB = C.border, lw = 0.2) => {
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(lw);
    doc.line(x, y1, x, y2);
};

const t = (
    doc:   Doc,
    text:  string,
    x:     number,
    y:     number,
    size:  number,
    bold:  boolean,
    color: RGB,
    align: "left" | "center" | "right" = "left",
    maxW?: number,
) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const opts: any = { align };
    if (maxW) opts.maxWidth = maxW;
    doc.text(text, x, y, opts);
};

const lbl = (doc: Doc, text: string, x: number, y: number, align: "left" | "right" | "center" = "left") =>
    t(doc, text.toUpperCase(), x, y, 5, false, C.muted, align);

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtVES = (n: number) =>
    "Bs. " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtUSD = (n: number) =>
    "$ " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d)
        .toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" })
        .toUpperCase();
};

// ── Section ───────────────────────────────────────────────────────────────────

interface SectionOpts {
    title:    string;
    lines:    PdfComputedLine[];
    total:    number;
    sign:     "+" | "−";
    accentC:  RGB;
    accentLt: RGB;
    accentBd: RGB;
    amtColor: RGB;
}

function drawSection(doc: Doc, x: number, y: number, w: number, opts: SectionOpts): number {
    const { title, lines, total, sign, accentC, accentLt, accentBd, amtColor } = opts;

    // Header
    const HDR_H = 7.5;
    fill(doc, x, y, w, HDR_H, accentLt);
    hline(doc, x, y,         w, accentBd, 0.35);
    hline(doc, x, y + HDR_H, w, accentBd, 0.35);
    fill(doc, x, y, 3, HDR_H, accentC);

    t(doc, title.toUpperCase(), x + 6, y + 5.1, 6.5, true, C.inkMed);
    t(doc, `${sign} ${fmtVES(total)}`, x + w - 3, y + 5.1, 6.5, true, amtColor, "right");

    y += HDR_H;

    if (lines.length === 0) {
        fill(doc, x, y, w, 6.5, C.white);
        hline(doc, x, y + 6.5, w, C.border, 0.15);
        t(doc, "Sin conceptos", x + 6, y + 4.4, 6, false, C.muted);
        return y + 6.5;
    }

    // Column anchors
    const LABEL_X   = x + 6;
    const SEP1_X    = x + w * 0.50;
    const SEP2_X    = x + w * 0.78;
    const AMT_X     = x + w - 4;
    const LABEL_MAX = SEP1_X - LABEL_X - 2;
    const FML_MAX   = SEP2_X - SEP1_X - 3;

    // Sub-header
    const SUB_H = 5;
    fill(doc, x, y, w, SUB_H, C.rowAlt);
    hline(doc, x, y + SUB_H, w, C.border, 0.15);
    lbl(doc, "Concepto",  LABEL_X,    y + 3.4);
    lbl(doc, "Fórmula",   SEP1_X + 3, y + 3.4);
    lbl(doc, "Monto",     AMT_X,      y + 3.4, "right");
    y += SUB_H;

    // Rows
    const ROW_H = 5.5;
    lines.forEach((line, i) => {
        fill(doc, x, y, w, ROW_H, i % 2 === 0 ? C.white : C.rowAlt);
        hline(doc, x, y + ROW_H, w, C.border, 0.1);
        vline(doc, SEP1_X, y, y + ROW_H, C.border, 0.1);
        vline(doc, SEP2_X, y, y + ROW_H, C.border, 0.1);

        t(doc, line.label,   LABEL_X,    y + 3.8, 6.5, false, C.inkMed,  "left", LABEL_MAX);
        t(doc, line.formula, SEP1_X + 3, y + 3.8, 5.5, false, C.muted,   "left", FML_MAX);
        t(doc, fmtVES(line.amount), AMT_X, y + 3.8, 6.5, true, amtColor, "right");

        y += ROW_H;
    });

    // Subtotal
    box(doc, x, y, w, 7, accentLt, accentBd, 0.3);
    fill(doc, x, y, 3, 7, accentC);
    t(doc, "SUBTOTAL", x + 6, y + 4.9, 6, false, accentC);
    t(doc, fmtVES(total), x + w - 4, y + 5.1, 8, true, accentC, "right");
    y += 7;

    return y;
}

// ── Receipt ───────────────────────────────────────────────────────────────────

function drawReceipt(doc: Doc, emp: PdfEmployeeResult, opts: PdfPayrollOptions, isFirst: boolean) {
    if (!isFirst) doc.addPage();

    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 13;
    const MR = PW - 13;
    const W  = MR - ML;

    // ── PAGE BG ───────────────────────────────────────────────────────────
    fill(doc, 0, 0, PW, PH, C.bg);

    // ── HEADER ────────────────────────────────────────────────────────────
    const HDR_H = 38;
    fill(doc, 0, 0, PW, HDR_H, C.headerBg);
    // Bottom accent line
    fill(doc, 0, HDR_H - 2, PW, 2, C.accent);
    // Left color strip
    fill(doc, 0, 0, 4, HDR_H - 2, C.primary);

    // Company
    t(doc, opts.companyName.toUpperCase(), ML + 2, 10, 11, true,  C.white);
    if (opts.companyId) t(doc, `RIF: ${opts.companyId}`, ML + 2, 16.5, 6.5, false, [150, 150, 168] as RGB);
    t(doc, "RECIBO DE PAGO DE NÓMINA", ML + 2, 23, 6, false, [100, 100, 120] as RGB);

    // Right: period + BCV
    const periodStr = opts.periodLabel
        ? opts.periodLabel.toUpperCase()
        : fmtDate(opts.payrollDate);
    lbl(doc, "Período",  MR, 9, "right");
    t(doc, periodStr, MR, 16, 8, true, C.white, "right");
    t(doc,
        `Tasa BCV: Bs. ${opts.bcvRate.toLocaleString("es-VE", { minimumFractionDigits: 2 })} / USD`,
        MR, 22.5, 6, false, [130, 130, 150] as RGB, "right"
    );
    t(doc,
        `Emitido: ${new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}`,
        MR, 29, 5.5, false, [100, 100, 118] as RGB, "right"
    );

    let y = HDR_H + 5;

    // ── EMPLOYEE CARD ─────────────────────────────────────────────────────
    const CARD_H = 22;
    box(doc, ML, y, W, CARD_H, C.white, C.border, 0.3);
    fill(doc, ML, y, 3, CARD_H, C.primary);

    // — Col 1: nombre + cédula
    const c1x = ML + 6;
    const c2x = ML + W * 0.46;
    const c3x = ML + W * 0.72;

    lbl(doc, "Trabajador", c1x, y + 5.5);
    t(doc, emp.nombre, c1x, y + 12, 9.5, true, C.ink, "left", c2x - c1x - 4);
    t(doc, emp.cedula, c1x, y + 18, 6.5, false, C.muted);

    vline(doc, c2x - 2, y + 3, y + 19, C.border);

    // — Col 2: cargo + estado
    lbl(doc, "Cargo / Condición", c2x, y + 5.5);
    t(doc, emp.cargo, c2x, y + 12, 8, false, C.inkMed, "left", c3x - c2x - 4);

    // Estado badge
    const estadoColor: RGB =
        emp.estado === "activo"   ? C.green :
        emp.estado === "inactivo" ? C.red   : [146, 64, 14] as RGB;
    const estadoBg: RGB =
        emp.estado === "activo"   ? C.greenLt :
        emp.estado === "inactivo" ? C.redLt   : [255, 247, 237] as RGB;
    const estadoStr = emp.estado.toUpperCase();
    const badgeW = 20; const badgeH = 5;
    box(doc, c2x, y + 14, badgeW, badgeH, estadoBg, estadoColor, 0.3);
    t(doc, estadoStr, c2x + badgeW / 2, y + 17.5, 5, true, estadoColor, "center");

    vline(doc, c3x - 2, y + 3, y + 19, C.border);

    // — Col 3: salario
    lbl(doc, "Salario Base Mensual", MR - 4, y + 5.5, "right");
    t(doc, fmtVES(emp.salarioMensual), MR - 4, y + 13, 10, true, C.primary, "right");

    y += CARD_H + 5;

    // ── SECTIONS ──────────────────────────────────────────────────────────

    y = drawSection(doc, ML, y, W, {
        title:    "Asignaciones",
        lines:    emp.earningLines,
        total:    emp.totalEarnings,
        sign:     "+",
        accentC:  C.green,
        accentLt: C.greenLt,
        accentBd: C.greenBd,
        amtColor: C.green,
    });

    y += 4;

    y = drawSection(doc, ML, y, W, {
        title:    "Bonificaciones",
        lines:    emp.bonusLines,
        total:    emp.totalBonuses,
        sign:     "+",
        accentC:  C.primary,
        accentLt: C.primaryLt,
        accentBd: C.primaryBd,
        amtColor: C.primary,
    });

    y += 4;

    y = drawSection(doc, ML, y, W, {
        title:    "Deducciones",
        lines:    emp.deductionLines,
        total:    emp.totalDeductions,
        sign:     "−",
        accentC:  C.red,
        accentLt: C.redLt,
        accentBd: C.redBd,
        amtColor: C.red,
    });

    y += 6;

    // ── NET SUMMARY ───────────────────────────────────────────────────────
    const NET_H = 28;
    fill(doc, ML, y, W, NET_H, C.netBg);
    // Top accent
    doc.setDrawColor(C.accent[0], C.accent[1], C.accent[2]);
    doc.setLineWidth(1);
    doc.line(ML, y, MR, y);

    // 4-column layout: Bruto | Deducciones | sep | Neto VES | Neto USD
    const col1x = ML + 6;
    const col2x = ML + W * 0.30;
    const sep1x  = ML + W * 0.56;
    const col3x = sep1x + 6;
    const col4x = MR - 4;

    // Vertical separator
    vline(doc, sep1x, y + 4, y + NET_H - 4, [50, 50, 70] as RGB, 0.5);

    // Bruto
    lbl(doc, "Bruto (VES)", col1x, y + 8);
    t(doc, fmtVES(emp.gross), col1x, y + 17, 9, true, [190, 190, 205] as RGB);

    // Deducciones
    lbl(doc, "Deducciones", col2x, y + 8);
    t(doc, `− ${fmtVES(emp.totalDeductions)}`, col2x, y + 17, 9, true, [220, 100, 105] as RGB);

    // Neto VES — prominent
    lbl(doc, "Neto a Cobrar", col3x, y + 6);
    t(doc, fmtVES(emp.net), col3x, y + 19, 14, true, C.accent);

    // Neto USD — subtle
    lbl(doc, `Equiv. USD`, col4x, y + 20, "right");
    t(doc, fmtUSD(emp.netUSD), col4x, y + 26, 7, false, [130, 128, 200] as RGB, "right");

    y += NET_H + 6;

    // ── LEGAL NOTE ────────────────────────────────────────────────────────
    hline(doc, ML, y, W, C.border, 0.25);
    y += 4;

    const legal =
        "El presente recibo acredita el pago de los haberes correspondientes al período indicado, " +
        "de conformidad con la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). " +
        "Ambas partes declaran su conformidad con los montos reflejados en este documento.";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    const legalLines: string[] = doc.splitTextToSize(legal, W);
    legalLines.forEach((line: string, i: number) => {
        doc.text(line, ML, y + 3.5 + i * 3.5);
    });

    // ── SIGNATURES ────────────────────────────────────────────────────────
    const sigY  = PH - 38;
    const sigW  = 75;
    const sigH  = 24;
    const sigPd = 6;

    // Employer
    box(doc, ML, sigY, sigW, sigH, C.white, C.border, 0.25);
    fill(doc, ML, sigY, sigW, 1.5, C.primary);
    t(doc, opts.companyName, ML + sigW / 2, sigY + 9, 7, true, C.inkMed, "center", sigW - 10);
    if (opts.companyId) t(doc, opts.companyId, ML + sigW / 2, sigY + 14, 5.5, false, C.muted, "center");
    hline(doc, ML + sigPd, sigY + 19, sigW - sigPd * 2, C.borderMed, 0.4);
    lbl(doc, "Firma y Sello del Empleador", ML + sigW / 2, sigY + 23, "center");

    // Employee
    const esx = MR - sigW;
    box(doc, esx, sigY, sigW, sigH, C.white, C.border, 0.25);
    fill(doc, esx, sigY, sigW, 1.5, C.primary);
    t(doc, emp.nombre, esx + sigW / 2, sigY + 9, 7, true, C.inkMed, "center", sigW - 10);
    t(doc, emp.cedula, esx + sigW / 2, sigY + 14, 5.5, false, C.muted, "center");
    hline(doc, esx + sigPd, sigY + 19, sigW - sigPd * 2, C.borderMed, 0.4);
    lbl(doc, "Firma del Trabajador / Conforme", esx + sigW / 2, sigY + 23, "center");

    // ── FOOTER ────────────────────────────────────────────────────────────
    fill(doc, 0, PH - 10, PW, 10, C.headerBg);
    fill(doc, 0, PH - 10, PW, 1, C.accent);
    t(doc,
        `${opts.companyName.toUpperCase()}  ·  ${opts.periodLabel ?? fmtDate(opts.payrollDate)}  ·  DOCUMENTO CONFIDENCIAL`,
        PW / 2, PH - 4, 5, false, [90, 90, 108] as RGB, "center"
    );
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function generatePayrollPdf(employees: PdfEmployeeResult[], opts: PdfPayrollOptions): void {
    const active = employees.filter((e) => e.estado === "activo");
    if (active.length === 0) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    active.forEach((emp, i) => drawReceipt(doc, emp, opts, i === 0));
    doc.save(`nomina_${opts.payrollDate.replaceAll("-", "")}.pdf`);
}
