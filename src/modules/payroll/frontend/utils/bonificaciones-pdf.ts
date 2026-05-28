// PDF generator: Reporte de Bonificaciones.
//
// Tres modalidades:
//   - "general"     → consolidado actual (un solo PDF con tabla de todos los empleados).
//   - "individual"  → A4 portrait, un comprobante completo por empleado con firma.
//   - "duplicado"   → Oficio 216×330mm, dos copias por hoja (Original + Copia)
//                     con línea de corte. Fallback a dos hojas oficio completas
//                     si el contenido no cabe en una mitad.
//
// Mismo estilo Konta usado en cesta-ticket-pdf / bono-guerra-pdf (header naranja,
// tabla zebra, footer Kontave compartido).

import jsPDF from "jspdf";
import { loadImageAsBase64 } from "./pdf-image-helper";
import {
    COLORS,
    PAGE,
    pageBounds,
    drawHeader,
    drawFooter,
    drawHeaderRow,
    drawRow,
    drawCompanyLogo,
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
import {
    OFICIO_FORMAT,
    HALF_TOP_Y,
    HALF_BOTTOM_Y,
    HALF_HEIGHT,
    CUT_LINE_Y,
    drawCutLine,
    drawCompactHeader,
    drawOriginalCopyChip,
    drawSignatures,
    type ReportMode,
} from "@/src/shared/frontend/utils/pdf-receipt-chrome";

export interface BonificacionesEmployee {
    cedula: string;
    nombre: string;
    cargo:  string;
    estado: string;
}

export interface BonificacionesBonusLine {
    label:     string;
    currency:  "USD" | "VES";
    amount:    number;   // monto en la moneda original
    amountVES: number;   // equivalente VES (USD × BCV o el mismo monto si ya es VES)
}

export interface BonificacionesOptions {
    companyName:    string;
    companyId?:     string;
    periodLabel:    string;
    payrollDate:    string;
    bonusLines:     BonificacionesBonusLine[];   // mismos bonos para cada empleado activo
    bcvRate:        number;
    logoUrl?:       string;
    showLogoInPdf?: boolean;
    /**
     * "general" (default)  → tabla consolidada como hasta hoy.
     * "individual"         → A4 portrait, un comprobante completo por empleado, con firma.
     * "duplicado"          → Oficio, dos copias (Original + Copia) por hoja, con firma.
     */
    pdfMode?:       ReportMode;
}

const fmtUSD = (n: number) => "$ " + formatN(n);
const fmtOriginal = (line: BonificacionesBonusLine) =>
    line.currency === "VES" ? formatVES(line.amount) : fmtUSD(line.amount);

type Doc = jsPDF;

interface PageHeader {
    companyName: string;
    companyRif?: string;
    periodLabel: string;
}

function repaintPageHeader(doc: Doc, opts: PageHeader): number {
    drawHeader(doc, {
        companyName: opts.companyName,
        companyRif:  opts.companyRif,
        reportTitle: "Bonificaciones",
        periodLabel: opts.periodLabel,
    });
    return PAGE.contentTop as number;
}

function drawParamsCard(
    doc: Doc,
    x: number,
    w: number,
    y: number,
    bcvRate: number,
    bonusLines: BonificacionesBonusLine[],
    employeeCount: number,
): number {
    const H = 14;
    fill(doc, x, y, w, H, COLORS.rowAlt);
    fill(doc, x, y, 1.5, H, COLORS.orange);
    rect(doc, x, y, w, H, COLORS.border, 0.2);

    const cx1 = x + 4;
    const cx2 = x + w * 0.36;
    const cx3 = x + w - 3;

    const totalVesPorEmpleado = bonusLines.reduce((s, l) => s + l.amountVES, 0);

    renderLabel(doc, "Tasa BCV", cx1, y + 5, "left", COLORS.muted, 7);
    renderMono(doc, `Bs. ${formatN(bcvRate)} / USD`, cx1, y + 11, 10, true, COLORS.inkMed, "left");

    renderLabel(doc, "Bonos por empleado", cx2, y + 5, "left", COLORS.muted, 7);
    renderMono(doc, `${bonusLines.length} concepto${bonusLines.length !== 1 ? "s" : ""}`, cx2, y + 11, 10, true, COLORS.ink, "left");

    renderLabel(doc, "Subtotal por empleado", cx3, y + 5, "right", COLORS.muted, 7);
    renderMono(doc, formatVES(totalVesPorEmpleado), cx3, y + 11, 10, true, COLORS.ink, "right");

    void employeeCount;
    return y + H + 5;
}

// ── Modo CONSOLIDADO (general) ────────────────────────────────────────────────

async function generateGeneralPdf(
    active: BonificacionesEmployee[],
    lines: BonificacionesBonusLine[],
    opts: BonificacionesOptions,
    companyLogo: string | null,
    kontaLogo: string | null,
): Promise<void> {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const ML = 12, W = PW - 2 * ML;

    const pageHeader: PageHeader = {
        companyName: opts.companyName,
        companyRif:  opts.companyId,
        periodLabel: opts.periodLabel,
    };

    let y = repaintPageHeader(doc, pageHeader);

    if (companyLogo) {
        drawCompanyLogo(doc, companyLogo, ML, y, 18, 7); y += 9;
    }

    y = drawParamsCard(doc, ML, W, y, opts.bcvRate, lines, active.length);

    const colConcept  = W * 0.50;
    const colCurrency = W * 0.10;
    const colOriginal = W * 0.20;
    const colVES      = W * 0.20;

    const drawTH = (yy: number): number => {
        drawHeaderRow(doc, yy, 6, [
            { x: ML,                                        w: colConcept,  text: "Concepto",   align: "left"   },
            { x: ML + colConcept,                           w: colCurrency, text: "Moneda",     align: "center" },
            { x: ML + colConcept + colCurrency,             w: colOriginal, text: "Monto",      align: "right"  },
            { x: ML + colConcept + colCurrency + colOriginal, w: colVES,    text: "Equiv. VES", align: "right"  },
        ]);
        return yy + 6;
    };

    const BANNER_H = 9;
    const ROW_H    = 6;
    const SUBT_H   = 7;
    const GAP_BLOCK = 4;

    const totalVesPorEmpleado = lines.reduce((s, l) => s + l.amountVES, 0);

    active.forEach((emp, idx) => {
        const blockH = BANNER_H + 6 + ROW_H * lines.length + SUBT_H + GAP_BLOCK;
        if (y + blockH > pageBounds(doc).contentBot) {
            doc.addPage();
            y = repaintPageHeader(doc, pageHeader);
        }

        fill(doc, ML, y, W, BANNER_H, COLORS.bandHead);
        fill(doc, ML, y, 1.5, BANNER_H, COLORS.orange);
        rect(doc, ML, y, W, BANNER_H, COLORS.border, 0.2);
        renderMono(doc, `${idx + 1}.`, ML + 4, y + 6, 9, true, COLORS.muted, "left");
        renderMono(doc, emp.nombre.toUpperCase(), ML + 11, y + 6, 9.5, true, COLORS.ink, "left");
        const right = ML + W - 3;
        renderMono(doc, emp.cedula, right, y + 6, 9, false, COLORS.muted, "right");
        if (emp.cargo) {
            renderMono(doc, emp.cargo, right - 40, y + 6, 8, false, COLORS.muted, "right");
        }
        y += BANNER_H;

        y = drawTH(y);

        lines.forEach((line, i) => {
            drawRow(doc, y, ROW_H, [
                { x: ML,                                          w: colConcept,  text: line.label,            align: "left",   size: 8.5,                       color: COLORS.ink },
                { x: ML + colConcept,                             w: colCurrency, text: line.currency,         align: "center", size: 8.5, mono: true, bold: true, color: line.currency === "USD" ? COLORS.orange : COLORS.amber },
                { x: ML + colConcept + colCurrency,               w: colOriginal, text: fmtOriginal(line),     align: "right",  size: 9,   mono: true, bold: true, color: COLORS.ink },
                { x: ML + colConcept + colCurrency + colOriginal, w: colVES,      text: formatVES(line.amountVES), align: "right", size: 9, mono: true, bold: true, color: COLORS.ink },
            ], { zebra: i % 2 === 1 });
            y += ROW_H;
        });

        fill(doc, ML, y, W, SUBT_H, COLORS.bandHead);
        rect(doc, ML, y, W, SUBT_H, COLORS.border, 0.2);
        renderLabel(doc, "Subtotal", ML + colConcept + colCurrency + colOriginal - 2, y + 5, "right", COLORS.muted, 8);
        renderMono(doc, formatVES(totalVesPorEmpleado), ML + W - 3, y + 5, 10, true, COLORS.ink, "right");
        y += SUBT_H + GAP_BLOCK;
    });

    // Total general
    const totalVES = totalVesPorEmpleado * active.length;
    if (y + 14 > pageBounds(doc).contentBot) {
        doc.addPage();
        y = repaintPageHeader(doc, pageHeader);
    }

    fill(doc, ML, y, W, 0.5, COLORS.orange);
    y += 1.2;
    fill(doc, ML, y, W, 12, COLORS.bandHead);
    rect(doc, ML, y, W, 12, COLORS.border, 0.2);
    renderLabel(doc, `Total · ${active.length} empleado${active.length !== 1 ? "s" : ""}`, ML + 3, y + 7.8, "left", COLORS.inkMed, 9);
    renderMono(doc, formatVES(totalVES), ML + W - 3, y + 8.2, 10.5, true, COLORS.ink, "right");
    y += 12 + 6;

    if (y + 16 > pageBounds(doc).contentBot) {
        doc.addPage();
        y = repaintPageHeader(doc, pageHeader);
    }
    hline(doc, ML, y, W, COLORS.border, 0.2);
    y += 4;

    const legal =
        "El presente reporte detalla las bonificaciones del período por trabajador. " +
        "Los montos en USD se convierten a bolívares usando la tasa BCV indicada en " +
        "el encabezado. Las bonificaciones forman parte del salario integral cuando " +
        "tengan carácter regular y permanente, conforme al Art. 104 LOTTT.";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
    const wrap = doc.splitTextToSize(legal, W) as string[];
    wrap.forEach((ln, i) => doc.text(ln, ML, y + i * 3.5));

    drawFooter(doc, kontaLogo);

    doc.save(`bonificaciones-${safeFilename(opts.companyName)}-${opts.payrollDate.replaceAll("-", "")}.pdf`);
}

// ── Modo PER-EMPLEADO (individual + duplicado) ────────────────────────────────

type ReceiptMode =
    | "full-single"
    | "full-original"
    | "full-copy"
    | "compact-top"
    | "compact-bottom";

function estimateCompactReceiptHeight(lines: BonificacionesBonusLine[], hasCompanyLogo: boolean): number {
    const headerH      = 10;                       // mini-header
    const logoH        = hasCompanyLogo ? 7 : 0;
    const identityH    = 12 + 2;
    const titleH       = 5.5;
    const headerRowH   = 4.8;
    const rowsH        = Math.max(1, lines.length) * 4.8;
    const subtotalH    = 7 + 2;
    const signaturesH  = 16 + 2;

    return headerH + logoH + identityH + titleH + headerRowH + rowsH + subtotalH + signaturesH;
}

function drawReceiptInRegion(
    doc: Doc,
    emp: BonificacionesEmployee,
    opts: BonificacionesOptions,
    lines: BonificacionesBonusLine[],
    totalVes: number,
    yStart: number,
    companyLogo: string | null,
    mode: ReceiptMode,
): number {
    const isCompact = mode === "compact-top" || mode === "compact-bottom";
    const showBadge = mode !== "full-single";
    const label     = mode === "compact-top" || mode === "full-original" ? "ORIGINAL" : "COPIA";

    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX   = 12;
    const xL        = marginX;
    const xR        = pageWidth - marginX;
    const contentW  = xR - xL;

    let y: number;

    if (isCompact) {
        y = drawCompactHeader(doc, opts, xL, xR, yStart, label as "ORIGINAL" | "COPIA", opts.periodLabel, "BONIFICACIONES");
    } else {
        if (showBadge) drawOriginalCopyChip(doc, xR, yStart, label as "ORIGINAL" | "COPIA");
        y = yStart;
    }

    // Logo opcional
    if (companyLogo) {
        drawCompanyLogo(doc, companyLogo, xL, y, isCompact ? 16 : 18, isCompact ? 6 : 7);
        y += isCompact ? 7 : 9;
    }

    // Tarjeta de identidad
    const idH = isCompact ? 12 : 16;
    fill(doc, xL, y, contentW, idH, COLORS.rowAlt);
    rect(doc, xL, y, contentW, idH, COLORS.border, 0.2);

    const colId  = xL + 3;
    const colCed = xL + contentW * 0.45;
    const colBcv = xR - 3;

    if (isCompact) {
        renderLabel(doc, "Trabajador", colId, y + 3, "left", COLORS.muted, 6);
        renderText(doc, emp.nombre.toUpperCase(), colId, y + 7, 9, true, COLORS.ink, "left", contentW * 0.42);
        if (emp.cargo) {
            renderText(doc, emp.cargo, colId, y + 10.5, 7, false, COLORS.muted, "left", contentW * 0.42, "helvetica");
        }

        renderLabel(doc, "Cédula", colCed, y + 3, "left", COLORS.muted, 6);
        renderMono(doc, emp.cedula, colCed, y + 7, 9, true, COLORS.ink, "left");

        renderLabel(doc, "Tasa BCV", colBcv, y + 3, "right", COLORS.muted, 6);
        renderMono(doc, `Bs. ${formatN(opts.bcvRate)} / USD`, colBcv, y + 7, 8.5, true, COLORS.inkMed, "right");
    } else {
        renderLabel(doc, "Trabajador", colId, y + 4, "left", COLORS.muted, 7);
        renderText(doc, emp.nombre.toUpperCase(), colId, y + 9, 10.5, true, COLORS.ink, "left", contentW * 0.42);
        if (emp.cargo) {
            renderText(doc, emp.cargo, colId, y + 13.5, 8, false, COLORS.muted, "left", contentW * 0.42, "helvetica");
        }

        renderLabel(doc, "Cédula", colCed, y + 4, "left", COLORS.muted, 7);
        renderMono(doc, emp.cedula, colCed, y + 9, 10.5, true, COLORS.ink, "left");

        renderLabel(doc, "Tasa BCV", colBcv, y + 4, "right", COLORS.muted, 7);
        renderMono(doc, `Bs. ${formatN(opts.bcvRate)} / USD`, colBcv, y + 9, 10, true, COLORS.inkMed, "right");
    }

    y += idH + (isCompact ? 2 : 6);

    // Tabla de bonificaciones
    const titleH      = isCompact ? 5.5 : 6.5;
    const headerRowH  = isCompact ? 4.8 : 6;
    const rowH        = isCompact ? 4.8 : 6;
    const titleSize   = isCompact ? 7   : 8;
    const totalSize   = isCompact ? 9   : 10;
    const fontConcept = isCompact ? 7.8 : 8.5;
    const fontAmount  = isCompact ? 8.2 : 9;

    // Section title bar
    fill(doc, xL, y, contentW, titleH, COLORS.bandHead);
    renderLabel(doc, "Bonificaciones", xL + 2, y + titleH - 1.9, "left", COLORS.inkMed, titleSize);
    renderMono(doc, `+ ${formatVES(totalVes)}`, xR - 2, y + titleH - 1.9, totalSize, true, COLORS.ink, "right");
    y += titleH;

    const colConcept  = contentW * 0.50;
    const colCurrency = contentW * 0.12;
    const colOriginal = contentW * 0.18;
    const colVES      = contentW * 0.20;

    drawHeaderRow(doc, y, headerRowH, [
        { x: xL,                                          w: colConcept,  text: "Concepto",   align: "left"   },
        { x: xL + colConcept,                             w: colCurrency, text: "Moneda",     align: "center" },
        { x: xL + colConcept + colCurrency,               w: colOriginal, text: "Monto",      align: "right"  },
        { x: xL + colConcept + colCurrency + colOriginal, w: colVES,      text: "Equiv. VES", align: "right"  },
    ]);
    y += headerRowH;

    lines.forEach((line, i) => {
        drawRow(doc, y, rowH, [
            { x: xL,                                          w: colConcept,  text: line.label,                align: "left",   size: fontConcept,                       color: COLORS.ink },
            { x: xL + colConcept,                             w: colCurrency, text: line.currency,             align: "center", size: fontConcept, mono: true, bold: true, color: line.currency === "USD" ? COLORS.orange : COLORS.amber },
            { x: xL + colConcept + colCurrency,               w: colOriginal, text: fmtOriginal(line),         align: "right",  size: fontAmount,  mono: true, bold: true, color: COLORS.ink },
            { x: xL + colConcept + colCurrency + colOriginal, w: colVES,      text: formatVES(line.amountVES), align: "right",  size: fontAmount,  mono: true, bold: true, color: COLORS.ink },
        ], { zebra: i % 2 === 1 });
        y += rowH;
    });

    y += isCompact ? 1 : 2;

    // Subtotal
    if (isCompact) {
        fill(doc, xL, y, contentW, 0.4, COLORS.orange);
        y += 1.2;
        fill(doc, xL, y, contentW, 8, COLORS.bandHead);
        rect(doc, xL, y, contentW, 8, COLORS.border, 0.2);
        renderLabel(doc, "Total a recibir (VES)", xL + 3, y + 5.2, "left", COLORS.inkMed, 7.5);
        renderMono(doc, formatVES(totalVes), xR - 3, y + 5.5, 11, true, COLORS.ink, "right");
        y += 8 + 2;
    } else {
        fill(doc, xL, y, contentW, 0.6, COLORS.orange);
        y += 2;
        fill(doc, xL, y, contentW, 13, COLORS.bandHead);
        rect(doc, xL, y, contentW, 13, COLORS.border, 0.2);
        renderLabel(doc, "Total a recibir (VES)", xL + 3, y + 8, "left", COLORS.inkMed, 9);
        renderMono(doc, formatVES(totalVes), xR - 3, y + 8.5, 14, true, COLORS.ink, "right");
        y += 13 + 5;

        // Nota legal abreviada en modo individual
        const legal = "Bonificaciones del período conforme a Art. 104 LOTTT. Las que sean regulares y permanentes forman parte del salario integral.";
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
        const wrap = doc.splitTextToSize(legal, contentW) as string[];
        wrap.forEach((ln, i) => doc.text(ln, xL, y + i * 3.4));
        y += wrap.length * 3.4 + 4;
    }

    // Firmas
    return drawSignatures(doc, xL, contentW, y, {
        compact:         isCompact,
        conformityText:  "Declaro haber recibido las bonificaciones reflejadas en este recibo",
    });
}

async function generatePerEmployeePdf(
    active: BonificacionesEmployee[],
    lines: BonificacionesBonusLine[],
    opts: BonificacionesOptions,
    companyLogo: string | null,
    kontaLogo: string | null,
    mode: "individual" | "duplicado",
): Promise<void> {
    const totalVes = lines.reduce((s, l) => s + l.amountVES, 0);

    const doc = mode === "individual"
        ? new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
        : new jsPDF({ orientation: "portrait", unit: "mm", format: OFICIO_FORMAT });

    const pageHeader: PageHeader = {
        companyName: opts.companyName,
        companyRif:  opts.companyId,
        periodLabel: opts.periodLabel,
    };

    active.forEach((emp, i) => {
        if (i > 0) doc.addPage();

        if (mode === "individual") {
            repaintPageHeader(doc, pageHeader);
            drawReceiptInRegion(doc, emp, opts, lines, totalVes, 32, companyLogo, "full-single");
            return;
        }

        // duplicado
        const h = estimateCompactReceiptHeight(lines, !!companyLogo);
        if (h <= HALF_HEIGHT) {
            drawReceiptInRegion(doc, emp, opts, lines, totalVes, HALF_TOP_Y,    companyLogo, "compact-top");
            drawCutLine(doc, CUT_LINE_Y);
            drawReceiptInRegion(doc, emp, opts, lines, totalVes, HALF_BOTTOM_Y, companyLogo, "compact-bottom");
        } else {
            repaintPageHeader(doc, pageHeader);
            drawReceiptInRegion(doc, emp, opts, lines, totalVes, 32, companyLogo, "full-original");
            doc.addPage();
            repaintPageHeader(doc, pageHeader);
            drawReceiptInRegion(doc, emp, opts, lines, totalVes, 32, companyLogo, "full-copy");
        }
    });

    drawFooter(doc, kontaLogo);

    doc.save(`bonificaciones-${safeFilename(opts.companyName)}-${opts.payrollDate.replaceAll("-", "")}.pdf`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function generateBonificacionesPdf(
    employees: BonificacionesEmployee[],
    opts: BonificacionesOptions,
): Promise<void> {
    const active = employees.filter((e) => e.estado === "activo");
    if (active.length === 0) return;
    const lines = opts.bonusLines.filter((l) => l.amount > 0);
    if (lines.length === 0) return;

    const [companyLogo, kontaLogo] = await Promise.all([
        opts.showLogoInPdf && opts.logoUrl
            ? loadImageAsBase64(opts.logoUrl).catch(() => null)
            : Promise.resolve(null),
        loadKontaLogo(),
    ]);

    const pdfMode: ReportMode = opts.pdfMode ?? "general";

    if (pdfMode === "general") {
        return generateGeneralPdf(active, lines, opts, companyLogo, kontaLogo);
    }
    return generatePerEmployeePdf(active, lines, opts, companyLogo, kontaLogo, pdfMode);
}
