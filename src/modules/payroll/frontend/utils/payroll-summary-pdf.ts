// PDF generator: Reporte General de Nómina.
//
// Tabla consolidada (A4 horizontal) con todos los empleados activos del run y
// los montos clave: salario base, asignaciones, bonos, deducciones y neto en
// VES + USD. Sin desglose individual — para el desglose se usa el recibo
// per-empleado (`generatePayrollPdf`). Disponible desde el último paso del
// calculador y desde el historial de nómina.

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
    renderLabel,
    renderMono,
    renderText,
    safeFilename,
} from "@/src/shared/frontend/utils/pdf-chrome";

// ── Public types ──────────────────────────────────────────────────────────────

export interface PayrollSummaryEmployeeRow {
    cedula:          string;
    nombre:          string;
    cargo:           string;
    salarioMensual:  number;
    totalEarnings:   number;
    totalBonuses:    number;
    totalDeductions: number;
    net:             number;
    netUSD:          number;
}

export interface PayrollSummaryOptions {
    companyName:  string;
    companyId?:   string;
    periodLabel:  string;
    periodStart?: string;
    periodEnd?:   string;
    bcvRate:      number;
}

// ── Implementation ────────────────────────────────────────────────────────────

interface ColumnSpec {
    key:    keyof PayrollSummaryEmployeeRow | "n";
    title:  string;
    width:  number;
    align:  "left" | "right" | "center";
    mono?:  boolean;
    bold?:  boolean;
    format: "text" | "ves" | "usd" | "number";
}

