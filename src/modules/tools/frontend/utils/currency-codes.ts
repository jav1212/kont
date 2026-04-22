// Currency metadata — display labels + symbols + country names in Spanish.
// Order here determines display order in the rates table and selectors.

export interface CurrencyMeta {
    code: string;
    label: string;        // "Dólar Estadounidense"
    country: string;      // "Estados Unidos"
    symbol: string;       // "$"
    flag: string;         // emoji flag
}

export const CURRENCIES: CurrencyMeta[] = [
    { code: "USD", label: "Dólar Estadounidense", country: "Estados Unidos",    symbol: "$",  flag: "🇺🇸" },
    { code: "EUR", label: "Euro",                 country: "Zona Euro",         symbol: "€",  flag: "🇪🇺" },
    { code: "CNY", label: "Yuan Chino",           country: "China",             symbol: "¥",  flag: "🇨🇳" },
    { code: "GBP", label: "Libra Esterlina",      country: "Reino Unido",       symbol: "£",  flag: "🇬🇧" },
    { code: "JPY", label: "Yen Japonés",          country: "Japón",             symbol: "¥",  flag: "🇯🇵" },
    { code: "CAD", label: "Dólar Canadiense",     country: "Canadá",            symbol: "C$", flag: "🇨🇦" },
    { code: "MXN", label: "Peso Mexicano",        country: "México",            symbol: "$",  flag: "🇲🇽" },
    { code: "BRL", label: "Real Brasileño",       country: "Brasil",            symbol: "R$", flag: "🇧🇷" },
    { code: "AED", label: "Dirham Emiratí",       country: "Emiratos Árabes",   symbol: "د.إ",flag: "🇦🇪" },
    { code: "TRY", label: "Lira Turca",           country: "Turquía",           symbol: "₺",  flag: "🇹🇷" },
    { code: "RUB", label: "Rublo Ruso",           country: "Rusia",             symbol: "₽",  flag: "🇷🇺" },
];

export const VES: CurrencyMeta = {
    code: "VES",
    label: "Bolívar Soberano",
    country: "Venezuela",
    symbol: "Bs.",
    flag: "🇻🇪",
};

export const CURRENCY_MAP: Record<string, CurrencyMeta> = Object.fromEntries(
    [...CURRENCIES, VES].map((c) => [c.code, c])
);

export function currencyMeta(code: string): CurrencyMeta {
    return CURRENCY_MAP[code] ?? { code, label: code, country: "", symbol: code, flag: "💱" };
}
