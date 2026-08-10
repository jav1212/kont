"use client";

import { useCallback, useMemo, useState } from "react";
import { useBcvRates } from "@/src/modules/tools/frontend/hooks/use-bcv-rates";
import {
    LOCAL_CURRENCY,
    normalizeCurrencyCode,
    type AppliedExchangeRate,
    type CurrencyCode,
} from "../../shared/currency";

export interface CurrencyOption {
    code: CurrencyCode;
    label: string;
}

export function useInvoiceExchangeRates(
    date: string,
    initial: readonly AppliedExchangeRate[] = [],
) {
    const { rates: bcvRates, date: publishedDate, loading, refresh } = useBcvRates(date || null);
    const [appliedRates, setAppliedRates] = useState<AppliedExchangeRate[]>(() => [...initial]);

    const effectiveRates = useMemo(() => {
        const existing = new Map(appliedRates.map((rate) => [normalizeCurrencyCode(rate.currencyCode), rate]));
        for (const rate of bcvRates) {
            const code = normalizeCurrencyCode(rate.code);
            const saved = existing.get(code);
            if (saved?.source === "manual" || saved?.source === "legacy") continue;
            existing.set(code, { currencyCode: code, vesPerUnit: rate.sell, decimals: saved?.decimals ?? 4,
                effectiveDate: rate.date, source: "bcv", bcvRate: rate.sell });
        }
        return [...existing.values()];
    }, [appliedRates, bcvRates]);

    const options = useMemo<CurrencyOption[]>(() => {
        const codes = new Set<string>([LOCAL_CURRENCY]);
        bcvRates.forEach((rate) => codes.add(normalizeCurrencyCode(rate.code)));
        effectiveRates.forEach((rate) => codes.add(normalizeCurrencyCode(rate.currencyCode)));
        const frequent = [LOCAL_CURRENCY, "USD", "EUR"];
        return [...codes].sort((a, b) => {
            const ai = frequent.indexOf(a); const bi = frequent.indexOf(b);
            if (ai >= 0 || bi >= 0) return (ai < 0 ? frequent.length : ai) - (bi < 0 ? frequent.length : bi);
            return a.localeCompare(b);
        })
            .map((code) => {
                const country = bcvRates.find((rate) => normalizeCurrencyCode(rate.code) === code)?.country;
                return { code, label: code === LOCAL_CURRENCY ? "Bolívares · VES" : `${code}${country ? ` · ${country}` : ""}` };
            });
    }, [effectiveRates, bcvRates]);

    const getRate = useCallback((currencyCode: CurrencyCode): number | null => {
        const code = normalizeCurrencyCode(currencyCode);
        if (code === LOCAL_CURRENCY) return 1;
        return effectiveRates.find((rate) => normalizeCurrencyCode(rate.currencyCode) === code)?.vesPerUnit ?? null;
    }, [effectiveRates]);

    const setManualRate = useCallback((currencyCode: CurrencyCode, value: number, decimals = 4) => {
        const code = normalizeCurrencyCode(currencyCode);
        setAppliedRates((current) => {
            const previous = current.find((rate) => normalizeCurrencyCode(rate.currencyCode) === code);
            const next: AppliedExchangeRate = {
                currencyCode: code,
                vesPerUnit: value,
                decimals,
                effectiveDate: previous?.effectiveDate ?? publishedDate ?? date,
                source: "manual",
                bcvRate: previous?.bcvRate ?? (previous?.source === "bcv" ? previous.vesPerUnit : null),
            };
            return [...current.filter((rate) => normalizeCurrencyCode(rate.currencyCode) !== code), next];
        });
    }, [date, publishedDate]);

    return { options, appliedRates: effectiveRates, setAppliedRates, getRate, setManualRate, publishedDate, loading, refresh };
}
