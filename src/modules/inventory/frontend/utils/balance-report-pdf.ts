// PDF generator: Reporte de Saldos (department balance summary).
//
// One row per department with opening / inbound / outbound / closing units +
// costs. Ends with a TOTAL row.

import jsPDF from "jspdf";
import type { BalanceReportRow } from "../../backend/domain/balance-report";
import {
    PAGE,
    COLORS,
    drawHeader,
    drawFooter,
    drawHeaderRow,
    drawRow,
    fill,
    formatN,
    formatQty,
    fmtPeriodMonth,
    loadKontaLogo,
    safeFilename,
    type KontaPdfHeaderOpts,
    type PdfCell,
} from "@/src/shared/frontend/utils/pdf-chrome";

export interface BalanceReportPdfOpts {
    companyName: string;
    companyRif?: string;
    period:      string;     // YYYY-MM
}

const COLS = (() => {
    // Department + 4 (units, cost) pairs
    const dept = 70;
    const u    = 23;
    const v    = 27;
    const sumW = 4 * (u + v);
    // sanity: dept + sumW = 70 + 4*50 = 270 < 277 ✓
    let x = PAGE.marginX;
    const dx = x; x += dept;
    const cols: { uX: number; uW: number; vX: number; vW: number }[] = [];
    for (let i = 0; i < 4; i++) {
        const uX = x; x += u;
        const vX = x; x += v;
        cols.push({ uX, uW: u, vX, vW: v });
    }
    return { dept: { x: dx, w: dept }, cols, u, v, sumW };
})();

const ROW_H = 6;
const HEADER_H = 7;
const SECTION_H = 5;

function drawTableHeader(doc: jsPDF, y: number): number {
    // Top row: section labels (Inv. Inicial / Entradas / Salidas / Existencia)
    const { dept, cols } = COLS;
    fill(doc, dept.x, y, dept.w + COLS.sumW, SECTION_H, COLORS.bandHead);
    const sections = ["Inv. Inicial", "Entradas", "Salidas", "Existencia"];
    for (let i = 0; i < 4; i++) {
        const c = cols[i]!;
        const xCenter = c.uX + (c.uW + c.vW) / 2;
        drawRow(doc, y, SECTION_H, [
            { x: xCenter - 30, w: 60, text: sections[i]!, align: "center", size: 7.5, bold: true, color: COLORS.ink },
        ]);
    }
    y += SECTION_H;

    // Sub-header: Departamento + (Unidades / Bs) × 4
    const subCells = [
        { x: dept.x, w: dept.w, text: "Departamento", align: "left" as const },
        ...cols.flatMap((c) => [
            { x: c.uX, w: c.uW, text: "Unidades", align: "right" as const },
            { x: c.vX, w: c.vW, text: "Bs",       align: "right" as const },
        ]),
    ];
    drawHeaderRow(doc, y, HEADER_H, subCells);
    return y + HEADER_H;
}

function sum(rows: BalanceReportRow[], key: keyof BalanceReportRow): number {
    return rows.reduce((acc, r) => acc + Number(r[key]), 0);
}

