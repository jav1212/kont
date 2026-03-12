// src/frontend/utils/payroll-pdf.ts
//
// Recibos de nomina — layout vertical por seccion, sin solapamiento.
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
    payrollDate:    string;
    bcvRate:        number;
    mondaysInMonth: number;
}

// ── Palette ───────────────────────────────────────────────────────────────────

type RGB = [number, number, number];

const C = {
    ink:       [17,  17,  17]  as RGB,
    inkMed:    [55,  55,  65]  as RGB,
    muted:     [130, 130, 140] as RGB,
    border:    [220, 220, 226] as RGB,
    borderMed: [180, 180, 188] as RGB,
    bg:        [248, 248, 250] as RGB,
    rowAlt:    [242, 242, 246] as RGB,
    white:     [255, 255, 255] as RGB,
    primary:   [91,  91,  214] as RGB,
    primaryBg: [237, 237, 252] as RGB,
    green:     [21,  94,  48]  as RGB,
    greenBg:   [240, 253, 244] as RGB,
    greenBd:   [187, 235, 200] as RGB,
    red:       [153, 27,  27]  as RGB,
    redBg:     [254, 242, 242] as RGB,
    redBd:     [254, 202, 202] as RGB,
    netBg:     [22,  22,  30]  as RGB,
};

// ── Primitives ────────────────────────────────────────────────────────────────

type Doc = jsPDF;

const fill = (doc: Doc, x: number, y: number, w: number, h: number, c: RGB) => {
    doc.setFillColor(c[0], c[1], c[2]); doc.rect(x, y, w, h, "F");
};

const box = (doc: Doc, x: number, y: number, w: number, h: number, fillC: RGB, strokeC: RGB, lw = 0.2) => {
    doc.setFillColor(fillC[0], fillC[1], fillC[2]);
    doc.setDrawColor(strokeC[0], strokeC[1], strokeC[2]);
    doc.setLineWidth(lw);
    doc.rect(x, y, w, h, "FD");
};

const hline = (doc: Doc, x: number, y: number, w: number, c: RGB = C.border, lw = 0.25) => {
    doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(lw); doc.line(x, y, x + w, y);
};

const vline = (doc: Doc, x: number, y1: number, y2: number, c: RGB = C.border, lw = 0.2) => {
    doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(lw); doc.line(x, y1, x, y2);
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
    t(doc, text.toUpperCase(), x, y, 5.5, false, C.muted, align);

// ── Section: full-width table for one group of lines ─────────────────────────

interface SectionOpts {
    title:    string;
    lines:    PdfComputedLine[];
    total:    number;
    sign:     "+" | "-";
    accentC:  RGB;
    accentBg: RGB;
    accentBd: RGB;
    amtColor: RGB;
}

function drawSection(doc: Doc, x: number, y: number, w: number, opts: SectionOpts): number {
    const { title, lines, total, sign, accentC, accentBg, accentBd, amtColor } = opts;

    // ── Section header ────────────────────────────────────────────────────
    const HDR_H = 7;
    fill(doc, x, y, w, HDR_H, C.bg);
    hline(doc, x, y,           w, C.border, 0.3);
    hline(doc, x, y + HDR_H,   w, C.border, 0.3);

    // Left accent strip
    fill(doc, x, y, 2.5, HDR_H, accentC);

    t(doc, title.toUpperCase(), x + 5, y + 4.8, 6.5, true, C.inkMed);

    // Right: total preview
    t(doc, `Total: ${fmtVES(total)}`, x + w - 3, y + 4.8, 6.5, true, amtColor, "right");

    y += HDR_H;

    if (lines.length === 0) {
        fill(doc, x, y, w, 6, C.white);
        hline(doc, x, y + 6, w, C.border, 0.15);
        t(doc, "Sin conceptos", x + 4, y + 4, 6, false, C.muted);
        return y + 6;
    }

    // ── Column layout (all relative to x, within width w) ────────────────
    //   Label col:   x+4  .. SEP1   (~52% of w)
    //   Formula col: SEP1 .. SEP2   (~28% of w)
    //   Amount col:  SEP2 .. x+w-3  (~20% of w, right-aligned)
    const SUB_H   = 5;
    const LABEL_X = x + 4;
    const SEP1_X  = x + w * 0.52;          // divider before formula col
    const SEP2_X  = x + w * 0.80;          // divider before amount col
    const AMT_X   = x + w - 3;             // right-align anchor (inside margin)

    const LABEL_MAX   = SEP1_X - LABEL_X - 3;
    const FORMULA_MAX = SEP2_X - SEP1_X - 3;

    fill(doc, x, y, w, SUB_H, C.rowAlt);
    hline(doc, x, y + SUB_H, w, C.border, 0.15);
    lbl(doc, "Concepto", LABEL_X,       y + 3.6);
    lbl(doc, "Formula",  SEP1_X + 2,    y + 3.6);
    lbl(doc, "Monto",    AMT_X,         y + 3.6, "right");
    y += SUB_H;

    // ── Data rows ─────────────────────────────────────────────────────────
    const ROW_H = 6;
    lines.forEach((line, i) => {
        const bg: RGB = i % 2 === 0 ? C.white : C.rowAlt;
        fill(doc, x, y, w, ROW_H, bg);
        hline(doc, x, y + ROW_H, w, C.border, 0.1);

        // Vertical separators
        vline(doc, SEP1_X, y, y + ROW_H, C.border, 0.1);
        vline(doc, SEP2_X, y, y + ROW_H, C.border, 0.1);

        // Concept label — left col
        t(doc, line.label, LABEL_X, y + 4.1, 6.5, false, C.inkMed, "left", LABEL_MAX);

        // Formula — middle col
        t(doc, line.formula, SEP1_X + 2, y + 4.1, 5.5, false, C.muted, "left", FORMULA_MAX);

        // Amount — right, right-aligned
        t(doc, `${sign} ${fmtVES(line.amount)}`, AMT_X, y + 4.1, 6.5, true, amtColor, "right");

        y += ROW_H;
    });

    // ── Subtotal row ──────────────────────────────────────────────────────
    box(doc, x, y, w, 7, accentBg, accentBd, 0.25);
    fill(doc, x, y, 2.5, 7, accentC);
    t(doc, "SUBTOTAL", x + 5, y + 4.8, 6, false, accentC);
    t(doc, fmtVES(total), x + w - 3, y + 5, 8, true, accentC, "right");
    y += 7;

    return y;
}

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtVES = (n: number) =>
    "Bs. " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtUSD = (n: number) =>
    "$ " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" }).toUpperCase();
};

