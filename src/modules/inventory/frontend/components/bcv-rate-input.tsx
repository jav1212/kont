"use client";

// Component: BcvRateInput + useBcvRate
// Purpose: Reusable BCV rate input with a companion "decimales" control, plus
// a state hook that preserves the *raw* BCV rate returned by the API so the
// displayed value can be re-derived when the user changes the decimal count.
//
// Architectural role: Shared across all inventory forms that register movements
// tied to a BCV exchange rate (purchases, sales, movements, adjustments, returns,
// self-consumption). Lets the user decide how many decimals of the rate affect
// the calculation so the total matches the supplier's physical invoice exactly.
//
// Semantics:
//   - Raw rate (from /api/bcv/rate) is kept internally as `rawRate: number | null`.
//   - Displayed value = `round(rawRate, decimals).toFixed(decimals)` — always
//     padded to the chosen precision so the input reflects the user's setting
//     exactly (e.g. rawRate=483.87 at 3 decimals → "483.870"). When the raw
//     rate has MORE precision than shown, bumping decimals up reveals it
//     (rawRate=414.0517035 at 2 → "414.05", at 4 → "414.0517").
//   - Manual typing clears `rawRate` (so future decimals changes round the typed
//     value instead of re-deriving from a stale API number).
//   - The effective rate used downstream is `round(parseFloat(rate), decimals)`.

import { useCallback, useState } from "react";
import { BaseInput } from "@/src/shared/frontend/components/base-input";

const labelCls = "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";
const subLabelCls = "font-mono text-[10px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] mb-1.5 block text-center";

export const DEFAULT_RATE_DECIMALS = 2;
const MAX_RATE_DECIMALS = 10;

/** Round a numeric rate to `decimals` fraction digits. Returns NaN for invalid input. */
export function roundRateValue(value: number, decimals: number): number {
    if (!isFinite(value)) return NaN;
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

/** Tolerates "42,10" in addition to "42.10". Returns NaN on empty/invalid. */
export function parseRateStr(s: string): number {
    if (!s) return NaN;
    return parseFloat(String(s).replace(",", "."));
}

/**
 * Round a raw rate to `decimals` fraction digits and render it with exactly
 * that many decimal places. Padding is intentional: the input must always show
 * the chosen precision. Preservation of raw-rate precision when bumping
 * decimals up is handled upstream in `useBcvRate` — this function just formats
 * whatever number it receives.
 *
 * Examples:
 *   formatRate(414.0517035, 2) → "414.05"
 *   formatRate(414.0517035, 4) → "414.0517"   (hook passes raw, not pre-truncated)
 *   formatRate(483.87,      3) → "483.870"    (padded to match chosen precision)
 */
export function formatRate(raw: number | string | null, decimals: number): string {
    const n = typeof raw === "number" ? raw : parseRateStr(raw ?? "");
    if (!isFinite(n)) return "";
    return roundRateValue(n, decimals).toFixed(decimals);
}

/**
 * Triad state + helpers for a BCV rate input.
 *
 * `rawRate` preserves the full-precision rate returned by the API so that when
 * the user bumps decimals up (2 → 4), we re-round from the original `414.0517035`
 * instead of the already-truncated `414.05`. When the user types manually, the
 * raw is cleared (next decimals change rounds the typed value directly).
 */
export function useBcvRate(initialDecimals = DEFAULT_RATE_DECIMALS) {
    const [rate, setRate] = useState<string>("");
    const [rawRate, setRawRate] = useState<number | null>(null);
    const [decimals, setDecimals] = useState<number>(initialDecimals);

    const setRateFromApi = useCallback((raw: number, currentDecimals: number) => {
        setRawRate(raw);
        setRate(formatRate(raw, currentDecimals));
    }, []);

    const setRateTyped = useCallback((v: string) => {
        setRate(v);
        setRawRate(null);
    }, []);

    const applyDecimals = useCallback((n: number) => {
        setDecimals(n);
        setRate((prev) => {
            if (rawRate != null) return formatRate(rawRate, n);
            const r = parseRateStr(prev);
            return isFinite(r) ? formatRate(r, n) : prev;
        });
    }, [rawRate]);

    const resetRate = useCallback(() => {
        setRate("");
        setRawRate(null);
    }, []);

    return {
        rate,
        rawRate,
        decimals,
        setRateFromApi,
        setRateTyped,
        applyDecimals,
        resetRate,
        setRateDirect: setRate,
    };
}

interface Props {
    /** Raw input value (string). Parent owns the state. */
    rate: string;
    onRateChange: (rate: string) => void;
    decimals: number;
    onDecimalsChange: (decimals: number) => void;
    loading?: boolean;
    bcvDate?: string | null;
    error?: string | null;
    label?: string;
    placeholder?: string;
}

export function BcvRateInput({
    rate,
    onRateChange,
    decimals,
    onDecimalsChange,
    loading = false,
    bcvDate,
    error,
    label = "Tasa BCV (Bs/USD)",
    placeholder,
}: Props) {
    function handleDecimalsChange(v: string) {
        const parsed = Math.round(Number(v));
        const next = isNaN(parsed) ? DEFAULT_RATE_DECIMALS : Math.max(0, Math.min(MAX_RATE_DECIMALS, parsed));
        onDecimalsChange(next);
    }

    const parsed = parseRateStr(rate);
    const effective = isFinite(parsed) ? roundRateValue(parsed, decimals) : null;
    const mismatch = effective != null && parsed !== effective;

    return (
        <div>
            <div className="flex items-end gap-2">
                <div className="flex-1">
                    <label className={labelCls}>{label}</label>
                    <BaseInput.Field
                        type="number"
                        value={rate}
                        onValueChange={onRateChange}
                        placeholder={loading ? "Consultando BCV…" : (placeholder ?? "Ej. 46.50")}
                        min={0}
                        isDisabled={loading}
                    />
                </div>
                <div className="w-20">
                    <label className={subLabelCls}>Decimales</label>
                    <BaseInput.Field
                        type="number"
                        value={String(decimals)}
                        onValueChange={handleDecimalsChange}
                        min={0}
                        max={MAX_RATE_DECIMALS}
                        step={1}
                        inputClassName="text-center"
                    />
                </div>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                {loading && (
                    <span className="text-[var(--text-tertiary)] animate-pulse">Consultando BCV…</span>
                )}
                {!loading && bcvDate && (
                    <span className="text-green-600 uppercase tracking-[0.12em]">BCV {bcvDate}</span>
                )}
                {!loading && error && (
                    <span className="text-amber-500">{error} — ingresa manualmente</span>
                )}
                {mismatch && (
                    <span className="text-[var(--text-tertiary)] tabular-nums">
                        → {effective!.toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: decimals })} Bs/USD usada
                    </span>
                )}
            </div>
        </div>
    );
}
