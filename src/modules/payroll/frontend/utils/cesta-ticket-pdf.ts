// PDF generator: Reporte de Cesta Ticket — segunda quincena del mes.
//
// Tres modalidades:
//   - "general"     → consolidado actual (tabla con firmas 3 por hoja al pie).
//   - "individual"  → A4 portrait, un comprobante completo por empleado con firma.
//   - "duplicado"   → Oficio 216×330mm, dos copias por hoja (Original + Copia)
//                     con línea de corte.

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

export interface CestaTicketEmployee {
    cedula: string;
    nombre: string;
    cargo:  string;
    estado: string;
    /** Override por empleado. Si falta, usa opts.montoUSD (default global). */
    montoUsd?: number;
}

export interface CestaTicketOptions {
    companyName:    string;
    companyId?:     string;
    periodLabel:    string;
    payrollDate:    string;
    montoUSD:       number;
    bcvRate:        number;
    logoUrl?:       string;
    showLogoInPdf?: boolean;
    /**
     * "general" (default)  → tabla consolidada como hasta hoy.
     * "individual"         → A4 portrait, un comprobante completo por empleado.
     * "duplicado"          → Oficio, dos copias (Original + Copia) por hoja.
     */
    pdfMode?:       ReportMode;
}

const fmtUSD = (n: number) => "$ " + formatN(n);

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
        reportTitle: "Cesta Ticket",
        periodLabel: opts.periodLabel,
    });
    return PAGE.contentTop as number;
}

function drawParamsCard(
    doc: Doc,
    x: number, w: number, y: number,
    montoUSD: number, bcvRate: number,
    customCount: number, minUsd: number, maxUsd: number,
): number {
    const H = 14;
    fill(doc, x, y, w, H, COLORS.rowAlt);
    fill(doc, x, y, 1.5, H, COLORS.orange);
    rect(doc, x, y, w, H, COLORS.border, 0.2);

    const cx1 = x + 4;
    const cx2 = x + w * 0.36;
    const cx3 = x + w - 3;

    const montoVES = montoUSD * bcvRate;
    const heterogeneous = customCount > 0 && minUsd !== maxUsd;
    const label1 = heterogeneous ? "Monto por defecto" : "Monto por empleado";

    renderLabel(doc, label1, cx1, y + 5, "left", COLORS.muted, 7);
    renderMono(doc, fmtUSD(montoUSD), cx1, y + 11, 10, true, COLORS.ink, "left");

    renderLabel(doc, "Tasa BCV", cx2, y + 5, "left", COLORS.muted, 7);
    renderMono(doc, `Bs. ${formatN(bcvRate, 4)} / USD`, cx2, y + 11, 10, true, COLORS.inkMed, "left");

    renderLabel(doc, "Equiv. por empleado", cx3, y + 5, "right", COLORS.muted, 7);
    renderMono(doc, formatVES(montoVES), cx3, y + 11, 10, true, COLORS.ink, "right");

    let nextY = y + H + 5;
    if (heterogeneous) {
        renderLabel(
            doc,
            `Montos personalizados: ${customCount} · rango ${fmtUSD(minUsd)} – ${fmtUSD(maxUsd)}`,
            x, nextY - 1, "left", COLORS.muted, 7.2,
        );
        nextY += 3.5;
    }
    return nextY;
}

// ── Modo CONSOLIDADO (general) ────────────────────────────────────────────────

