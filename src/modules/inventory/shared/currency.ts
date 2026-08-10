export type CurrencyCode = string;

export type ExchangeRateSource = "bcv" | "manual" | "legacy";

export interface AppliedExchangeRate {
    currencyCode: CurrencyCode;
    vesPerUnit: number;
    decimals: number;
    effectiveDate: string;
    source: ExchangeRateSource;
    bcvRate?: number | null;
}

export const LOCAL_CURRENCY = "VES" as const;

/** Normalize the legacy database contract without leaking B/D into the domain. */
export function normalizeCurrencyCode(value?: string | null): CurrencyCode {
    const code = String(value ?? "").trim().toUpperCase();
    if (!code || code === "B") return LOCAL_CURRENCY;
    if (code === "D") return "USD";
    return code;
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
    return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

export function isLocalCurrency(value?: string | null): boolean {
    return normalizeCurrencyCode(value) === LOCAL_CURRENCY;
}

export function rateForCurrency(
    currencyCode: CurrencyCode,
    rates: readonly AppliedExchangeRate[],
): number | null {
    const code = normalizeCurrencyCode(currencyCode);
    if (code === LOCAL_CURRENCY) return 1;
    const rate = rates.find((item) => normalizeCurrencyCode(item.currencyCode) === code)?.vesPerUnit;
    return rate != null && Number.isFinite(rate) && rate > 0 ? rate : null;
}

export function formatCurrencyCode(value?: string | null): string {
    return normalizeCurrencyCode(value) === LOCAL_CURRENCY ? "Bs" : normalizeCurrencyCode(value);
}
