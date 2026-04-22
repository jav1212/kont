"use client";

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { BcvRate } from "../hooks/use-bcv-rates";
import { CURRENCIES, currencyMeta } from "../utils/currency-codes";
import { formatVes, parseUserNumber } from "../utils/format-number";

interface Props {
    rates: BcvRate[];
}

export function CrossConverter({ rates }: Props) {
    const [from, setFrom] = useState<string>("USD");
    const [to, setTo] = useState<string>("EUR");
    const [amount, setAmount] = useState<string>("100");

    const fromRate = rates.find((r) => r.code === from)?.sell ?? NaN;
    const toRate = rates.find((r) => r.code === to)?.sell ?? NaN;
    const amountNum = parseUserNumber(amount);

    const result = useMemo(() => {
        if (!isFinite(amountNum) || !isFinite(fromRate) || !isFinite(toRate) || toRate === 0) return NaN;
        // amount in VES = amount × fromRate; then / toRate = amount in destination
        return (amountNum * fromRate) / toRate;
    }, [amountNum, fromRate, toRate]);

    const fromMeta = currencyMeta(from);
    const toMeta = currencyMeta(to);
    const crossRate = isFinite(fromRate) && isFinite(toRate) && toRate !== 0 ? fromRate / toRate : NaN;

    return (
        <div className="rounded-2xl border border-border-light bg-surface-1 overflow-hidden shadow-sm shadow-black/5">
            <div className="px-6 py-4 border-b border-border-light bg-surface-1/60">
                <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                    Conversión cruzada
                </p>
                <p className="text-[11px] text-foreground/50 mt-0.5">
                    De divisa a divisa usando el BCV como referencia
                </p>
            </div>

            <div className="p-6 flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 items-end">
                    {/* From */}
                    <div className="flex flex-col gap-1.5 min-w-0">
                        <label className="text-[12px] font-bold uppercase tracking-[0.12em] text-foreground/60">
                            {fromMeta.flag} Desde
                        </label>
                        <div className="flex items-center gap-2 min-w-0">
                            <select
                                value={from}
                                onChange={(e) => setFrom(e.target.value)}
                                className="h-11 rounded-lg border border-border-light bg-surface-2 px-2 text-[14px] font-mono font-bold shrink-0 focus:outline-none focus:border-primary-500"
                            >
                                {CURRENCIES.map((c) => (
                                    <option key={c.code} value={c.code}>{c.code}</option>
                                ))}
                            </select>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="flex-1 min-w-0 h-11 rounded-lg border border-border-light bg-surface-2 px-4 text-[16px] font-mono font-bold tabular-nums focus:outline-none focus:border-primary-500"
                                placeholder="0,00"
                            />
                        </div>
                    </div>

                    <div className="hidden md:flex items-center justify-center h-11">
                        <ArrowRight size={20} className="text-foreground/40" />
                    </div>

                    {/* To */}
                    <div className="flex flex-col gap-1.5 min-w-0">
                        <label className="text-[12px] font-bold uppercase tracking-[0.12em] text-foreground/60">
                            {toMeta.flag} Hasta
                        </label>
                        <div className="flex items-center gap-2 min-w-0">
                            <select
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                className="h-11 rounded-lg border border-border-light bg-surface-2 px-2 text-[14px] font-mono font-bold shrink-0 focus:outline-none focus:border-primary-500"
                            >
                                {CURRENCIES.map((c) => (
                                    <option key={c.code} value={c.code}>{c.code}</option>
                                ))}
                            </select>
                            <div className="flex-1 min-w-0 h-11 rounded-lg border border-primary-500/40 bg-primary-500/5 px-4 flex items-center text-[16px] font-mono font-bold tabular-nums text-foreground truncate">
                                {isFinite(result) ? formatVes(result, 2) : "—"}
                            </div>
                        </div>
                    </div>
                </div>

                {isFinite(crossRate) && (
                    <p className="text-[11px] text-foreground/50 text-center pt-2 border-t border-border-light">
                        1 {from} ≈ {formatVes(crossRate, 4)} {to} · vía BCV
                    </p>
                )}
            </div>
        </div>
    );
}
