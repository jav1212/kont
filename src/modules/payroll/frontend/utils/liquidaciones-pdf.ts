// liquidaciones-pdf.ts
// Genera recibos individuales de liquidación laboral (LOTTT Art. 92, 142 y ss.)
// Paleta visual unificada con payroll-pdf.ts

import jsPDF from "jspdf";

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
    companyName: string;
    companyId?:  string;
    fechaDoc:    string;   // ISO YYYY-MM-DD
    bcvRate?:    number;
}

// ── Palette (teal/cyan — unificada con payroll-pdf) ───────────────────────────

type RGB = [number, number, number];

const C = {
    ink:       [8,   18,  25]  as RGB,
    inkMed:    [30,  50,  65]  as RGB,
    muted:     [100, 115, 130] as RGB,
    border:    [210, 220, 230] as RGB,
    borderMed: [160, 178, 192] as RGB,
    bg:        [238, 240, 247] as RGB,
    rowAlt:    [228, 233, 244] as RGB,
    white:     [255, 255, 255] as RGB,
    // Primary — teal #0891B2
    primary:   [8,   145, 178] as RGB,
    primaryLt: [207, 250, 254] as RGB,
    primaryBd: [103, 232, 249] as RGB,
    // Accent — bright cyan for dark backgrounds
    accent:    [34,  211, 238] as RGB,
    // Success — emerald
    green:     [5,   150, 105] as RGB,
    greenLt:   [236, 253, 245] as RGB,
    greenBd:   [167, 243, 208] as RGB,
    // Warning — amber (indemnización)
    amber:     [180, 83,  9]   as RGB,
    amberLt:   [255, 247, 237] as RGB,
    amberBd:   [251, 191, 36]  as RGB,
    // Error — red
    red:       [185, 28,  28]  as RGB,
    redLt:     [254, 242, 242] as RGB,
    redBd:     [252, 165, 165] as RGB,
    // Header
    headerBg:  [11,  12,  20]  as RGB,
    headerSub: [20,  22,  38]  as RGB,
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
    const opts: Record<string, unknown> = { align };
    if (maxW) opts.maxWidth = maxW;
    doc.text(text, x, y, opts);
};

const lbl = (doc: Doc, text: string, x: number, y: number, align: "left" | "right" | "center" = "left") =>
    t(doc, text.toUpperCase(), x, y, 5, false, C.muted, align);

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtVES = (n: number) =>
    "Bs. " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d)
        .toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" })
        .toUpperCase();
};

const MOTIVO_LABEL: Record<string, string> = {
    renuncia:              "Renuncia Voluntaria",
    despido_justificado:   "Despido Justificado",
    despido_injustificado: "Despido Injustificado",
};

// ── Receipt renderer ──────────────────────────────────────────────────────────

