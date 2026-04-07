// prestaciones-pdf.ts
// Redesigned to match Premium/Clean UI of liquidaciones-pdf.ts

import jsPDF from "jspdf";
import { loadImageAsBase64 } from "./pdf-image-helper";

export interface PrestacionesPdfData {
    companyName:            string;
    employee:               { nombre: string; cedula: string; cargo?: string };
    fechaIngreso:           string;
    fechaCorte:             string;
    anios:                  number;
    mesesCompletos:         number;
    totalDias:              number;
    salarioVES:             number;
    salarioDiario:          number;
    alicuotaUtil:           number;
    alicuotaBono:           number;
    salarioIntegralDiario:  number;
    diasTrimestrales:       number;
    diasAdicionales:        number;
    diasTotales:            number;
    saldoAcumulado:         number;
    garantia:               number;
    montoFinal:             number;
    aplicaGarantia:         boolean;
    anticipoPrestaciones:   number;
    interesesAcumulados:    number;
    pagoInmediato:          number;
    saldoFavor:             number;
    porcentajeAnticipo?:    number;
    tasaIntereses?:         number;
    logoUrl?:               string;
    showLogoInPdf?:         boolean;
}

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
    primary:   [217, 58,  16]  as RGB,
    amber:     [220, 38,  38]  as RGB,
    green:     [22,  101, 52]  as RGB,
};

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

const fmtVES = (n: number) => "Bs. " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    return `${parseInt(d)} ${meses[parseInt(m) - 1]} ${y}`.toUpperCase();
};

function drawFooter(doc: Doc, PW: number, PH: number, companyName: string, sub: string) {
    fill(doc, 0, PH - 14, PW, 14, C.white);
    hline(doc, 0, PH - 14, PW, C.border, 0.4);
    lbl(doc, `${companyName.toUpperCase()}  |  ${sub}  |  DOCUMENTO CONFIDENCIAL`, PW / 2, PH - 7, "center", C.muted);
}

function drawSignatures(doc: Doc, ML: number, W: number, y: number): number {
    const SIG_W = (W - 16) / 2;
    const SIG_H = 24;
    ["EMPLEADOR", "TRABAJADOR"].forEach((role, i) => {
        const sx = ML + i * (SIG_W + 16);
        doc.setDrawColor(C.borderStr[0], C.borderStr[1], C.borderStr[2]);
        doc.setLineWidth(0.4);
        doc.setLineDashPattern([2, 1.5], 0);
        doc.rect(sx, y, SIG_W, SIG_H, "S");
        doc.setLineDashPattern([], 0); // reset
        
        hline(doc, sx + 8, y + SIG_H - 8, SIG_W - 16, C.borderStr, 0.4);
        lbl(doc, role, sx + SIG_W / 2, y + SIG_H - 4.5, "center", C.muted);
    });
    return y + SIG_H + 8;
}

function detailRow(
    doc: Doc, ML: number, MR: number, W: number, y: number,
    label: string, sub: string, value: string, color: RGB, alt: boolean, formula?: string
): number {
    const H = 10;
    if (alt) fill(doc, ML, y, W, H, C.rowAlt);
    hline(doc, ML, y + H, W, C.border, 0.25);
    
    t(doc, label, ML + 4,  y + 4.5, 7, true, C.ink);
    if (sub) t(doc, sub, ML + 4,  y + 8.5, 5, false, C.muted, "left", W * 0.5);
    
    if (formula) {
        tm(doc, formula, ML + W * 0.5, y + 6.5, 6, false, C.muted, "left");
    }
    
    tm(doc, value, MR - 4, y + 6.5, 8, true, color, "right");
    return y + H;
}

