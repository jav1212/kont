import type { PurchaseBookRow } from "../../frontend/utils/purchase-book-excel";

export const PURCHASE_BOOK_IMPORT_MARKER = "[KONT_LIBRO_COMPRAS_IMPORT]";

export interface PurchaseBookImportMeta {
    source: "libro_compras_xlsx";
    fileName: string;
    sourceRow: number;
    operation: string;
    supplierRif: string;
    supplierName: string;
    exempt: number;
    taxableBase: number;
    vatRate: number;
    vatAmount: number;
    retention: number;
}

export function buildPurchaseBookNotes(row: PurchaseBookRow, fileName: string): string {
    const meta: PurchaseBookImportMeta = {
        source: "libro_compras_xlsx",
        fileName,
        sourceRow: row.sourceRow,
        operation: row.operation,
        supplierRif: row.supplierRif,
        supplierName: row.supplierName,
        exempt: row.exempt,
        taxableBase: row.taxableBase,
        vatRate: row.vatRate,
        vatAmount: row.vatAmount,
        retention: row.retention,
    };
    return `${PURCHASE_BOOK_IMPORT_MARKER}${JSON.stringify(meta)}`;
}

export function getPurchaseBookImportMeta(notes?: string | null): PurchaseBookImportMeta | null {
    if (!notes?.startsWith(PURCHASE_BOOK_IMPORT_MARKER)) return null;
    try {
        const parsed = JSON.parse(notes.slice(PURCHASE_BOOK_IMPORT_MARKER.length));
        return parsed?.source === "libro_compras_xlsx" ? parsed as PurchaseBookImportMeta : null;
    } catch {
        return null;
    }
}

export function isPurchaseBookImported(invoice: { notes?: string | null }): boolean {
    return getPurchaseBookImportMeta(invoice.notes) !== null;
}