export async function generateBalanceReportPdf(
    rows: BalanceReportRow[],
    opts: BalanceReportPdfOpts,
): Promise<void> {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    const headerOpts: KontaPdfHeaderOpts = {
        companyName: opts.companyName,
        companyRif:  opts.companyRif,
        reportTitle: "Reporte de Saldos",
        periodLabel: fmtPeriodMonth(opts.period),
        legalCaption: "Reporte Art. 177 ISLR",
    };

    drawHeader(doc, headerOpts);
    let y = drawTableHeader(doc, PAGE.contentTop);

    let zebra = false;
    for (const r of rows) {
        if (y + ROW_H > PAGE.contentBot) {
            doc.addPage();
            drawHeader(doc, headerOpts);
            y = drawTableHeader(doc, PAGE.contentTop);
            zebra = false;
        }

        const cells: PdfCell[] = [
            { x: COLS.dept.x, w: COLS.dept.w, text: r.departmentName || "Sin departamento", align: "left", size: 8.5, bold: true, color: COLORS.ink },
            { x: COLS.cols[0]!.uX, w: COLS.cols[0]!.uW, text: formatQty(r.openingUnits),  align: "right", mono: true, size: 8,   bold: true, color: COLORS.ink },
            { x: COLS.cols[0]!.vX, w: COLS.cols[0]!.vW, text: formatN(r.openingCost),     align: "right", mono: true, size: 8,   bold: true, color: COLORS.ink },
            { x: COLS.cols[1]!.uX, w: COLS.cols[1]!.uW, text: formatQty(r.inboundUnits),  align: "right", mono: true, size: 8,   bold: true, color: COLORS.ink },
            { x: COLS.cols[1]!.vX, w: COLS.cols[1]!.vW, text: formatN(r.inboundCost),     align: "right", mono: true, size: 8,   bold: true, color: COLORS.ink },
            { x: COLS.cols[2]!.uX, w: COLS.cols[2]!.uW, text: formatQty(r.outboundUnits), align: "right", mono: true, size: 8,   bold: true, color: COLORS.ink },
            { x: COLS.cols[2]!.vX, w: COLS.cols[2]!.vW, text: formatN(r.outboundCost),    align: "right", mono: true, size: 8,   bold: true, color: COLORS.ink },
            { x: COLS.cols[3]!.uX, w: COLS.cols[3]!.uW, text: formatQty(r.closingUnits),  align: "right", mono: true, size: 8.5, bold: true, color: COLORS.ink },
            { x: COLS.cols[3]!.vX, w: COLS.cols[3]!.vW, text: formatN(r.closingCost),     align: "right", mono: true, size: 8.5, bold: true, color: COLORS.ink },
        ];
        drawRow(doc, y, ROW_H, cells, { zebra });
        zebra = !zebra;
        y += ROW_H;
    }

    if (y + ROW_H + 2 > PAGE.contentBot) {
        doc.addPage();
        drawHeader(doc, headerOpts);
        y = drawTableHeader(doc, PAGE.contentTop);
    }
    y += 1;
    fill(doc, PAGE.marginX, y, PAGE.width - 2 * PAGE.marginX, 0.4, COLORS.orange);
    y += 1.5;

    const totalCells: PdfCell[] = [
        { x: COLS.dept.x, w: COLS.dept.w, text: "TOTAL", align: "left", size: 9, bold: true, color: COLORS.ink },
        { x: COLS.cols[0]!.uX, w: COLS.cols[0]!.uW, text: formatQty(sum(rows, "openingUnits")),  align: "right", mono: true, size: 9, bold: true, color: COLORS.ink },
        { x: COLS.cols[0]!.vX, w: COLS.cols[0]!.vW, text: formatN(sum(rows, "openingCost")),     align: "right", mono: true, size: 9, bold: true, color: COLORS.ink },
        { x: COLS.cols[1]!.uX, w: COLS.cols[1]!.uW, text: formatQty(sum(rows, "inboundUnits")),  align: "right", mono: true, size: 9, bold: true, color: COLORS.ink },
        { x: COLS.cols[1]!.vX, w: COLS.cols[1]!.vW, text: formatN(sum(rows, "inboundCost")),     align: "right", mono: true, size: 9, bold: true, color: COLORS.ink },
        { x: COLS.cols[2]!.uX, w: COLS.cols[2]!.uW, text: formatQty(sum(rows, "outboundUnits")), align: "right", mono: true, size: 9, bold: true, color: COLORS.ink },
        { x: COLS.cols[2]!.vX, w: COLS.cols[2]!.vW, text: formatN(sum(rows, "outboundCost")),    align: "right", mono: true, size: 9, bold: true, color: COLORS.ink },
        { x: COLS.cols[3]!.uX, w: COLS.cols[3]!.uW, text: formatQty(sum(rows, "closingUnits")),  align: "right", mono: true, size: 9, bold: true, color: COLORS.ink },
        { x: COLS.cols[3]!.vX, w: COLS.cols[3]!.vW, text: formatN(sum(rows, "closingCost")),     align: "right", mono: true, size: 9, bold: true, color: COLORS.ink },
    ];
    drawRow(doc, y, ROW_H + 1.5, totalCells);

    const logo = await loadKontaLogo();
    drawFooter(doc, logo);

    const company = safeFilename(opts.companyName) || "empresa";
    doc.save(`reporte-saldos_${opts.period}_${company}.pdf`);
}
