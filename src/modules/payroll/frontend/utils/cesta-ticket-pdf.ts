// PDF generator: Reporte de Cesta Ticket — segunda quincena del mes.
// Estilo Konta — header naranja, tabla zebra, recuadros de firma con badge USD,
// footer Kontave compartido en cada página.

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

export interface CestaTicketEmployee {
    cedula: string;
    nombre: string;
    cargo:  string;
    estado: string;
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

function drawParamsCard(doc: Doc, x: number, w: number, y: number, montoUSD: number, bcvRate: number): number {
    const H = 14;
    fill(doc, x, y, w, H, COLORS.rowAlt);
    fill(doc, x, y, 1.5, H, COLORS.orange);
    rect(doc, x, y, w, H, COLORS.border, 0.2);

    const cx1 = x + 4;
    const cx2 = x + w * 0.36;
    const cx3 = x + w - 3;

    const montoVES = montoUSD * bcvRate;

    renderLabel(doc, "Monto por empleado", cx1, y + 5, "left", COLORS.muted, 7);
    renderMono(doc, fmtUSD(montoUSD), cx1, y + 11, 10, true, COLORS.ink, "left");

    renderLabel(doc, "Tasa BCV", cx2, y + 5, "left", COLORS.muted, 7);
    renderMono(doc, `Bs. ${formatN(bcvRate)} / USD`, cx2, y + 11, 10, true, COLORS.inkMed, "left");

    renderLabel(doc, "Equiv. por empleado", cx3, y + 5, "right", COLORS.muted, 7);
    renderMono(doc, formatVES(montoVES), cx3, y + 11, 10, true, COLORS.ink, "right");

    return y + H + 5;
}

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
        try { doc.addImage(companyLogo, "JPEG", ML, y, 18, 7, undefined, "FAST"); y += 9; } catch { /* */ }
    }

    y = drawParamsCard(doc, ML, W, y, opts.montoUSD, opts.bcvRate);

    // ── Table header ──────────────────────────────────────────────────────────
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

    const montoVES = opts.montoUSD * opts.bcvRate;
    const ROW_H = 6;
    active.forEach((emp, i) => {
        if (y + ROW_H > pageBounds(doc).contentBot) {
            doc.addPage();
            y = repaintPageHeader(doc, pageHeader);
            y = drawTH(y);
        }
        drawRow(doc, y, ROW_H, [
            { x: ML,                                       w: colN,    text: String(i + 1),         align: "center", size: 8.5, mono: true,            color: COLORS.muted },
            { x: ML + colN,                                w: colName, text: emp.nombre,            align: "left",   size: 8.5,                       color: COLORS.ink },
            { x: ML + colN + colName,                      w: colCed,  text: emp.cedula,            align: "left",   size: 8.5, mono: true,            color: COLORS.muted },
            { x: ML + colN + colName + colCed,             w: colUSD,  text: fmtUSD(opts.montoUSD), align: "right",  size: 9,   mono: true, bold: true, color: COLORS.ink },
            { x: ML + colN + colName + colCed + colUSD,    w: colVES,  text: formatVES(montoVES),   align: "right",  size: 9,   mono: true, bold: true, color: COLORS.ink },
        ], { zebra: i % 2 === 1 });
        y += ROW_H;
    });

    y += 2;

    // ── Totals row (orange-accented) ──────────────────────────────────────────
    if (y + 14 > pageBounds(doc).contentBot) {
        doc.addPage();
        y = repaintPageHeader(doc, pageHeader);
    }

    const totalUSD = opts.montoUSD * active.length;
    const totalVES = montoVES * active.length;

    fill(doc, ML, y, W, 0.5, COLORS.orange);
    y += 1.2;
    fill(doc, ML, y, W, 12, COLORS.bandHead);
    rect(doc, ML, y, W, 12, COLORS.border, 0.2);
    renderLabel(doc, `Total · ${active.length} empleado${active.length !== 1 ? "s" : ""}`, ML + 3, y + 7.8, "left", COLORS.inkMed, 9);
    renderMono(doc, fmtUSD(totalUSD),  ML + colN + colName + colCed + colUSD - 1, y + 7.8, 10, true, COLORS.ink, "right");
    renderMono(doc, formatVES(totalVES), ML + W - 3, y + 8.2, 10.5, true, COLORS.ink, "right");
    y += 12 + 8;

    // ── Signature boxes ───────────────────────────────────────────────────────
    if (y + 8 > pageBounds(doc).contentBot) {
        doc.addPage();
        y = repaintPageHeader(doc, pageHeader);
    }
    renderLabel(doc, "Firma de recibo", ML, y, "left", COLORS.inkMed, 8);
    y += 6;

    const SIG_W = (W - 8) / 3;
    const SIG_H = 28;
    const GAP   = 4;
    const PD    = 3;
    const CB    = 2.5;

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

        renderMono(doc, fmtUSD(opts.montoUSD), sx + SIG_W - PD, y + 6, 8.5, true, COLORS.ink, "right");

        renderText(doc, emp.nombre, sx + PD, y + 10.5, 9, true, COLORS.ink, "left", SIG_W - PD * 2, "helvetica");
        renderMono(doc, emp.cedula, sx + PD, y + 14.5, 7.8, false, COLORS.muted, "left");
        renderMono(doc, formatVES(montoVES), sx + PD, y + 18.5, 7.8, false, COLORS.muted, "left");

        // checkbox
        rect(doc, sx + PD, y + 20, CB, CB, COLORS.borderStr, 0.3);
        renderText(doc, "Recibido en Bs. efectivo", sx + PD + CB + 1.5, y + 22.5, 7, false, COLORS.muted, "left", SIG_W - PD * 2 - CB - 2, "helvetica");

        // signature line
        hline(doc, sx + PD, y + SIG_H - 4, SIG_W - PD * 2, COLORS.borderStr, 0.3);
        renderLabel(doc, "Firma", sx + SIG_W / 2, y + SIG_H - 0.5, "center", COLORS.muted, 7);

        if (col === 2 || i === active.length - 1) y += SIG_H + 5;
    });

    // ── Legal note ────────────────────────────────────────────────────────────
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
