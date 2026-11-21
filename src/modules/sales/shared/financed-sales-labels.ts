// Spanish labels shared by the financed-sales calculator and ledger screens.

import { decimalToFixed, type ExactDecimal } from "@kontave/monetary/domain";
import type { FinancedSaleAccountRole, FinancedSaleJournalKind } from "@kontave/sales/domain";

/** Default account names shown for each journal role before accounts are chosen. */
export const DEFAULT_ROLE_LABELS: Record<FinancedSaleAccountRole, string> = {
    bank: "Banco",
    financier_receivable: "Cuentas por cobrar Cashea",
    sales: "Ventas",
    exchange_gain: "Diferencial cambiario (ingreso)",
    exchange_loss: "Diferencial cambiario (egreso)",
    financier_commission: "Comisión financiadora",
};

/** Field labels of the account selectors. */
export const ROLE_HINTS: Record<FinancedSaleAccountRole, string> = {
    bank: "Cuenta banco",
    financier_receivable: "Cuenta por cobrar financiadora",
    sales: "Cuenta de ventas",
    exchange_gain: "Ganancia cambiaria",
    exchange_loss: "Pérdida cambiaria",
    financier_commission: "Gasto por comisión",
};

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/**
 * Formats a `YYYY-MM` month for display.
 * @param month - Month key.
 * @returns For example «Octubre 2025».
 */
export function monthLabel(month: string): string {
    return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month} ${month.slice(0, 4)}`;
}

/**
 * Description of a monthly summary entry.
 * @param kind - Kind of the summarized entries.
 * @param month - `YYYY-MM` month the entries belong to.
 * @returns Entry description.
 */
export function describeFinancedSalesMonth(kind: FinancedSaleJournalKind, month: string): string {
    const descriptions: Record<FinancedSaleJournalKind, string> = {
        sale: "Ventas financiadas",
        collection: "Cobros financiadora",
        revaluation: "Diferencial cambiario no realizado",
        revaluation_reversal: "Reverso diferencial no realizado",
    };
    return `${descriptions[kind]} ${monthLabel(month)}`;
}

/**
 * Formats a decimal as Venezuelan currency text.
 * @param value - Exact decimal or decimal text.
 * @param digits - Fraction digits.
 * @returns Localized number without currency symbol.
 */
export function formatVes(value: ExactDecimal | string, digits = 2): string {
    return Number(decimalToFixed(value as ExactDecimal, digits)).toLocaleString("es-VE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
