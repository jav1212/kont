// Estado de Resultados (Pérdidas y Ganancias) — PDF generator.
// Portrait A4. Single-column layout:
//   INGRESOS  ── lista de cuentas tipo revenue
//   (-) GASTOS ── lista de cuentas tipo expense
//   = UTILIDAD / PÉRDIDA NETA

import jsPDF from 'jspdf';
import {
    PAGE, COLORS, type Doc,
    drawHeader, drawFooter,
    fill, hline, renderText, renderMono, renderLabel,
    formatN, fmtGeneratedAt,
    loadKontaLogo,
} from '@/src/shared/frontend/utils/pdf-chrome';
import type { IncomeStatement, StatementLine } from './financial-statements';

// ── Input ────────────────────────────────────────────────────────────────────

export interface IncomeStatementPdfInput {
    companyName: string;
    companyRif:  string;
    /** Display label of the period (e.g. "Marzo 2026") */
    periodLabel: string;
    /** Period range to display: "Del 1 al 31 de marzo de 2026" */
    rangeLabel:  string;
    statement:   IncomeStatement;
}

// ── Layout constants ────────────────────────────────────────────────────────

const ROW_H = 5.4;
const LABEL_DENT = 4;

// ── Public ───────────────────────────────────────────────────────────────────

export async function generateIncomeStatementPdf(input: IncomeStatementPdfInput): Promise<void> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const yStart = drawHeader(doc, {
        companyName:  input.companyName,
        companyRif:   input.companyRif,
        reportTitle:  'Estado de Resultados',
        periodLabel:  input.periodLabel,
    });

    drawRangeSubheader(doc, input.rangeLabel, yStart);

    const tableTop = yStart + 14;
    const margin   = PAGE.marginX;
    const pw       = doc.internal.pageSize.getWidth();
    const colW     = pw - 2 * margin;

    let y = renderColumnHeader(doc, margin, tableTop, colW, 'INGRESOS Y GASTOS DEL PERÍODO');

    // ── Ingresos
    y = renderSection(doc, margin, y, colW, 'INGRESOS', input.statement.revenues);
    y = renderSubtotal(doc, margin, y, colW, 'Total Ingresos', input.statement.totalRevenues);
    y += 4;

    // ── Gastos
    y = renderSection(doc, margin, y, colW, '(-) GASTOS', input.statement.expenses);
    y = renderSubtotal(doc, margin, y, colW, 'Total Gastos', input.statement.totalExpenses);
    y += 4;

    // ── Utilidad / Pérdida neta
    y = renderTotal(doc, margin, y, colW,
        input.statement.netIncome >= 0 ? 'UTILIDAD NETA DEL EJERCICIO' : 'PÉRDIDA NETA DEL EJERCICIO',
        input.statement.netIncome,
    );

    // ── Disclaimer / margen
    drawMarginNote(doc, margin, y + 4, colW, input.statement);

    // ── Footer / watermark
    const logo = await loadKontaLogo();
    drawFooter(doc, logo);

    const dateStamp = fmtGeneratedAt(new Date().toISOString()).replace(/[: ]/g, '').slice(0, 8);
    const filename = `EstadoDeResultados_${slug(input.companyName)}_${dateStamp}.pdf`;
    doc.save(filename);
}

// ── Section renderers ───────────────────────────────────────────────────────

function renderColumnHeader(doc: Doc, x: number, y: number, w: number, label: string): number {
    fill(doc, x, y - 4, w, 5.5, COLORS.bandHead);
    renderLabel(doc, label, x + 2, y, 'left', COLORS.ink, 8);
    hline(doc, x, y + 1.5, w, COLORS.borderStr, 0.4);
    return y + 6;
}

function renderSection(doc: Doc, x: number, y: number, w: number, title: string, lines: StatementLine[]): number {
    renderLabel(doc, title, x + 1, y, 'left', COLORS.muted, 7);
    y += 4;
    if (lines.length === 0) {
        renderText(doc, '— sin movimientos —', x + LABEL_DENT, y, 7.5, false, COLORS.muted, 'left');
        return y + ROW_H;
    }
    for (const line of lines) {
        if (y > pageBottomY(doc)) {
            doc.addPage();
            y = PAGE.contentTop;
        }
        renderMono(doc, line.accountCode, x + LABEL_DENT, y, 7, false, COLORS.muted, 'left');
        renderText(doc, truncate(line.accountName, 90), x + LABEL_DENT + 18, y, 8, false, COLORS.ink, 'left');
        renderMono(doc, formatN(line.amount), x + w - 2, y, 8, false, COLORS.ink, 'right');
        y += ROW_H;
    }
    return y;
}

function renderSubtotal(doc: Doc, x: number, y: number, w: number, label: string, amount: number): number {
    hline(doc, x + 1, y - 1.5, w - 2, COLORS.border, 0.2);
    renderText(doc, label, x + LABEL_DENT, y + 2, 8.5, true, COLORS.ink, 'left');
    renderMono(doc, formatN(amount), x + w - 2, y + 2, 9, true, COLORS.ink, 'right');
    return y + ROW_H + 2;
}

function renderTotal(doc: Doc, x: number, y: number, w: number, label: string, amount: number): number {
    fill(doc, x, y - 1, w, ROW_H + 4, COLORS.bandHead);
    hline(doc, x, y - 1, w, COLORS.orange, 0.6);
    renderLabel(doc, label, x + 2, y + 4, 'left', COLORS.ink, 9);
    renderMono(doc, formatN(amount), x + w - 2, y + 4, 11, true, COLORS.ink, 'right');
    return y + ROW_H + 6;
}

function drawRangeSubheader(doc: Doc, rangeLabel: string, y: number): void {
    const pw = doc.internal.pageSize.getWidth();
    renderLabel(doc,
        `${rangeLabel.toUpperCase()} · Expresado en Bolívares (Bs.)`,
        pw / 2, y + 5, 'center', COLORS.muted, 7);
}

function drawMarginNote(doc: Doc, x: number, y: number, w: number, statement: IncomeStatement): void {
    const margin = statement.totalRevenues > 0
        ? (statement.netIncome / statement.totalRevenues) * 100
        : null;

    fill(doc, x, y, w, 11, COLORS.rowAlt);
    hline(doc, x, y, w, COLORS.borderStr, 0.2);
    hline(doc, x, y + 11, w, COLORS.borderStr, 0.2);

    const left  = margin !== null
        ? `Margen neto: ${formatN(margin)}%`
        : 'Margen neto: — (sin ingresos)';
    const right = `Diferencia: ${formatN(statement.totalRevenues - statement.totalExpenses)} Bs.`;

    renderText(doc, left, x + 3, y + 4.5, 7.5, true, COLORS.muted, 'left');
    renderText(doc, right, x + w - 3, y + 4.5, 7.5, true, COLORS.muted, 'right');
    renderText(doc,
        'Cifras agregadas a partir de los asientos contables registrados como confirmados (posted) en el período.',
        x + 3, y + 8.5, 6.5, false, COLORS.muted, 'left');
}

// ── Utility ─────────────────────────────────────────────────────────────────

function pageBottomY(doc: Doc): number {
    return doc.internal.pageSize.getHeight() - PAGE.footerHeight - 5;
}

function truncate(s: string, n: number): string {
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function slug(s: string): string {
    return s.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}
