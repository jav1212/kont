"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import {
    DEFAULT_REFERENCE_CURRENCY,
    normalizeExchangeRateInput,
    type PayrollReferenceCurrencyCode,
} from "../../../shared/reference-currency";

// Calculator-flavour BCV state.
// Different from `useBcvRate` (in shared/bcv-pill) which fetches once and
// is read-only. The calculators expose an editable rate for any BCV
// currency and date (same choices as the payroll run), a manual refresh
// button, and surface fetch errors inline.

export interface CalculatorBcv {
    /** rate (Bs. per `currencyCode`) as a string for controlled <input> binding */
    exchangeRate:  string;
    setExchangeRate(v: string): void;
    /** parsed numeric rate in Bs. per `currencyCode` (0 if unparseable) */
    bcvRate:       number;
    /** reference currency the rate and the displayed equivalents use */
    currencyCode:  PayrollReferenceCurrencyCode;
    setCurrencyCode(code: PayrollReferenceCurrencyCode): void;
    /** ISO date (YYYY-MM-DD) whose BCV publication is requested */
    rateDate:      string;
    setRateDate(iso: string): void;
    /**
     * Bs. per USD for `rateDate`. Employee salaries are stored in VES or USD,
     * so USD salaries must convert with this rate even when another reference
     * currency is selected. Equals `bcvRate` while the currency is USD so a
     * manually typed rate is honoured.
     */
    usdRate:       number;
    /** true while a fetch is in flight */
    bcvLoading:    boolean;
    /** last fetch error message, or null */
    bcvFetchError: string | null;
    /** fetch `currencyCode` (and USD) from /api/bcv/rate for `rateDate` */
    fetchBcvRate(): Promise<void>;
}

interface Options {
    /** initial rate string when no fetch has happened yet (defaults to "79.59") */
    initial?:    string;
    /** auto-fetch on mount and whenever the date or currency changes (default true) */
    autoFetch?:  boolean;
}

type RateResponse = { rate?: number; error?: string };

async function requestRate(date: string, code: string): Promise<{ rate: string } | { error: string }> {
    const res  = await fetch(`/api/bcv/rate?date=${date}&code=${code}`);
    const data = await res.json() as RateResponse;
    if (!res.ok) return { error: data.error ?? "Error al consultar." };
    const rate = normalizeExchangeRateInput(data.rate ?? "");
    return rate ? { rate } : { error: "La API BCV devolvió una tasa inválida." };
}

/**
 * Owns the exchange-rate inputs of the payroll benefit calculators.
 *
 * @param opts - Initial rate and whether to fetch automatically.
 * @returns Editable rate state, the selected currency and date, the USD rate
 *          for salary conversion, and fetch status.
 * @remarks Changing the date or currency triggers a new fetch (when
 *          `autoFetch` is on) that overwrites any manually typed rate.
 *          Responses from superseded requests are discarded.
 */
export function useCalculatorBcv(opts: Options = {}): CalculatorBcv {
    const { initial = "79.59", autoFetch = true } = opts;

    const [exchangeRate,   setExchangeRateState] = useState(initial);
    const [currencyCode,   setCurrencyCode]      = useState<PayrollReferenceCurrencyCode>(DEFAULT_REFERENCE_CURRENCY);
    const [rateDate,       setRateDate]          = useState(() => getTodayIsoDate());
    const [fetchedUsdRate, setFetchedUsdRate]    = useState(initial);
    const [bcvLoading,     setBcvLoading]        = useState(false);
    const [bcvFetchError,  setBcvFetchError]     = useState<string | null>(null);
    const requestSeq = useRef(0);

    const setExchangeRate = useCallback((value: string) => {
        const trimmed = value.trim();
        if (trimmed === "") {
            setExchangeRateState("");
            return;
        }
        setExchangeRateState(normalizeExchangeRateInput(trimmed) || trimmed);
    }, []);

    const fetchBcvRate = useCallback(async () => {
        if (!rateDate) return;
        const seq = ++requestSeq.current;
        setBcvLoading(true);
        setBcvFetchError(null);
        try {
            const [selected, usd] = await Promise.all([
                requestRate(rateDate, currencyCode),
                currencyCode === "USD" ? null : requestRate(rateDate, "USD"),
            ]);
            if (seq !== requestSeq.current) return;
            if ("error" in selected) {
                setBcvFetchError(selected.error);
                return;
            }
            setExchangeRateState(selected.rate);
            if (usd && "error" in usd) {
                setBcvFetchError(`Sin tasa USD para convertir salarios en dólares: ${usd.error}`);
                return;
            }
            setFetchedUsdRate(usd ? usd.rate : selected.rate);
        } catch {
            if (seq === requestSeq.current) setBcvFetchError("No se pudo conectar con la API BCV.");
        } finally {
            if (seq === requestSeq.current) setBcvLoading(false);
        }
    }, [rateDate, currencyCode]);

    useEffect(() => {
        if (!autoFetch) return;
        void fetchBcvRate();
    }, [autoFetch, fetchBcvRate]);

    const bcvRate = useMemo(() => parseFloat(exchangeRate) || 0, [exchangeRate]);
    const usdRate = useMemo(
        () => currencyCode === "USD" ? bcvRate : parseFloat(fetchedUsdRate) || 0,
        [currencyCode, bcvRate, fetchedUsdRate],
    );

    return {
        exchangeRate, setExchangeRate, bcvRate,
        currencyCode, setCurrencyCode,
        rateDate, setRateDate,
        usdRate,
        bcvLoading, bcvFetchError, fetchBcvRate,
    };
}
