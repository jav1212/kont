import { CURRENCIES, currencyMeta } from "@/src/modules/tools/frontend/utils/currency-codes";

export const PAYROLL_REFERENCE_CURRENCY_CODES = [
    "USD", "EUR", "CNY", "TRY", "RUB", "AED", "GBP", "JPY", "CAD", "MXN", "BRL",
] as const;

export type PayrollReferenceCurrencyCode = typeof PAYROLL_REFERENCE_CURRENCY_CODES[number];
export type PayrollInputCurrency = PayrollReferenceCurrencyCode | "VES";

export const DEFAULT_REFERENCE_CURRENCY: PayrollReferenceCurrencyCode = "USD";

export const PAYROLL_REFERENCE_CURRENCIES = CURRENCIES.filter((currency) =>
    (PAYROLL_REFERENCE_CURRENCY_CODES as readonly string[]).includes(currency.code)
);

export function isPayrollReferenceCurrencyCode(value: string): value is PayrollReferenceCurrencyCode {
    return (PAYROLL_REFERENCE_CURRENCY_CODES as readonly string[]).includes(value);
}

export function normalizePayrollInputCurrency(value: string | null | undefined): PayrollInputCurrency {
    if (value === "VES") return "VES";
    return isPayrollReferenceCurrencyCode(String(value ?? "").toUpperCase())
        ? String(value).toUpperCase() as PayrollReferenceCurrencyCode
        : DEFAULT_REFERENCE_CURRENCY;
}

export function referenceCurrencyLabel(code: PayrollReferenceCurrencyCode): string {
    return currencyMeta(code).label || code;
}

export function referenceCurrencySymbol(code: PayrollReferenceCurrencyCode): string {
    return currencyMeta(code).symbol || code;
}

const EXCHANGE_RATE_DECIMALS = 4;

/**
 * Normalizes a Bs.-per-unit exchange rate to the fixed precision shown in
 * every rate input (4 decimals, matching BCV publications).
 *
 * @param raw - Rate typed by the user or returned by `/api/bcv/rate`.
 * @returns The rate formatted with 4 decimals, or `""` when it is not a positive finite number.
 */
export function normalizeExchangeRateInput(raw: string | number): string {
    const parsed = typeof raw === "number" ? raw : parseFloat(raw);
    if (!isFinite(parsed) || parsed <= 0) return "";
    return parsed.toFixed(EXCHANGE_RATE_DECIMALS);
}
