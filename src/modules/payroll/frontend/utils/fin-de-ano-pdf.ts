// fin-de-ano-pdf.ts
// Genera recibos de "Bonificación de Fin de Año" en formato idéntico
// al documento legal venezolano (LOTTT Arts. 131, 142, 190, 192).

import jsPDF from "jspdf";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FinDeAnoConcept {
    label:   string;
    dias:    number | null;   // null = no mostrar
    salario: number | null;   // null = no mostrar (e.g. intereses)
    monto:   number;
    italic?: boolean;
}

export interface FinDeAnoDeduccion {
    label: string;
    monto: number;
}

export interface FinDeAnoEmployee {
    nombre:   string;
    cedula:   string;
    concepts: FinDeAnoConcept[];
    deductions: FinDeAnoDeduccion[];
    subtotal:   number;
    totalDed:   number;
    totalRecibido: number;
    salarioDiarioIntegral: number;
}

export interface FinDeAnoOptions {
    companyName:   string;
    periodStart:   string;   // DD/MM/YYYY
    periodEnd:     string;   // DD/MM/YYYY
    ciudad:        string;
    fechaDoc:      string;   // e.g. "14 de noviembre de 2025"
}

// ── Number to words (Bolívares, Spanish) ────────────────────────────────────

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

// ── Palette ───────────────────────────────────────────────────────────────────

type RGB = [number, number, number];

const C = {
    ink:      [15,  15,  20]  as RGB,
    inkMed:   [50,  50,  60]  as RGB,
    muted:    [120, 120, 132] as RGB,
    border:   [218, 218, 226] as RGB,
    white:    [255, 255, 255] as RGB,
    primary:  [8,   145, 178] as RGB,
    primaryLt:[207, 250, 254] as RGB,
    accent:   [34,  211, 238] as RGB,
    headerBg: [18,  18,  26]  as RGB,
    rowAlt:   [240, 240, 245] as RGB,
    subtotal: [207, 250, 254] as RGB,
    subtotalBd:[103, 232, 249] as RGB,
    sectionHdr:[20,  22,  38]  as RGB,
};

// ── PDF primitives ───────────────────────────────────────────────────────────

type Doc = jsPDF;

const fmtVES = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function txt(
    doc:   Doc,
    text:  string,
    x:     number,
    y:     number,
    size:  number,
    bold:  boolean,
    align: "left" | "center" | "right" = "left",
    color: RGB = C.ink,
    maxW?: number,
) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const opts: Record<string, unknown> = { align };
    if (maxW) opts.maxWidth = maxW;
    doc.text(text, x, y, opts);
}

function fill(doc: Doc, x: number, y: number, w: number, h: number, c: RGB) {
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(x, y, w, h, "F");
}

function hline(doc: Doc, x: number, y: number, w: number, lw = 0.25, c: RGB = C.border) {
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(lw);
    doc.line(x, y, x + w, y);
}

// ── Receipt renderer ─────────────────────────────────────────────────────────

