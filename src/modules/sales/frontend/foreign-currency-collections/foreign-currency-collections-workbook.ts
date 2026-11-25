// Excel adapters for the exchange difference of foreign currency collected:
// reads the «I.G.T.F. Percibido» report of the point of sale and writes the
// calculated report.

import * as XLSX from "xlsx";
import { decimalToFixed, type ExactDecimal } from "@kontave/monetary/domain";
import type { ForeignCurrencyCollectionsExchangeDifferenceReport } from "@kontave/sales/application";
import { cellDate, cellNumber, formatDate, type WorkbookImport } from "../financed-sales/financed-sales-workbook";

export interface ImportedForeignCurrencyCollection {
    /** `YYYY-MM-DD`, or `YYYY-MM-DD#n` when the same date appears more than once. */
    reference: string;
    collectedOn: string;
    bookedVes: string;
    igtfVes: string | null;
    operations: number | null;
    documents: string | null;
}

/** Report heading, e.g. «I.G.T.F. Percibido del 01/10/2025 al 30/09/2026». */
export interface IgtfReportHeading {
    company: string | null;
    period: string | null;
}

const HEADERS = {
    date: ["fecha"],
    base: ["base imponible igtf", "base imponible", "base"],
    tax: ["impuesto", "igtf"],
    operations: ["cant. operaciones", "operaciones", "cantidad"],
    documents: ["no.  documento", "no. documento", "documento", "documentos"],
} as const;

/**
 * Reads every sheet of an IGTF perception report. The report repeats its header
 * on each printed page, so every header row redefines the columns of the rows
 * below it; page titles, notes and the totals row are skipped.
 * @param file - Workbook chosen by the user (`.xls` or `.xlsx`).
 * @returns Daily collections ordered by date, the report heading and warnings.
 */
export async function readIgtfPerceptionWorkbook(file: File): Promise<WorkbookImport<ImportedForeignCurrencyCollection> & { heading: IgtfReportHeading }> {
    const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true });
    const items: ImportedForeignCurrencyCollection[] = [];
    const warnings: string[] = [];
    const seen = new Map<string, number>();
    const heading: IgtfReportHeading = { company: null, period: null };

    for (const sheetName of workbook.SheetNames) {
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
        let columns: Record<keyof typeof HEADERS, number> | null = null;
        matrix.forEach((cells, index) => {
            const texts = cells.map((cell) => typeof cell === "string" ? cell.trim() : "");
            heading.company ??= texts.find((text) => /\bRIF\b/i.test(text)) ?? null;
            heading.period ??= texts.find((text) => /percibido del/i.test(text)) ?? null;
            const base = headerColumn(texts, HEADERS.base);
            if (base >= 0 && headerColumn(texts, HEADERS.date) >= 0) {
                columns = {
                    date: headerColumn(texts, HEADERS.date),
                    base,
                    tax: headerColumn(texts, HEADERS.tax),
                    operations: headerColumn(texts, HEADERS.operations),
                    documents: headerColumn(texts, HEADERS.documents),
                };
                return;
            }
            if (!columns) return;
            const collectedOn = cellDate(cells[columns.date]);
            if (!collectedOn) return;
            const amount = cellNumber(cells[columns.base]);
            if (amount === null || amount === 0) return;
            if (amount < 0) {
                warnings.push(`${sheetName} fila ${index + 1}: base negativa ignorada (${amount}).`);
                return;
            }
            const tax = columns.tax >= 0 ? cellNumber(cells[columns.tax]) : null;
            const operations = columns.operations >= 0 ? cellNumber(cells[columns.operations]) : null;
            const documents = columns.documents >= 0 ? cells[columns.documents] : null;
            const occurrences = (seen.get(collectedOn) ?? 0) + 1;
            seen.set(collectedOn, occurrences);
            if (occurrences > 1) warnings.push(`${sheetName} fila ${index + 1}: la fecha ${formatDate(collectedOn)} se repite; se importa como cobro adicional.`);
            items.push({
                reference: occurrences > 1 ? `${collectedOn}#${occurrences}` : collectedOn,
                collectedOn,
                bookedVes: amount.toFixed(2),
                igtfVes: tax === null ? null : tax.toFixed(2),
                operations,
                documents: documents === null ? null : String(documents).trim() || null,
            });
        });
        if (!columns) warnings.push(`${sheetName}: no se encontró la fila de encabezados (Fecha, Base Imponible IGTF).`);
    }
    items.sort((left, right) => left.reference.localeCompare(right.reference));
    if (!items.length) warnings.push("No se encontraron días con base imponible.");
    return { items, warnings, heading };
}

