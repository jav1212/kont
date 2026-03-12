// src/frontend/utils/payroll-pdf.ts
//
// Recibos de nómina — diseño que replica el sistema visual de la app:
// fondo blanco/gris, acento violeta-indigo, mono uppercase, bordes sutiles.
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
    payrollDate:    string;
    bcvRate:        number;
    mondaysInMonth: number;
}

// ── Design tokens (mirrors the app palette) ───────────────────────────────────

const T = {
    // Backgrounds
    pageBg:     [248, 248, 250] as RGB,   // surface-2 equivalent
    cardBg:     [255, 255, 255] as RGB,   // white card
    rowAlt:     [250, 250, 252] as RGB,   // zebra stripe

    // Borders
    borderL:    [229, 229, 235] as RGB,   // border-light
    borderM:    [210, 210, 218] as RGB,   // border-medium

    // Text
    ink:        [17,  17,  17]  as RGB,   // foreground / text primary
    inkMed:     [55,  55,  65]  as RGB,   // text secondary
    muted:      [140, 140, 150] as RGB,   // text muted / labels

    // Accent — indigo/violet matching the app primary
    primary:    [91,  91,  214] as RGB,   // ~#5B5BD6
    primaryDim: [116, 116, 224] as RGB,   // lighter
    primaryBg:  [237, 237, 252] as RGB,   // tinted bg

    // Semantic
    green:      [22,  101, 52]  as RGB,   // dark green for earnings
    greenBg:    [240, 253, 244] as RGB,
    red:        [153, 27,  27]  as RGB,   // dark red for deductions
    redBg:      [255, 241, 242] as RGB,

    white:      [255, 255, 255] as RGB,
    black:      [0,   0,   0]   as RGB,
};

type RGB = [number, number, number];

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtVES = (n: number) =>
    "Bs. " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtUSD = (n: number) =>
    "$ " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-VE", {
        day: "numeric", month: "long", year: "numeric",
    }).toUpperCase();

// ── Drawing primitives ────────────────────────────────────────────────────────

type Doc = jsPDF;

function fill(doc: Doc, x: number, y: number, w: number, h: number, color: RGB) {
    doc.setFillColor(...color);
    doc.rect(x, y, w, h, "F");
}

function stroke(doc: Doc, x: number, y: number, w: number, h: number, color: RGB, lw = 0.25) {
    doc.setDrawColor(...color);
    doc.setLineWidth(lw);
    doc.rect(x, y, w, h, "S");
}

function card(doc: Doc, x: number, y: number, w: number, h: number) {
    fill(doc, x, y, w, h, T.cardBg);
    stroke(doc, x, y, w, h, T.borderL, 0.25);
}

function hline(doc: Doc, x: number, y: number, w: number, color: RGB = T.borderL, lw = 0.25) {
    doc.setDrawColor(...color);
    doc.setLineWidth(lw);
    doc.line(x, y, x + w, y);
}

function vline(doc: Doc, x: number, y1: number, y2: number, color: RGB = T.borderL, lw = 0.25) {
    doc.setDrawColor(...color);
    doc.setLineWidth(lw);
    doc.line(x, y1, x, y2);
}

function txt(
    doc:  Doc,
    text: string,
    x:    number,
    y:    number,
    opts: {
        size?:   number;
        bold?:   boolean;
        color?:  RGB;
        align?:  "left" | "center" | "right";
        maxW?:   number;
        upper?:  boolean;
    } = {}
) {
    const {
        size  = 7,
        bold  = false,
        color = T.ink,
        align = "left",
        maxW,
        upper = false,
    } = opts;

    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);

    const content = upper ? text.toUpperCase() : text;
    const options: any = { align };
    if (maxW) options.maxWidth = maxW;
    doc.text(content, x, y, options);
}

// Label — small mono uppercase muted  (mirrors: font-mono text-[10px] uppercase tracking-[0.18em])
function label(doc: Doc, text: string, x: number, y: number, align: "left" | "right" = "left") {
    txt(doc, text, x, y, { size: 5.5, color: T.muted, upper: true, align });
}

// ── Section header pill ───────────────────────────────────────────────────────

