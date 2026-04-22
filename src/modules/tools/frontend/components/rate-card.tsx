"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { BcvRate } from "../hooks/use-bcv-rates";
import { currencyMeta } from "../utils/currency-codes";
import { formatRate, formatPercentage } from "../utils/format-number";

interface Props {
    rate: BcvRate;
    highlight?: boolean;
}

export function RateCard({ rate, highlight }: Props) {
    const meta = currencyMeta(rate.code);
    const pct = rate.percentageChange;
    const trend = pct == null ? 0 : pct > 0 ? 1 : pct < 0 ? -1 : 0;

    return (
        <div className={[
            "rounded-2xl border px-5 py-4 flex flex-col gap-2 transition-colors",
            highlight
                ? "border-primary-500/40 bg-primary-500/5"
                : "border-border-light bg-surface-1",
        ].join(" ")}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-[22px] leading-none">{meta.flag}</span>
                    <span className="text-[13px] font-mono font-bold text-foreground">{rate.code}</span>
                </div>
                <span className={[
                    "inline-flex items-center gap-1 text-[11px] font-mono tabular-nums font-bold px-1.5 py-0.5 rounded",
                    trend > 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "",
                    trend < 0 ? "bg-red-500/10 text-red-600 dark:text-red-400" : "",
                    trend === 0 ? "bg-surface-2 text-foreground/60" : "",
                ].join(" ")}>
                    {trend > 0 ? <TrendingUp size={10} /> : trend < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                    {formatPercentage(pct)}
                </span>
            </div>
            <div>
                <div className="text-[22px] font-mono font-bold tabular-nums text-foreground leading-tight">
                    Bs. {formatRate(rate.sell)}
                </div>
                <div className="text-[11px] text-foreground/50">
                    1 {rate.code} · {meta.label}
                </div>
            </div>
        </div>
    );
}
