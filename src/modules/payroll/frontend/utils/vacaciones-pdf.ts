// ============================================================================
// VACACIONES PDF — Constancia de Vacaciones Completas y Fraccionadas (LOTTT)
// ============================================================================

import jsPDF from "jspdf";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VacPdfEmployee {
    nombre:    string;
    cedula:    string;
    cargo?:    string;
    anios?:    number;
}

export interface VacCompletasPdfData {
    companyName:       string;
    employee:          VacPdfEmployee;
    fechaInicio:       string;   // ISO
    fechaCulminacion:  string;   // ISO
    fechaReintegro:    string;   // ISO
    salarioVES:        number;
    salarioDia:        number;
    diasCalendario:    number;
    diasHabiles:       number;
    diasDescanso:      number;
    diasDisfrute:      number;
    diasBono:          number;
    montoDisfrute:     number;
    montoBono:         number;
    total:             number;
}

export interface VacFraccionadasPdfData {
    companyName:        string;
    employee:           VacPdfEmployee;
    fechaIngreso:       string;   // ISO
    fechaEgreso:        string;   // ISO
    ultimoAniversario:  string;   // ISO
    aniosCompletos:     number;
    mesesFraccion:      number;
    diasAnuales:        number;
    salarioVES:         number;
    salarioDia:         number;
    fraccionDisfrute:   number;
    fraccionBono:       number;
    montoDisfrute:      number;
    montoBono:          number;
    total:              number;
}

// ── Colors ────────────────────────────────────────────────────────────────────

type RGB = [number, number, number];
const C = {
    ink:      [15,  15,  20]  as RGB,
    inkMed:   [50,  50,  60]  as RGB,
    muted:    [120, 120, 132] as RGB,
    border:   [218, 218, 226] as RGB,
    borderMd: [175, 175, 185] as RGB,
    bg:       [246, 246, 250] as RGB,
    rowAlt:   [240, 240, 245] as RGB,
    white:    [255, 255, 255] as RGB,
    primary:  [8,   145, 178] as RGB,
    accent:   [34,  211, 238] as RGB,
    header:   [18,  18,  26]  as RGB,
    green:    [22,  101, 52]  as RGB,
    amber:    [180, 120, 10]  as RGB,
    amberBg:  [253, 230, 138] as RGB,
};

// ── Primitives ────────────────────────────────────────────────────────────────

const fill = (doc: jsPDF, x: number, y: number, w: number, h: number, c: RGB) => {
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(x, y, w, h, "F");
};

const hline = (doc: jsPDF, x: number, y: number, w: number, c: RGB = C.border, lw = 0.2) => {
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(lw);
    doc.line(x, y, x + w, y);
};

const txt = (
    doc: jsPDF, text: string,
    x: number, y: number, size: number, bold: boolean,
    color: RGB, align: "left" | "center" | "right" = "left",
    maxW?: number,
) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.setCharSpace(0);
    const str = maxW ? ((doc.splitTextToSize(text, maxW) as string[])[0] ?? "") : text;
    let ax = x;
    if (align === "right")  ax = x - doc.getTextWidth(str);
    if (align === "center") ax = x - doc.getTextWidth(str) / 2;
    doc.text(str, ax, y);
};

const fmtNum = (n: number): string => {
    const [int, dec] = n.toFixed(2).split(".");
    return int.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec;
};
const fmtVES = (n: number) => "Bs. " + fmtNum(n);

