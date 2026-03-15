// ============================================================================
// PRESTACIONES PDF — Constancia de Prestaciones Sociales (Art. 142 LOTTT)
// ============================================================================

import jsPDF from "jspdf";

export interface PrestacionesPdfData {
    companyName:            string;
    employee:               { nombre: string; cedula: string; cargo?: string };
    fechaIngreso:           string;   // ISO
    fechaCorte:             string;   // ISO
    // Antigüedad
    anios:                  number;
    mesesCompletos:         number;
    totalDias:              number;
    // Salario
    salarioVES:             number;
    salarioDiario:          number;
    alicuotaUtil:           number;
    alicuotaBono:           number;
    salarioIntegralDiario:  number;
    // Días
    diasTrimestrales:       number;
    diasAdicionales:        number;
    diasTotales:            number;
    // Montos
    saldoAcumulado:         number;
    garantia:               number;   // 30d × integral × años (Art. 142.c)
    montoFinal:             number;   // max(saldo, garantia)
    aplicaGarantia:         boolean;
}

type RGB = [number, number, number];
const C = {
    inkMed:   [50,  50,  60]  as RGB,
    muted:    [120, 120, 132] as RGB,
    border:   [218, 218, 226] as RGB,
    borderMd: [175, 175, 185] as RGB,
    bg:       [246, 246, 250] as RGB,
    rowAlt:   [240, 240, 245] as RGB,
    white:    [255, 255, 255] as RGB,
    header:   [18,  18,  26]  as RGB,
    primary:  [8,   145, 178] as RGB,
    accent:   [34,  211, 238] as RGB,
    green:    [22,  101, 52]  as RGB,
    greenBg:  [167, 243, 208] as RGB,
    amber:    [180, 120, 10]  as RGB,
};

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
    fill(doc, 0, PH - 10, PW, 1, C.greenBg);
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

function detailRow(
    doc: jsPDF, ML: number, W: number, y: number,
    label: string, sub: string, value: string, color: RGB, alt: boolean,
): number {
    const H = 10;
    fill(doc, ML, y, W, H, alt ? C.rowAlt : C.white);
    hline(doc, ML, y + H, W, C.border, 0.1);
    txt(doc, label, ML + 4,  y + 4.5, 7,   true,  C.inkMed);
    txt(doc, sub,   ML + 4,  y + 8.5, 4.5, false, C.muted, "left", W * 0.6);
    txt(doc, value, MR_DOC,  y + 7,   7.5, true,  color,   "right");
    return y + H;
}

// Module-level ref for MR (set per call)
let MR_DOC = 0;