function sectionHeader(doc: Doc, text: string, x: number, y: number, w: number, accent: RGB) {
    // Left accent bar
    doc.setFillColor(...accent);
    doc.rect(x, y, 2, 6, "F");

    // Rest of header bg
    fill(doc, x + 2, y, w - 2, 6, T.pageBg);
    stroke(doc, x, y, w, 6, T.borderL, 0.2);

    txt(doc, text, x + 5, y + 4.2, { size: 6, bold: true, color: T.inkMed, upper: true });
}

// ── Lines table ───────────────────────────────────────────────────────────────

function linesTable(
    doc:      Doc,
    lines:    PdfComputedLine[],
    x:        number,
    y:        number,
    w:        number,
    sign:     "+" | "-",
    amtColor: RGB,
): number {
    const ROW_H  = 5.8;
    const LABEL_W  = w * 0.45;
    const FORMULA_W = w * 0.30;
    // amount takes the rest

    if (lines.length === 0) {
        fill(doc, x, y, w, ROW_H, T.cardBg);
        stroke(doc, x, y, w, ROW_H, T.borderL, 0.15);
        txt(doc, "Sin conceptos", x + 3, y + 3.8, { size: 6, color: T.muted });
        return y + ROW_H;
    }

    lines.forEach((line, i) => {
        const bg: RGB = i % 2 === 0 ? T.cardBg : T.rowAlt;
        fill(doc, x, y, w, ROW_H, bg);
        stroke(doc, x, y, w, ROW_H, T.borderL, 0.15);

        // Label
        txt(doc, line.label, x + 2.5, y + 3.8, {
            size: 6.5, color: T.inkMed, maxW: LABEL_W - 3,
        });

        // Formula — muted
        txt(doc, line.formula, x + LABEL_W + 1, y + 3.5, {
            size: 5.5, color: T.muted, maxW: FORMULA_W - 2,
        });

        // Amount
        txt(doc, `${sign} ${fmtVES(line.amount)}`, x + w - 2.5, y + 3.8, {
            size: 7, bold: true, color: amtColor, align: "right",
        });

        y += ROW_H;
    });

    return y;
}

// ── One receipt page ──────────────────────────────────────────────────────────