// ── One receipt ───────────────────────────────────────────────────────────────

function drawReceipt(doc: Doc, emp: PdfEmployeeResult, opts: PdfPayrollOptions, isFirst: boolean) {
    if (!isFirst) doc.addPage();

    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 14;
    const MR = PW - 14;
    const W  = MR - ML;

    // ── PAGE BG ───────────────────────────────────────────────────────────
    fill(doc, 0, 0, PW, PH, C.bg);

    // ── HEADER ───────────────────────────────────────────────────────────
    fill(doc, 0, 0, PW, 34, C.ink);
    fill(doc, 0, 32, PW, 2, C.primary);

    // Left: company name + RIF + doc title
    t(doc, opts.companyName, ML, 10, 12, true, C.white);
    if (opts.companyId) t(doc, `RIF: ${opts.companyId}`, ML, 17, 7, false, [160, 160, 175] as RGB);
    t(doc, "RECIBO DE PAGO DE NOMINA", ML, 24, 6.5, false, [110, 110, 130] as RGB);

    // Right side
    lbl(doc, "Fecha de pago", MR, 9, "right");
    t(doc, fmtDate(opts.payrollDate), MR, 17, 8.5, true, C.white, "right");
    t(doc, `Tasa BCV: Bs. ${opts.bcvRate.toLocaleString("es-VE", { minimumFractionDigits: 2 })} / USD`, MR, 24, 6, false, [160, 160, 175] as RGB, "right");

    let y = 40;

    // ── EMPLOYEE CARD ─────────────────────────────────────────────────────
    box(doc, ML, y, W, 20, C.white, C.border, 0.3);

    // Left accent strip
    fill(doc, ML, y, 3, 20, C.primary);

    // Name + cedula
    lbl(doc, "Empleado", ML + 6, y + 5.5);
    t(doc, emp.nombre, ML + 6, y + 12, 10, true, C.ink, "left", W * 0.48);
    t(doc, emp.cedula, ML + 6, y + 17.5, 6.5, false, C.muted);

    // Vertical divider
    vline(doc, ML + W * 0.52, y + 3, y + 17, C.border);

    // Cargo
    const cx = ML + W * 0.54;
    lbl(doc, "Cargo", cx, y + 5.5);
    t(doc, emp.cargo, cx, y + 12, 8, false, C.inkMed, "left", W * 0.28);

    // Salary
    lbl(doc, "Salario Base Mensual", MR - 3, y + 5.5, "right");
    t(doc, fmtUSD(emp.salarioMensual), MR - 3, y + 12, 10, true, C.primary, "right");
    lbl(doc, "USD mensual", MR - 3, y + 17.5, "right");

    y += 25;

    // ── SECTIONS (vertical stack) ─────────────────────────────────────────

    y = drawSection(doc, ML, y, W, {
        title:    "Asignaciones",
        lines:    emp.earningLines,
        total:    emp.totalEarnings,
        sign:     "+",
        accentC:  C.green,
        accentBg: C.greenBg,
        accentBd: C.greenBd,
        amtColor: C.green,
    });

    y += 3;

    y = drawSection(doc, ML, y, W, {
        title:    "Bonificaciones",
        lines:    emp.bonusLines,
        total:    emp.totalBonuses,
        sign:     "+",
        accentC:  C.primary,
        accentBg: C.primaryBg,
        accentBd: [180, 180, 230] as RGB,
        amtColor: C.primary,
    });

    y += 3;

    y = drawSection(doc, ML, y, W, {
        title:    "Deducciones",
        lines:    emp.deductionLines,
        total:    emp.totalDeductions,
        sign:     "-",
        accentC:  C.red,
        accentBg: C.redBg,
        accentBd: C.redBd,
        amtColor: C.red,
    });

    y += 5;

    // ── NET SUMMARY ───────────────────────────────────────────────────────
    fill(doc, ML, y, W, 26, C.netBg);
    // Top border: primary
    doc.setDrawColor(C.primary[0], C.primary[1], C.primary[2]); doc.setLineWidth(0.8);
    doc.line(ML, y, MR, y);

    const ny = y;

    // Bruto
    lbl(doc, "Total Bruto (VES)", ML + 6, ny + 7);
    t(doc, fmtVES(emp.gross), ML + 6, ny + 15, 9, true, [200, 200, 210] as RGB);

    // Separator
    vline(doc, ML + W * 0.34, ny + 4, ny + 22, [60, 60, 80] as RGB, 0.3);

    // Deducciones
    const d2x = ML + W * 0.36;
    lbl(doc, "Total Deducciones", d2x, ny + 7);
    t(doc, `- ${fmtVES(emp.totalDeductions)}`, d2x, ny + 15, 9, true, [220, 100, 100] as RGB);

    // Separator
    vline(doc, ML + W * 0.64, ny + 2, ny + 24, C.primary, 0.4);

    // Neto — prominent
    const nx = ML + W * 0.66;
    lbl(doc, "Neto a Cobrar", nx, ny + 6);
    t(doc, fmtVES(emp.net), nx, ny + 17, 14, true, C.primary);

    // USD equiv
    lbl(doc, `Equiv. ${fmtUSD(emp.netUSD)}`, MR - 3, ny + 23, "right");

    y += 30;

    // ── LEGAL NOTE ────────────────────────────────────────────────────────
    hline(doc, ML, y, W, C.border, 0.3);
    y += 5;

    const legal =
        "El presente recibo acredita el pago de los haberes correspondientes al periodo indicado, " +
        "de conformidad con la Ley Organica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). " +
        "Ambas partes declaran su conformidad con los montos reflejados en este documento.";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    const legalLines: string[] = doc.splitTextToSize(legal, W - 4);
    legalLines.forEach((line: string, i: number) => {
        doc.text(line, ML + 2, y + 4 + i * 3.8);
    });
    y += legalLines.length * 3.8 + 8;

    // ── SIGNATURES ────────────────────────────────────────────────────────
    const sigY = PH - 36;
    const sigW = 72;

    // Employer signature box
    const sigH   = 24;
    const sigPad = 5;
    box(doc, ML, sigY, sigW, sigH, C.white, C.border, 0.25);
    // Name centered at top
    t(doc, opts.companyName, ML + sigW / 2, sigY + 7, 7, true, C.inkMed, "center", sigW - 10);
    if (opts.companyId) t(doc, opts.companyId, ML + sigW / 2, sigY + 12, 6, false, C.muted, "center");
    // Signature line
    hline(doc, ML + sigPad, sigY + 17, sigW - sigPad * 2, C.borderMed, 0.4);
    // Label centered below line
    lbl(doc, "Firma y Sello del Empleador", ML + sigW / 2, sigY + 22);

    // Employee signature box
    const esx = MR - sigW;
    box(doc, esx, sigY, sigW, sigH, C.white, C.border, 0.25);
    // Name centered at top
    t(doc, emp.nombre, esx + sigW / 2, sigY + 7, 7, true, C.inkMed, "center", sigW - 10);
    t(doc, emp.cedula, esx + sigW / 2, sigY + 12, 6, false, C.muted, "center");
    // Signature line
    hline(doc, esx + sigPad, sigY + 17, sigW - sigPad * 2, C.borderMed, 0.4);
    // Label centered below line
    lbl(doc, "Firma del Trabajador / Conforme", esx + sigW / 2, sigY + 22);

    // ── FOOTER ────────────────────────────────────────────────────────────
    fill(doc, 0, PH - 10, PW, 10, C.ink);
    t(doc,
        `${opts.companyName}  |  Generado el ${new Date().toLocaleDateString("es-VE")}  |  Documento Confidencial`,
        PW / 2, PH - 4.5, 5.5, false, [120, 120, 135] as RGB, "center"
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