function drawReceipt(doc: Doc, emp: LiquidacionEmployee, opts: LiquidacionOptions, isFirst: boolean) {
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
    fill(doc, 0, HDR_H - 2, PW, 2, C.accent);
    fill(doc, 0, 0, 4, HDR_H - 2, C.primary);

    // Left: company
    t(doc, opts.companyName.toUpperCase(), ML + 2, 10, 11, true, C.white);
    if (opts.companyId) t(doc, `RIF: ${opts.companyId}`, ML + 2, 16.5, 6.5, false, [150, 150, 168] as RGB);
    t(doc, "LIQUIDACIÓN LABORAL · LOTTT ART. 92 Y 142", ML + 2, 23, 6, false, [100, 100, 120] as RGB);

    // Right: motivo + fecha
    t(doc, (MOTIVO_LABEL[emp.motivo] ?? emp.motivo).toUpperCase(), MR, 9, 8, true, C.white, "right");
    lbl(doc, "Motivo de egreso", MR, 14.5, "right");
    t(doc, `Egreso: ${fmtDate(emp.fechaEgreso)}`, MR, 22.5, 6.5, false, [150, 175, 185] as RGB, "right");
    t(doc,
        `Emitido: ${new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}`,
        MR, 29, 5.5, false, [100, 100, 118] as RGB, "right"
    );

    let y = HDR_H + 5;

    // ── EMPLOYEE CARD ─────────────────────────────────────────────────────
    const CARD_H = 28;
    box(doc, ML, y, W, CARD_H, C.white, C.border, 0.3);
    fill(doc, ML, y, 3, CARD_H, C.primary);

    const c1x = ML + 6;
    const c2x = ML + W * 0.46;
    const c3x = ML + W * 0.73;

    // Col 1: nombre + cédula
    lbl(doc, "Trabajador", c1x, y + 5.5);
    t(doc, emp.nombre, c1x, y + 12, 9.5, true, C.ink, "left", c2x - c1x - 4);
    t(doc, emp.cedula, c1x, y + 18.5, 6.5, false, C.muted);

    vline(doc, c2x - 2, y + 3, y + CARD_H - 3, C.border);

    // Col 2: cargo + antigüedad
    lbl(doc, "Cargo / Antigüedad", c2x, y + 5.5);
    t(doc, emp.cargo, c2x, y + 12, 8, false, C.inkMed, "left", c3x - c2x - 4);
    const antStr = emp.antiguedadAnios > 0
        ? `${emp.antiguedadAnios} año${emp.antiguedadAnios !== 1 ? "s" : ""}, ${emp.antiguedadDias} días`
        : `${emp.antiguedadDias} días`;
    t(doc, antStr, c2x, y + 21, 7.5, true, C.primary);

    vline(doc, c3x - 2, y + 3, y + CARD_H - 3, C.border);

    // Col 3: período de trabajo
    lbl(doc, "Período de Trabajo", MR - 4, y + 5.5, "right");
    t(doc, fmtDate(emp.fechaIngreso), MR - 4, y + 12, 6.5, false, C.inkMed, "right");
    hline(doc, c3x - 2, y + 15, MR - (c3x - 2), C.border, 0.15);
    lbl(doc, "Fecha de Egreso", MR - 4, y + 19, "right");
    t(doc, fmtDate(emp.fechaEgreso), MR - 4, y + 26, 7.5, true, C.primary, "right");

    y += CARD_H + 5;

    // ── TABLE HEADER ──────────────────────────────────────────────────────
    const COL_CONCEPTO = ML;
    const COL_DIAS     = MR - 62;
    const COL_SAL      = MR - 36;
    const COL_MONTO    = MR;
    const LABEL_MAX    = COL_DIAS - ML - 10;

    const TH_H = 7.5;
    fill(doc, ML, y, W, TH_H, C.headerBg);
    fill(doc, ML, y, 3, TH_H, C.primary);
    hline(doc, ML, y + TH_H, W, C.primaryBd, 0.4);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(140, 200, 215);
    doc.text("CONCEPTO",        COL_CONCEPTO + 6, y + 4.8, { align: "left"   });
    doc.text("DÍAS",            COL_DIAS,          y + 4.8, { align: "center" });
    doc.text("SALARIO DIARIO",  COL_SAL,           y + 4.8, { align: "center" });
    doc.text("MONTO (Bs)",      COL_MONTO,         y + 4.8, { align: "right"  });
    y += TH_H;

    // ── CONCEPT ROWS ──────────────────────────────────────────────────────
    const ROW_H = 7;
    emp.lines.forEach((line, i) => {
        const isAmber = line.highlight === "amber";
        const rowBg   = isAmber ? C.amberLt : (i % 2 === 0 ? C.white : C.rowAlt);

        fill(doc, ML, y, W, ROW_H, rowBg);
        hline(doc, ML, y + ROW_H, W, C.border, 0.1);
        vline(doc, COL_DIAS - 12, y, y + ROW_H, C.border, 0.1);
        vline(doc, COL_SAL  - 12, y, y + ROW_H, C.border, 0.1);

        const labelColor: RGB = isAmber ? C.amber : C.inkMed;
        const amtColor: RGB   = isAmber ? C.amber : C.primary;

        t(doc, line.label, COL_CONCEPTO + 6, y + 4.5, 7, isAmber, labelColor, "left", LABEL_MAX);
        if (line.dias !== undefined)
            t(doc, String(line.dias), COL_DIAS, y + 4.5, 7, false, C.inkMed, "center");
        if (line.formula !== undefined)
            t(doc, line.formula, COL_SAL, y + 4.5, 5, false, C.muted, "center", 40);
        else if (line.salario !== undefined)
            t(doc, fmtVES(line.salario), COL_SAL, y + 4.5, 6, false, C.muted, "center");
        t(doc, fmtVES(line.monto), COL_MONTO, y + 4.5, 7.5, true, amtColor, "right");

        y += ROW_H;
    });

    y += 4;

    // ── TOTAL BAR ─────────────────────────────────────────────────────────
    const NET_H = 20;
    fill(doc, ML, y, W, NET_H, C.headerBg);
    doc.setDrawColor(C.accent[0], C.accent[1], C.accent[2]);
    doc.setLineWidth(1.2);
    doc.line(ML, y, MR, y);

    const midX = ML + W * 0.5;
    vline(doc, midX, y + 4, y + NET_H - 4, [50, 65, 85] as RGB, 0.5);

    // Left: employee summary
    lbl(doc, `${emp.lines.length} concepto${emp.lines.length !== 1 ? "s" : ""}`, ML + 6, y + 7);
    t(doc, emp.nombre, ML + 6, y + 14, 7, false, [160, 180, 190] as RGB, "left", midX - ML - 10);

    // Right: total
    lbl(doc, "Total a Cobrar", midX + 6, y + 7);
    t(doc, fmtVES(emp.total), MR - 4, y + 16, 14, true, C.accent, "right");

    y += NET_H + 10;

    // ── LEGAL NOTE ────────────────────────────────────────────────────────
    hline(doc, ML, y, W, C.border, 0.2);
    y += 4;
    const nota =
        "El presente documento certifica el pago de todas las acreencias laborales del trabajador indicado, calculadas conforme a la " +
        "Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). El trabajador declara recibir los montos indicados " +
        "a su entera satisfacción, sin reserva ni reclamación alguna por los conceptos aquí liquidados.";
    doc.setFont("helvetica", "italic");
    doc.setFontSize(5.5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    const notaLines: string[] = doc.splitTextToSize(nota, W);
    notaLines.forEach((line: string, i: number) => {
        doc.text(line, ML, y + i * 3.5);
    });

    // ── SIGNATURES ────────────────────────────────────────────────────────
    const sigY  = PH - 40;
    const sigW  = 75;
    const sigH  = 24;
    const sigPd = 6;

    box(doc, ML, sigY, sigW, sigH, C.white, C.border, 0.25);
    fill(doc, ML, sigY, sigW, 1.5, C.primary);
    t(doc, opts.companyName, ML + sigW / 2, sigY + 9, 7, true, C.inkMed, "center", sigW - 10);
    if (opts.companyId) t(doc, opts.companyId, ML + sigW / 2, sigY + 14, 5.5, false, C.muted, "center");
    hline(doc, ML + sigPd, sigY + 19, sigW - sigPd * 2, C.borderMed, 0.4);
    lbl(doc, "Firma y Sello del Empleador", ML + sigW / 2, sigY + 23, "center");

    const esx = MR - sigW;
    box(doc, esx, sigY, sigW, sigH, C.white, C.border, 0.25);
    fill(doc, esx, sigY, sigW, 1.5, C.primary);
    t(doc, emp.nombre, esx + sigW / 2, sigY + 9, 7, true, C.inkMed, "center", sigW - 10);
    t(doc, emp.cedula, esx + sigW / 2, sigY + 14, 5.5, false, C.muted, "center");
    hline(doc, esx + sigPd, sigY + 19, sigW - sigPd * 2, C.borderMed, 0.4);
    lbl(doc, "Firma del Trabajador · Conforme", esx + sigW / 2, sigY + 23, "center");

    // ── FOOTER ────────────────────────────────────────────────────────────
    fill(doc, 0, PH - 10, PW, 10, C.headerBg);
    fill(doc, 0, PH - 10, PW, 1, C.accent);
    t(doc,
        `${opts.companyName.toUpperCase()}  ·  LIQUIDACIÓN LABORAL  ·  ${fmtDate(opts.fechaDoc)}  ·  DOCUMENTO CONFIDENCIAL`,
        PW / 2, PH - 4, 5, false, [90, 95, 112] as RGB, "center"
    );
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function generateLiquidacionPdf(employees: LiquidacionEmployee[], opts: LiquidacionOptions): void {
    if (employees.length === 0) return;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    employees.forEach((emp, i) => drawReceipt(doc, emp, opts, i === 0));
    const slug = opts.fechaDoc.replaceAll("-", "");
    doc.save(`liquidaciones_${slug}.pdf`);
}
