// ============================================================================
// VACACIONES PDF — Constancia de Vacaciones (LOTTT)
// Diseño fiel al card de vista previa: fondo blanco, header oscuro,
// secciones separadas por líneas suaves, tabla limpia, total en color.
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

// ── Colors (matching the card design) ─────────────────────────────────────────

type RGB = [number, number, number];
const C = {
    ink:      [15,  15,  20]  as RGB,
    inkMed:   [50,  50,  60]  as RGB,
    muted:    [120, 120, 132] as RGB,
    muted2:   [80,  80,  100] as RGB,
    border:   [218, 218, 226] as RGB,   // #dadae2 — border-light
    bgStripe: [240, 240, 245] as RGB,   // #f0f0f5 — row alt
    bgPage:   [246, 246, 250] as RGB,   // #f6f6fa
    white:    [255, 255, 255] as RGB,
    primary:  [8,   145, 178] as RGB,   // #0891b2
    accent:   [34,  211, 238] as RGB,   // #22d3ee
    amber:    [180, 120, 10]  as RGB,   // #b4780a
    amberAcc: [253, 230, 138] as RGB,   // #fde68a
    header:   [18,  18,  26]  as RGB,   // #12121a
    accentBg: [150, 200, 220] as RGB,   // light cyan for reintegro / meses
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

const rect = (doc: jsPDF, x: number, y: number, w: number, h: number, stroke: RGB, lw = 0.25) => {
    doc.setDrawColor(stroke[0], stroke[1], stroke[2]);
    doc.setLineWidth(lw);
    doc.rect(x, y, w, h, "D");
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

function emitidoStr(): string {
    return new Date().toLocaleDateString("es-VE", {
        day: "2-digit", month: "short", year: "numeric",
    }).toUpperCase();
}

// ── Shared: header ────────────────────────────────────────────────────────────

function drawHeader(
    doc: jsPDF, PW: number, ML: number, MR: number,
    accentLeft: RGB, accentBottom: RGB,
    companyName: string, titleLine1: string, titleLine2: string,
    rightLabel: string, rightLine1: string, rightLine2?: string,
): number {
    const HDR_H = 40;
    fill(doc, 0, 0, PW, HDR_H, C.header);
    // Left accent bar (4mm wide, stops 2mm from bottom)
    fill(doc, 0, 0, 4, HDR_H - 2, accentLeft);
    // Bottom accent line (2mm tall)
    fill(doc, 4, HDR_H - 2, PW - 4, 2, accentBottom);

    txt(doc, companyName.toUpperCase(),  ML + 6, 11,   11, true,  C.white);
    txt(doc, titleLine1,                  ML + 6, 18,   6,  false, C.muted);
    txt(doc, titleLine2,                  ML + 6, 23.5, 5.5,false, C.muted2);

    txt(doc, rightLabel.toUpperCase(),   MR, 11,   5,  false, C.muted, "right");
    txt(doc, rightLine1,                  MR, 17.5, 7,  true,  C.white, "right");
    if (rightLine2) txt(doc, rightLine2, MR, 23.5, 7,  true,  C.white, "right");
    txt(doc, `Emitido: ${emitidoStr()}`, MR, 30,   5,  false, C.muted, "right");

    return HDR_H + 5;
}

// ── Shared: employee card ─────────────────────────────────────────────────────

function drawEmployeeCard(
    doc: jsPDF, ML: number, W: number, MR: number, y: number,
    accentBar: RGB,
    nombre: string, cargo: string | undefined, cedula: string, rightSub: string,
): number {
    const H = 16;
    fill(doc, ML, y, W, H, C.white);
    fill(doc, ML, y, 3, H, accentBar);
    rect(doc, ML, y, W, H, C.border, 0.25);

    txt(doc, nombre.toUpperCase(), ML + 7, y + 6,  10, true,  C.inkMed, "left", W * 0.63);
    if (cargo) txt(doc, cargo.toUpperCase(), ML + 7, y + 11, 5.5, false, C.muted, "left", W * 0.55);

    txt(doc, `CI: ${cedula}`,  MR - 3, y + 6,  8,   true,  C.inkMed, "right");
    txt(doc, rightSub,          MR - 3, y + 11, 5.5, false, C.muted, "right");

    return y + H + 4;
}

// ── Shared: params strip (dark) ───────────────────────────────────────────────

interface ParamCol { lbl: string; val: string; color: RGB; }

function drawParamsStrip(doc: jsPDF, ML: number, W: number, y: number, cols: ParamCol[]): number {
    const H = 14;
    fill(doc, ML, y, W, H, C.header);
    const colW = W / cols.length;
    cols.forEach(({ lbl, val, color }, i) => {
        const cx = ML + i * colW + 4;
        txt(doc, lbl.toUpperCase(), cx, y + 4.5, 5, false, C.muted);
        txt(doc, val,               cx, y + 10,  6.5, true, color, "left", colW - 6);
    });
    return y + H + 1;
}

// ── Shared: concept table ─────────────────────────────────────────────────────

interface ConceptRow { label: string; subtitle: string; dias: number; monto: number; color: RGB; alt: boolean; }

function drawConceptTable(
    doc: jsPDF, ML: number, W: number, MR: number, y: number,
    rows: ConceptRow[],
    totalLabel: string, totalDias: number, total: number,
    totalAccent: RGB, totalBar: RGB,
): number {
    // Table header (dark)
    fill(doc, ML, y, W, 8, C.header);
    txt(doc, "CONCEPTO", ML + 4, y + 5.5, 5.5, true, C.muted);
    txt(doc, "DÍAS",     MR - 38, y + 5.5, 5.5, true, C.muted, "right");
    txt(doc, "MONTO",    MR,      y + 5.5, 5.5, true, C.muted, "right");
    y += 8;

    // Rows
    for (const { label, subtitle, dias, monto, color, alt } of rows) {
        const H = 14;
        fill(doc, ML, y, W, H, alt ? C.bgStripe : C.white);
        hline(doc, ML, y + H, W, C.border, 0.15);

        txt(doc, label,    ML + 4, y + 5.5, 8,   true,  C.inkMed);
        txt(doc, subtitle, ML + 4, y + 10,  5,   false, C.muted, "left", W * 0.56);

        txt(doc, `${dias} d`,   MR - 38, y + 7.5, 7, false, C.muted, "right");
        txt(doc, fmtVES(monto), MR,      y + 8,   9, true,  color,   "right");

        y += H;
    }

    y += 2;

    // Total bar (dark)
    fill(doc, ML, y, W, 13, C.header);
    fill(doc, ML, y, 3,  13, totalBar);
    txt(doc, `${totalLabel}  ·  ${totalDias} días`, ML + 7, y + 8.5, 6.5, true, C.muted);
    txt(doc, fmtVES(total), MR, y + 8.5, 11, true, totalAccent, "right");

    return y + 13 + 6;
}

// ── Shared: signatures ────────────────────────────────────────────────────────

function drawSignatures(doc: jsPDF, ML: number, W: number, y: number): number {
    txt(doc, "FIRMAS DE CONFORMIDAD", ML, y, 6, true, C.inkMed);
    y += 6;
    const boxW = (W - 14) / 2;
    ["EMPLEADOR", "TRABAJADOR"].forEach((role, i) => {
        const sx = ML + i * (boxW + 14);
        // box
        fill(doc, sx, y, boxW, 22, C.white);
        rect(doc, sx, y, boxW, 22, C.border, 0.25);
        // gray top stripe
        fill(doc, sx, y, boxW, 2, C.muted);
        // signature line
        hline(doc, sx + 6, y + 17, boxW - 12, C.border, 0.4);
        txt(doc, role, sx + boxW / 2, y + 21, 5, false, C.muted, "center");
    });
    return y + 22 + 6;
}

// ── Shared: legal note ────────────────────────────────────────────────────────

function drawLegal(doc: jsPDF, ML: number, W: number, y: number, text: string): number {
    hline(doc, ML, y, W, C.border, 0.2);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    (doc.splitTextToSize(text, W) as string[]).forEach((line: string, i: number) => {
        doc.text(line, ML, y + i * 3.5);
    });
    return y + 12;
}

// ── Shared: footer ────────────────────────────────────────────────────────────

function drawFooter(
    doc: jsPDF, PW: number, PH: number,
    text: string, accentLine: RGB,
) {
    fill(doc, 0, PH - 11, PW, 11, C.header);
    fill(doc, 0, PH - 11, PW,  1, accentLine);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.setTextColor(80, 80, 100);
    doc.text(text, PW / 2, PH - 4, { align: "center" });
}

// ============================================================================
// GENERATE — Vacaciones Completas
// ============================================================================

export function generateVacComplletasPdf(data: VacCompletasPdfData): void {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 13, MR = PW - 13, W = MR - ML;

    // Page background
    fill(doc, 0, 0, PW, PH, C.bgPage);

    // ── Header ──
    let y = drawHeader(
        doc, PW, ML, MR,
        C.primary, C.accent,
        data.companyName,
        "CONSTANCIA DE VACACIONES",
        "Arts. 190 · 192 LOTTT — Disfrute y Bono Vacacional",
        "Período",
        formatDateES(data.fechaInicio),
        `al ${formatDateES(data.fechaCulminacion)}`,
    );

    // ── Employee card ──
    y = drawEmployeeCard(
        doc, ML, W, MR, y, C.primary,
        data.employee.nombre,
        data.employee.cargo,
        data.employee.cedula,
        `${data.employee.anios ?? 0} año${(data.employee.anios ?? 0) !== 1 ? "s" : ""} de servicio`,
    );

    // ── Params strip: Salario Mensual | Salario Diario | Reintegro | Cal·Háb·Desc ──
    y = drawParamsStrip(doc, ML, W, y, [
        { lbl: "Salario Mensual",  val: fmtVES(data.salarioVES), color: C.white },
        { lbl: "Salario Diario",   val: fmtVES(data.salarioDia), color: C.white },
        { lbl: "Reintegro",        val: formatDateES(data.fechaReintegro).toUpperCase(), color: C.accentBg },
        { lbl: "Cal · Háb · Desc", val: `${data.diasCalendario} · ${data.diasHabiles} · ${data.diasDescanso}`, color: C.white },
    ]);

    // ── Concept table ──
    y = drawConceptTable(
        doc, ML, W, MR, y,
        [
            {
                label: "Disfrute Vacacional",
                subtitle: "Art. 190 LOTTT · 15 días base (+adicionales)",
                dias: data.diasDisfrute, monto: data.montoDisfrute,
                color: C.primary, alt: false,
            },
            {
                label: "Bono Vacacional",
                subtitle: "Art. 192 LOTTT · 15 días base (+adicionales)",
                dias: data.diasBono, monto: data.montoBono,
                color: C.amber, alt: true,
            },
        ],
        "Total a recibir",
        data.diasDisfrute + data.diasBono,
        data.total,
        C.accent,
        C.accent,
    );

    // ── Signatures ──
    y = drawSignatures(doc, ML, W, y);

    // ── Legal note ──
    drawLegal(doc, ML, W, y,
        "La presente constancia certifica el disfrute del período vacacional de conformidad con los Arts. 190 y 192 " +
        "de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). " +
        "Las firmas de ambas partes confirman el acuerdo sobre las fechas y montos indicados.",
    );

    // ── Footer ──
    drawFooter(doc, PW, PH,
        `${data.companyName.toUpperCase()}  ·  CONSTANCIA DE VACACIONES  ·  DOCUMENTO CONFIDENCIAL`,
        C.accent,
    );

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

    // Page background
    fill(doc, 0, 0, PW, PH, C.bgPage);

    // ── Header (amber accent) ──
    let y = drawHeader(
        doc, PW, ML, MR,
        C.amber, C.amberAcc,
        data.companyName,
        "CONSTANCIA DE VACACIONES FRACCIONADAS",
        "Art. 196 LOTTT — Porción proporcional al período trabajado",
        "Fecha de Egreso",
        formatDateES(data.fechaEgreso),
    );

    // ── Employee card ──
    y = drawEmployeeCard(
        doc, ML, W, MR, y, C.amber,
        data.employee.nombre,
        data.employee.cargo,
        data.employee.cedula,
        `${data.aniosCompletos} año${data.aniosCompletos !== 1 ? "s" : ""} completo${data.aniosCompletos !== 1 ? "s" : ""}`,
    );

    // ── Params strip: Fecha Ingreso | Último Aniversario | Meses Año | Días Anuales ──
    y = drawParamsStrip(doc, ML, W, y, [
        { lbl: "Fecha de Ingreso",    val: formatDateES(data.fechaIngreso).toUpperCase(),        color: C.white },
        { lbl: "Último Aniversario",  val: formatDateES(data.ultimoAniversario).toUpperCase(),   color: C.white },
        { lbl: "Meses Año en Curso",  val: `${data.mesesFraccion} mes${data.mesesFraccion !== 1 ? "es" : ""}`, color: C.accentBg },
        { lbl: "Días Anuales Base",   val: `${data.diasAnuales} días`,                           color: C.white },
    ]);

    // ── Formula box ──
    const formulaH = 10;
    fill(doc, ML, y, W, formulaH, C.bgStripe);
    rect(doc, ML, y, W, formulaH, C.border, 0.2);
    txt(doc, "FÓRMULA (ART. 196):", ML + 4, y + 4, 5, false, C.muted);
    txt(doc,
        `\u2308 ${data.diasAnuales} días / 12 meses × ${data.mesesFraccion} meses \u2309  =  ${data.fraccionDisfrute} días`,
        ML + 4, y + 8.5, 7, true, C.inkMed,
    );
    y += formulaH + 3;

    // ── Concept table ──
    y = drawConceptTable(
        doc, ML, W, MR, y,
        [
            {
                label: "Disfrute Fraccionado",
                subtitle: `Art. 190 + 196 LOTTT · ${data.diasAnuales}d/12 × ${data.mesesFraccion} meses`,
                dias: data.fraccionDisfrute, monto: data.montoDisfrute,
                color: C.amber, alt: false,
            },
            {
                label: "Bono Vacacional Fraccionado",
                subtitle: `Art. 192 + 196 LOTTT · ${data.diasAnuales}d/12 × ${data.mesesFraccion} meses`,
                dias: data.fraccionBono, monto: data.montoBono,
                color: C.amber, alt: true,
            },
        ],
        "Total Fraccionado",
        data.fraccionDisfrute + data.fraccionBono,
        data.total,
        C.amberAcc,
        C.amberAcc,
    );

    // ── Salary strip (light) ──
    fill(doc, ML, y, W, 10, C.bgStripe);
    rect(doc, ML, y, W, 10, C.border, 0.2);
    txt(doc, "SALARIO MENSUAL:", ML + 4, y + 4, 5, false, C.muted);
    txt(doc, fmtVES(data.salarioVES), ML + 44, y + 4, 7, true, C.inkMed);
    txt(doc, "SALARIO DIARIO:", ML + W * 0.5, y + 4, 5, false, C.muted);
    txt(doc, fmtVES(data.salarioDia), ML + W * 0.5 + 38, y + 4, 7, true, C.inkMed);
    txt(doc, `Base: salario mensual ÷ 30 = ${fmtVES(data.salarioDia)} / día`,
        ML + 4, y + 8.5, 5, false, C.muted);
    y += 14;

    // ── Signatures ──
    y = drawSignatures(doc, ML, W, y);

    // ── Legal note ──
    drawLegal(doc, ML, W, y,
        "La presente constancia certifica el pago de las vacaciones fraccionadas de conformidad con el Art. 196 " +
        "de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT), correspondientes a la fracción " +
        "del año de servicio no cubierta por el período completo. El cálculo se realiza sobre el salario normal del trabajador.",
    );

    // ── Footer ──
    drawFooter(doc, PW, PH,
        `${data.companyName.toUpperCase()}  ·  VACACIONES FRACCIONADAS  ·  DOCUMENTO CONFIDENCIAL`,
        C.amberAcc,
    );

    doc.save(`vacaciones_fraccionadas_${data.employee.cedula}_${data.fechaEgreso.replaceAll("-", "")}.pdf`);
}