export async function generatePayrollSummaryPdf(
    rows: PayrollSummaryEmployeeRow[],
    opts: PayrollSummaryOptions,
): Promise<void> {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const ML = PAGE.marginX;
    const W  = PW - 2 * ML;

    const kontaLogo = await loadKontaLogo();

    const headerOpts = {
        companyName: opts.companyName,
        companyRif:  opts.companyId,
        reportTitle: "Reporte General de Nómina",
        periodLabel: opts.periodLabel,
    };

    // ── Page chrome (header) ──────────────────────────────────────────────────
    drawHeader(doc, headerOpts);
    let y: number = PAGE.contentTop;

    // ── Sub-cabecera con KPIs ─────────────────────────────────────────────────
    const totals = rows.reduce(
        (acc, r) => {
            acc.salario   += r.salarioMensual;
            acc.earnings  += r.totalEarnings;
            acc.bonuses   += r.totalBonuses;
            acc.deductions += r.totalDeductions;
            acc.net       += r.net;
            acc.netUSD    += r.netUSD;
            return acc;
        },
        { salario: 0, earnings: 0, bonuses: 0, deductions: 0, net: 0, netUSD: 0 },
    );

    const kpiH = 12;
    fill(doc, ML, y, W, kpiH, COLORS.rowAlt);
    fill(doc, ML, y, 1.5, kpiH, COLORS.orange);
    rect(doc, ML, y, W, kpiH, COLORS.border, 0.2);

    const kpis: [string, string][] = [
        ["BCV",          `Bs. ${formatN(opts.bcvRate, 4)} / USD`],
        ["Empleados",    String(rows.length)],
        ["Total Neto",   formatVES(totals.net)],
        ["Total Neto $", `$ ${formatN(totals.netUSD)}`],
    ];
    const colWk = (W - 4) / kpis.length;
    kpis.forEach(([label, value], i) => {
        const cx = ML + 4 + i * colWk;
        renderLabel(doc, label, cx, y + 4.5, "left", COLORS.muted, 7);
        renderMono(doc, value, cx, y + 9.5, 9.5, true, COLORS.ink, "left");
    });

    y += kpiH + 5;

    // ── Tabla — definición de columnas (suma = W) ─────────────────────────────
    // W = 297 - 20 = 277 mm en A4 horizontal.
    const cols: ColumnSpec[] = [
        { key: "n",               title: "N°",         width: 10, align: "center", mono: true,            format: "text"   },
        { key: "cedula",          title: "Cédula",     width: 24, align: "left",   mono: true,            format: "text"   },
        { key: "nombre",          title: "Nombre",     width: 60, align: "left",                          format: "text"   },
        { key: "cargo",           title: "Cargo",      width: 38, align: "left",                          format: "text"   },
        { key: "salarioMensual",  title: "Sal. Base",  width: 28, align: "right",  mono: true,            format: "ves"    },
        { key: "totalEarnings",   title: "Asignac.",   width: 28, align: "right",  mono: true,            format: "ves"    },
        { key: "totalBonuses",    title: "Bonos",      width: 22, align: "right",  mono: true,            format: "ves"    },
        { key: "totalDeductions", title: "Deducc.",    width: 22, align: "right",  mono: true,            format: "ves"    },
        { key: "net",             title: "Neto Bs.",   width: 28, align: "right",  mono: true, bold: true, format: "ves"    },
        { key: "netUSD",          title: "Neto $",     width: 17, align: "right",  mono: true,            format: "usd"    },
    ];

    // Build x positions
    const colsWithX: (ColumnSpec & { x: number })[] = [];
    let cursor = ML;
    for (const c of cols) {
        colsWithX.push({ ...c, x: cursor });
        cursor += c.width;
    }

    function fmtCell(col: ColumnSpec, value: number | string): string {
        if (col.format === "ves")    return formatN(value as number);
        if (col.format === "usd")    return formatN(value as number);
        if (col.format === "number") return formatN(value as number);
        return String(value);
    }

    function drawTH(yy: number): number {
        drawHeaderRow(
            doc, yy, 6,
            colsWithX.map((c) => ({ x: c.x, w: c.width, text: c.title, align: c.align })),
        );
        return yy + 6;
    }

    y = drawTH(y);

    // ── Filas ─────────────────────────────────────────────────────────────────
    const ROW_H = 5.6;
    rows.forEach((row, i) => {
        if (y + ROW_H > pageBounds(doc).contentBot) {
            doc.addPage();
            drawHeader(doc, headerOpts);
            y = drawTH(PAGE.contentTop as number);
        }
        drawRow(
            doc, y, ROW_H,
            colsWithX.map((c) => {
                const raw = c.key === "n" ? String(i + 1) : row[c.key];
                const text = c.format === "text" ? String(raw) : fmtCell(c, raw as number);
                return {
                    x:     c.x,
                    w:     c.width,
                    text,
                    align: c.align,
                    mono:  c.mono,
                    bold:  c.bold,
                    size:  c.bold ? 8.5 : 8,
                    color: c.bold ? COLORS.ink : COLORS.inkMed,
                };
            }),
            { zebra: i % 2 === 1 },
        );
        y += ROW_H;
    });

    // ── Fila de totales (regla naranja superior) ──────────────────────────────
    if (y + 12 > pageBounds(doc).contentBot) {
        doc.addPage();
        drawHeader(doc, headerOpts);
        y = drawTH(PAGE.contentTop as number);
    }

    fill(doc, ML, y, W, 0.5, COLORS.orange);
    y += 1.2;

    // Para la fila TOTAL: las primeras 4 columnas (N°, Cédula, Nombre, Cargo)
    // se fusionan en una sola celda con la palabra "TOTAL". Las siguientes
    // muestran la suma por columna.
    const labelW = colsWithX.slice(0, 4).reduce((a, c) => a + c.width, 0);
    fill(doc, ML, y, W, 8, COLORS.bandHead);
    rect(doc, ML, y, W, 8, COLORS.border, 0.2);

    renderLabel(doc, "Total", ML + labelW - 3, y + 5.6, "right", COLORS.inkMed, 8);

    const totalsByKey: Record<string, number> = {
        salarioMensual:  totals.salario,
        totalEarnings:   totals.earnings,
        totalBonuses:    totals.bonuses,
        totalDeductions: totals.deductions,
        net:             totals.net,
        netUSD:          totals.netUSD,
    };
    colsWithX.slice(4).forEach((c) => {
        const value = totalsByKey[c.key as string];
        renderMono(doc, fmtCell(c, value), c.x + c.width - 1, y + 5.6, c.bold ? 9 : 8.5, true, COLORS.ink, "right");
    });

    y += 8 + 8;

    // ── Firma de recibo ─────────────────────────────────────────────────────────
    // Una tarjeta por empleado con su neto, para que el trabajador deje constancia
    // de la recepción del pago. 4 tarjetas por fila (A4 horizontal).
    if (y + 8 > pageBounds(doc).contentBot) {
        doc.addPage();
        drawHeader(doc, headerOpts);
        y = PAGE.contentTop as number;
    }
    renderLabel(doc, "Firma de recibo", ML, y, "left", COLORS.inkMed, 8);
    y += 6;

    const SIG_COLS = 4;
    const SIG_GAP  = 4;
    const SIG_W    = (W - SIG_GAP * (SIG_COLS - 1)) / SIG_COLS;
    const SIG_H    = 40;
    const PD       = 3;
    const CB       = 2.5;
    const SIG_LINE_Y_OFFSET  = 6;
    const SIG_LABEL_Y_OFFSET = 1.5;

    rows.forEach((row, i) => {
        const col = i % SIG_COLS;
        const sx  = ML + col * (SIG_W + SIG_GAP);

        if (col === 0 && i > 0 && y + SIG_H > pageBounds(doc).contentBot) {
            doc.addPage();
            drawHeader(doc, headerOpts);
            y = PAGE.contentTop as number;
        }

        fill(doc, sx, y, SIG_W, SIG_H, COLORS.white);
        rect(doc, sx, y, SIG_W, SIG_H, COLORS.border, 0.25);
        fill(doc, sx, y, SIG_W, 1, COLORS.orange);

        renderMono(doc, formatVES(row.net), sx + SIG_W - PD, y + 6, 9, true, COLORS.ink, "right");
        renderText(doc, row.nombre, sx + PD, y + 10.5, 9, true, COLORS.ink, "left", SIG_W - PD * 2, "helvetica");
        renderMono(doc, row.cedula, sx + PD, y + 14.5, 7.8, false, COLORS.muted, "left");
        renderMono(doc, `$ ${formatN(row.netUSD)}`, sx + PD, y + 18.5, 7.8, false, COLORS.muted, "left");

        rect(doc, sx + PD, y + 21, CB, CB, COLORS.borderStr, 0.3);
        renderText(doc, "Recibido (efectivo / transferencia)", sx + PD + CB + 1.5, y + 23.5, 7, false, COLORS.muted, "left", SIG_W - PD * 2 - CB - 2, "helvetica");

        hline(doc, sx + PD, y + SIG_H - SIG_LINE_Y_OFFSET, SIG_W - PD * 2, COLORS.borderStr, 0.3);
        renderLabel(doc, "Firma", sx + SIG_W / 2, y + SIG_H - SIG_LABEL_Y_OFFSET, "center", COLORS.muted, 7);

        if (col === SIG_COLS - 1 || i === rows.length - 1) y += SIG_H + 5;
    });

    drawFooter(doc, kontaLogo);

    const periodSlug = (opts.periodEnd ?? opts.periodStart ?? "").replaceAll("-", "");
    doc.save(`nomina-general-${safeFilename(opts.companyName)}-${periodSlug || "periodo"}.pdf`);
}
