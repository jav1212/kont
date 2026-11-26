// Excel adapters for the exchange difference of foreign currency collected:
// reads the «I.G.T.F. Percibido» report of the point of sale or the collections
// template, and writes the calculated report.

import * as XLSX from "xlsx";
import { decimalToFixed, type ExactDecimal } from "@kontave/monetary/domain";
import type { ForeignCurrencyCollectionsExchangeDifferenceReport } from "@kontave/sales/application";
import { cellDate, cellNumber, formatDate, type WorkbookImport } from "../financed-sales/financed-sales-workbook";

export interface ImportedForeignCurrencyCollection {
    /** `YYYY-MM-DD`, or `YYYY-MM-DD#n` when the same date appears more than once. */
    reference: string;
    collectedOn: string;
    amount: string;
    currency: "VES" | "USD";
    igtfVes: string | null;
    /** Payment date set by the row; otherwise the screen's payment term applies. */
    paidOn: string | null;
    /** Rate of the collection date set by the row. */
    vesPerUsd: string | null;
    operations: number | null;
    documents: string | null;
}

/** Report heading, e.g. «I.G.T.F. Percibido del 01/10/2025 al 30/09/2026». */
export interface IgtfReportHeading {
    company: string | null;
    period: string | null;
}

type ForeignCurrencyCollectionsImport = WorkbookImport<ImportedForeignCurrencyCollection> & { heading: IgtfReportHeading };

const IGTF_HEADERS = {
    date: ["fecha"],
    base: ["base imponible igtf", "base imponible", "base"],
    tax: ["impuesto", "igtf"],
    operations: ["cant. operaciones", "operaciones", "cantidad"],
    documents: ["no.  documento", "no. documento", "documento", "documentos"],
} as const;

const TEMPLATE_HEADERS = {
    collectedOn: ["fecha venta", "fecha de venta", "fecha cobro", "fecha de cobro"],
    days: ["dias", "días", "cantidad de dias", "cantidad de días"],
    paidOn: ["fecha recibo", "fecha de recibo", "fecha pago", "fecha de pago"],
    amount: ["monto", "monto cobrado", "entrada", "monto divisas"],
    currency: ["moneda"],
    vesPerUsd: ["tasa", "tasa venta", "tasa cobro"],
} as const;

/**
 * Reads foreign currency collections from either the IGTF perception report or
 * the collections template, detected by the template's «fecha venta» column.
 * @param file - Workbook chosen by the user (`.xls` or `.xlsx`).
 * @returns Collections ordered by date, the report heading and warnings.
 */
export async function readForeignCurrencyCollectionsWorkbook(file: File): Promise<ForeignCurrencyCollectionsImport> {
    const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true });
    const matrices = workbook.SheetNames.map((name) => ({
        name,
        matrix: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: null, raw: true }),
    }));
    const isTemplate = matrices.some(({ matrix }) => matrix.some((cells) => headerColumn(texts(cells), TEMPLATE_HEADERS.collectedOn) >= 0));
    return isTemplate ? readTemplate(matrices) : readIgtfReport(matrices);
}

/**
 * Downloads the collections template: one row per collection with the sale
 * date, either the days until the dollars were paid out or the receipt date,
 * the amount and its currency. «tasa» optionally overrides the BCV rate of the
 * sale date.
 */