async function generateGeneralPdf(
    active: CestaTicketEmployee[],
    opts: CestaTicketOptions,
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

    const montosUsd = active.map((e) => e.montoUsd ?? opts.montoUSD);
    const customCount = active.filter(
        (e) => typeof e.montoUsd === "number" && e.montoUsd !== opts.montoUSD,
    ).length;
    const minUsd = montosUsd.reduce((m, n) => (n < m ? n : m), montosUsd[0]);
    const maxUsd = montosUsd.reduce((m, n) => (n > m ? n : m), montosUsd[0]);

    y = drawParamsCard(doc, ML, W, y, opts.montoUSD, opts.bcvRate, customCount, minUsd, maxUsd);

    const colN     = W * 0.07;
    const colName  = W * 0.40;
    const colCed   = W * 0.18;
    const colUSD   = W * 0.16;
    const colVES   = W * 0.19;
    const drawTH = (yy: number): number => {
        drawHeaderRow(doc, yy, 6, [
            { x: ML,                                        w: colN,    text: "N°",         align: "center" },
            { x: ML + colN,                                 w: colName, text: "Nombre",     align: "left"   },
            { x: ML + colN + colName,                       w: colCed,  text: "Cédula",     align: "left"   },
            { x: ML + colN + colName + colCed,              w: colUSD,  text: "Monto USD",  align: "right"  },
            { x: ML + colN + colName + colCed + colUSD,     w: colVES,  text: "Equiv. VES", align: "right"  },
        ]);
        return yy + 6;
    };

    y = drawTH(y);

    const ROW_H = 6;
    active.forEach((emp, i) => {
        if (y + ROW_H > pageBounds(doc).contentBot) {
            doc.addPage();
            y = repaintPageHeader(doc, pageHeader);
            y = drawTH(y);
        }
        const empMonto    = montosUsd[i];
        const empMontoVes = empMonto * opts.bcvRate;
        drawRow(doc, y, ROW_H, [
            { x: ML,                                       w: colN,    text: String(i + 1),       align: "center", size: 8.5, mono: true,            color: COLORS.muted },
            { x: ML + colN,                                w: colName, text: emp.nombre,          align: "left",   size: 8.5,                       color: COLORS.ink },
            { x: ML + colN + colName,                      w: colCed,  text: emp.cedula,          align: "left",   size: 8.5, mono: true,            color: COLORS.muted },
            { x: ML + colN + colName + colCed,             w: colUSD,  text: fmtUSD(empMonto),    align: "right",  size: 9,   mono: true, bold: true, color: COLORS.ink },
            { x: ML + colN + colName + colCed + colUSD,    w: colVES,  text: formatVES(empMontoVes), align: "right", size: 9,  mono: true, bold: true, color: COLORS.ink },
        ], { zebra: i % 2 === 1 });
        y += ROW_H;
    });

    y += 2;

    if (y + 14 > pageBounds(doc).contentBot) {
        doc.addPage();
        y = repaintPageHeader(doc, pageHeader);
    }

    const totalUSD = montosUsd.reduce((s, n) => s + n, 0);
    const totalVES = totalUSD * opts.bcvRate;

    fill(doc, ML, y, W, 0.5, COLORS.orange);
    y += 1.2;
    fill(doc, ML, y, W, 12, COLORS.bandHead);
    rect(doc, ML, y, W, 12, COLORS.border, 0.2);
    renderLabel(doc, `Total · ${active.length} empleado${active.length !== 1 ? "s" : ""}`, ML + 3, y + 7.8, "left", COLORS.inkMed, 9);
    renderMono(doc, fmtUSD(totalUSD),  ML + colN + colName + colCed + colUSD - 1, y + 7.8, 10, true, COLORS.ink, "right");
    renderMono(doc, formatVES(totalVES), ML + W - 3, y + 8.2, 10.5, true, COLORS.ink, "right");
    y += 12 + 8;

    if (y + 8 > pageBounds(doc).contentBot) {
        doc.addPage();
        y = repaintPageHeader(doc, pageHeader);
    }
    renderLabel(doc, "Firma de recibo", ML, y, "left", COLORS.inkMed, 8);
    y += 6;

    const SIG_W = (W - 8) / 3;
    const SIG_H = 40;
    const GAP   = 4;
    const PD    = 3;
    const CB    = 2.5;
    const SIG_LINE_Y_OFFSET   = 6;
    const SIG_LABEL_Y_OFFSET  = 1.5;

    active.forEach((emp, i) => {
        const col = i % 3;
        const sx  = ML + col * (SIG_W + GAP);

        if (col === 0 && i > 0 && y + SIG_H > pageBounds(doc).contentBot) {
            doc.addPage();
            y = repaintPageHeader(doc, pageHeader);
        }

        fill(doc, sx, y, SIG_W, SIG_H, COLORS.white);
        rect(doc, sx, y, SIG_W, SIG_H, COLORS.border, 0.25);
        fill(doc, sx, y, SIG_W, 1, COLORS.orange);

        const empMonto    = montosUsd[i];
        const empMontoVes = empMonto * opts.bcvRate;

        renderMono(doc, fmtUSD(empMonto), sx + SIG_W - PD, y + 6, 8.5, true, COLORS.ink, "right");
        renderText(doc, emp.nombre, sx + PD, y + 10.5, 9, true, COLORS.ink, "left", SIG_W - PD * 2, "helvetica");
        renderMono(doc, emp.cedula, sx + PD, y + 14.5, 7.8, false, COLORS.muted, "left");
        renderMono(doc, formatVES(empMontoVes), sx + PD, y + 18.5, 7.8, false, COLORS.muted, "left");

        rect(doc, sx + PD, y + 21, CB, CB, COLORS.borderStr, 0.3);
        renderText(doc, "Recibido en Bs. efectivo", sx + PD + CB + 1.5, y + 23.5, 7, false, COLORS.muted, "left", SIG_W - PD * 2 - CB - 2, "helvetica");

        hline(doc, sx + PD, y + SIG_H - SIG_LINE_Y_OFFSET, SIG_W - PD * 2, COLORS.borderStr, 0.3);
        renderLabel(doc, "Firma", sx + SIG_W / 2, y + SIG_H - SIG_LABEL_Y_OFFSET, "center", COLORS.muted, 7);

        if (col === 2 || i === active.length - 1) y += SIG_H + 5;
    });

    if (y + 18 > pageBounds(doc).contentBot) {
        doc.addPage();
        y = repaintPageHeader(doc, pageHeader);
    }
    hline(doc, ML, y, W, COLORS.border, 0.2);
    y += 4;

    const legal =
        "El presente reporte acredita el pago del beneficio de alimentación (cesta ticket) correspondiente " +
        "a la segunda quincena del período indicado, de conformidad con la Ley de Alimentación para los " +
        "Trabajadores y las Trabajadoras (LOTTT). El trabajador confirma la recepción del beneficio con su firma.";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
    const lines = doc.splitTextToSize(legal, W) as string[];
    lines.forEach((ln, i) => doc.text(ln, ML, y + i * 3.5));

    drawFooter(doc, kontaLogo);

    doc.save(`cesta-ticket-${safeFilename(opts.companyName)}-${opts.payrollDate.replaceAll("-", "")}.pdf`);
}

