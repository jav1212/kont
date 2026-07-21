// PDF generator: Determinación del Porcentaje de Retención de ISLR (Forma AR-I).
// Una página por trabajador con el desglose de las secciones A–J y el porcentaje
// resultante. Comparte el chrome Konta (header naranja, footer Kontave, paleta
// slate + naranja) con los demás reportes de nómina.

import type jsPDF from "jspdf";
import { loadImageAsBase64 } from "./pdf-image-helper";
import {
    COLORS,
    drawHeader,
    drawFooter,
    drawHeaderRow,
    drawCompanyLogoBand,
    fill,
    hline,
    rect,
    formatN,
    formatVES,
    loadKontaLogo,
    renderText,
    renderMono,
    renderLabel,
    safeFilename,
} from "@/src/shared/frontend/utils/pdf-chrome";

// ── Public types ──────────────────────────────────────────────────────────────

export interface AriPdfEmployee {
    nombre: string;
    cedula: string;
    cargo?: string;
}

export interface AriPdfData {
    companyName:           string;
    companyId?:            string;
    employee:              AriPdfEmployee;
    anioGravable:          number;
    valorUT:               number;
    remuneracionAnual:     number;      // casilla A (Bs)
    usarDesgravamenUnico:  boolean;
    totalDesgravamenesBs:  number;
    cargasFamiliares:      number;
    impuestosRetenidosDeMas: number;
    // Resultado (AriResult)
    remuneracionUT:        number;      // B
    desgravamenesUT:       number;      // D
    desgravamenUnicoUT:    number;      // E
    enriquecimientoNetoUT: number;      // F
    alicuota:              number;
    impuestoUT:            number;      // G
    rebajasUT:             number;      // H
    impuestoARetenerUT:    number;      // I
    porcentaje:            number;      // J
    sujetoARetencion:      boolean;
    logoUrl?:              string;
    showLogoInPdf?:        boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type Doc = jsPDF;

const formatUT = (n: number): string => `${formatN(n)} U.T.`;

function drawEmployeeCard(doc: Doc, x: number, w: number, y: number, employee: AriPdfEmployee, rightSub: string): number {
    const H = 16;
    fill(doc, x, y, w, H, COLORS.rowAlt);
    fill(doc, x, y, 1.5, H, COLORS.orange);
    rect(doc, x, y, w, H, COLORS.border, 0.2);
    renderLabel(doc, "Contribuyente", x + 4, y + 4.5, "left", COLORS.muted, 7);
    renderText(doc, employee.nombre.toUpperCase(), x + 4, y + 9.5, 11, true, COLORS.ink, "left", w * 0.55, "helvetica");
    if (employee.cargo) {
        renderText(doc, employee.cargo, x + 4, y + 13.6, 8, false, COLORS.muted, "left", w * 0.55, "helvetica");
    }
    renderLabel(doc, "Cédula", x + w - 3, y + 4.5, "right", COLORS.muted, 7);
    renderMono(doc, employee.cedula, x + w - 3, y + 9.5, 11, true, COLORS.ink, "right");
    renderMono(doc, rightSub, x + w - 3, y + 13.6, 7.8, false, COLORS.muted, "right");
    return y + H + 5;
}

interface ParamCol { label: string; value: string; accent?: boolean; }

function drawParamsStrip(doc: Doc, x: number, w: number, y: number, cols: ParamCol[]): number {
    const H = 14;
    fill(doc, x, y, w, H, COLORS.rowAlt);
    rect(doc, x, y, w, H, COLORS.border, 0.2);
    const colW = w / cols.length;
    cols.forEach(({ label, value, accent }, i) => {
        const cx = x + i * colW;
        if (accent) fill(doc, cx, y, 1.2, H, COLORS.orange);
        renderLabel(doc, label, cx + 3, y + 5, "left", COLORS.muted, 7);
        renderMono(doc, value, cx + 3, y + 11, 9, true, COLORS.inkMed, "left");
    });
    return y + H + 4;
}

interface AriRow { label: string; sub?: string; value: string; strong?: boolean; }

function drawAriTable(doc: Doc, x: number, w: number, y: number, rows: AriRow[]): number {
    const colLabel = w * 0.64;
    const colValue = w * 0.36;

    drawHeaderRow(doc, y, 6, [
        { x,             w: colLabel, text: "Concepto (Forma AR-I)", align: "left"  },
        { x: x + colLabel, w: colValue, text: "Valor",              align: "right" },
    ]);
    y += 6;

    rows.forEach((r, i) => {
        const H = r.sub ? 10 : 7.5;
        if (i % 2 === 1) fill(doc, x, y, w, H, COLORS.rowAlt);
        renderText(doc, r.label, x + 3, y + (r.sub ? 4.4 : 5), 9.2, !!r.strong, COLORS.ink, "left", colLabel - 4, "helvetica");
        if (r.sub) renderText(doc, r.sub, x + 3, y + 8.2, 7, false, COLORS.muted, "left", colLabel - 4, "helvetica");
        renderMono(doc, r.value, x + w - 3, y + (r.sub ? 6 : 5.2), 9.5, !!r.strong, r.strong ? COLORS.ink : COLORS.inkMed, "right");
        y += H;
    });

    return y;
}

function drawSignatures(doc: Doc, x: number, w: number, y: number): number {
    renderLabel(doc, "Constancia de Entrega y Recepción", x, y + 4, "left", COLORS.inkMed, 8.5);
    y += 6;
    const boxW = (w - 14) / 2;
    const H = 24;
    ["Contribuyente", "Agente de Retención"].forEach((role, i) => {
        const sx = x + i * (boxW + 14);
        rect(doc, sx, y, boxW, H, COLORS.borderStr, 0.3);
        hline(doc, sx + 6, y + H - 8, boxW - 12, COLORS.borderStr, 0.3);
        renderLabel(doc, role, sx + boxW / 2, y + H - 4, "center", COLORS.muted, 7.5);
    });
    return y + H + 6;
}

function drawLegal(doc: Doc, x: number, w: number, y: number, text: string): number {
    hline(doc, x, y, w, COLORS.border, 0.2);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
    const lines = doc.splitTextToSize(text, w) as string[];
    lines.forEach((line, i) => doc.text(line, x, y + i * 3.5));
    return y + lines.length * 3.5 + 2;
}

// ── Generator ─────────────────────────────────────────────────────────────────

export async function generateAriPdf(data: AriPdfData): Promise<void> {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const ML = 12, W = PW - 2 * ML;

    const [companyLogo, kontaLogo] = await Promise.all([
        data.showLogoInPdf && data.logoUrl
            ? loadImageAsBase64(data.logoUrl).catch(() => null)
            : Promise.resolve(null),
        loadKontaLogo(),
    ]);

    drawHeader(doc, {
        companyName:  data.companyName,
        companyRif:   data.companyId,
        reportTitle:  "Retención de ISLR (AR-I)",
        periodLabel:  `Año Gravable ${data.anioGravable}`,
        legalCaption: "Determinación del %",
    });

    let y = 32;

    if (companyLogo) {
        y = drawCompanyLogoBand(doc, companyLogo, ML, y, "full");
    }

    y = drawEmployeeCard(doc, ML, W, y, data.employee, `${data.cargasFamiliares} carga${data.cargasFamiliares !== 1 ? "s" : ""} familiar${data.cargasFamiliares !== 1 ? "es" : ""}`);

    y = drawParamsStrip(doc, ML, W, y, [
        { label: "Valor U.T.",         value: formatVES(data.valorUT) },
        { label: "Remuneración anual", value: formatVES(data.remuneracionAnual), accent: true },
        { label: "Desgravamen",        value: data.usarDesgravamenUnico ? "Único (774 U.T.)" : "Detallado" },
    ]);

    const deduccionUT = data.desgravamenesUT > 0 ? data.desgravamenesUT : data.desgravamenUnicoUT;
    const rows: AriRow[] = [
        {
            label: "A/B · Remuneración estimada",
            sub:   `${formatVES(data.remuneracionAnual)} ÷ ${formatVES(data.valorUT)}`,
            value: formatUT(data.remuneracionUT),
        },
        {
            label: data.usarDesgravamenUnico ? "E · Desgravamen único" : "C/D · Desgravámenes",
            sub:   data.usarDesgravamenUnico ? "Art. 60 Ley ISLR" : `${formatVES(data.totalDesgravamenesBs)} ÷ ${formatVES(data.valorUT)}`,
            value: `− ${formatUT(deduccionUT)}`,
        },
        {
            label:  "F · Enriquecimiento neto gravable",
            value:  formatUT(data.enriquecimientoNetoUT),
            strong: true,
        },
        {
            label: "G · Impuesto según Tarifa Nº 1",
            sub:   `Alícuota ${formatN(data.alicuota * 100, 0)} %`,
            value: formatUT(data.impuestoUT),
        },
        {
            label: "H · Rebajas (personal + cargas)",
            sub:   "Art. 61 Ley ISLR · 10 U.T. + 10 U.T./carga",
            value: `− ${formatUT(data.rebajasUT)}`,
        },
        {
            label:  "I · Impuesto a retener en el año",
            value:  formatUT(data.impuestoARetenerUT),
            strong: true,
        },
    ];
    y = drawAriTable(doc, ML, W, y, rows);

    // Barra del porcentaje (casilla J)
    fill(doc, ML, y, W, 0.5, COLORS.orange);
    y += 1.2;
    fill(doc, ML, y, W, 13, COLORS.bandHead);
    rect(doc, ML, y, W, 13, COLORS.border, 0.2);
    renderLabel(doc, "J · Porcentaje de Retención Inicial", ML + 3, y + 8, "left", COLORS.inkMed, 9);
    renderMono(doc, `${formatN(data.porcentaje)} %`, ML + W - 3, y + 8.8, 15, true, COLORS.ink, "right");
    y += 13 + 5;

    if (!data.sujetoARetencion) {
        renderMono(doc, "Remuneración anual < 1.000 U.T. — no sujeto a retención.", ML + 3, y, 8, false, COLORS.muted, "left");
        y += 6;
    }

    y = drawSignatures(doc, ML, W, y);

    drawLegal(doc, ML, W, y,
        "La presente determinación reproduce las secciones A–J de la Forma AR-I para el cálculo del porcentaje " +
        "inicial de retención del Impuesto Sobre la Renta sobre sueldos, salarios y demás remuneraciones, de " +
        "conformidad con la Ley de ISLR y el Decreto 1808 sobre Retenciones. El porcentaje resultante se aplica " +
        "sobre cada pago o abono en cuenta que efectúe el agente de retención durante el año gravable.",
    );

    drawFooter(doc, kontaLogo);

    doc.save(`ari-${safeFilename(data.employee.cedula)}-${data.anioGravable}.pdf`);
}