function drawReceipt(doc: Doc, emp: FinDeAnoEmployee, opts: FinDeAnoOptions, isFirst: boolean) {
    if (!isFirst) doc.addPage();

    const PW  = doc.internal.pageSize.getWidth();
    const PH  = doc.internal.pageSize.getHeight();
    const ML  = 14;
    const MR  = PW - 14;
    const W   = MR - ML;

    // ── HEADER ─────────────────────────────────────────────────────────────
    const HDR_H = 36;
    fill(doc, 0, 0, PW, HDR_H, C.headerBg);
    fill(doc, 0, HDR_H - 2, PW, 2, C.accent);
    fill(doc, 0, 0, 4, HDR_H - 2, C.primary);

    txt(doc, opts.companyName.toUpperCase(), ML + 2, 10, 11, true, "left", C.white);
    txt(doc, "BONIFICACIÓN DE FIN DE AÑO — LOTTT Arts. 131, 142, 190, 192",
        ML + 2, 17, 6, false, "left", [100, 100, 120] as RGB);

    txt(doc, "PERÍODO", MR, 9, 5, false, "right", [120, 120, 140] as RGB);
    txt(doc, `${opts.periodStart} — ${opts.periodEnd}`, MR, 16, 8, true, "right", C.white);
    txt(doc,
        `Emitido: ${new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}`,
        MR, 24, 5.5, false, "right", [100, 100, 118] as RGB);

    let y = HDR_H + 8;

    // ── Intro paragraph ────────────────────────────────────────────────────
    const totalStr  = montoEnLetras(emp.totalRecibido);
    const salIntStr = `${fmtVES(emp.salarioDiarioIntegral)} BOLIVARES CON ${String(Math.round((emp.salarioDiarioIntegral % 1) * 100)).padStart(2, "0")}/100 (Bs. ${fmtVES(emp.salarioDiarioIntegral)})`;

    const intro = [
        `Yo, ${emp.nombre}, titular de la cedula de Identidad número V-${emp.cedula} y de este domicilio, por medio de la presente hago constar que he recibido de la Firma`,
        `${opts.companyName} la cantidad de ${totalStr} (Bs. ${fmtVES(emp.totalRecibido)}) por concepto de las Bonificación de Fin de Año:`,
        `Utilidades, Adelanto de Prestaciones y Vacaciones, que me corresponde por el periodo de trabajo que va del ${opts.periodStart} al ${opts.periodEnd}. El cual ha sido calculado sobre la base de mi`,
        `salario Integral devengado para esta fecha, la cantidad de ${salIntStr} Bolívares diarios`,
    ].join(" ");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(20, 20, 25);
    const introLines: string[] = doc.splitTextToSize(intro, W);
    introLines.forEach((line: string, i: number) => {
        doc.text(line, ML, y + i * 4.2);
    });
    y += introLines.length * 4.2 + 3;

    const declaracion = "Por el presente documento declaro haber recibido a mi cabal y entera satisfacción y en moneda de curso legal, la cantidad mencionada por lo cual nada tengo a reclamar por concepto de utilidades y anticipo de Prestaciones Sociales, calculado de la siguiente manera:";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const declLines: string[] = doc.splitTextToSize(declaracion, W);
    declLines.forEach((line: string, i: number) => {
        doc.text(line, ML, y + i * 4.2);
    });
    y += declLines.length * 4.2 + 5;

    // ── Table header ──────────────────────────────────────────────────────
    const COL_CONCEPTO = ML;
    const COL_DIAS     = MR - 60;
    const COL_SALARIO  = MR - 36;
    const COL_MONTO    = MR;
    const COL_W        = COL_DIAS - ML - 2;

    // Header row
    fill(doc, ML, y - 4, W, 6, C.sectionHdr);
    fill(doc, ML, y - 4, 3, 6, C.primary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(200, 210, 220);
    doc.text("CONCEPTOS",  COL_CONCEPTO + 5, y, { align: "left"  });
    doc.text("DÍAS",       COL_DIAS,     y, { align: "center" });
    doc.text("SALARIO",    COL_SALARIO,  y, { align: "center" });
    doc.text("MONTO (Bs)", COL_MONTO,    y, { align: "right"  });
    y += 5;
    hline(doc, ML, y, W, 0.4, C.primary);
    y += 2;

    // ── Concept rows ──────────────────────────────────────────────────────
    const ROW_H = 4.8;
    emp.concepts.forEach((c, i) => {
        if (i % 2 !== 0) {
            fill(doc, ML, y - 3.5, W, ROW_H, C.rowAlt);
        }

        doc.setFont("helvetica", c.italic ? "italic" : "normal");
        doc.setFontSize(8);
        doc.setTextColor(C.inkMed[0], C.inkMed[1], C.inkMed[2]);
        const labelLines: string[] = doc.splitTextToSize(c.label, COL_W);
        labelLines.forEach((line: string, li: number) => {
            doc.text(line, COL_CONCEPTO, y + li * 3.8);
        });

        if (c.dias !== null) {
            doc.setFont("helvetica", "normal");
            doc.text(String(c.dias), COL_DIAS, y, { align: "center" });
        }
        if (c.salario !== null) {
            doc.text(fmtVES(c.salario), COL_SALARIO, y, { align: "center" });
        }
        if (c.monto > 0) {
            doc.setFont("helvetica", "bold");
            doc.setTextColor(C.ink[0], C.ink[1], C.ink[2]);
            doc.text(fmtVES(c.monto), COL_MONTO, y, { align: "right" });
        }

        const rowH = Math.max(ROW_H, labelLines.length * 3.8 + 1);
        y += rowH;
        hline(doc, ML, y, W, 0.1);
    });

    y += 2;

    // ── Subtotal ──────────────────────────────────────────────────────────
    fill(doc, ML, y - 3.5, W, 6, C.subtotal);
    fill(doc, ML, y - 3.5, 3, 6, C.primary);
    doc.setDrawColor(C.subtotalBd[0], C.subtotalBd[1], C.subtotalBd[2]);
    doc.setLineWidth(0.3);
    doc.rect(ML, y - 3.5, W, 6, "D");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(C.ink[0], C.ink[1], C.ink[2]);
    doc.text("SUBTOTAL", COL_CONCEPTO + 5, y);
    doc.setTextColor(C.primary[0], C.primary[1], C.primary[2]);
    doc.text(fmtVES(emp.subtotal), COL_MONTO, y, { align: "right" });
    y += 8;

    // ── Deductions ────────────────────────────────────────────────────────
    fill(doc, ML, y - 4, W, 6, C.sectionHdr);
    fill(doc, ML, y - 4, 3, 6, C.primary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(200, 210, 220);
    doc.text("DEDUCCIONES", COL_CONCEPTO + 5, y);
    doc.text("MONTO (Bs)", COL_MONTO, y, { align: "right" });
    y += 5;
    hline(doc, ML, y, W, 0.4, C.primary);
    y += 2;

    emp.deductions.forEach((d, i) => {
        if (i % 2 !== 0) {
            fill(doc, ML, y - 3.5, W, ROW_H, C.rowAlt);
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(C.inkMed[0], C.inkMed[1], C.inkMed[2]);
        doc.text(d.label, COL_CONCEPTO, y);
        doc.setFont("helvetica", d.monto > 0 ? "bold" : "normal");
        doc.setTextColor(C.ink[0], C.ink[1], C.ink[2]);
        doc.text(fmtVES(d.monto), COL_MONTO, y, { align: "right" });
        y += ROW_H;
        hline(doc, ML, y, W, 0.1);
    });

    y += 2;

    // Total deducciones
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(C.inkMed[0], C.inkMed[1], C.inkMed[2]);
    doc.text("TOTAL DEDUCCIONES", COL_CONCEPTO, y);
    doc.setTextColor(C.ink[0], C.ink[1], C.ink[2]);
    doc.text(fmtVES(emp.totalDed), COL_MONTO, y, { align: "right" });
    y += 3;
    hline(doc, ML, y, W, 0.5);
    y += 5;

    // Total recibido
    fill(doc, ML, y - 4.5, W, 9, C.headerBg);
    // Top accent line
    doc.setDrawColor(C.accent[0], C.accent[1], C.accent[2]);
    doc.setLineWidth(1);
    doc.line(ML, y - 4.5, ML + W, y - 4.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(C.white[0], C.white[1], C.white[2]);
    doc.text("TOTAL RECIBIDO", COL_CONCEPTO + 2, y + 0.5);
    doc.setTextColor(C.accent[0], C.accent[1], C.accent[2]);
    doc.text(fmtVES(emp.totalRecibido), COL_MONTO, y + 0.5, { align: "right" });
    y += 12;

    // ── Legal note ────────────────────────────────────────────────────────
    hline(doc, ML, y, W, 0.2);
    y += 4;
    const nota = "La prestación de antigüedad Art. 142 fue cancelada con salario integral, para dar cumplimiento al artículo 122 de la Ley Orgánica del Trabajo.";
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    const notaLines: string[] = doc.splitTextToSize(nota, W);
    notaLines.forEach((line: string, i: number) => {
        doc.text(line, ML, y + i * 3.8);
    });
    y += notaLines.length * 3.8 + 6;

    // ── Signatures ────────────────────────────────────────────────────────
    const sigW  = 75;
    const sigH  = 22;
    const sigPd = 6;

    // Employer
    doc.setFillColor(C.white[0], C.white[1], C.white[2]);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.25);
    doc.rect(ML, y, sigW, sigH, "FD");
    fill(doc, ML, y, sigW, 1.5, C.primary);
    txt(doc, opts.companyName, ML + sigW / 2, y + 9, 7, true, "center", C.inkMed, sigW - 10);
    hline(doc, ML + sigPd, y + 17, sigW - sigPd * 2, 0.4, C.border);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text("FIRMA Y SELLO DEL EMPLEADOR", ML + sigW / 2, y + 21, { align: "center" });

    // Employee
    const esx = MR - sigW;
    doc.setFillColor(C.white[0], C.white[1], C.white[2]);
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.25);
    doc.rect(esx, y, sigW, sigH, "FD");
    fill(doc, esx, y, sigW, 1.5, C.primary);
    txt(doc, emp.nombre, esx + sigW / 2, y + 9, 7, true, "center", C.inkMed, sigW - 10);
    txt(doc, `C.I. V-${emp.cedula}`, esx + sigW / 2, y + 14, 5.5, false, "center", C.muted);
    hline(doc, esx + sigPd, y + 17, sigW - sigPd * 2, 0.4, C.border);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text("FIRMA DEL TRABAJADOR / CONFORME", esx + sigW / 2, y + 21, { align: "center" });

    // City + date centred between signatures
    txt(doc, `${opts.ciudad}, ${opts.fechaDoc}`, PW / 2, y + sigH + 6, 7.5, false, "center", C.inkMed);

    // ── FOOTER ────────────────────────────────────────────────────────────
    fill(doc, 0, PH - 10, PW, 10, C.headerBg);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(100, 100, 120);
    doc.text(opts.companyName.toUpperCase(), ML, PH - 4);
    doc.text("DOCUMENTO CONFIDENCIAL", PW / 2, PH - 4, { align: "center" });
    doc.text(
        new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase(),
        MR, PH - 4, { align: "right" }
    );
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function generateFinDeAnoPdf(employees: FinDeAnoEmployee[], opts: FinDeAnoOptions): void {
    if (employees.length === 0) return;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    employees.forEach((emp, i) => drawReceipt(doc, emp, opts, i === 0));
    doc.save(`bonificacion_fin_de_ano_${opts.periodEnd.replaceAll("/", "")}.pdf`);
}
