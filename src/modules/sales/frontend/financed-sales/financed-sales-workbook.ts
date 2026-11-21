// Excel adapters for the financed-sales exchange-difference report: reads the
// daily financed-sales workbook and the financier deposits workbook, and writes
// the calculated report.

import * as XLSX from "xlsx";
import { decimalToFixed, type ExactDecimal } from "@kontave/monetary/domain";
import type { FinancedSaleAccountRole, FinancedSaleJournalEntry } from "@kontave/sales/domain";
import type { FinancedSalesExchangeDifferenceReport } from "@kontave/sales/application";

export interface ImportedFinancedSale {
    /** `YYYY-MM-DD`, or `YYYY-MM-DD#n` when the same date appears more than once. */
    reference: string;
    saleDate: string;
    amountVes: string;
    sheet: string;
    row: number;
}

export interface ImportedFinancedSaleCollection {
    /** Sale reference (date) the deposit belongs to. */
    saleReference: string;
    collectedOn: string;
    receivedVes: string;
    vesPerUsd?: string;
}

export interface WorkbookImport<T> {
    items: T[];
    warnings: string[];
}

/**
 * Reads every sheet of a financed-sales workbook. Each row whose first date cell
 * is followed by a positive amount becomes one sale; the amount is the last
 * numeric cell after the date, so operation-number and RIF columns are ignored
 * regardless of where each monthly sheet places them.
 * @param file - Workbook chosen by the user.
 * @returns Sales ordered by date plus warnings about skipped or repeated rows.
 */
export async function readFinancedSalesWorkbook(file: File): Promise<WorkbookImport<ImportedFinancedSale>> {
    const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true });
    const items: ImportedFinancedSale[] = [];
    const warnings: string[] = [];
    const seen = new Map<string, number>();

    for (const sheetName of workbook.SheetNames) {
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
        matrix.forEach((cells, index) => {
            const dateColumn = cells.findIndex((cell) => cellDate(cell) !== null);
            if (dateColumn < 0) return;
            const saleDate = cellDate(cells[dateColumn])!;
            const amounts = cells.slice(dateColumn + 1).map(cellNumber).filter((value): value is number => value !== null);
            const amount = amounts[amounts.length - 1];
            if (amount === undefined || amount === 0) return;
            if (amount < 0) {
                warnings.push(`${sheetName} fila ${index + 1}: monto negativo ignorado (${amount}).`);
                return;
            }
            const occurrences = (seen.get(saleDate) ?? 0) + 1;
            seen.set(saleDate, occurrences);
            if (occurrences > 1) warnings.push(`${sheetName} fila ${index + 1}: la fecha ${formatDate(saleDate)} se repite; se importa como venta adicional.`);
            items.push({
                reference: occurrences > 1 ? `${saleDate}#${occurrences}` : saleDate,
                saleDate,
                amountVes: amount.toFixed(2),
                sheet: sheetName,
                row: index + 1,
            });
        });
    }
    items.sort((left, right) => left.reference.localeCompare(right.reference));
    if (!items.length) warnings.push("No se encontraron filas con fecha y monto.");
    return { items, warnings };
}

const COLLECTION_HEADERS = {
    saleDate: ["fecha venta", "fecha_venta", "venta"],
    collectedOn: ["fecha cobro", "fecha_cobro", "cobro", "fecha deposito", "fecha depósito"],
    receivedVes: ["monto cobrado", "monto_cobrado", "monto cobrado bs", "monto_cobrado_bs", "monto", "bs"],
    vesPerUsd: ["tasa", "tasa cobro", "tasa_cobro"],
} as const;

/**
 * Reads financier deposits from the first sheet. Requires the columns
 * «fecha venta», «fecha cobro» and «monto cobrado»; «tasa» is optional and marks
 * a partial payment converted at that rate.
 * @param file - Workbook chosen by the user.
 * @returns Deposits plus warnings about invalid rows.
 */