/**
 * Writes the calculated report with the daily detail and the monthly summary.
 * @param report - Calculated report.
 * @param heading - Company and period shown at the top of each sheet.
 * @param fileName - Download file name.
 */
export function downloadForeignCurrencyCollectionsWorkbook(
    report: ForeignCurrencyCollectionsExchangeDifferenceReport,
    heading: IgtfReportHeading,
    fileName: string,
): void {
    const title = [heading.company, heading.period].filter(Boolean).map((text) => [text]);
    const detail: unknown[][] = [...title, [
        "Fecha", "Documentos", "Base IGTF Bs", "IGTF Bs", "Tasa del día", "USD cobrados", "Fecha cierre", "Tasa cierre", "Valor al cierre Bs", "Diferencial Bs", "Observación",
    ]];
    for (const row of report.rows) {
        const line = row.line;
        if (row.status === "failed") {
            detail.push([formatDate(line.collectedOn), null, num(line.bookedVes), line.igtfVes ? num(line.igtfVes) : null, null, null, null, null, null, null, row.reason]);
            continue;
        }
        const v = row.valuation;
        detail.push([
            formatDate(line.collectedOn), line.reference.includes("#") ? line.reference : null, num(line.bookedVes), line.igtfVes ? num(line.igtfVes) : null,
            num(v.collection.vesPerUsd), num(v.collectedUsd), formatDate(v.closingDate), num(v.closingVesPerUsd), num(v.closingVes), num(v.exchangeDifference),
            row.rateSource === "override" ? "Tasa del día manual" : null,
        ]);
    }

    const months: unknown[][] = [...title, ["Mes", "Días", "Base IGTF Bs", "IGTF Bs", "USD cobrados", "Fecha cierre", "Tasa cierre", "Valor al cierre Bs", "Ganancia Bs", "Pérdida Bs", "Diferencial neto Bs", "Observación"]];
    for (const month of report.months) {
        months.push([
            month.month, month.days, num(month.bookedVes), num(month.igtfVes), num(month.collectedUsd),
            month.closingDate ? formatDate(month.closingDate) : null, month.closingVesPerUsd ? num(month.closingVesPerUsd) : null,
            num(month.closingVes), num(month.gainVes), num(month.lossVes), num(month.gainVes) - num(month.lossVes),
            month.provisional ? "Mes sin cerrar: tasa del corte" : null,
        ]);
    }
    const t = report.totals;
    months.push(["Total", t.days, num(t.bookedVes), num(t.igtfVes), num(t.collectedUsd), null, null, num(t.closingVes), num(t.gainVes), num(t.lossVes), num(t.gainVes) - num(t.lossVes), null]);

    const workbook = XLSX.utils.book_new();
    appendSheet(workbook, "Resumen mensual", months);
    appendSheet(workbook, "Detalle diario", detail);
    XLSX.writeFile(workbook, fileName);
}

function appendSheet(workbook: XLSX.WorkBook, name: string, matrix: unknown[][]): void {
    const sheet = XLSX.utils.aoa_to_sheet(matrix);
    sheet["!cols"] = Array.from({ length: Math.max(...matrix.map((row) => row.length)) }, () => ({ wch: 16 }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function headerColumn(texts: readonly string[], names: readonly string[]): number {
    return texts.findIndex((text) => names.includes(text.toLowerCase().replace(/\s+/g, " ")) || names.includes(text.toLowerCase()));
}

function num(value: ExactDecimal | string): number {
    return Number(decimalToFixed(value as ExactDecimal, 8));
}
