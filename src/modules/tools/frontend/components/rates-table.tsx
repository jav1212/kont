"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { motion } from "framer-motion";
import type { BcvRate } from "../hooks/use-bcv-rates";
import { currencyMeta } from "../utils/currency-codes";
import { formatRate, formatPercentage } from "../utils/format-number";
import { Flag } from "./flag";

interface Props {
    rates: BcvRate[];
    loading?: boolean;
}

export function RatesTable({ rates, loading }: Props) {
    return (
        <div className="rounded-2xl border border-border-light bg-surface-1 overflow-hidden">
            <div className="px-6 py-4 border-b border-border-light flex items-center justify-between gap-2 flex-wrap">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground">
                        Cotización BCV
                    </p>
                    <p className="text-[11px] text-foreground/50 mt-0.5 font-mono">
                        Precio de venta y variación diaria
                    </p>
                </div>
                {!loading && rates.length > 0 && (
                    <span className="inline-flex items-center h-7 px-2.5 rounded-md bg-surface-2 border border-border-light text-[10px] font-mono uppercase tracking-[0.14em] text-foreground/60">
                        {rates.length} {rates.length === 1 ? "moneda" : "monedas"}
                    </span>
                )}
            </div>

            <div className="overflow-x-auto">
                <table className="w-full" aria-label="Tasas BCV">
                    <thead>
                        <tr className="border-b border-border-light bg-surface-2">
                            <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/60">
                                Moneda
                            </th>
                            <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/60">
                                Compra
                            </th>
                            <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/60">
                                Venta
                            </th>
                            <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/60">
                                Variación
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && rates.length === 0 && (
                            Array.from({ length: 6 }).map((_, i) => (
                                <tr key={`skel-${i}`} className="border-b border-border-light last:border-b-0">
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-[22px] h-[22px] rounded-full bg-surface-2 animate-pulse shrink-0" />
                                            <div className="flex flex-col gap-1.5">
                                                <div className="h-3 w-10 rounded bg-surface-2 animate-pulse" />
                                                <div className="h-2.5 w-24 rounded bg-surface-2 animate-pulse" />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <div className="ml-auto h-3 w-16 rounded bg-surface-2 animate-pulse" />
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <div className="ml-auto h-4 w-20 rounded bg-surface-2 animate-pulse" />
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <div className="ml-auto h-5 w-14 rounded bg-surface-2 animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        )}
                        {!loading && rates.length === 0 && (
                            <tr>
                                <td className="px-4 py-8 text-center text-[11px] text-foreground/40 uppercase tracking-[0.14em] font-mono" colSpan={4}>
                                    Sin datos disponibles
                                </td>
                            </tr>
                        )}
                        {rates.map((r, idx) => {
                            const m = currencyMeta(r.code);
                            const pct = r.percentageChange;
                            const trend = pct == null ? 0 : pct > 0 ? 1 : pct < 0 ? -1 : 0;
                            return (
                                <motion.tr
                                    key={r.code}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3), ease: "easeOut" }}
                                    className={[
                                        "border-b border-border-light last:border-b-0",
                                        "transition-colors duration-150",
                                        idx % 2 === 1 ? "bg-surface-2" : "",
                                        "hover:bg-surface-2",
                                    ].join(" ")}
                                >
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-3">
                                            <Flag code={m.countryCode} size={20} />
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[13px] font-mono font-bold text-foreground">
                                                    {r.code}
                                                </span>
                                                <span className="text-[11px] text-foreground/50 truncate">
                                                    {m.label}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3.5 text-right text-[13px] font-mono tabular-nums text-foreground/55">
                                        {formatRate(r.buy)}
                                    </td>
                                    <td className="px-4 py-3.5 text-right">
                                        <span className="text-[15px] font-mono font-bold tabular-nums text-foreground">
                                            {formatRate(r.sell)}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3.5 text-right">
                                        <span
                                            className={[
                                                "inline-flex items-center gap-1 text-[12px] font-mono tabular-nums font-bold px-1.5 py-0.5 rounded",
                                                trend > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" : "",
                                                trend < 0 ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" : "",
                                                trend === 0 ? "text-foreground/50" : "",
                                            ].join(" ")}
                                        >
                                            {trend > 0 ? <TrendingUp size={11} /> : trend < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
                                            {formatPercentage(pct)}
                                        </span>
                                    </td>
                                </motion.tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