export function downloadForeignCurrencyCollectionsTemplate(): void {
    const sheet = XLSX.utils.aoa_to_sheet([
        ["fecha venta", "dias", "fecha recibo", "monto", "moneda", "tasa"],
        ["01/10/2025", 7, null, 23808.06, "USD", null],
        ["02/10/2025", null, "10/10/2025", 1500, "USD", null],
        ["03/10/2025", 7, null, 271955.55, "Bs", null],
    ]);
    sheet["!cols"] = [{ wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 10 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Cobros en divisas");
    XLSX.writeFile(workbook, "plantilla-cobros-divisas.xlsx");
}

type SheetMatrix = { name: string; matrix: unknown[][] };

/**
 * The template has one header row per sheet; «dias» and «fecha recibo» are both
 * optional, and a row without either uses the screen's payment term.
 */
function readTemplate(sheets: readonly SheetMatrix[]): ForeignCurrencyCollectionsImport {
    const items: ImportedForeignCurrencyCollection[] = [];
    const warnings: string[] = [];
    const seen = new Map<string, number>();
    for (const { name, matrix } of sheets) {
        const headerIndex = matrix.findIndex((cells) => headerColumn(texts(cells), TEMPLATE_HEADERS.collectedOn) >= 0);
        if (headerIndex < 0) continue;
        const header = texts(matrix[headerIndex]);
        const columns = Object.fromEntries(
            Object.entries(TEMPLATE_HEADERS).map(([key, names]) => [key, headerColumn(header, names)]),
        ) as Record<keyof typeof TEMPLATE_HEADERS, number>;
        if (columns.amount < 0) {
            warnings.push(`${name}: falta la columna «monto».`);
            continue;
        }
        matrix.slice(headerIndex + 1).forEach((cells, offset) => {
            if (cells.every((cell) => cell === null || String(cell).trim() === "")) return;
            const row = `${name} fila ${headerIndex + offset + 2}`;
            const collectedOn = cellDate(cells[columns.collectedOn]);
            const amount = cellNumber(cells[columns.amount]);
            if (!collectedOn || amount === null || amount <= 0) {
                warnings.push(`${row}: fecha de venta o monto inválido.`);
                return;
            }
            const currency = parseCurrency(columns.currency >= 0 ? cells[columns.currency] : null);
            if (!currency) {
                warnings.push(`${row}: moneda no reconocida; use USD o Bs.`);
                return;
            }
            const days = columns.days >= 0 ? cellNumber(cells[columns.days]) : null;
            const receivedOn = columns.paidOn >= 0 ? cellDate(cells[columns.paidOn]) : null;
            if (days !== null && (!Number.isInteger(days) || days < 0)) {
                warnings.push(`${row}: los días deben ser un número entero positivo.`);
                return;
            }
            if (days !== null && receivedOn && receivedOn !== addDays(collectedOn, days)) {
                warnings.push(`${row}: los días y la fecha de recibo no coinciden; se usa la fecha de recibo.`);
            }
            const rate = columns.vesPerUsd >= 0 ? cellNumber(cells[columns.vesPerUsd]) : null;
            const occurrences = (seen.get(collectedOn) ?? 0) + 1;
            seen.set(collectedOn, occurrences);
            items.push({
                reference: occurrences > 1 ? `${collectedOn}#${occurrences}` : collectedOn,
                collectedOn,
                amount: amount.toFixed(2),
                currency,
                igtfVes: null,
                paidOn: receivedOn ?? (days === null ? null : addDays(collectedOn, days)),
                vesPerUsd: rate && rate > 0 ? String(rate) : null,
                operations: null,
                documents: null,
            });
        });
    }
    items.sort((left, right) => left.reference.localeCompare(right.reference));
    if (!items.length) warnings.push("No se encontraron cobros con fecha de venta y monto.");
    return { items, warnings, heading: { company: null, period: null } };
}

/**
 * Reads every sheet of an IGTF perception report. The report repeats its header
 * on each printed page, so every header row redefines the columns of the rows
 * below it; page titles, notes and the totals row are skipped.
 */
function readIgtfReport(sheets: readonly SheetMatrix[]): ForeignCurrencyCollectionsImport {
    const items: ImportedForeignCurrencyCollection[] = [];
    const warnings: string[] = [];
    const seen = new Map<string, number>();
    const heading: IgtfReportHeading = { company: null, period: null };

    for (const { name: sheetName, matrix } of sheets) {
        let columns: Record<keyof typeof IGTF_HEADERS, number> | null = null;
        matrix.forEach((cells, index) => {
            const cellTexts = texts(cells);
            heading.company ??= cellTexts.find((text) => /\bRIF\b/i.test(text)) ?? null;
            heading.period ??= cellTexts.find((text) => /percibido del/i.test(text)) ?? null;
            const base = headerColumn(cellTexts, IGTF_HEADERS.base);
            if (base >= 0 && headerColumn(cellTexts, IGTF_HEADERS.date) >= 0) {
                columns = {
                    date: headerColumn(cellTexts, IGTF_HEADERS.date),
                    base,
                    tax: headerColumn(cellTexts, IGTF_HEADERS.tax),
                    operations: headerColumn(cellTexts, IGTF_HEADERS.operations),
                    documents: headerColumn(cellTexts, IGTF_HEADERS.documents),
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
                amount: amount.toFixed(2),
                currency: "VES",
                igtfVes: tax === null ? null : tax.toFixed(2),
                paidOn: null,
                vesPerUsd: null,
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
        "Fecha venta", "Referencia", "Monto", "Moneda", "IGTF Bs", "Tasa venta", "USD", "Base Bs", "Fecha recibo", "Tasa recibo", "Valor al recibo Bs", "Diferencial Bs", "Observación",
    ]];
    for (const row of report.rows) {
        const line = row.line;
        const currency = line.currency === "USD" ? "USD" : "Bs";
        if (row.status === "failed") {
            detail.push([formatDate(line.collectedOn), null, num(line.amount), currency, line.igtfVes ? num(line.igtfVes) : null, null, null, null, null, null, null, null, row.reason]);
            continue;
        }
        const v = row.valuation;
        const notes = [
            row.rateSource === "override" ? "Tasa de venta manual" : null,
            row.provisional ? `Recibo el ${formatDate(row.scheduledPaidOn)}: valorado al corte` : null,
        ].filter(Boolean).join(" · ");
        detail.push([
            formatDate(line.collectedOn), line.reference.includes("#") ? line.reference : null, num(line.amount), currency, line.igtfVes ? num(line.igtfVes) : null,
            num(v.collection.vesPerUsd), num(v.collectedUsd), num(v.bookedVes), formatDate(v.paidOn), num(v.paymentVesPerUsd), num(v.paymentVes), num(v.exchangeDifference),
            notes || null,
        ]);
    }

    const months: unknown[][] = [...title, ["Mes de venta", "Cobros", "Base Bs", "IGTF Bs", "USD", "Valor al recibo Bs", "Ganancia Bs", "Pérdida Bs", "Diferencial neto Bs", "Observación"]];
    for (const month of report.months) {
        months.push([
            month.month, month.days, num(month.bookedVes), num(month.igtfVes), num(month.collectedUsd),
            num(month.paymentVes), num(month.gainVes), num(month.lossVes), num(month.gainVes) - num(month.lossVes),
            month.provisional ? "Incluye cobros sin recibir: valorados al corte" : null,
        ]);
    }
    const t = report.totals;
    months.push(["Total", t.days, num(t.bookedVes), num(t.igtfVes), num(t.collectedUsd), num(t.paymentVes), num(t.gainVes), num(t.lossVes), num(t.gainVes) - num(t.lossVes), null]);

    const workbook = XLSX.utils.book_new();
    appendSheet(workbook, "Resumen mensual", months);
    appendSheet(workbook, "Detalle", detail);
    XLSX.writeFile(workbook, fileName);
}

function appendSheet(workbook: XLSX.WorkBook, name: string, matrix: unknown[][]): void {
    const sheet = XLSX.utils.aoa_to_sheet(matrix);
    sheet["!cols"] = Array.from({ length: Math.max(...matrix.map((row) => row.length)) }, () => ({ wch: 16 }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function texts(cells: readonly unknown[]): string[] {
    return cells.map((cell) => typeof cell === "string" ? cell.trim() : "");
}

function headerColumn(texts: readonly string[], names: readonly string[]): number {
    return texts.findIndex((text) => names.includes(text.toLowerCase().replace(/\s+/g, " ")) || names.includes(text.toLowerCase()));
}

function parseCurrency(cell: unknown): "VES" | "USD" | null {
    const text = typeof cell === "string" ? cell.trim().toLowerCase().replace(/[.\s]/g, "") : "";
    if (!text || ["usd", "$", "us$", "dolares", "dólares", "divisas"].includes(text)) return "USD";
    if (["bs", "ves", "bolivares", "bolívares", "bss", "bsd"].includes(text)) return "VES";
    return null;
}

function addDays(iso: string, days: number): string {
    const value = new Date(`${iso}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}

function num(value: ExactDecimal | string): number {
    return Number(decimalToFixed(value as ExactDecimal, 8));
}