export async function generatePrestacionesPdf(data: PrestacionesPdfData): Promise<void> {
    console.log("Starting generatePrestacionesPdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 16, MR = PW - 16, W = MR - ML;

    let logoBase64 = null;
    if (data.showLogoInPdf && data.logoUrl) {
        console.log("Fetching logo...", data.logoUrl);
        logoBase64 = await loadImageAsBase64(data.logoUrl).catch(err => {
            console.warn("Logo fetch failed", err);
            return null;
        });
        console.log("Logo fetched:", !!logoBase64);
    }

    fill(doc, 0, 0, PW, PH, C.bg);

    // ── Header ────────────────────────────────────────────────────────────
    let topY = 20;
    if (logoBase64) {
        try { doc.addImage(logoBase64, "JPEG", ML, topY - 5, 28, 11); } catch { /* */ }
        t(doc, data.companyName.toUpperCase(), ML + 32, topY, 13, true, C.ink);
    } else {
        t(doc, data.companyName.toUpperCase(), ML, topY, 13, true, C.ink);
    }

    t(doc, "PRESTACIONES SOCIALES", MR, topY - 1, 9, true, C.ink, "right");
    t(doc, "ART. 142 LOTTT — GARANTÍA Y ACUMULADOS", MR, topY + 3, 6, false, C.muted, "right");

    lbl(doc, "FECHA CORTE", MR, topY + 11, "right");
    tm(doc, fmtDate(data.fechaCorte), MR, topY + 15, 9, true, C.inkMed, "right");
    
    lbl(doc, `EMITIDO: ${new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}`, MR, topY + 20, "right");

    let y = topY + 26;
    hline(doc, ML, y, W, C.border, 0.4);
    y += 8;

    // ── Employee data ──────────────────────────────────────────────
    const c1x = ML;
    const c2x = ML + W * 0.40;
    const c3x = ML + W * 0.70;

    lbl(doc, "Trabajador", c1x, y);
    t(doc, data.employee.nombre.toUpperCase(), c1x, y + 5, 9, true, C.ink, "left", c2x - c1x - 4);
    if (data.employee.cargo) t(doc, data.employee.cargo.toUpperCase(), c1x, y + 9, 6.5, false, C.muted);
    tm(doc, "CI " + data.employee.cedula, c1x, y + 13.5, 7.5, true, C.inkMed, "left");

    lbl(doc, "Antigüedad", c2x, y);
    const antStr = `${data.anios}a ${data.mesesCompletos % 12}m`;
    tm(doc, antStr, c2x, y + 5, 8.5, true, C.ink, "left");
    tm(doc, `Ingreso: ${fmtDate(data.fechaIngreso)}`, c2x, y + 9.5, 6.5, false, C.inkMed, "left");

    lbl(doc, "Sal. Integral / Día", c3x, y);
    tm(doc, fmtVES(data.salarioIntegralDiario), c3x, y + 5, 8.5, true, C.ink, "left");
    tm(doc, `Base: ${fmtVES(data.salarioDiario)}`, c3x, y + 9.5, 6.5, false, C.muted, "left");

    y += 18;
    hline(doc, ML, y, W, C.border, 0.4);
    y += 6;

    // ── Componentes Salariales ──────────────────────────────────────────────
    lbl(doc, "COMPONENTE SALARIAL", ML, y + 2, "left");
    y += 5;
    hline(doc, ML, y, W, C.borderStr, 0.8);
    y = detailRow(doc, ML, MR, W, y, "Salario normal / día", "", fmtVES(data.salarioDiario), C.inkMed, false, "Salario mensual ÷ 30");
    y = detailRow(doc, ML, MR, W, y, "Alícuota de utilidades", "", fmtVES(data.alicuotaUtil), C.inkMed, true, "Sal. Diario × días_util / 360");
    y = detailRow(doc, ML, MR, W, y, "Alícuota bono vacacional", "", fmtVES(data.alicuotaBono), C.inkMed, false, "Sal. Diario × días_bono / 360");
    
    fill(doc, ML, y, W, 8, C.rowAlt);
    t(doc, "SALARIO INTEGRAL DIARIO (Art. 122)", ML + 4, y + 5.5, 7, true, C.ink);
    tm(doc, fmtVES(data.salarioIntegralDiario), MR - 4, y + 5.5, 9, true, C.ink, "right");
    y += 8;
    hline(doc, ML, y, W, C.borderStr, 0.8);
    y += 8;

    // ── Días Acumulados ──────────────────────────────────────────────
    lbl(doc, "PRESTACIONES ACUMULADAS", ML, y + 2, "left");
    y += 5;
    hline(doc, ML, y, W, C.borderStr, 0.8);
    y = detailRow(doc, ML, MR, W, y, "Días trimestrales", "5 días/mes × meses completos", `${data.diasTrimestrales} días`, C.ink, false);
    y = detailRow(doc, ML, MR, W, y, "Días adicionales", "Art. 142.b (desde año 2)", `${data.diasAdicionales} días`, C.ink, true);
    
    fill(doc, ML, y, W, 12, C.white);
    t(doc, `SALDO ACUMULADO`, ML + 4, y + 5.5, 7, true, C.ink);
    t(doc, `${data.diasTotales} días × ${fmtVES(data.salarioIntegralDiario)}`, ML + 4, y + 9.5, 6, false, C.muted);
    tm(doc, fmtVES(data.saldoAcumulado), MR - 4, y + 7.5, 10, true, C.inkMed, "right");
    y += 12;
    hline(doc, ML, y, W, C.border, 0.25);
    fill(doc, ML, y, W, 12, C.white);
    t(doc, `GARANTÍA ART. 142.C`, ML + 4, y + 5.5, 7, true, C.ink);
    t(doc, `30 días × Sal. Integral × ${data.anios} año(s)`, ML + 4, y + 9.5, 6, false, C.muted);
    tm(doc, fmtVES(data.garantia), MR - 4, y + 7.5, 10, true, C.inkMed, "right");
    y += 12;

    // Monto final
    fill(doc, ML, y, W, 12, C.rowAlt);
    t(doc, "MONTO TOTAL PRESTACIONES", ML + 4, y + 7.5, 8, true, C.ink);
    tm(doc, fmtVES(data.montoFinal), MR - 4, y + 8, 12, true, C.ink, "right");
    y += 12;
    hline(doc, ML, y, W, C.borderStr, 0.8);
    y += 8;

    // ── Pago inmediato (Anticipos) ──────────────────────────────────────────
    if (data.anticipoPrestaciones > 0 || data.interesesAcumulados > 0) {
        const pct = data.porcentajeAnticipo ?? 75;
        lbl(doc, "PAGO INMEDIATO", ML, y + 2, "left");
        y += 5;
        hline(doc, ML, y, W, C.borderStr, 0.8);
        
        let localAlt = false;
        if (data.anticipoPrestaciones > 0) {
            y = detailRow(doc, ML, MR, W, y, `Anticipo de Prestaciones (${pct}%)`, "Art. 144 LOTTT", fmtVES(data.anticipoPrestaciones), C.amber, localAlt);
            localAlt = !localAlt;
        }
        if (data.interesesAcumulados > 0) {
            y = detailRow(doc, ML, MR, W, y, "Intereses de Fideicomiso", "Art. 143 LOTTT", fmtVES(data.interesesAcumulados), C.ink, localAlt);
        }

        fill(doc, ML, y, W, 12, C.white);
        t(doc, "Monto total acumulado (Garantía o Saldo)", ML + 4, y + 5.5, 7, false, C.inkMed);
        tm(doc, fmtVES(data.montoFinal), MR - 4, y + 5.5, 9, false, C.inkMed, "right");
        t(doc, "TOTAL ANTICIPOS ENTREGADOS", ML + 4, y + 9.5, 7, true, C.inkMed);
        tm(doc, `- ${fmtVES(data.pagoInmediato)}`, MR - 4, y + 9.5, 9, false, C.inkMed, "right");
        y += 12;

        fill(doc, ML, y, W, 12, C.rowAlt);
        t(doc, "SALDO A FAVOR (PRESTACIONES NETAS)", ML + 4, y + 7.5, 8, true, C.ink);
        tm(doc, fmtVES(data.saldoFavor), MR - 4, y + 8, 12, true, C.ink, "right");
        y += 12;
        hline(doc, ML, y, W, C.borderStr, 0.8);
        y += 8;
    }

    // ── Signatures ──────────────────────────────────────────────
    if (y > PH - 45) {
        doc.addPage();
        y = 30;
    } else {
        y += 4;
    }

    const legal = "La presente constancia certifica el saldo de prestaciones sociales de conformidad con el Art. 142 de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). El monto corresponde al mayor valor entre el saldo acumulado (Art. 142.a y 142.b) y la garantía de 30 días de salario integral por año de servicio (Art. 142.c).";
    t(doc, legal, ML, y, 6, false, C.muted, "left", W);
    
    y += 16;
    y = drawSignatures(doc, ML, W, y);

    drawFooter(doc, PW, PH, data.companyName, `PRESTACIONES SOCIALES AL ${fmtDate(data.fechaCorte)}`);
    console.log("PDF building done. Saving...");
    doc.save(`prestaciones_${data.employee.cedula}_${data.fechaCorte.replaceAll("-", "")}.pdf`);
    console.log("PDF saved!");
}

export async function generateInteresesAnticipoPdf(data: PrestacionesPdfData): Promise<void> {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 16, MR = PW - 16, W = MR - ML;

    const logoBase64 = (data.showLogoInPdf && data.logoUrl)
        ? await loadImageAsBase64(data.logoUrl).catch(() => null)
        : null;

    fill(doc, 0, 0, PW, PH, C.bg);

    // ── Header ────────────────────────────────────────────────────────────
    let topY = 20;
    if (logoBase64) {
        try { doc.addImage(logoBase64, "JPEG", ML, topY - 5, 28, 11); } catch { /* */ }
        t(doc, data.companyName.toUpperCase(), ML + 32, topY, 13, true, C.ink);
    } else {
        t(doc, data.companyName.toUpperCase(), ML, topY, 13, true, C.ink);
    }

    t(doc, "INTERESES Y ANTICIPO", MR, topY - 1, 9, true, C.ink, "right");
    t(doc, "ART. 143/144 LOTTT", MR, topY + 3, 6, false, C.muted, "right");

    lbl(doc, "FECHA CORTE", MR, topY + 11, "right");
    tm(doc, fmtDate(data.fechaCorte), MR, topY + 15, 9, true, C.inkMed, "right");
    
    lbl(doc, `EMITIDO: ${new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}`, MR, topY + 20, "right");

    let y = topY + 26;
    hline(doc, ML, y, W, C.border, 0.4);
    y += 8;

    // ── Employee data ──────────────────────────────────────────────
    const c1x = ML;
    const c2x = ML + W * 0.40;
    const c3x = ML + W * 0.70;

    lbl(doc, "Trabajador", c1x, y);
    t(doc, data.employee.nombre.toUpperCase(), c1x, y + 5, 9, true, C.ink, "left", c2x - c1x - 4);
    if (data.employee.cargo) t(doc, data.employee.cargo.toUpperCase(), c1x, y + 9, 6.5, false, C.muted);
    tm(doc, "CI " + data.employee.cedula, c1x, y + 13.5, 7.5, true, C.inkMed, "left");

    lbl(doc, "Antigüedad", c2x, y);
    const antStr = `${data.anios}a ${data.mesesCompletos % 12}m`;
    tm(doc, antStr, c2x, y + 5, 8.5, true, C.ink, "left");
    tm(doc, `Ingreso: ${fmtDate(data.fechaIngreso)}`, c2x, y + 9.5, 6.5, false, C.inkMed, "left");

    lbl(doc, "Base de Cálculo", c3x, y);
    tm(doc, "Saldo Acumulado", c3x, y + 5, 7, false, C.muted, "left");
    tm(doc, fmtVES(data.saldoAcumulado), c3x, y + 9.5, 8.5, true, C.inkMed, "left");

    y += 18;
    hline(doc, ML, y, W, C.border, 0.4);
    y += 6;

    // ── Liquidación / Conceptos ──────────────────────────────────────────────
    const pct = data.porcentajeAnticipo ?? 75;
    const tasa = data.tasaIntereses ?? 0;
    lbl(doc, "PAGO INMEDIATO", ML, y + 2, "left");
    y += 5;
    hline(doc, ML, y, W, C.borderStr, 0.8);

    y = detailRow(doc, ML, MR, W, y, `Anticipo de Prestaciones (${pct}%)`, `Art. 144 — ${pct}% del saldo acumulado`, fmtVES(data.anticipoPrestaciones), C.amber, false);
    y = detailRow(doc, ML, MR, W, y, "Intereses sobre Prestaciones", `Art. 143 — Tasa aplicada ${tasa}%`, fmtVES(data.interesesAcumulados), C.green, true);
    
    fill(doc, ML, y, W, 12, C.rowAlt);
    t(doc, "TOTAL ANTICIPOS E INTERESES", ML + 4, y + 7.5, 8, true, C.ink);
    tm(doc, fmtVES(data.pagoInmediato), MR - 4, y + 8, 12, true, C.ink, "right");
    y += 12;
    hline(doc, ML, y, W, C.borderStr, 0.8);
    y += 8;

    // Resumen de saldo a favor
    lbl(doc, "RESUMEN DE CUENTA DE GARANTÍA", ML, y + 2, "left");
    y += 5;
    hline(doc, ML, y, W, C.borderStr, 0.8);
    y = detailRow(doc, ML, MR, W, y, "Monto Prestaciones Acumuladas", data.aplicaGarantia ? "Se aplicó Garantía Art. 142.c" : "Por días acumulados", fmtVES(data.montoFinal), C.inkMed, false);
    y = detailRow(doc, ML, MR, W, y, "Total Deducción (Pago actual)", "Anticipos + Intereses ya entregados", `- ${fmtVES(data.pagoInmediato)}`, C.inkMed, true);

    fill(doc, ML, y, W, 12, C.rowAlt);
    t(doc, "SALDO PENDIENTE A FAVOR DEL TRABAJADOR", ML + 4, y + 7.5, 8, true, C.ink);
    tm(doc, fmtVES(data.saldoFavor), MR - 4, y + 8, 12, true, C.green, "right");
    y += 12;
    hline(doc, ML, y, W, C.borderStr, 0.8);
    y += 8;

    // ── Signatures ──────────────────────────────────────────────
    if (y > PH - 45) {
        doc.addPage();
        y = 30;
    } else {
        y += 4;
    }

    const legal = `Los intereses son calculados conforme al Art. 143 LOTTT. El monto anticipado ha sido depositado y deducido proporcionalmente conforme al Art. 144 LOTTT.`;
    t(doc, legal, ML, y, 6, false, C.muted, "left", W);
    
    y += 12;
    y = drawSignatures(doc, ML, W, y);

    drawFooter(doc, PW, PH, data.companyName, `INTERESES Y ANTICIPO AL ${fmtDate(data.fechaCorte)}`);
    doc.save(`intereses_anticipo_${data.employee.cedula}_${data.fechaCorte.replaceAll("-", "")}.pdf`);
}
