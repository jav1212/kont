// PDF generator: Bonificación de Fin de Año (LOTTT Arts. 131, 142, 190, 192).
// Estilo Konta — header naranja, tabla zebra, firma + ciudad/fecha. Footer
// Kontave compartido en cada página.

import jsPDF from "jspdf";
import { loadImageAsBase64 } from "./pdf-image-helper";
import {
    COLORS,
    drawHeader,
    drawFooter,
    drawHeaderRow,
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

export interface FinDeAnoConcept {
    label:   string;
    dias:    number | null;
    salario: number | null;
    monto:   number;
    italic?: boolean;
}

export interface FinDeAnoDeduccion {
    label: string;
    monto: number;
}

export interface FinDeAnoEmployee {
    nombre:                string;
    cedula:                string;
    concepts:              FinDeAnoConcept[];
    deductions:            FinDeAnoDeduccion[];
    subtotal:              number;
    totalDed:              number;
    totalRecibido:         number;
    salarioDiarioIntegral: number;
}

export interface FinDeAnoOptions {
    companyName:    string;
    companyId?:     string;
    periodStart:    string;
    periodEnd:      string;
    ciudad:         string;
    fechaDoc:       string;
    logoUrl?:       string;
    showLogoInPdf?: boolean;
}

// ── Number to words (Spanish) ─────────────────────────────────────────────────

const ONES = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
    "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE",
    "DIECIOCHO", "DIECINUEVE"];
const TENS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const HUND = ["", "CIEN", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
    "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function hundreds(n: number): string {
    if (n === 0) return "";
    if (n === 100) return "CIEN";
    const h = Math.floor(n / 100);
    const rest = n % 100;
    const hStr = h > 0 ? HUND[h] + (rest > 0 ? " " : "") : "";
    if (rest === 0) return hStr;
    if (rest < 20) return hStr + ONES[rest];
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    return hStr + TENS[t] + (o > 0 ? " Y " + ONES[o] : "");
}

function intToWords(n: number): string {
    if (n === 0) return "CERO";
    if (n < 0) return "MENOS " + intToWords(-n);
    let result = "";
    if (n >= 1_000_000) {
        const m = Math.floor(n / 1_000_000);
        result += (m === 1 ? "UN MILLÓN" : hundreds(m) + " MILLONES") + " ";
        n %= 1_000_000;
    }
    if (n >= 1_000) {
        const k = Math.floor(n / 1_000);
        result += (k === 1 ? "MIL" : hundreds(k) + " MIL") + " ";
        n %= 1_000;
    }
    if (n > 0) result += hundreds(n);
    return result.trim();
}

export function montoEnLetras(monto: number): string {
    const bs   = Math.floor(monto);
    const cts  = Math.round((monto - bs) * 100);
    const bsStr = intToWords(bs);
    return `${bsStr} BOLÍVARES CON ${String(cts).padStart(2, "0")}/100CTMOS`;
}

// ── Per-employee receipt ──────────────────────────────────────────────────────

type Doc = jsPDF;

