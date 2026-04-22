"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { BcvRate } from "../hooks/use-bcv-rates";
import { currencyMeta } from "../utils/currency-codes";
import { formatRate, formatPercentage } from "../utils/format-number";
import { RateSparkline } from "./rate-sparkline";
import { Flag } from "./flag";

interface Props {
    rate: BcvRate;
    highlight?: boolean;
}

function RateCardComponent({ rate, highlight }: Props) {
    const meta = currencyMeta(rate.code);
    const pct = rate.percentageChange;
    const trend = pct == null ? 0 : pct > 0 ? 1 : pct < 0 ? -1 : 0;

    if (highlight) {
        // USD — hero treatment. Bigger, accented border, with trend sparkline.
        return (
            <div className="relative rounded-2xl px-6 py-5 sm:py-6 flex flex-col gap-3 overflow-hidden border border-primary-500 bg-surface-1">
                <div className="relative flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <Flag code={meta.countryCode} size={28} />
                        <div className="flex flex-col min-w-0">
                            <span className="text-[14px] font-mono font-bold tracking-tight text-foreground">
                                {rate.code}
                            </span>
                            <span className="text-[11px] text-foreground/55 truncate">
                                {meta.label}
                            </span>
                        </div>
                    </div>
                    <span
                        className={[
                            "inline-flex items-center gap-1 text-[11px] font-mono tabular-nums font-bold px-2 py-1 rounded-md shrink-0",
                            trend > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" : "",
                            trend < 0 ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" : "",
                            trend === 0 ? "bg-surface-2 text-foreground/55" : "",
                        ].join(" ")}
                    >
                        {trend > 0 ? <TrendingUp size={11} /> : trend < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
                        {formatPercentage(pct)}
                    </span>
                </div>

                <div className="relative mt-auto pt-1">
                    <div className="flex items-baseline gap-2">
                        <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-foreground/50">
                            Bs.
                        </span>
                        <span className="text-[34px] sm:text-[40px] leading-none font-mono font-bold tabular-nums text-foreground tracking-tight">
                            {formatRate(rate.sell)}
                        </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="text-[10px] text-foreground/50 font-mono uppercase tracking-[0.14em]">
                            Venta BCV · por 1 {rate.code}
                        </div>
                        <RateSparkline code={rate.code} days={7} />
                    </div>
                </div>
            </div>
        );
    }

    // Default — secondary card (EUR, CNY, etc.)
    return (
        <div
            className={[
                "group rounded-2xl border border-border-light bg-surface-1 px-5 py-4 flex flex-col gap-2.5",
                "transition-[transform,border-color] duration-200 ease-out",
                "hover:border-border-medium motion-safe:hover:-translate-y-0.5",
            ].join(" ")}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Flag code={meta.countryCode} size={22} />
                    <span className="text-[13px] font-mono font-bold text-foreground">{rate.code}</span>
                </div>
                <span
                    className={[
                        "inline-flex items-center gap-1 text-[11px] font-mono tabular-nums font-bold px-1.5 py-0.5 rounded",
                        trend > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" : "",
                        trend < 0 ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" : "",
                        trend === 0 ? "bg-surface-2 text-foreground/55" : "",
                    ].join(" ")}
                >
                    {trend > 0 ? <TrendingUp size={10} /> : trend < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                    {formatPercentage(pct)}
                </span>
            </div>
            <div>
                <div className="text-[24px] font-mono font-bold tabular-nums text-foreground leading-tight tracking-tight">
                    Bs. {formatRate(rate.sell)}
                </div>
                <div className="text-[11px] text-foreground/50 mt-0.5">
                    1 {rate.code} · {meta.label}
                </div>
            </div>
        </div>
    );
}

function Skeleton({ highlight }: { highlight?: boolean }) {
    if (highlight) {
        return (
            <div
                aria-hidden
                className="relative rounded-2xl px-6 py-5 sm:py-6 flex flex-col gap-3 overflow-hidden border border-primary-500 bg-surface-1"
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-surface-2 animate-pulse" />
                        <div className="flex flex-col gap-1.5">
                            <div className="h-3 w-10 rounded bg-surface-2 animate-pulse" />
                            <div className="h-2.5 w-24 rounded bg-surface-2 animate-pulse" />
                        </div>
                    </div>
                    <div className="h-6 w-14 rounded-md bg-surface-2 animate-pulse" />
                </div>
                <div className="mt-auto pt-1">
                    <div className="h-9 w-40 rounded bg-surface-2 animate-pulse" />
                    <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="h-2.5 w-32 rounded bg-surface-2 animate-pulse" />
                        <div className="h-7 w-20 rounded bg-surface-2 animate-pulse" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            aria-hidden
            className="rounded-2xl border border-border-light bg-surface-1 px-5 py-4 flex flex-col gap-2.5"
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-surface-2 animate-pulse" />
                    <div className="h-3 w-8 rounded bg-surface-2 animate-pulse" />
                </div>
                <div className="h-5 w-12 rounded bg-surface-2 animate-pulse" />
            </div>
            <div className="flex flex-col gap-1.5">
                <div className="h-6 w-28 rounded bg-surface-2 animate-pulse" />
                <div className="h-2.5 w-24 rounded bg-surface-2 animate-pulse" />
            </div>
        </div>
    );
}

// Compound component export — allows callers to render <RateCard.Skeleton /> for loading states.
export const RateCard = Object.assign(RateCardComponent, { Skeleton });