export async function readFinancedSaleCollectionsWorkbook(file: File): Promise<WorkbookImport<ImportedFinancedSaleCollection>> {
    const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { items: [], warnings: ["El archivo no contiene hojas."] };
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
    const headerIndex = matrix.findIndex((cells) => headerColumn(cells, COLLECTION_HEADERS.collectedOn) >= 0);
    if (headerIndex < 0) return { items: [], warnings: ["No se encontró la fila de encabezados (fecha venta, fecha cobro, monto cobrado)."] };
    const header = matrix[headerIndex];
    const columns = {
        saleDate: headerColumn(header, COLLECTION_HEADERS.saleDate),
        collectedOn: headerColumn(header, COLLECTION_HEADERS.collectedOn),
        receivedVes: headerColumn(header, COLLECTION_HEADERS.receivedVes),
        vesPerUsd: headerColumn(header, COLLECTION_HEADERS.vesPerUsd),
    };
    if (columns.saleDate < 0 || columns.receivedVes < 0) {
        return { items: [], warnings: ["Faltan las columnas «fecha venta» o «monto cobrado»."] };
    }

    const items: ImportedFinancedSaleCollection[] = [];
    const warnings: string[] = [];
    matrix.slice(headerIndex + 1).forEach((cells, offset) => {
        if (cells.every((cell) => cell === null || String(cell).trim() === "")) return;
        const row = headerIndex + offset + 2;
        const saleDate = cellDate(cells[columns.saleDate]);
        const collectedOn = cellDate(cells[columns.collectedOn]);
        const received = cellNumber(cells[columns.receivedVes]);
        const rate = columns.vesPerUsd >= 0 ? cellNumber(cells[columns.vesPerUsd]) : null;
        if (!saleDate || !collectedOn || received === null || received <= 0) {
            warnings.push(`Fila ${row}: fecha de venta, fecha de cobro o monto inválido.`);
            return;
        }
        items.push({ saleReference: saleDate, collectedOn, receivedVes: received.toFixed(2), ...(rate && rate > 0 ? { vesPerUsd: String(rate) } : {}) });
    });
    return { items, warnings };
}

/** Downloads an empty deposits workbook with the expected columns. */
export function downloadFinancedSaleCollectionsTemplate(): void {
    const sheet = XLSX.utils.aoa_to_sheet([
        ["fecha venta", "fecha cobro", "monto cobrado", "tasa"],
        ["01/10/2025", "15/10/2025", 3992.47, null],
    ]);
    sheet["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 10 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Cobros");
    XLSX.writeFile(workbook, "plantilla-cobros-financiadora.xlsx");
}

export type AccountRoleLabels = Record<FinancedSaleAccountRole, string>;

const MODE_LABELS = { actual: "Real", estimated: "Estimado", pending: "Pendiente" } as const;

/**
 * Writes the calculated report as a workbook with the daily detail, monthly
 * totals and both journal variants.
 * @param report - Calculated report.
 * @param journals - Daily and monthly entries, already filtered by the estimated-collection policy.
 * @param roleLabels - Account names shown for each journal role.
 * @param fileName - Download file name.
 */