// ── Modo PER-EMPLEADO (individual + duplicado) ────────────────────────────────

type ReceiptMode =
    | "full-single"
    | "full-original"
    | "full-copy"
    | "compact-top"
    | "compact-bottom";

function estimateCompactReceiptHeight(hasCompanyLogo: boolean): number {
    const headerH    = 10;
    const logoH      = hasCompanyLogo ? 7 : 0;
    const identityH  = 12 + 2;
    const conceptH   = 24 + 2; // caja única "Concepto + monto"
    const signaturesH = 16 + 2;
    return headerH + logoH + identityH + conceptH + signaturesH;
}

function drawReceiptInRegion(
    doc: Doc,
    emp: CestaTicketEmployee,
    opts: CestaTicketOptions,
    empMontoUsd: number,
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

    const empMontoVes = empMontoUsd * opts.bcvRate;

    let y: number;

    if (isCompact) {
        y = drawCompactHeader(doc, opts, xL, xR, yStart, label as "ORIGINAL" | "COPIA", opts.periodLabel, "CESTA TICKET");
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
        if (emp.cargo) renderText(doc, emp.cargo, colId, y + 10.5, 7, false, COLORS.muted, "left", contentW * 0.42, "helvetica");

        renderLabel(doc, "Cédula", colCed, y + 3, "left", COLORS.muted, 6);
        renderMono(doc, emp.cedula, colCed, y + 7, 9, true, COLORS.ink, "left");

        renderLabel(doc, "Tasa BCV", colBcv, y + 3, "right", COLORS.muted, 6);
        renderMono(doc, `Bs. ${formatN(opts.bcvRate, 4)} / USD`, colBcv, y + 7, 8.5, true, COLORS.inkMed, "right");
    } else {
        renderLabel(doc, "Trabajador", colId, y + 4, "left", COLORS.muted, 7);
        renderText(doc, emp.nombre.toUpperCase(), colId, y + 9, 10.5, true, COLORS.ink, "left", contentW * 0.42);
        if (emp.cargo) renderText(doc, emp.cargo, colId, y + 13.5, 8, false, COLORS.muted, "left", contentW * 0.42, "helvetica");

        renderLabel(doc, "Cédula", colCed, y + 4, "left", COLORS.muted, 7);
        renderMono(doc, emp.cedula, colCed, y + 9, 10.5, true, COLORS.ink, "left");

        renderLabel(doc, "Tasa BCV", colBcv, y + 4, "right", COLORS.muted, 7);
        renderMono(doc, `Bs. ${formatN(opts.bcvRate, 4)} / USD`, colBcv, y + 9, 10, true, COLORS.inkMed, "right");
    }

    y += idH + (isCompact ? 2 : 6);

    // Caja única: concepto + monto USD + equiv VES
    const conceptH = isCompact ? 22 : 28;
    fill(doc, xL, y, contentW, conceptH, COLORS.bandHead);
    rect(doc, xL, y, contentW, conceptH, COLORS.border, 0.2);
    fill(doc, xL, y, contentW, 0.5, COLORS.orange);

    if (isCompact) {
        renderLabel(doc, "Concepto", xL + 3, y + 4, "left", COLORS.muted, 6.5);
        renderText(doc, "Cesta Ticket socio-alimentaria", xL + 3, y + 8.5, 10, true, COLORS.ink, "left", contentW * 0.55);

        renderLabel(doc, "Monto USD", xR - 3, y + 4, "right", COLORS.muted, 6.5);
        renderMono(doc, fmtUSD(empMontoUsd), xR - 3, y + 9.5, 12.5, true, COLORS.ink, "right");

        renderLabel(doc, "Equivalente VES", xL + 3, y + 14, "left", COLORS.muted, 6.5);
        renderMono(doc, formatVES(empMontoVes), xR - 3, y + 18, 11, true, COLORS.ink, "right");

        // Checkbox conformidad (compacto en una línea inferior)
        rect(doc, xL + 3, y + conceptH - 4.5, 2, 2, COLORS.borderStr, 0.3);
        renderText(doc, "Recibido en Bs. efectivo", xL + 7, y + conceptH - 3, 6.5, false, COLORS.muted, "left", undefined, "helvetica");
    } else {
        renderLabel(doc, "Concepto", xL + 3, y + 5, "left", COLORS.muted, 7);
        renderText(doc, "Cesta Ticket socio-alimentaria", xL + 3, y + 10, 11.5, true, COLORS.ink, "left", contentW * 0.55);

        renderLabel(doc, "Monto USD", xR - 3, y + 5, "right", COLORS.muted, 7);
        renderMono(doc, fmtUSD(empMontoUsd), xR - 3, y + 11, 14, true, COLORS.ink, "right");

        renderLabel(doc, "Equivalente VES", xL + 3, y + 17, "left", COLORS.muted, 7);
        renderMono(doc, formatVES(empMontoVes), xR - 3, y + 22, 13, true, COLORS.ink, "right");
    }

    y += conceptH + (isCompact ? 2 : 5);

    // Nota legal mini (solo full)
    if (!isCompact) {
        const legal = "Beneficio de alimentación pagado en bolívares por orden expresa del trabajador, conforme a Ley de Alimentación y LOTTT.";
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
        conformityText:  "Declaro haber recibido el beneficio de cesta ticket reflejado",
    });
}