function drawReceipt(doc: Doc, emp: PdfEmployeeResult, opts: PdfPayrollOptions, isFirst: boolean) {
    if (!isFirst) doc.addPage();

    const PW = doc.internal.pageSize.getWidth();   // 210mm
    const PH = doc.internal.pageSize.getHeight();  // 297mm
    const ML = 14;
    const MR = PW - 14;
    const W  = MR - ML;

    // ── PAGE BACKGROUND ───────────────────────────────────────────────────
    fill(doc, 0, 0, PW, PH, T.pageBg);

    // ── HEADER CARD ───────────────────────────────────────────────────────
    card(doc, ML, 10, W, 22);

    // Left: violet accent strip
    doc.setFillColor(...T.primary);
    doc.rect(ML, 10, 3, 22, "F");

    // Company name
    txt(doc, opts.companyName, ML + 7, 19, { size: 11, bold: true, color: T.ink, upper: true });

    // Sub-label
    label(doc, "Recibo de Pago de Nómina", ML + 7, 27);

    // Right: date block
    label(doc, "Fecha de Pago", MR - 4, 16, "right");
    txt(doc, fmtDate(opts.payrollDate), MR - 4, 22, {
        size: 8, bold: true, color: T.primary, align: "right",
    });
    label(doc, `Tasa BCV: Bs. ${opts.bcvRate.toLocaleString("es-VE", { minimumFractionDigits: 2 })} / USD`, MR - 4, 28, "right");

    let y = 37;

    // ── EMPLOYEE IDENTITY ─────────────────────────────────────────────────
    card(doc, ML, y, W, 18);

    // Left block: nombre + cedula
    label(doc, "Empleado", ML + 4, y + 5);
    txt(doc, emp.nombre, ML + 4, y + 11, { size: 9, bold: true, color: T.ink });
    label(doc, emp.cedula, ML + 4, y + 15.5);

    // Vertical divider
    vline(doc, ML + W * 0.52, y + 3, y + 15, T.borderL);

    // Mid block: cargo
    const mid = ML + W * 0.54;
    label(doc, "Cargo", mid, y + 5);
    txt(doc, emp.cargo, mid, y + 11, { size: 8, bold: false, color: T.inkMed, upper: true });

    // Right block: salary
    label(doc, "Salario Base Mensual", MR - 4, y + 5, "right");
    txt(doc, fmtUSD(emp.salarioMensual), MR - 4, y + 11, {
        size: 9, bold: true, color: T.primary, align: "right",
    });
    label(doc, "USD", MR - 4, y + 15.5, "right");

    y += 23;

    // ── COLUMNS: ASIGNACIONES | BONIFICACIONES | DEDUCCIONES ──────────────

    const GAP   = 3.5;
    const COL_W = (W - GAP * 2) / 3;
    const cols  = [
        {
            x:       ML,
            title:   "Asignaciones",
            lines:   emp.earningLines,
            total:   emp.totalEarnings,
            sign:    "+" as const,
            accent:  T.green,
            accentBg: T.greenBg,
            amtColor: T.green,
        },
        {
            x:       ML + COL_W + GAP,
            title:   "Bonificaciones",
            lines:   emp.bonusLines,
            total:   emp.totalBonuses,
            sign:    "+" as const,
            accent:  T.primary,
            accentBg: T.primaryBg,
            amtColor: T.primary,
        },
        {
            x:       ML + (COL_W + GAP) * 2,
            title:   "Deducciones",
            lines:   emp.deductionLines,
            total:   emp.totalDeductions,
            sign:    "-" as const,
            accent:  T.red,
            accentBg: T.redBg,
            amtColor: T.red,
        },
    ];

    // Column section headers
    cols.forEach((col) => {
        sectionHeader(doc, col.title, col.x, y, COL_W, col.accent);
    });
    y += 7;

    // Sub-header row
    cols.forEach((col) => {
        fill(doc, col.x, y, COL_W, 5, T.pageBg);
        stroke(doc, col.x, y, COL_W, 5, T.borderL, 0.15);
        label(doc, "Concepto", col.x + 2.5, y + 3.5);
        label(doc, "Monto", col.x + COL_W - 2.5, y + 3.5, "right");
    });
    y += 5;

    // Data rows — enforce equal height across all columns
    const ROW_H     = 5.8;
    const maxLines  = Math.max(
        emp.earningLines.length,
        emp.bonusLines.length,
        emp.deductionLines.length,
        1,
    );

    for (let r = 0; r < maxLines; r++) {
        const bg: RGB = r % 2 === 0 ? T.cardBg : T.rowAlt;

        cols.forEach((col) => {
            fill(doc, col.x, y, COL_W, ROW_H, bg);
            stroke(doc, col.x, y, COL_W, ROW_H, T.borderL, 0.12);

            const line = col.lines[r];
            if (!line) return;

            txt(doc, line.label, col.x + 2.5, y + 3.8, {
                size: 6.5, color: T.inkMed, maxW: COL_W * 0.5,
            });

            txt(doc, line.formula, col.x + COL_W * 0.5, y + 3.4, {
                size: 5.5, color: T.muted, maxW: COL_W * 0.3,
            });

            txt(doc, `${col.sign} ${fmtVES(line.amount)}`, col.x + COL_W - 2.5, y + 3.8, {
                size: 7, bold: true, color: col.amtColor, align: "right",
            });
        });

        y += ROW_H;
    }

    // Subtotal footer row per column
    cols.forEach((col) => {
        fill(doc, col.x, y, COL_W, 7.5, col.accentBg);
        stroke(doc, col.x, y, COL_W, 7.5, col.accent, 0.3);

        label(doc, "Subtotal", col.x + 2.5, y + 4);
        txt(doc, fmtVES(col.total), col.x + COL_W - 2.5, y + 5.5, {
            size: 8, bold: true, color: col.accent, align: "right",
        });
    });

    y += 11;

    // ── NET SUMMARY ───────────────────────────────────────────────────────
    // Outer card
    card(doc, ML, y, W, 26);

    // Top primary accent bar (4px tall)
    doc.setFillColor(...T.primary);
    doc.rect(ML, y, W, 3, "F");

    // Three info blocks inside
    const netY = y + 3;

    // — Bruto —
    const b1x = ML + 6;
    label(doc, "Total Bruto (VES)", b1x, netY + 7);
    txt(doc, fmtVES(emp.gross), b1x, netY + 14, {
        size: 9, bold: true, color: T.inkMed,
    });

    // — Deducciones —
    vline(doc, ML + W * 0.33, netY + 4, netY + 20, T.borderL);
    const b2x = ML + W * 0.35;
    label(doc, "Total Deducciones", b2x, netY + 7);
    txt(doc, `- ${fmtVES(emp.totalDeductions)}`, b2x, netY + 14, {
        size: 9, bold: true, color: T.red,
    });

    // — Neto — (highlighted)
    vline(doc, ML + W * 0.62, netY + 2, netY + 22, T.primary, 0.4);
    const b3x = ML + W * 0.64;
    label(doc, "Neto a Cobrar", b3x, netY + 6);
    txt(doc, fmtVES(emp.net), b3x, netY + 15, {
        size: 13, bold: true, color: T.primary,
    });
    label(doc, `Equiv. ${fmtUSD(emp.netUSD)}`, b3x, netY + 21);

    y += 31;

    // ── LEGAL NOTE ────────────────────────────────────────────────────────
    hline(doc, ML, y, W, T.borderL);
    y += 4;
    const legal =
        "El presente recibo acredita el pago de los haberes correspondientes al periodo indicado, " +
        "de conformidad con la Ley Organica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). " +
        "Ambas partes declaran su conformidad con los montos reflejados en este documento.";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...T.muted);
    const legalLines: string[] = doc.splitTextToSize(legal, W - 6);
    const LEGAL_LINE_H = 3.8;
    legalLines.forEach((line: string, i: number) => {
        doc.text(line, ML + 3, y + 4 + i * LEGAL_LINE_H);
    });
    y += legalLines.length * LEGAL_LINE_H + 7;

    // ── SIGNATURES ────────────────────────────────────────────────────────
    const sigY = PH - 36;
    const sigW = 68;

    // Employer
    card(doc, ML, sigY, sigW, 20);
    hline(doc, ML + 6, sigY + 12, sigW - 12, T.borderM, 0.4);
    label(doc, "Firma y Sello del Empleador", ML + sigW / 2, sigY + 16, "right");
    txt(doc, opts.companyName, ML + sigW / 2, sigY + 6, {
        size: 7, bold: true, color: T.inkMed, align: "center", upper: true, maxW: sigW - 8,
    });

    // Employee
    const esx = MR - sigW;
    card(doc, esx, sigY, sigW, 20);
    hline(doc, esx + 6, sigY + 12, sigW - 12, T.borderM, 0.4);
    label(doc, "Firma del Trabajador / Conforme", esx + sigW / 2, sigY + 16, "right");
    txt(doc, emp.nombre, esx + sigW / 2, sigY + 5.5, {
        size: 7, bold: true, color: T.inkMed, align: "center", upper: true, maxW: sigW - 8,
    });
    label(doc, emp.cedula, esx + sigW / 2, sigY + 10, "right");
    txt(doc, emp.cedula, esx + sigW / 2, sigY + 10, {
        size: 6, color: T.muted, align: "center",
    });

    // ── FOOTER ────────────────────────────────────────────────────────────
    fill(doc, 0, PH - 10, PW, 10, T.pageBg);
    hline(doc, 0, PH - 10, PW, T.borderL, 0.3);
    txt(doc, `${opts.companyName}  ·  Generado el ${new Date().toLocaleDateString("es-VE")}  ·  Documento confidencial`, PW / 2, PH - 4.5, {
        size: 5.5, color: T.muted, align: "center", upper: true,
    });
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function generatePayrollPdf(
    employees: PdfEmployeeResult[],
    opts:      PdfPayrollOptions,
): void {
    const active = employees.filter((e) => e.estado === "activo");
    if (active.length === 0) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    active.forEach((emp, i) => drawReceipt(doc, emp, opts, i === 0));

    const dateStr = opts.payrollDate.replaceAll("-", "");
    doc.save(`nomina_${dateStr}.pdf`);
}