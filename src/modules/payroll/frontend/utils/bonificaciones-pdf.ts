// PDF generator: Reporte de Bonificaciones — bonos por empleado del período.
// Cada empleado activo recibe un bloque con la lista de bonos (USD o VES),
// equivalente VES por línea y subtotal. Total general al final.
// Mismo estilo Konta usado en cesta-ticket-pdf / bono-guerra-pdf (header naranja,
// tabla zebra, footer Kontave compartido).

import type jsPDF from "jspdf";
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
    renderMono,
    renderLabel,
    safeFilename,
} from "@/src/shared/frontend/utils/pdf-chrome";

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

    const { default: jsPDF } = await import("jspdf");
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

    y = drawParamsCard(doc, ML, W, y, opts.bcvRate, lines, active.length);

    // ── Columnas: empleado banner + filas de bonos ─────────────────────────
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
        // Bloque mínimo necesario: banner + th + filas + subtotal
        const blockH = BANNER_H + 6 + ROW_H * lines.length + SUBT_H + GAP_BLOCK;
        if (y + blockH > pageBounds(doc).contentBot) {
            doc.addPage();
            y = repaintPageHeader(doc, pageHeader);
        }

        // Banner del empleado
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

        // Subtotal por empleado
        fill(doc, ML, y, W, SUBT_H, COLORS.bandHead);
        rect(doc, ML, y, W, SUBT_H, COLORS.border, 0.2);
        renderLabel(doc, "Subtotal", ML + colConcept + colCurrency + colOriginal - 2, y + 5, "right", COLORS.muted, 8);
        renderMono(doc, formatVES(totalVesPorEmpleado), ML + W - 3, y + 5, 10, true, COLORS.ink, "right");
        y += SUBT_H + GAP_BLOCK;
    });

    // ── Total general ──────────────────────────────────────────────────────
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

    // ── Nota legal ─────────────────────────────────────────────────────────
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
