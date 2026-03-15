// ============================================================================
// UTILIDADES PDF — Constancia de Utilidades Completas y Fraccionadas (LOTTT)
// Arts. 131, 174, 175
// ============================================================================

import jsPDF from "jspdf";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UtilPdfEmployee {
    nombre: string;
    cedula: string;
    cargo?: string;
}

export interface UtilidadesCompletasPdfData {
    companyName:    string;
    employee:       UtilPdfEmployee;
    anioFiscal:     number;
    salarioVES:     number;
    salarioDia:     number;
    diasUtilidades: number;
    monto:          number;
}

export interface UtilidadesFraccionadasPdfData {
    companyName:      string;
    employee:         UtilPdfEmployee;
    anioFiscal:       number;
    fechaIngreso:     string;   // ISO
    fechaCorte:       string;   // ISO
    inicioFiscal:     string;   // ISO
    periodoInicio:    string;   // ISO — max(inicioFiscal, fechaIngreso)
    mesesTrabajados:  number;
    diasUtilidades:   number;
    diasFraccionados: number;
    salarioVES:       number;
    salarioDia:       number;
    monto:            number;
}

// ── Colors ────────────────────────────────────────────────────────────────────

type RGB = [number, number, number];
const C = {
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
    emerald:  [5,   150, 105] as RGB,
    emBg:     [167, 243, 208] as RGB,
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

function drawBg(doc: jsPDF, PW: number, PH: number) {
    doc.setFillColor(C.bg[0], C.bg[1], C.bg[2]);
    doc.rect(0, 0, PW, PH, "F");
}

function drawFooter(doc: jsPDF, PW: number, PH: number, companyName: string, sub: string) {
    fill(doc, 0, PH - 10, PW, 10, C.header);
    fill(doc, 0, PH - 10, PW, 1, C.emBg);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.setTextColor(90, 90, 108);
    doc.text(
        `${companyName.toUpperCase()}  ·  ${sub}  ·  DOCUMENTO CONFIDENCIAL`,
        PW / 2, PH - 4, { align: "center" },
    );
}

function drawSignatures(doc: jsPDF, ML: number, W: number, y: number): number {
    const SIG_W = (W - 12) / 2;
    const SIG_H = 22;
    ["EMPLEADOR", "TRABAJADOR"].forEach((role, i) => {
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
// GENERATE — Utilidades Completas
// ============================================================================

export function generateUtilidadesCompletasPdf(data: UtilidadesCompletasPdfData): void {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 13, MR = PW - 13, W = MR - ML;

    drawBg(doc, PW, PH);

    // ── Header ────────────────────────────────────────────────────────────────
    const HDR_H = 40;
    fill(doc, 0, 0, PW, HDR_H, C.header);
    fill(doc, 0, HDR_H - 2, PW, 2, C.emBg);
    fill(doc, 0, 0, 4, HDR_H - 2, C.emerald);

    txt(doc, data.companyName.toUpperCase(), ML + 2, 10,   11, true,  C.white);
    txt(doc, "CONSTANCIA DE UTILIDADES ANUALES",  ML + 2, 17,   6,  false, [100,100,120] as RGB);
    txt(doc, "Art. 131 + 174 LOTTT — Participación en Beneficios", ML + 2, 23.5, 5.5, false, [80,80,100] as RGB);
    txt(doc, "AÑO FISCAL",              MR, 12,   5,  false, [100,100,118] as RGB, "right");
    txt(doc, String(data.anioFiscal),   MR, 19,   11, true,  C.white, "right");
    txt(doc,
        `Emitido: ${new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}`,
        MR, 27, 5, false, [100,100,118] as RGB, "right",
    );

    let y = HDR_H + 5;

    // ── Employee card ──────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 14, C.white);
    fill(doc, ML, y, 3,  14, C.emerald);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.rect(ML, y, W, 14, "D");
    txt(doc, data.employee.nombre.toUpperCase(), ML + 7, y + 5.5, 9,   true,  C.inkMed, "left", W * 0.65);
    txt(doc, data.employee.cargo?.toUpperCase() ?? "", ML + 7, y + 10, 5.5, false, C.muted, "left", W * 0.55);
    txt(doc, `CI: ${data.employee.cedula}`,      MR - 2, y + 5.5, 7.5, true,  C.inkMed, "right");

    y += 18;

    // ── Params strip ──────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 13, C.header);
    const px1 = ML + 4, px2 = ML + W * 0.35, px3 = MR - 4;
    txt(doc, "SALARIO MENSUAL",       px1, y + 4, 5, false, C.muted);
    txt(doc, fmtVES(data.salarioVES), px1, y + 9, 7, true,  C.white);
    txt(doc, "SALARIO DIARIO",        px2, y + 4, 5, false, C.muted);
    txt(doc, fmtVES(data.salarioDia), px2, y + 9, 7, true,  C.white);
    txt(doc, "DÍAS DE UTILIDADES",    px3, y + 4, 5, false, C.muted, "right");
    txt(doc, `${data.diasUtilidades} días`, px3, y + 9, 8, true, [150,230,200] as RGB, "right");

    y += 17;

    // ── Formula box ───────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 9, C.rowAlt);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.rect(ML, y, W, 9, "D");
    txt(doc, "FÓRMULA:",                                  ML + 4, y + 3.5, 5,   false, C.muted);
    txt(doc, `${data.diasUtilidades} días × ${fmtVES(data.salarioDia)} / día  =  ${fmtVES(data.monto)}`,
        ML + 4, y + 7.5, 6.5, true, C.inkMed);

    y += 13;

    // ── Concept row ───────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 7, C.header);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text("CONCEPTO",   ML + 4,        y + 4.5);
    doc.text("DÍAS",       ML + W * 0.68, y + 4.5, { align: "right" });
    doc.text("MONTO",      MR,            y + 4.5, { align: "right" });
    y += 7;

    fill(doc, ML, y, W, 11, C.white);
    hline(doc, ML, y + 11, W, C.border, 0.1);
    txt(doc, "Utilidades Anuales",                 ML + 4,        y + 5,   7.5, true,  C.inkMed);
    txt(doc, `Art. 131 + 174 LOTTT · Año ${data.anioFiscal}`, ML + 4, y + 9.2, 5, false, C.muted, "left", W * 0.55);
    txt(doc, `${data.diasUtilidades} d`,           ML + W * 0.68, y + 7,   7,   false, C.muted,   "right");
    txt(doc, fmtVES(data.monto),                   MR,            y + 7,   8,   true,  C.emerald, "right");
    y += 11 + 3;

    // ── Total ──────────────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 12, C.header);
    fill(doc, ML, y, 3,  12, C.emBg);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text(`TOTAL UTILIDADES  ·  ${data.diasUtilidades} DÍAS  ·  AÑO ${data.anioFiscal}`, ML + 7, y + 7.5);
    doc.setTextColor(C.emBg[0], C.emBg[1], C.emBg[2]);
    doc.setFontSize(10);
    doc.text(fmtVES(data.monto), MR, y + 8, { align: "right" });

    y += 18;

    // ── Signatures ────────────────────────────────────────────────────────────
    txt(doc, "FIRMAS DE CONFORMIDAD", ML, y, 6, true, C.inkMed);
    y += 5;
    y = drawSignatures(doc, ML, W, y);

    // ── Legal note ────────────────────────────────────────────────────────────
    hline(doc, ML, y, W, C.border, 0.2);
    y += 4;
    const legal = `La presente constancia certifica el pago de utilidades correspondientes al año fiscal ${data.anioFiscal}, de conformidad con los Arts. 131 y 174 de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). El cálculo se realiza sobre el salario normal del trabajador. La firma de ambas partes confirma la recepción de dicho beneficio.`;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    (doc.splitTextToSize(legal, W) as string[]).forEach((line: string, i: number) => {
        doc.text(line, ML, y + i * 3.5);
    });

    drawFooter(doc, PW, PH, data.companyName, `UTILIDADES ${data.anioFiscal}`);
    doc.save(`utilidades_${data.employee.cedula}_${data.anioFiscal}.pdf`);
}

// ============================================================================
// GENERATE — Utilidades Fraccionadas
// ============================================================================

export function generateUtilidadesFraccionadasPdf(data: UtilidadesFraccionadasPdfData): void {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 13, MR = PW - 13, W = MR - ML;

    drawBg(doc, PW, PH);

    // ── Header (amber) ────────────────────────────────────────────────────────
    const HDR_H = 40;
    fill(doc, 0, 0, PW, HDR_H, C.header);
    fill(doc, 0, HDR_H - 2, PW, 2, C.amberBg);
    fill(doc, 0, 0, 4, HDR_H - 2, C.amber);

    txt(doc, data.companyName.toUpperCase(),    ML + 2, 10,   11, true,  C.white);
    txt(doc, "CONSTANCIA DE UTILIDADES FRACCIONADAS", ML + 2, 17, 6, false, [100,100,120] as RGB);
    txt(doc, "Art. 175 LOTTT — Fracción proporcional al período trabajado", ML + 2, 23.5, 5.5, false, [80,80,100] as RGB);
    txt(doc, "AÑO FISCAL",            MR, 12,   5,  false, [100,100,118] as RGB, "right");
    txt(doc, String(data.anioFiscal), MR, 19,   11, true,  C.white, "right");
    txt(doc,
        `Emitido: ${new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}`,
        MR, 27, 5, false, [100,100,118] as RGB, "right",
    );

    let y = HDR_H + 5;

    // ── Employee card ──────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 14, C.white);
    fill(doc, ML, y, 3,  14, C.amber);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.rect(ML, y, W, 14, "D");
    txt(doc, data.employee.nombre.toUpperCase(), ML + 7, y + 5.5, 9,   true,  C.inkMed, "left", W * 0.65);
    txt(doc, data.employee.cargo?.toUpperCase() ?? "", ML + 7, y + 10, 5.5, false, C.muted, "left", W * 0.55);
    txt(doc, `CI: ${data.employee.cedula}`,      MR - 2, y + 5.5, 7.5, true,  C.inkMed, "right");
    txt(doc, `${data.mesesTrabajados} mes${data.mesesTrabajados !== 1 ? "es" : ""} en año ${data.anioFiscal}`,
        MR - 2, y + 10, 5.5, false, C.muted, "right");

    y += 18;

    // ── Params strip ──────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 13, C.header);
    const px1 = ML + 4, px2 = ML + W * 0.28, px3 = ML + W * 0.56, px4 = MR - 4;
    txt(doc, "INICIO PERÍODO",                px1, y + 4, 5, false, C.muted);
    txt(doc, formatDateES(data.periodoInicio).toUpperCase(), px1, y + 9, 5.5, true, C.white);
    txt(doc, "FECHA DE CORTE",                px2, y + 4, 5, false, C.muted);
    txt(doc, formatDateES(data.fechaCorte).toUpperCase(), px2, y + 9, 5.5, true, C.white);
    txt(doc, "MESES TRABAJADOS",              px3, y + 4, 5, false, C.muted);
    txt(doc, `${data.mesesTrabajados} meses`, px3, y + 9, 7, true, [150,200,220] as RGB);
    txt(doc, "DÍAS UTILIDADES BASE",          px4, y + 4, 5, false, C.muted, "right");
    txt(doc, `${data.diasUtilidades} días`,   px4, y + 9, 7, true,  C.white, "right");

    y += 17;

    // ── Formula box ───────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 9, C.rowAlt);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.rect(ML, y, W, 9, "D");
    txt(doc, "FÓRMULA (ART. 175):", ML + 4, y + 3.5, 5, false, C.muted);
    txt(doc,
        `⌈ ${data.diasUtilidades} días / 12 meses × ${data.mesesTrabajados} meses ⌉  =  ${data.diasFraccionados} días`,
        ML + 4, y + 7.5, 6.5, true, C.inkMed);

    y += 13;

    // ── Concept table header ───────────────────────────────────────────────────
    fill(doc, ML, y, W, 7, C.header);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text("CONCEPTO",   ML + 4,        y + 4.5);
    doc.text("DÍAS",       ML + W * 0.68, y + 4.5, { align: "right" });
    doc.text("MONTO",      MR,            y + 4.5, { align: "right" });
    y += 7;

    fill(doc, ML, y, W, 11, C.white);
    hline(doc, ML, y + 11, W, C.border, 0.1);
    txt(doc, "Utilidades Fraccionadas",     ML + 4,        y + 5,   7.5, true,  C.inkMed);
    txt(doc, `Art. 175 LOTTT · ${data.diasUtilidades}d/12 × ${data.mesesTrabajados} meses`,
                                            ML + 4,        y + 9.2, 5,   false, C.muted, "left", W * 0.55);
    txt(doc, `${data.diasFraccionados} d`,  ML + W * 0.68, y + 7,   7,   false, C.muted,  "right");
    txt(doc, fmtVES(data.monto),            MR,            y + 7,   8,   true,  C.amber,  "right");
    y += 11 + 3;

    // ── Salary strip ──────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 10, C.rowAlt);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.15);
    doc.rect(ML, y, W, 10, "D");
    txt(doc, "SALARIO MENSUAL:", ML + 4,        y + 4,   5, false, C.muted);
    txt(doc, fmtVES(data.salarioVES), ML + 40,  y + 4,   6, true,  C.inkMed);
    txt(doc, "SALARIO DIARIO:",   ML + W * 0.5, y + 4,   5, false, C.muted);
    txt(doc, fmtVES(data.salarioDia), ML + W * 0.5 + 34, y + 4, 6, true, C.inkMed);
    txt(doc, `Base: salario mensual ÷ 30 = ${fmtVES(data.salarioDia)} / día`,
        ML + 4, y + 8.5, 5, false, C.muted);

    y += 15;

    // ── Total ──────────────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 12, C.header);
    fill(doc, ML, y, 3,  12, C.amberBg);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text(`TOTAL FRACCIONADO  ·  ${data.diasFraccionados} DÍAS  ·  AÑO ${data.anioFiscal}`, ML + 7, y + 7.5);
    doc.setTextColor(C.amberBg[0], C.amberBg[1], C.amberBg[2]);
    doc.setFontSize(10);
    doc.text(fmtVES(data.monto), MR, y + 8, { align: "right" });

    y += 18;

    // ── Signatures ────────────────────────────────────────────────────────────
    txt(doc, "FIRMAS DE CONFORMIDAD", ML, y, 6, true, C.inkMed);
    y += 5;
    y = drawSignatures(doc, ML, W, y);

    // ── Legal note ────────────────────────────────────────────────────────────
    hline(doc, ML, y, W, C.border, 0.2);
    y += 4;
    const legal = `La presente constancia certifica el pago de utilidades fraccionadas correspondientes al período trabajado en el año fiscal ${data.anioFiscal}, de conformidad con el Art. 175 de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). El cálculo es proporcional a los meses completos laborados desde el inicio del año fiscal o de la relación laboral (lo que ocurra después).`;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    (doc.splitTextToSize(legal, W) as string[]).forEach((line: string, i: number) => {
        doc.text(line, ML, y + i * 3.5);
    });

    drawFooter(doc, PW, PH, data.companyName, `UTILIDADES FRACCIONADAS ${data.anioFiscal}`);
    doc.save(`utilidades_fraccionadas_${data.employee.cedula}_${data.anioFiscal}.pdf`);
}