function drawReceipt(doc: Doc, emp: FinDeAnoEmployee, opts: FinDeAnoOptions, isFirst: boolean, companyLogo: string | null): void {
    if (!isFirst) doc.addPage();

    const PW = doc.internal.pageSize.getWidth();
    const ML = 12, W = PW - 2 * ML;

    drawHeader(doc, {
        companyName: opts.companyName,
        companyRif:  opts.companyId,
        reportTitle: "Bonificación de Fin de Año",
        periodLabel: `${opts.periodStart} — ${opts.periodEnd}`,
    });

    let y = 32;

    if (companyLogo) {
        try { doc.addImage(companyLogo, "JPEG", ML, y, 18, 7, undefined, "FAST"); y += 9; } catch { /* */ }
    }

    // ── Intro paragraph ───────────────────────────────────────────────────────
    const totalStr  = montoEnLetras(emp.totalRecibido);
    const salIntStr = `${formatN(emp.salarioDiarioIntegral)} BOLÍVARES (Bs. ${formatN(emp.salarioDiarioIntegral)})`;

    const intro =
        `Yo, ${emp.nombre}, titular de la cédula de identidad número V-${emp.cedula} y de este domicilio, por medio de la presente hago constar que he recibido de la firma ` +
        `${opts.companyName} la cantidad de ${totalStr} (Bs. ${formatN(emp.totalRecibido)}) por concepto de Bonificación de Fin de Año: ` +
        `Utilidades, Adelanto de Prestaciones y Vacaciones, que me corresponde por el período de trabajo del ${opts.periodStart} al ${opts.periodEnd}, ` +
        `calculado sobre la base de mi salario integral diario devengado, equivalente a ${salIntStr}.`;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(COLORS.inkMed[0], COLORS.inkMed[1], COLORS.inkMed[2]);
    const introLines = doc.splitTextToSize(intro, W) as string[];
    introLines.forEach((line, i) => doc.text(line, ML, y + i * 4.5));
    y += introLines.length * 4.5 + 4;

    const declaracion =
        "Declaro haber recibido la cantidad indicada a mi cabal y entera satisfacción y en moneda de curso legal, " +
        "por lo cual nada tengo que reclamar por concepto de utilidades y anticipo de prestaciones sociales, " +
        "calculadas de la siguiente manera:";
    const declLines = doc.splitTextToSize(declaracion, W) as string[];
    declLines.forEach((line, i) => doc.text(line, ML, y + i * 4.5));
    y += declLines.length * 4.5 + 6;

    // ── Concepts table ────────────────────────────────────────────────────────
    const colConcept = W * 0.52;
    const colDias    = W * 0.12;
    const colSalario = W * 0.16;
    const colMonto   = W * 0.20;

    drawHeaderRow(doc, y, 6, [
        { x: ML,                                       w: colConcept, text: "Conceptos",  align: "left"  },
        { x: ML + colConcept,                          w: colDias,    text: "Días",       align: "center"},
        { x: ML + colConcept + colDias,                w: colSalario, text: "Salario",    align: "center"},
        { x: ML + colConcept + colDias + colSalario,   w: colMonto,   text: "Monto",      align: "right" },
    ]);
    y += 6;

    const ROW_H = 6;
    emp.concepts.forEach((c, i) => {
        if (i % 2 === 1) fill(doc, ML, y, W, ROW_H, COLORS.rowAlt);
        renderText(doc, c.label, ML + 3, y + 4.2, 8.5, false, COLORS.inkMed, "left", colConcept - 4, "helvetica");
        if (c.dias !== null) {
            renderMono(doc, String(c.dias), ML + colConcept + colDias / 2, y + 4.2, 8.5, false, COLORS.muted, "center");
        }
        if (c.salario !== null) {
            renderMono(doc, formatN(c.salario), ML + colConcept + colDias + colSalario / 2, y + 4.2, 8.5, false, COLORS.muted, "center");
        }
        if (c.monto > 0) {
            renderMono(doc, formatVES(c.monto), ML + colConcept + colDias + colSalario + colMonto - 2, y + 4.2, 9, true, COLORS.ink, "right");
        }
        y += ROW_H;
        hline(doc, ML, y, W, COLORS.border, 0.15);
    });
    y += 2;

    // ── Subtotal ──────────────────────────────────────────────────────────────
    fill(doc, ML, y, W, 8, COLORS.bandHead);
    rect(doc, ML, y, W, 8, COLORS.border, 0.2);
    renderLabel(doc, "Subtotal", ML + 3, y + 5.5, "left", COLORS.inkMed, 8.5);
    renderMono(doc, formatVES(emp.subtotal), ML + W - 3, y + 5.8, 10, true, COLORS.ink, "right");
    y += 8 + 6;

    // ── Deductions ────────────────────────────────────────────────────────────
    drawHeaderRow(doc, y, 6, [
        { x: ML, w: W - colMonto, text: "Deducciones", align: "left"  },
        { x: ML + W - colMonto, w: colMonto, text: "Monto", align: "right" },
    ]);
    y += 6;

    emp.deductions.forEach((d, i) => {
        if (i % 2 === 1) fill(doc, ML, y, W, ROW_H, COLORS.rowAlt);
        renderText(doc, d.label, ML + 3, y + 4.2, 8.5, false, COLORS.inkMed, "left", W - colMonto - 4, "helvetica");
        renderMono(doc, formatVES(d.monto), ML + W - 3, y + 4.2, 9, d.monto > 0, COLORS.ink, "right");
        y += ROW_H;
        hline(doc, ML, y, W, COLORS.border, 0.15);
    });
    y += 3;

    fill(doc, ML, y, W, 8, COLORS.bandHead);
    rect(doc, ML, y, W, 8, COLORS.border, 0.2);
    renderLabel(doc, "Total deducciones", ML + 3, y + 5.5, "left", COLORS.inkMed, 8.5);
    renderMono(doc, formatVES(emp.totalDed), ML + W - 3, y + 5.8, 10, true, COLORS.ink, "right");
    y += 8 + 5;

    // ── Total recibido (orange-accented) ──────────────────────────────────────
    fill(doc, ML, y, W, 0.6, COLORS.orange);
    y += 1.4;
    fill(doc, ML, y, W, 14, COLORS.bandHead);
    rect(doc, ML, y, W, 14, COLORS.border, 0.2);
    renderLabel(doc, "Total recibido", ML + 3, y + 8.5, "left", COLORS.inkMed, 9);
    renderMono(doc, formatVES(emp.totalRecibido), ML + W - 3, y + 9, 14, true, COLORS.ink, "right");
    y += 14 + 6;

    // ── Legal note ────────────────────────────────────────────────────────────
    hline(doc, ML, y, W, COLORS.border, 0.2);
    y += 4;
    const nota = "La prestación de antigüedad Art. 142 fue cancelada con salario integral, en cumplimiento del Art. 122 LOTTT.";
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
    doc.text(nota, ML, y);
    y += 8;

    // ── Signatures ────────────────────────────────────────────────────────────
    const SIG_W = 75;
    const SIG_H = 22;
    rect(doc, ML, y, SIG_W, SIG_H, COLORS.borderStr, 0.3);
    renderText(doc, opts.companyName, ML + SIG_W / 2, y + 9, 9, true, COLORS.inkMed, "center", SIG_W - 8, "helvetica");
    hline(doc, ML + 6, y + SIG_H - 7, SIG_W - 12, COLORS.borderStr, 0.3);
    renderLabel(doc, "Firma y sello del empleador", ML + SIG_W / 2, y + SIG_H - 3, "center", COLORS.muted, 7);

    const esx = ML + W - SIG_W;
    rect(doc, esx, y, SIG_W, SIG_H, COLORS.borderStr, 0.3);
    renderText(doc, emp.nombre, esx + SIG_W / 2, y + 8.5, 9, true, COLORS.inkMed, "center", SIG_W - 8, "helvetica");
    renderMono(doc, `CI V-${emp.cedula}`, esx + SIG_W / 2, y + 13, 8, false, COLORS.muted, "center");
    hline(doc, esx + 6, y + SIG_H - 7, SIG_W - 12, COLORS.borderStr, 0.3);
    renderLabel(doc, "Firma del trabajador · Conforme", esx + SIG_W / 2, y + SIG_H - 3, "center", COLORS.muted, 7);

    // City/date centered
    renderText(doc, `${opts.ciudad}, ${opts.fechaDoc}`, PW / 2, y + SIG_H + 7, 9, false, COLORS.inkMed, "center", undefined, "helvetica");
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function generateFinDeAnoPdf(employees: FinDeAnoEmployee[], opts: FinDeAnoOptions): Promise<void> {
    if (employees.length === 0) return;

    const [companyLogo, kontaLogo] = await Promise.all([
        opts.showLogoInPdf && opts.logoUrl
            ? loadImageAsBase64(opts.logoUrl).catch(() => null)
            : Promise.resolve(null),
        loadKontaLogo(),
    ]);

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    employees.forEach((emp, i) => drawReceipt(doc, emp, opts, i === 0, companyLogo));

    drawFooter(doc, kontaLogo);

    doc.save(`fin-de-ano-${safeFilename(opts.companyName)}-${opts.periodEnd.replaceAll("/", "")}.pdf`);
}
