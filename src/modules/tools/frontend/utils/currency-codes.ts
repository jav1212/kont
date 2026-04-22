// Currency metadata — display labels + symbols + ISO country codes.
// Order here determines display order in the rates table and selectors.

export interface CurrencyMeta {
    code: string;
    label: string;        // "Dólar Estadounidense"
    country: string;      // "Estados Unidos"
    countryCode: string;  // ISO 3166-1 alpha-2 — used by the <Flag/> component
    symbol: string;       // "$"
}

export const CURRENCIES: CurrencyMeta[] = [
    { code: "USD", label: "Dólar Estadounidense", country: "Estados Unidos",    countryCode: "US", symbol: "$"   },
    { code: "EUR", label: "Euro",                 country: "Zona Euro",         countryCode: "EU", symbol: "€"   },
    { code: "CNY", label: "Yuan Chino",           country: "China",             countryCode: "CN", symbol: "¥"   },
    { code: "GBP", label: "Libra Esterlina",      country: "Reino Unido",       countryCode: "GB", symbol: "£"   },
    { code: "JPY", label: "Yen Japonés",          country: "Japón",             countryCode: "JP", symbol: "¥"   },
    { code: "CAD", label: "Dólar Canadiense",     country: "Canadá",            countryCode: "CA", symbol: "C$"  },
    { code: "MXN", label: "Peso Mexicano",        country: "México",            countryCode: "MX", symbol: "$"   },
    { code: "BRL", label: "Real Brasileño",       country: "Brasil",            countryCode: "BR", symbol: "R$"  },
    { code: "AED", label: "Dirham Emiratí",       country: "Emiratos Árabes",   countryCode: "AE", symbol: "د.إ" },
    { code: "TRY", label: "Lira Turca",           country: "Turquía",           countryCode: "TR", symbol: "₺"   },
    { code: "RUB", label: "Rublo Ruso",           country: "Rusia",             countryCode: "RU", symbol: "₽"   },
];

export const VES: CurrencyMeta = {
    code: "VES",
    label: "Bolívar Soberano",
    country: "Venezuela",
    countryCode: "VE",
    symbol: "Bs.",
};

export const CURRENCY_MAP: Record<string, CurrencyMeta> = Object.fromEntries(
    [...CURRENCIES, VES].map((c) => [c.code, c])
);

export function currencyMeta(code: string): CurrencyMeta {
    return CURRENCY_MAP[code] ?? { code, label: code, country: "", countryCode: "XX", symbol: code };
}

/**
 * Map a currency code (e.g. "USD") to its ISO country code ("US"), used by <Flag/>.
 * Falls back to "XX" for unknown codes — the Flag component renders a neutral chip.
 */
export function currencyToCountry(code: string): string {
    return currencyMeta(code).countryCode;
}