export function generatePrestacionesPdf(data: PrestacionesPdfData): void {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 13, MR = PW - 13, W = MR - ML;
    MR_DOC = MR;

    drawBg(doc, PW, PH);

    // ── Header ────────────────────────────────────────────────────────────────
    const HDR_H = 40;
    fill(doc, 0, 0, PW, HDR_H, C.header);
    fill(doc, 0, HDR_H - 2, PW, 2, C.greenBg);
    fill(doc, 0, 0, 4, HDR_H - 2, C.green);

    txt(doc, data.companyName.toUpperCase(),        ML + 2, 10,   11, true,  C.white);
    txt(doc, "CONSTANCIA DE PRESTACIONES SOCIALES", ML + 2, 17,   6,  false, [100,100,120] as RGB);
    txt(doc, "Art. 142 LOTTT — Garantía de Prestaciones",   ML + 2, 23.5, 5.5, false, [80,80,100] as RGB);
    txt(doc, "CORTE AL",                            MR,     12,   5,  false, [100,100,118] as RGB, "right");
    txt(doc, formatDateES(data.fechaCorte),         MR,     18.5, 7,  true,  C.white, "right");
    txt(doc,
        `Emitido: ${new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}`,
        MR, 26, 5, false, [100,100,118] as RGB, "right",
    );

    let y = HDR_H + 5;

    // ── Employee card ──────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 14, C.white);
    fill(doc, ML, y, 3,  14, C.green);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.rect(ML, y, W, 14, "D");
    txt(doc, data.employee.nombre.toUpperCase(), ML + 7, y + 5.5, 9,   true,  C.inkMed, "left", W * 0.65);
    txt(doc, data.employee.cargo?.toUpperCase() ?? "", ML + 7, y + 10, 5.5, false, C.muted, "left", W * 0.55);
    txt(doc, `CI: ${data.employee.cedula}`,      MR - 2, y + 5.5, 7.5, true,  C.inkMed, "right");
    txt(doc, `Ingreso: ${formatDateES(data.fechaIngreso).toUpperCase()}`, MR - 2, y + 10, 5, false, C.muted, "right");

    y += 18;

    // ── Antigüedad strip ──────────────────────────────────────────────────────
    fill(doc, ML, y, W, 13, C.header);
    const px1 = ML + 4, px2 = ML + W * 0.28, px3 = ML + W * 0.56, px4 = MR - 4;
    txt(doc, "ANTIGÜEDAD",                       px1, y + 4, 5, false, C.muted);
    txt(doc, `${data.anios} año${data.anios !== 1 ? "s" : ""} ${data.mesesCompletos % 12} mes${(data.mesesCompletos % 12) !== 1 ? "es" : ""}`,
        px1, y + 9, 7, true, C.white);
    txt(doc, "DÍAS TOTALES",                     px2, y + 4, 5, false, C.muted);
    txt(doc, `${data.totalDias} días`,           px2, y + 9, 7, true, C.white);
    txt(doc, "SAL. INTEGRAL / DÍA",              px3, y + 4, 5, false, C.muted);
    txt(doc, fmtVES(data.salarioIntegralDiario), px3, y + 9, 7, true, [150,230,200] as RGB);
    txt(doc, "SAL. INTEGRAL / MES",              px4, y + 4, 5, false, C.muted, "right");
    txt(doc, fmtVES(data.salarioIntegralDiario * 30), px4, y + 9, 7, true, C.white, "right");

    y += 17;

    // ── Section: Salario Integral ─────────────────────────────────────────────
    fill(doc, ML, y, W, 7, C.header);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text("COMPONENTE SALARIAL",  ML + 4, y + 4.5);
    doc.text("FÓRMULA",              ML + W * 0.6, y + 4.5, { align: "right" });
    doc.text("MONTO/DÍA",            MR, y + 4.5, { align: "right" });
    y += 7;

    y = detailRow(doc, ML, W, y, "Salario normal / día", "Salario mensual ÷ 30", fmtVES(data.salarioDiario), C.inkMed, false);
    y = detailRow(doc, ML, W, y, "Alícuota de utilidades", `${fmtVES(data.salarioDiario)} × días_util / 360`, fmtVES(data.alicuotaUtil), C.inkMed, true);
    y = detailRow(doc, ML, W, y, "Alícuota bono vacacional", `${fmtVES(data.salarioDiario)} × días_bono / 360`, fmtVES(data.alicuotaBono), C.inkMed, false);

    // Integral total
    fill(doc, ML, y, W, 10, C.header);
    fill(doc, ML, y, 3,  10, C.green);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text("SALARIO INTEGRAL DIARIO  (Art. 122 LOTTT)", ML + 7, y + 6.5);
    doc.setTextColor(C.greenBg[0], C.greenBg[1], C.greenBg[2]);
    doc.setFontSize(9);
    doc.text(fmtVES(data.salarioIntegralDiario), MR, y + 7, { align: "right" });

    y += 14;

    // ── Section: Días acumulados ──────────────────────────────────────────────
    fill(doc, ML, y, W, 7, C.header);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text("PRESTACIONES ACUMULADAS  (Art. 142)", ML + 4, y + 4.5);
    doc.text("DÍAS", MR, y + 4.5, { align: "right" });
    y += 7;

    // Trimestrales
    fill(doc, ML, y, W, 10, C.white);
    hline(doc, ML, y + 10, W, C.border, 0.1);
    txt(doc, "Días trimestrales", ML + 4, y + 4.5, 7, true, C.inkMed);
    txt(doc, `5 días/mes × ${data.mesesCompletos} meses completos`, ML + 4, y + 8.5, 4.5, false, C.muted);
    txt(doc, `${data.diasTrimestrales} días`, MR, y + 7, 7.5, true, C.inkMed, "right");
    y += 10;

    // Adicionales
    fill(doc, ML, y, W, 10, C.rowAlt);
    hline(doc, ML, y + 10, W, C.border, 0.1);
    txt(doc, "Días adicionales", ML + 4, y + 4.5, 7, true, C.inkMed);
    txt(doc, `2 días × año desde año 2 (acumulativo) — Art. 142.b`, ML + 4, y + 8.5, 4.5, false, C.muted);
    txt(doc, `${data.diasAdicionales} días`, MR, y + 7, 7.5, true,
        data.diasAdicionales > 0 ? C.amber : C.muted, "right");
    y += 10 + 2;

    // Total días → Saldo acumulado
    fill(doc, ML, y, W, 11, C.header);
    fill(doc, ML, y, 3,  11, C.primary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text(`SALDO ACUMULADO  ·  ${data.diasTotales} días × ${fmtVES(data.salarioIntegralDiario)}`, ML + 7, y + 7);
    doc.setTextColor(C.accent[0], C.accent[1], C.accent[2]);
    doc.setFontSize(9);
    doc.text(fmtVES(data.saldoAcumulado), MR, y + 7.5, { align: "right" });

    y += 15;

    // ── Garantía Art. 142.c ───────────────────────────────────────────────────
    fill(doc, ML, y, W, 11, C.header);
    fill(doc, ML, y, 3,  11, C.green);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text(`GARANTÍA ART. 142.C  ·  30 días × ${fmtVES(data.salarioIntegralDiario)} × ${data.anios} año${data.anios !== 1 ? "s" : ""}`, ML + 7, y + 7);
    doc.setTextColor(C.greenBg[0], C.greenBg[1], C.greenBg[2]);
    doc.setFontSize(9);
    doc.text(fmtVES(data.garantia), MR, y + 7.5, { align: "right" });

    y += 15;

    // ── Monto final ───────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 13, data.aplicaGarantia ? C.green : C.primary);
    fill(doc, ML, y, 3,  13, data.aplicaGarantia ? C.greenBg : C.accent);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(C.white[0], C.white[1], C.white[2]);
    doc.text(
        data.aplicaGarantia
            ? "SE APLICA GARANTÍA ART. 142.C  (mayor al saldo acumulado)"
            : "SE APLICA SALDO ACUMULADO  (mayor a la garantía)",
        ML + 7, y + 5.5,
    );
    doc.setFontSize(11);
    doc.text(fmtVES(data.montoFinal), MR, y + 9.5, { align: "right" });

    y += 18;

    // ── Signatures ────────────────────────────────────────────────────────────
    txt(doc, "FIRMAS DE CONFORMIDAD", ML, y, 6, true, C.inkMed);
    y += 5;
    y = drawSignatures(doc, ML, W, y);

    // ── Legal note ────────────────────────────────────────────────────────────
    hline(doc, ML, y, W, C.border, 0.2);
    y += 4;
    const legal = "La presente constancia certifica el saldo de prestaciones sociales de conformidad con el Art. 142 de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). El monto corresponde al mayor valor entre el saldo acumulado (Art. 142.a y 142.b) y la garantía de 30 días de salario integral por año de servicio (Art. 142.c). El salario integral incluye las alícuotas de utilidades y bono vacacional (Art. 122 LOTTT).";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    (doc.splitTextToSize(legal, W) as string[]).forEach((line: string, i: number) => {
        doc.text(line, ML, y + i * 3.5);
    });

    drawFooter(doc, PW, PH, data.companyName, `PRESTACIONES AL ${formatDateES(data.fechaCorte).toUpperCase()}`);
    doc.save(`prestaciones_${data.employee.cedula}_${data.fechaCorte.replaceAll("-", "")}.pdf`);
}
