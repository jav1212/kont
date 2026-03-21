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
    // Ajustes opcionales
    anticipoPrestaciones:   number;
    interesesAcumulados:    number;
    pagoInmediato:          number;   // anticipo + intereses (lo que se paga ahora)
    saldoFavor:             number;   // montoFinal − anticipo − intereses
    porcentajeAnticipo?:    number;   // e.g. 75
    tasaIntereses?:         number;   // e.g. 3
}

type RGB = [number, number, number];
const C = {
    inkMed:   [50,  50,  60]  as RGB,
    muted:    [120, 120, 132] as RGB,
    border:   [218, 218, 226] as RGB,
    borderMd: [175, 175, 185] as RGB,
    bg:       [255, 255, 255] as RGB,   // blanco para impresión
    rowAlt:   [240, 240, 245] as RGB,
    white:    [255, 255, 255] as RGB,
    header:   [255, 255, 255] as RGB,
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
    fill(doc, 0, PH - 10, PW, 10, C.white);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.3);
    doc.line(0, PH - 10, PW, PH - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
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

    txt(doc, data.companyName.toUpperCase(),        ML + 2, 10,   11, true,  C.inkMed);
    txt(doc, "CONSTANCIA DE PRESTACIONES SOCIALES", ML + 2, 17,   6,  false, C.muted);
    txt(doc, "Art. 142 LOTTT — Garantía de Prestaciones",   ML + 2, 23.5, 5.5, false, C.muted);
    txt(doc, "CORTE AL",                            MR,     12,   5,  false, C.muted, "right");
    txt(doc, formatDateES(data.fechaCorte),         MR,     18.5, 7,  true,  C.inkMed, "right");
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
    fill(doc, ML, y, W, 13, C.rowAlt);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.rect(ML, y, W, 13, "D");
    const px1 = ML + 4, px2 = ML + W * 0.28, px3 = ML + W * 0.56, px4 = MR - 4;
    txt(doc, "ANTIGÜEDAD",                       px1, y + 4, 5, false, C.muted);
    txt(doc, `${data.anios} año${data.anios !== 1 ? "s" : ""} ${data.mesesCompletos % 12} mes${(data.mesesCompletos % 12) !== 1 ? "es" : ""}`,
        px1, y + 9, 7, true, C.inkMed);
    txt(doc, "DÍAS TOTALES",                     px2, y + 4, 5, false, C.muted);
    txt(doc, `${data.totalDias} días`,           px2, y + 9, 7, true, C.inkMed);
    txt(doc, "SAL. INTEGRAL / DÍA",              px3, y + 4, 5, false, C.muted);
    txt(doc, fmtVES(data.salarioIntegralDiario), px3, y + 9, 7, true, C.green);
    txt(doc, "SAL. INTEGRAL / MES",              px4, y + 4, 5, false, C.muted, "right");
    txt(doc, fmtVES(data.salarioIntegralDiario * 30), px4, y + 9, 7, true, C.inkMed, "right");

    y += 17;

    // ── Section: Salario Integral ─────────────────────────────────────────────
    fill(doc, ML, y, W, 7, C.rowAlt);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.setTextColor(C.inkMed[0], C.inkMed[1], C.inkMed[2]);
    doc.text("COMPONENTE SALARIAL",  ML + 4, y + 4.5);
    doc.text("FÓRMULA",              ML + W * 0.6, y + 4.5, { align: "right" });
    doc.text("MONTO/DÍA",            MR, y + 4.5, { align: "right" });
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.line(ML, y + 7, ML + W, y + 7);
    y += 7;

    y = detailRow(doc, ML, W, y, "Salario normal / día", "Salario mensual ÷ 30", fmtVES(data.salarioDiario), C.inkMed, false);
    y = detailRow(doc, ML, W, y, "Alícuota de utilidades", `${fmtVES(data.salarioDiario)} × días_util / 360`, fmtVES(data.alicuotaUtil), C.inkMed, true);
    y = detailRow(doc, ML, W, y, "Alícuota bono vacacional", `${fmtVES(data.salarioDiario)} × días_bono / 360`, fmtVES(data.alicuotaBono), C.inkMed, false);

    // Integral total
    fill(doc, ML, y, W, 10, C.white);
    fill(doc, ML, y, 3,  10, C.green);
    doc.setDrawColor(C.green[0], C.green[1], C.green[2]);
    doc.setLineWidth(0.8);
    doc.line(ML, y, ML + W, y);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.line(ML, y + 10, ML + W, y + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(C.inkMed[0], C.inkMed[1], C.inkMed[2]);
    doc.text("SALARIO INTEGRAL DIARIO  (Art. 122 LOTTT)", ML + 7, y + 6.5);
    doc.setTextColor(C.green[0], C.green[1], C.green[2]);
    doc.setFontSize(9);
    doc.text(fmtVES(data.salarioIntegralDiario), MR, y + 7, { align: "right" });

    y += 14;

    // ── Section: Días acumulados ──────────────────────────────────────────────
    fill(doc, ML, y, W, 7, C.rowAlt);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.setTextColor(C.inkMed[0], C.inkMed[1], C.inkMed[2]);
    doc.text("PRESTACIONES ACUMULADAS  (Art. 142)", ML + 4, y + 4.5);
    doc.text("DÍAS", MR, y + 4.5, { align: "right" });
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.line(ML, y + 7, ML + W, y + 7);
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
    fill(doc, ML, y, W, 11, C.white);
    fill(doc, ML, y, 3,  11, C.primary);
    doc.setDrawColor(C.primary[0], C.primary[1], C.primary[2]);
    doc.setLineWidth(0.8);
    doc.line(ML, y, ML + W, y);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.line(ML, y + 11, ML + W, y + 11);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(C.inkMed[0], C.inkMed[1], C.inkMed[2]);
    doc.text(`SALDO ACUMULADO  ·  ${data.diasTotales} días × ${fmtVES(data.salarioIntegralDiario)}`, ML + 7, y + 7);
    doc.setTextColor(C.primary[0], C.primary[1], C.primary[2]);
    doc.setFontSize(9);
    doc.text(fmtVES(data.saldoAcumulado), MR, y + 7.5, { align: "right" });

    y += 15;

    // ── Garantía Art. 142.c ───────────────────────────────────────────────────
    fill(doc, ML, y, W, 11, C.white);
    fill(doc, ML, y, 3,  11, C.green);
    doc.setDrawColor(C.green[0], C.green[1], C.green[2]);
    doc.setLineWidth(0.8);
    doc.line(ML, y, ML + W, y);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.line(ML, y + 11, ML + W, y + 11);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(C.inkMed[0], C.inkMed[1], C.inkMed[2]);
    doc.text(`GARANTÍA ART. 142.C  ·  30 días × ${fmtVES(data.salarioIntegralDiario)} × ${data.anios} año${data.anios !== 1 ? "s" : ""}`, ML + 7, y + 7);
    doc.setTextColor(C.green[0], C.green[1], C.green[2]);
    doc.setFontSize(9);
    doc.text(fmtVES(data.garantia), MR, y + 7.5, { align: "right" });

    y += 15;

    // ── Monto final ───────────────────────────────────────────────────────────
    const montoColor = data.aplicaGarantia ? C.green : C.primary;
    const montoBar   = data.aplicaGarantia ? C.greenBg : [103, 232, 249] as RGB;
    fill(doc, ML, y, W, 13, C.white);
    fill(doc, ML, y, 3,  13, montoBar);
    doc.setDrawColor(montoColor[0], montoColor[1], montoColor[2]);
    doc.setLineWidth(1);
    doc.line(ML, y, ML + W, y);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.line(ML, y + 13, ML + W, y + 13);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(C.inkMed[0], C.inkMed[1], C.inkMed[2]);
    doc.text(
        data.aplicaGarantia
            ? "SE APLICA GARANTÍA ART. 142.C  (mayor al saldo acumulado)"
            : "SE APLICA SALDO ACUMULADO  (mayor a la garantía)",
        ML + 7, y + 5.5,
    );
    doc.setTextColor(montoColor[0], montoColor[1], montoColor[2]);
    doc.setFontSize(11);
    doc.text(fmtVES(data.montoFinal), MR, y + 9.5, { align: "right" });

    y += 18;

    // ── Pago inmediato + Saldo a favor ────────────────────────────────────────
    if (data.anticipoPrestaciones > 0 || data.interesesAcumulados > 0) {
        const pct = data.porcentajeAnticipo ?? 75;

        // Sub-header: Pago inmediato
        fill(doc, ML, y, W, 7, C.rowAlt);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(5);
        doc.setTextColor(C.inkMed[0], C.inkMed[1], C.inkMed[2]);
        doc.text("PAGO INMEDIATO  (Art. 143 / 144 LOTTT)", ML + 4, y + 4.5);
        doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
        doc.setLineWidth(0.2);
        doc.line(ML, y + 7, ML + W, y + 7);
        y += 7;

        if (data.anticipoPrestaciones > 0) {
            fill(doc, ML, y, W, 10, C.white);
            hline(doc, ML, y + 10, W, C.border, 0.1);
            txt(doc, `Anticipo (${pct}% saldo acumulado)`, ML + 4, y + 4.5, 7, true, C.inkMed);
            txt(doc, `Art. 144 LOTTT — ${pct}% de ${fmtVES(data.saldoAcumulado)}`, ML + 4, y + 8.5, 4.5, false, C.muted);
            txt(doc, fmtVES(data.anticipoPrestaciones), MR, y + 7, 8, true, C.amber, "right");
            y += 10;
        }

        if (data.interesesAcumulados > 0) {
            fill(doc, ML, y, W, 10, C.rowAlt);
            hline(doc, ML, y + 10, W, C.border, 0.1);
            txt(doc, "Intereses acumulados", ML + 4, y + 4.5, 7, true, C.inkMed);
            txt(doc, "Art. 143 LOTTT — Se pagan junto con el anticipo", ML + 4, y + 8.5, 4.5, false, C.muted);
            txt(doc, fmtVES(data.interesesAcumulados), MR, y + 7, 8, true, C.green, "right");
            y += 10;
        }

        // Total pago inmediato bar
        fill(doc, ML, y, W, 11, C.white);
        fill(doc, ML, y, 3,  11, [253, 200, 80] as RGB);
        doc.setDrawColor(C.amber[0], C.amber[1], C.amber[2]);
        doc.setLineWidth(0.8);
        doc.line(ML, y, ML + W, y);
        doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
        doc.setLineWidth(0.2);
        doc.line(ML, y + 11, ML + W, y + 11);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.5);
        doc.setTextColor(C.inkMed[0], C.inkMed[1], C.inkMed[2]);
        doc.text("TOTAL PAGO INMEDIATO  (Anticipo + Intereses)", ML + 7, y + 7);
        doc.setTextColor(C.amber[0], C.amber[1], C.amber[2]);
        doc.setFontSize(9);
        doc.text(fmtVES(data.pagoInmediato), MR, y + 7.5, { align: "right" });

        y += 15;

        // Sub-header: Saldo a favor
        fill(doc, ML, y, W, 7, C.rowAlt);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(5);
        doc.setTextColor(C.inkMed[0], C.inkMed[1], C.inkMed[2]);
        doc.text("SALDO A FAVOR DEL TRABAJADOR", ML + 4, y + 4.5);
        doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
        doc.setLineWidth(0.2);
        doc.line(ML, y + 7, ML + W, y + 7);
        y += 7;

        // Monto prestaciones row
        fill(doc, ML, y, W, 10, C.white);
        hline(doc, ML, y + 10, W, C.border, 0.1);
        txt(doc, "Monto total prestaciones", ML + 4, y + 4.5, 7, true, C.inkMed);
        txt(doc, data.aplicaGarantia ? "Garantía Art. 142.c" : "Saldo acumulado", ML + 4, y + 8.5, 4.5, false, C.muted);
        txt(doc, fmtVES(data.montoFinal), MR, y + 7, 7.5, true, C.inkMed, "right");
        y += 10;

        // Deducción row
        fill(doc, ML, y, W, 10, C.rowAlt);
        hline(doc, ML, y + 10, W, C.border, 0.1);
        txt(doc, "- Anticipo + Intereses", ML + 4, y + 4.5, 7, true, C.inkMed);
        txt(doc, "Monto ya pagado al trabajador", ML + 4, y + 8.5, 4.5, false, C.muted);
        txt(doc, `- ${fmtVES(data.pagoInmediato)}`, MR, y + 7, 7.5, true, C.muted, "right");
        y += 10 + 2;

        // Saldo a favor bar
        fill(doc, ML, y, W, 13, C.white);
        fill(doc, ML, y, 3,  13, C.greenBg);
        doc.setDrawColor(C.green[0], C.green[1], C.green[2]);
        doc.setLineWidth(1);
        doc.line(ML, y, ML + W, y);
        doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
        doc.setLineWidth(0.2);
        doc.line(ML, y + 13, ML + W, y + 13);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.setTextColor(C.inkMed[0], C.inkMed[1], C.inkMed[2]);
        doc.text("SALDO A FAVOR  (Prestaciones - Anticipo - Intereses)", ML + 7, y + 5.5);
        doc.setFontSize(11);
        doc.setTextColor(C.green[0], C.green[1], C.green[2]);
        doc.text(fmtVES(data.saldoFavor), MR, y + 9.5, { align: "right" });

        y += 18;
    }

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

// ============================================================================
// SIMPLIFIED PDF — Intereses y Anticipo (Art. 143 / 144 LOTTT)
// ============================================================================

export function generateInteresesAnticipoPdf(data: PrestacionesPdfData): void {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 13, MR = PW - 13, W = MR - ML;
    MR_DOC = MR;

    drawBg(doc, PW, PH);

    // ── Header ────────────────────────────────────────────────────────────────
    const HDR_H = 40;
    fill(doc, 0, 0, PW, HDR_H, C.header);
    fill(doc, 0, HDR_H - 2, PW, 2, [253, 230, 138] as RGB);
    fill(doc, 0, 0, 4, HDR_H - 2, C.amber);

    txt(doc, data.companyName.toUpperCase(),          ML + 2, 10,   11, true,  C.inkMed);
    txt(doc, "INTERESES Y ANTICIPO DE PRESTACIONES",  ML + 2, 17,   6,  false, C.muted);
    txt(doc, "Art. 143 / 144 LOTTT",                  ML + 2, 23.5, 5.5, false, C.muted);
    txt(doc, "CORTE AL",                              MR,     12,   5,  false, C.muted, "right");
    txt(doc, formatDateES(data.fechaCorte),           MR,     18.5, 7,  true,  C.inkMed, "right");
    txt(doc,
        `Emitido: ${new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}`,
        MR, 26, 5, false, [100,100,118] as RGB, "right",
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
    txt(doc, `Ingreso: ${formatDateES(data.fechaIngreso).toUpperCase()}`, MR - 2, y + 10, 5, false, C.muted, "right");

    y += 18;

    // ── Antigüedad strip (params reference) ───────────────────────────────────
    fill(doc, ML, y, W, 13, C.rowAlt);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.rect(ML, y, W, 13, "D");
    const px1 = ML + 4, px2 = ML + W * 0.35, px3 = MR - 4;
    txt(doc, "ANTIGÜEDAD",                        px1, y + 4, 5, false, C.muted);
    txt(doc, `${data.anios} año${data.anios !== 1 ? "s" : ""} ${data.mesesCompletos % 12} mes${(data.mesesCompletos % 12) !== 1 ? "es" : ""}`,
        px1, y + 9, 7, true, C.inkMed);
    txt(doc, "SALDO ACUMULADO",                   px2, y + 4, 5, false, C.muted);
    txt(doc, fmtVES(data.saldoAcumulado),         px2, y + 9, 7, true, C.primary);
    txt(doc, "SAL. INTEGRAL / DÍA",               px3, y + 4, 5, false, C.muted, "right");
    txt(doc, fmtVES(data.salarioIntegralDiario),  px3, y + 9, 7, true, C.inkMed, "right");

    y += 17;

    const pct  = data.porcentajeAnticipo ?? 75;
    const tasa = data.tasaIntereses ?? 0;

    // ── Pago inmediato ────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 7, C.rowAlt);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.setTextColor(C.inkMed[0], C.inkMed[1], C.inkMed[2]);
    doc.text("PAGO INMEDIATO  (Art. 143 / 144 LOTTT)", ML + 4, y + 4.5);
    doc.text("MONTO", MR, y + 4.5, { align: "right" });
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.line(ML, y + 7, ML + W, y + 7);
    y += 7;

    // Anticipo
    fill(doc, ML, y, W, 10, C.white);
    hline(doc, ML, y + 10, W, C.border, 0.1);
    txt(doc, `Anticipo (${pct}% saldo acumulado)`, ML + 4, y + 4.5, 7, true, C.inkMed);
    txt(doc, `Art. 144 LOTTT — ${pct}% de ${fmtVES(data.saldoAcumulado)}`, ML + 4, y + 8.5, 4.5, false, C.muted);
    txt(doc, fmtVES(data.anticipoPrestaciones), MR, y + 7, 8, true, C.amber, "right");
    y += 10;

    // Intereses acumulados
    fill(doc, ML, y, W, 10, C.rowAlt);
    hline(doc, ML, y + 10, W, C.border, 0.1);
    txt(doc, "Intereses acumulados", ML + 4, y + 4.5, 7, true, C.inkMed);
    txt(doc, `Art. 143 LOTTT — ${fmtVES(data.saldoAcumulado)} × ${tasa}% × ${data.mesesCompletos} meses / 12`, ML + 4, y + 8.5, 4.5, false, C.muted);
    txt(doc, fmtVES(data.interesesAcumulados), MR, y + 7, 8, true, C.green, "right");
    y += 10 + 2;

    // Total pago inmediato
    fill(doc, ML, y, W, 12, C.white);
    fill(doc, ML, y, 3,  12, [253, 200, 80] as RGB);
    doc.setDrawColor(C.amber[0], C.amber[1], C.amber[2]);
    doc.setLineWidth(0.8);
    doc.line(ML, y, ML + W, y);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.line(ML, y + 12, ML + W, y + 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(C.inkMed[0], C.inkMed[1], C.inkMed[2]);
    doc.text("TOTAL PAGO INMEDIATO  (Anticipo + Intereses)", ML + 7, y + 7);
    doc.setTextColor(C.amber[0], C.amber[1], C.amber[2]);
    doc.setFontSize(10);
    doc.text(fmtVES(data.pagoInmediato), MR, y + 8, { align: "right" });

    y += 16;

    // ── Saldo a favor ─────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 7, C.rowAlt);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.setTextColor(C.inkMed[0], C.inkMed[1], C.inkMed[2]);
    doc.text("SALDO A FAVOR DEL TRABAJADOR", ML + 4, y + 4.5);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.line(ML, y + 7, ML + W, y + 7);
    y += 7;

    fill(doc, ML, y, W, 10, C.white);
    hline(doc, ML, y + 10, W, C.border, 0.1);
    txt(doc, "Monto total prestaciones", ML + 4, y + 4.5, 7, true, C.inkMed);
    txt(doc, data.aplicaGarantia ? "Garantía Art. 142.c" : "Saldo acumulado", ML + 4, y + 8.5, 4.5, false, C.muted);
    txt(doc, fmtVES(data.montoFinal), MR, y + 7, 7.5, true, C.inkMed, "right");
    y += 10;

    fill(doc, ML, y, W, 10, C.rowAlt);
    hline(doc, ML, y + 10, W, C.border, 0.1);
    txt(doc, "− Anticipo + Intereses", ML + 4, y + 4.5, 7, true, C.inkMed);
    txt(doc, "Monto ya pagado al trabajador", ML + 4, y + 8.5, 4.5, false, C.muted);
    txt(doc, `− ${fmtVES(data.pagoInmediato)}`, MR, y + 7, 7.5, true, C.muted, "right");
    y += 10 + 2;

    // Saldo a favor bar
    fill(doc, ML, y, W, 14, C.white);
    fill(doc, ML, y, 3,  14, [167, 243, 208] as RGB);
    doc.setDrawColor(C.green[0], C.green[1], C.green[2]);
    doc.setLineWidth(1);
    doc.line(ML, y, ML + W, y);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.line(ML, y + 14, ML + W, y + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(C.inkMed[0], C.inkMed[1], C.inkMed[2]);
    doc.text("SALDO A FAVOR  (Prestaciones - Anticipo - Intereses)", ML + 7, y + 5.5);
    doc.setFontSize(5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text("Monto pendiente en el fideicomiso del trabajador", ML + 7, y + 10);
    doc.setFontSize(12);
    doc.setTextColor(C.green[0], C.green[1], C.green[2]);
    doc.text(fmtVES(data.saldoFavor), MR, y + 10, { align: "right" });

    y += 20;

    // ── Signatures ────────────────────────────────────────────────────────────
    txt(doc, "FIRMAS DE CONFORMIDAD", ML, y, 6, true, C.inkMed);
    y += 5;
    y = drawSignatures(doc, ML, W, y);

    // ── Legal note ────────────────────────────────────────────────────────────
    hline(doc, ML, y, W, C.border, 0.2);
    y += 4;
    const legal = `Los intereses sobre prestaciones sociales son calculados conforme al Art. 143 LOTTT, aplicando la tasa del ${tasa}% anual sobre el saldo acumulado proporcional a los ${data.mesesCompletos} meses de servicio. El anticipo del ${pct}% corresponde al máximo establecido por el Art. 144 LOTTT, el cual limita el anticipo de prestaciones al 75% del saldo acumulado. El monto neto a cobrar resulta de sumar los intereses y deducir el anticipo del monto de prestaciones correspondiente.`;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    (doc.splitTextToSize(legal, W) as string[]).forEach((line: string, i: number) => {
        doc.text(line, ML, y + i * 3.5);
    });

    drawFooter(doc, PW, PH, data.companyName, `INTERESES Y ANTICIPO AL ${formatDateES(data.fechaCorte).toUpperCase()}`);
    doc.save(`intereses_anticipo_${data.employee.cedula}_${data.fechaCorte.replaceAll("-", "")}.pdf`);
}