export function downloadFinancedSalesReportWorkbook(
    report: FinancedSalesExchangeDifferenceReport,
    journals: { daily: readonly FinancedSaleJournalEntry[]; monthly: readonly FinancedSaleJournalEntry[] },
    roleLabels: AccountRoleLabels,
    fileName: string,
): void {
    const detail: unknown[][] = [[
        "Venta", "Fecha venta", "Monto venta Bs", "Tasa venta", "Venta USD", "% contado", "Contado Bs",
        "Financiado Bs", "Financiado USD", "Fecha cobro", "Cobrado Bs", "Tasa implícita", "Diferencial Bs", "Saldo Bs", "Origen cobro", "Observación",
    ]];
    for (const row of report.rows) {
        if (row.status === "failed") {
            detail.push([row.line.reference, formatDate(row.line.saleDate), num(row.line.saleAmountVes), null, null, null, null, null, null, null, null, null, null, null, null, row.reason]);
            continue;
        }
        const s = row.settlement;
        const collections = s.collections.length ? s.collections : [null];
        collections.forEach((collection, index) => {
            const first = index === 0;
            detail.push([
                s.terms.reference,
                formatDate(s.terms.saleDate),
                first ? num(s.terms.saleAmountVes) : null,
                first ? num(s.terms.saleVesPerUsd) : null,
                first ? num(s.saleAmountUsd) : null,
                first ? num(s.terms.upfrontPercent) : null,
                first ? num(s.upfrontVes) : null,
                first ? num(s.financedVes) : null,
                first ? num(s.financedUsd) : null,
                collection ? formatDate(collection.collectedOn) : null,
                collection ? num(collection.receivedVes) : null,
                collection ? num(collection.impliedVesPerUsd) : null,
                collection ? num(collection.exchangeDifference) : null,
                index === collections.length - 1 ? num(s.outstandingCarriedVes) : null,
                MODE_LABELS[row.collectionMode],
                row.saleRateSource === "override" ? "Tasa de venta manual" : null,
            ]);
        });
    }

    const months: unknown[][] = [["Mes", "Ventas Bs", "Contado Bs", "Financiado Bs", "Cobrado Bs", "Ganancia cambiaria Bs", "Pérdida cambiaria Bs", "Diferencial neto Bs", "Saldo por cobrar Bs"]];
    for (const month of [...report.months, { month: "Total", ...report.totals }]) {
        months.push([
            month.month, num(month.saleAmountVes), num(month.upfrontVes), num(month.financedVes), num(month.collectedVes),
            num(month.realizedGainVes), num(month.realizedLossVes), num(month.realizedGainVes) - num(month.realizedLossVes), num(month.outstandingCarriedVes),
        ]);
    }

    const workbook = XLSX.utils.book_new();
    appendSheet(workbook, "Detalle", detail, 14);
    appendSheet(workbook, "Resumen mensual", months, 18);
    appendSheet(workbook, "Asientos diarios", journalMatrix(journals.daily, roleLabels), 18);
    appendSheet(workbook, "Asientos mensuales", journalMatrix(journals.monthly, roleLabels), 18);
    XLSX.writeFile(workbook, fileName);
}

function journalMatrix(entries: readonly FinancedSaleJournalEntry[], roleLabels: AccountRoleLabels): unknown[][] {
    const matrix: unknown[][] = [["N°", "Fecha", "Descripción", "Cuenta", "Debe", "Haber"]];
    entries.forEach((entry, index) => {
        for (const line of entry.lines) {
            matrix.push([index + 1, formatDate(entry.date), entry.description, roleLabels[line.role], num(line.debit) || null, num(line.credit) || null]);
        }
    });
    return matrix;
}

function appendSheet(workbook: XLSX.WorkBook, name: string, matrix: unknown[][], width: number): void {
    const sheet = XLSX.utils.aoa_to_sheet(matrix);
    sheet["!cols"] = (matrix[0] ?? []).map(() => ({ wch: width }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function num(value: ExactDecimal | string): number {
    return Number(decimalToFixed(value as ExactDecimal, 8));
}

/** Converts a Date, Excel serial or `dd/mm/yyyy` text cell to `YYYY-MM-DD`. */
function cellDate(cell: unknown): string | null {
    if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
        // SheetJS builds local-midnight dates that can land seconds before midnight; noon avoids a day shift.
        const noon = new Date(cell.getTime() + 12 * 60 * 60 * 1000);
        return isoDate(noon.getFullYear(), noon.getMonth() + 1, noon.getDate());
    }
    if (typeof cell !== "string") return null;
    const match = cell.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match;
    return isoDate(Number(year), Number(month), Number(day));
}

function isoDate(year: number, month: number, day: number): string | null {
    const value = new Date(Date.UTC(year, month - 1, day));
    if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return null;
    return value.toISOString().slice(0, 10);
}

function cellNumber(cell: unknown): number | null {
    if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
    if (typeof cell !== "string") return null;
    const raw = cell.trim();
    if (!/^-?[\d.,]+$/.test(raw)) return null;
    // Venezuelan text amounts use "." for thousands and "," for decimals.
    const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
}

function headerColumn(cells: unknown[], names: readonly string[]): number {
    return cells.findIndex((cell) => typeof cell === "string" && names.includes(cell.trim().toLowerCase()));
}

export function formatDate(iso: string): string {
    const [year, month, day] = iso.slice(0, 10).split("-");
    return `${day}/${month}/${year}`;
}
