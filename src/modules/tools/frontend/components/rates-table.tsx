"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { BcvRate } from "../hooks/use-bcv-rates";
import { currencyMeta } from "../utils/currency-codes";
import { formatRate, formatPercentage } from "../utils/format-number";

interface Props {
    rates: BcvRate[];
    loading?: boolean;
}

export function RatesTable({ rates, loading }: Props) {
    return (
        <div className="rounded-2xl border border-border-light bg-surface-1 overflow-hidden shadow-sm shadow-black/5">
            <div className="px-6 py-4 border-b border-border-light bg-surface-1/60">
                <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                    Cotización BCV
                </p>
                <p className="text-[11px] text-foreground/50 mt-0.5">
                    Precio de venta y variación diaria
                </p>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full" aria-label="Tasas BCV">
                    <thead>
                        <tr className="bg-surface-2/30 border-b border-border-light">
                            <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-foreground/50">Moneda</th>
                            <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-[0.1em] text-foreground/50">Compra</th>
                            <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-[0.1em] text-foreground/50">Venta</th>
                            <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-[0.1em] text-foreground/50">Variación</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light/50">
                        {loading && rates.length === 0 && (
                            Array.from({ length: 6 }).map((_, i) => (
                                <tr key={i}>
                                    <td className="px-4 py-3" colSpan={4}>
                                        <div className="h-5 bg-surface-2 rounded animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        )}
                        {!loading && rates.length === 0 && (
                            <tr>
                                <td className="px-4 py-6 text-center text-[12px] text-foreground/40 uppercase tracking-[0.12em]" colSpan={4}>
                                    Sin datos disponibles
                                </td>
                            </tr>
                        )}
                        {rates.map((r) => {
                            const m = currencyMeta(r.code);
                            const pct = r.percentageChange;
                            const trend = pct == null ? 0 : pct > 0 ? 1 : pct < 0 ? -1 : 0;
                            return (
                                <tr key={r.code} className="hover:bg-surface-2/50 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[20px] leading-none">{m.flag}</span>
                                            <div className="flex flex-col">
                                                <span className="text-[13px] font-mono font-bold text-foreground">
                                                    {r.code}
                                                </span>
                                                <span className="text-[11px] text-foreground/50">
                                                    {m.label}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right text-[14px] font-mono tabular-nums text-foreground/70">
                                        {formatRate(r.buy)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-[15px] font-mono font-bold tabular-nums text-foreground">
                                        {formatRate(r.sell)}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <span className={[
                                            "inline-flex items-center gap-1 text-[12px] font-mono tabular-nums font-bold",
                                            trend > 0 ? "text-[var(--text-success, theme(colors.emerald.500))]" : "",
                                            trend < 0 ? "text-[var(--text-danger, theme(colors.red.500))]" : "",
                                            trend === 0 ? "text-foreground/50" : "",
                                        ].join(" ")}>
                                            {trend > 0 ? <TrendingUp size={12} /> : trend < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
                                            {formatPercentage(pct)}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