function formatDateES(iso: string): string {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    const meses = ["enero","febrero","marzo","abril","mayo","junio",
                   "julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return `${parseInt(d)} de ${meses[parseInt(m) - 1]} de ${y}`;
}

// ── Shared header / footer ────────────────────────────────────────────────────

function drawBg(doc: jsPDF, PW: number, PH: number) {
    fill(doc, 0, 0, PW, PH, C.bg);
}

function drawFooter(doc: jsPDF, PW: number, PH: number, companyName: string, subtitle: string) {
    fill(doc, 0, PH - 10, PW, 10, C.header);
    fill(doc, 0, PH - 10, PW, 1,  C.accent);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.setTextColor(90, 90, 108);
    doc.text(
        `${companyName.toUpperCase()}  ·  ${subtitle}  ·  DOCUMENTO CONFIDENCIAL`,
        PW / 2, PH - 4, { align: "center" },
    );
}

function drawHeader(
    doc: jsPDF, PW: number, ML: number, MR: number,
    accentColor: RGB, companyName: string, titleLine1: string, titleLine2: string,
    rightLabel: string, rightValue: string,
): number {
    const HDR_H = 40;
    fill(doc, 0, 0, PW, HDR_H, C.header);
    fill(doc, 0, HDR_H - 2, PW, 2, { ...accentColor } as unknown as RGB);
    fill(doc, 0, 0, 4, HDR_H - 2, accentColor);

    txt(doc, companyName.toUpperCase(),          ML + 2, 10,   11, true,  C.white);
    txt(doc, titleLine1,                          ML + 2, 17,   6,  false, [100, 100, 120] as RGB);
    txt(doc, titleLine2,                          ML + 2, 23.5, 5.5,false, [80, 80, 100] as RGB);

    txt(doc, rightLabel.toUpperCase(),            MR, 12,   5,  false, [100, 100, 118] as RGB, "right");
    txt(doc, rightValue,                          MR, 18.5, 7.5,true,  C.white, "right");
    txt(doc,
        `Emitido: ${new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}`,
        MR, 26, 5, false, [100, 100, 118] as RGB, "right",
    );

    return HDR_H + 5;
}

// ── Concept row in table ──────────────────────────────────────────────────────

function conceptRow(
    doc: jsPDF, ML: number, W: number, y: number,
    label: string, subtitle: string, dias: number, monto: number, color: RGB, alt: boolean,
): number {
    const H = 11;
    fill(doc, ML, y, W, H, alt ? C.rowAlt : C.white);
    hline(doc, ML, y + H, W, C.border, 0.1);

    txt(doc, label,    ML + 4, y + 5,   7.5, true,  C.inkMed);
    txt(doc, subtitle, ML + 4, y + 9.2, 5,   false, C.muted, "left", W * 0.55);

    txt(doc, `${dias} d`,       ML + W * 0.68, y + 7, 7, false, C.muted,   "right");
    txt(doc, fmtVES(monto),     ML + W,        y + 7, 8, true,  color,     "right");

    return y + H;
}

// ── Signature boxes ───────────────────────────────────────────────────────────

function drawSignatures(doc: jsPDF, ML: number, W: number, y: number): number {
    const SIG_W = (W - 12) / 2;
    const SIG_H = 22;
    const labels = ["EMPLEADOR", "TRABAJADOR"];
    labels.forEach((role, i) => {
        const sx = ML + i * (SIG_W + 12);
        doc.setFillColor(C.white[0], C.white[1], C.white[2]);
        doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
        doc.setLineWidth(0.25);
        doc.rect(sx, y, SIG_W, SIG_H, "FD");
        fill(doc, sx, y, SIG_W, 1.5, C.muted);
        hline(doc, sx + 6, y + SIG_H - 5, SIG_W - 12, C.borderMd, 0.4);
        txt(doc, role, sx + SIG_W / 2, y + SIG_H - 1.5, 4, false, C.muted, "center");
    });
    return y + SIG_H + 6;
}

// ============================================================================
// GENERATE — Vacaciones Completas
// ============================================================================

export function generateVacComplletasPdf(data: VacCompletasPdfData): void {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 13, MR = PW - 13, W = MR - ML;

    drawBg(doc, PW, PH);

    let y = drawHeader(
        doc, PW, ML, MR, C.primary,
        data.companyName,
        "CONSTANCIA DE VACACIONES",
        "Arts. 190 · 192 LOTTT — Disfrute y Bono Vacacional",
        "Período",
        `${formatDateES(data.fechaInicio)} al ${formatDateES(data.fechaCulminacion)}`,
    );

    // ── Employee card ──────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 14, C.white);
    fill(doc, ML, y, 3,  14, C.primary);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.rect(ML, y, W, 14, "D");

    txt(doc, data.employee.nombre.toUpperCase(),    ML + 7, y + 5.5, 9, true,  C.inkMed, "left", W * 0.65);
    txt(doc, data.employee.cargo?.toUpperCase() ?? "", ML + 7, y + 10,  5.5, false, C.muted, "left", W * 0.55);
    txt(doc, `CI: ${data.employee.cedula}`,          MR - 2, y + 5.5, 7.5, true, C.inkMed, "right");
    txt(doc, `${data.employee.anios ?? 0} año${(data.employee.anios ?? 0) !== 1 ? "s" : ""} de servicio`,
        MR - 2, y + 10, 5.5, false, C.muted, "right");

    y += 18;

    // ── Params strip ──────────────────────────────────────────────────────────
    const px1 = ML + 4, px2 = ML + W * 0.28, px3 = ML + W * 0.56, px4 = MR - 4;
    fill(doc, ML, y, W, 13, C.header);

    txt(doc, "SALARIO MENSUAL",            px1, y + 4, 5, false, C.muted);
    txt(doc, fmtVES(data.salarioVES),      px1, y + 9, 7, true,  C.white);
    txt(doc, "SALARIO DIARIO",             px2, y + 4, 5, false, C.muted);
    txt(doc, fmtVES(data.salarioDia),      px2, y + 9, 7, true,  C.white);
    txt(doc, "REINTEGRO",                  px3, y + 4, 5, false, C.muted);
    txt(doc, formatDateES(data.fechaReintegro).toUpperCase(), px3, y + 9, 6, true, [150,200,220] as RGB);
    txt(doc, "DÍAS CAL. · HÁB. · DESC.",  px4, y + 4, 5, false, C.muted, "right");
    txt(doc, `${data.diasCalendario} · ${data.diasHabiles} · ${data.diasDescanso}`,
        px4, y + 9, 7, true, C.white, "right");

    y += 17;

    // ── Concept table header ───────────────────────────────────────────────────
    fill(doc, ML, y, W, 7, C.header);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text("CONCEPTO",          ML + 4,       y + 4.5);
    doc.text("DÍAS",              ML + W * 0.68, y + 4.5, { align: "right" });
    doc.text("MONTO",             MR,            y + 4.5, { align: "right" });
    y += 7;

    y = conceptRow(doc, ML, W, y, "Disfrute Vacacional",
        `Art. 190 LOTTT · 15 días base (+adicionales)`,
        data.diasDisfrute, data.montoDisfrute, C.primary, false);

    y = conceptRow(doc, ML, W, y, "Bono Vacacional",
        `Art. 192 LOTTT · 15 días base (+adicionales)`,
        data.diasBono, data.montoBono, C.amber, true);

    y += 3;

    // ── Total ──────────────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 12, C.header);
    fill(doc, ML, y, 3,  12, C.accent);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text(`TOTAL  ·  ${data.diasDisfrute + data.diasBono} DÍAS`, ML + 7, y + 7.5);
    doc.setTextColor(C.accent[0], C.accent[1], C.accent[2]);
    doc.setFontSize(10);
    doc.text(fmtVES(data.total), MR, y + 8, { align: "right" });

    y += 18;

    // ── Signature boxes ────────────────────────────────────────────────────────
    txt(doc, "FIRMAS DE CONFORMIDAD", ML, y, 6, true, C.inkMed);
    y += 5;
    y = drawSignatures(doc, ML, W, y);

    // ── Legal note ─────────────────────────────────────────────────────────────
    hline(doc, ML, y, W, C.border, 0.2);
    y += 4;
    const legal = "La presente constancia certifica el disfrute del período vacacional de conformidad con los Arts. 190 y 192 de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). Las firmas de ambas partes confirman el acuerdo sobre las fechas y montos indicados.";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    (doc.splitTextToSize(legal, W) as string[]).forEach((line: string, i: number) => {
        doc.text(line, ML, y + i * 3.5);
    });

    drawFooter(doc, PW, PH, data.companyName,
        `${formatDateES(data.fechaInicio)} — ${formatDateES(data.fechaCulminacion)}`);
    doc.save(`vacaciones_completas_${data.employee.cedula}_${data.fechaInicio.replaceAll("-", "")}.pdf`);
}

// ============================================================================
// GENERATE — Vacaciones Fraccionadas
// ============================================================================

export function generateVacFraccionadasPdf(data: VacFraccionadasPdfData): void {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 13, MR = PW - 13, W = MR - ML;

    drawBg(doc, PW, PH);

    // Amber accent for header
    const HDR_H = 40;
    fill(doc, 0, 0, PW, HDR_H, C.header);
    fill(doc, 0, HDR_H - 2, PW, 2, C.amberBg);
    fill(doc, 0, 0, 4, HDR_H - 2, C.amber);

    txt(doc, data.companyName.toUpperCase(),        ML + 2, 10,   11, true,  C.white);
    txt(doc, "CONSTANCIA DE VACACIONES FRACCIONADAS", ML + 2, 17, 6,  false, [100, 100, 120] as RGB);
    txt(doc, "Art. 196 LOTTT — Porción proporcional al período trabajado", ML + 2, 23.5, 5.5, false, [80, 80, 100] as RGB);
    txt(doc, "FECHA DE EGRESO",      MR, 12,   5,  false, [100, 100, 118] as RGB, "right");
    txt(doc, formatDateES(data.fechaEgreso), MR, 18.5, 7.5, true,  C.white, "right");
    txt(doc,
        `Emitido: ${new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}`,
        MR, 26, 5, false, [100, 100, 118] as RGB, "right",
    );

    let y = HDR_H + 5;

    // ── Employee card ──────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 14, C.white);
    fill(doc, ML, y, 3,  14, C.amber);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.rect(ML, y, W, 14, "D");

    txt(doc, data.employee.nombre.toUpperCase(),    ML + 7, y + 5.5, 9, true,  C.inkMed, "left", W * 0.65);
    txt(doc, data.employee.cargo?.toUpperCase() ?? "", ML + 7, y + 10, 5.5, false, C.muted, "left", W * 0.55);
    txt(doc, `CI: ${data.employee.cedula}`,          MR - 2, y + 5.5, 7.5, true, C.inkMed, "right");
    txt(doc, `${data.aniosCompletos} año${data.aniosCompletos !== 1 ? "s" : ""} completo${data.aniosCompletos !== 1 ? "s" : ""}`,
        MR - 2, y + 10, 5.5, false, C.muted, "right");

    y += 18;

    // ── Params strip ──────────────────────────────────────────────────────────
    const px1 = ML + 4, px2 = ML + W * 0.28, px3 = ML + W * 0.56, px4 = MR - 4;
    fill(doc, ML, y, W, 13, C.header);

    txt(doc, "FECHA DE INGRESO",              px1, y + 4, 5, false, C.muted);
    txt(doc, formatDateES(data.fechaIngreso).toUpperCase(), px1, y + 9, 5.5, true, C.white);
    txt(doc, "ÚLTIMO ANIVERSARIO",            px2, y + 4, 5, false, C.muted);
    txt(doc, formatDateES(data.ultimoAniversario).toUpperCase(), px2, y + 9, 5.5, true, C.white);
    txt(doc, "MESES EN AÑO EN CURSO",         px3, y + 4, 5, false, C.muted);
    txt(doc, `${data.mesesFraccion} mes${data.mesesFraccion !== 1 ? "es" : ""}`, px3, y + 9, 7, true, [150,200,220] as RGB);
    txt(doc, "DÍAS ANUALES BASE",             px4, y + 4, 5, false, C.muted, "right");
    txt(doc, `${data.diasAnuales} días`,      px4, y + 9, 7, true,  C.white, "right");

    y += 17;

    // ── Formula box ───────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 9, C.rowAlt);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.rect(ML, y, W, 9, "D");
    txt(doc, "FÓRMULA (ART. 196):", ML + 4, y + 3.5, 5, false, C.muted);
    txt(doc,
        `⌈ ${data.diasAnuales} días / 12 meses × ${data.mesesFraccion} meses ⌉  =  ${data.fraccionDisfrute} días`,
        ML + 4, y + 7.5, 6.5, true, C.inkMed);

    y += 13;

    // ── Concept table header ───────────────────────────────────────────────────
    fill(doc, ML, y, W, 7, C.header);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text("CONCEPTO",          ML + 4,        y + 4.5);
    doc.text("DÍAS",              ML + W * 0.68, y + 4.5, { align: "right" });
    doc.text("MONTO",             MR,            y + 4.5, { align: "right" });
    y += 7;

    y = conceptRow(doc, ML, W, y, "Disfrute Fraccionado",
        `Art. 190 + 196 LOTTT · ${data.diasAnuales}d/12 × ${data.mesesFraccion} meses`,
        data.fraccionDisfrute, data.montoDisfrute, C.amber, false);

    y = conceptRow(doc, ML, W, y, "Bono Vacacional Fraccionado",
        `Art. 192 + 196 LOTTT · ${data.diasAnuales}d/12 × ${data.mesesFraccion} meses`,
        data.fraccionBono, data.montoBono, C.amber, true);

    y += 3;

    // ── Total ──────────────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 12, C.header);
    fill(doc, ML, y, 3,  12, C.amberBg);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text(`TOTAL FRACCIONADO  ·  ${data.fraccionDisfrute + data.fraccionBono} DÍAS`, ML + 7, y + 7.5);
    doc.setTextColor(C.amberBg[0], C.amberBg[1], C.amberBg[2]);
    doc.setFontSize(10);
    doc.text(fmtVES(data.total), MR, y + 8, { align: "right" });

    y += 18;

    // ── Salary strip ──────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 10, C.rowAlt);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.15);
    doc.rect(ML, y, W, 10, "D");
    txt(doc, "SALARIO MENSUAL:",  ML + 4, y + 4,   5, false, C.muted);
    txt(doc, fmtVES(data.salarioVES), ML + 40, y + 4, 6, true, C.inkMed);
    txt(doc, "SALARIO DIARIO:",   ML + W * 0.5, y + 4, 5, false, C.muted);
    txt(doc, fmtVES(data.salarioDia), ML + W * 0.5 + 34, y + 4, 6, true, C.inkMed);
    txt(doc, `Base de cálculo: salario mensual ÷ 30 = ${fmtVES(data.salarioDia)} / día`,
        ML + 4, y + 8.5, 5, false, C.muted);

    y += 15;

    // ── Signature boxes ────────────────────────────────────────────────────────
    txt(doc, "FIRMAS DE CONFORMIDAD", ML, y, 6, true, C.inkMed);
    y += 5;
    y = drawSignatures(doc, ML, W, y);

    // ── Legal note ─────────────────────────────────────────────────────────────
    hline(doc, ML, y, W, C.border, 0.2);
    y += 4;
    const legal = "La presente constancia certifica el pago de las vacaciones fraccionadas de conformidad con el Art. 196 de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT), correspondientes a la fracción del año de servicio no cubierta por el período completo. El cálculo se realiza sobre el salario normal (no integral) del trabajador.";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    (doc.splitTextToSize(legal, W) as string[]).forEach((line: string, i: number) => {
        doc.text(line, ML, y + i * 3.5);
    });

    drawFooter(doc, PW, PH, data.companyName, `EGRESO: ${formatDateES(data.fechaEgreso).toUpperCase()}`);
    doc.save(`vacaciones_fraccionadas_${data.employee.cedula}_${data.fechaEgreso.replaceAll("-", "")}.pdf`);
}