async function generatePerEmployeePdf(
    active: CestaTicketEmployee[],
    opts: CestaTicketOptions,
    companyLogo: string | null,
    kontaLogo: string | null,
    mode: "individual" | "duplicado",
): Promise<void> {
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

        const empMontoUsd = emp.montoUsd ?? opts.montoUSD;

        if (mode === "individual") {
            repaintPageHeader(doc, pageHeader);
            drawReceiptInRegion(doc, emp, opts, empMontoUsd, 32, companyLogo, "full-single");
            return;
        }

        // duplicado
        const h = estimateCompactReceiptHeight(!!companyLogo);
        if (h <= HALF_HEIGHT) {
            drawReceiptInRegion(doc, emp, opts, empMontoUsd, HALF_TOP_Y,    companyLogo, "compact-top");
            drawCutLine(doc, CUT_LINE_Y);
            drawReceiptInRegion(doc, emp, opts, empMontoUsd, HALF_BOTTOM_Y, companyLogo, "compact-bottom");
        } else {
            repaintPageHeader(doc, pageHeader);
            drawReceiptInRegion(doc, emp, opts, empMontoUsd, 32, companyLogo, "full-original");
            doc.addPage();
            repaintPageHeader(doc, pageHeader);
            drawReceiptInRegion(doc, emp, opts, empMontoUsd, 32, companyLogo, "full-copy");
        }
    });

    drawFooter(doc, kontaLogo);

    doc.save(`cesta-ticket-${safeFilename(opts.companyName)}-${opts.payrollDate.replaceAll("-", "")}.pdf`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function generateCestaTicketPdf(
    employees: CestaTicketEmployee[],
    opts: CestaTicketOptions,
): Promise<void> {
    const active = employees.filter((e) => e.estado === "activo");
    if (active.length === 0) return;

    const [companyLogo, kontaLogo] = await Promise.all([
        opts.showLogoInPdf && opts.logoUrl
            ? loadImageAsBase64(opts.logoUrl).catch(() => null)
            : Promise.resolve(null),
        loadKontaLogo(),
    ]);

    const pdfMode: ReportMode = opts.pdfMode ?? "general";

    if (pdfMode === "general") {
        return generateGeneralPdf(active, opts, companyLogo, kontaLogo);
    }
    return generatePerEmployeePdf(active, opts, companyLogo, kontaLogo, pdfMode);
}
