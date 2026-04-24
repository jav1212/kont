"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { motion } from "framer-motion";
import { VES, currencyMeta } from "../utils/currency-codes";
import { formatVes, formatPercentage, parseUserNumber, roundToDecimals } from "../utils/format-number";
import type { BcvRate } from "../hooks/use-bcv-rates";
import { CurrencyInlineSelect } from "./currency-inline-select";
import { AnimatedNumber } from "./animated-number";
import { Flag } from "./flag";
import { BaseInput } from "@/src/shared/frontend/components/base-input";

interface Props {
    rates: BcvRate[];
    rateDate: string | null;
    decimals: number;
}

type Direction = "to-ves" | "from-ves";

// Currency display order inside the equivalences grid: majors first, then rest.
const EQUIVALENCE_PRIORITY = ["USD", "EUR", "CNY"];

export function CurrencyConverter({ rates, rateDate, decimals }: Props) {
    const [code, setCode] = useState<string>("USD");
    const [direction, setDirection] = useState<Direction>("to-ves");
    const [amount, setAmount] = useState<string>("100");

    const amountNum = parseUserNumber(amount);
    const activeRate = useMemo(() => rates.find((r) => r.code === code) ?? null, [rates, code]);
    const rate = activeRate?.sell ?? NaN;
    const effectiveRate = useMemo(() => roundToDecimals(rate, decimals), [rate, decimals]);

    const converted = useMemo(() => {
        if (!isFinite(amountNum) || !isFinite(effectiveRate)) return NaN;
        return direction === "to-ves" ? amountNum * effectiveRate : effectiveRate === 0 ? NaN : amountNum / effectiveRate;
    }, [amountNum, effectiveRate, direction]);

    const originMeta = direction === "to-ves" ? currencyMeta(code) : VES;
    const targetMeta = direction === "to-ves" ? VES : currencyMeta(code);

    const toggleDirection = () => setDirection((d) => (d === "to-ves" ? "from-ves" : "to-ves"));

    const amountInVes = useMemo(() => {
        if (!isFinite(amountNum) || !isFinite(effectiveRate)) return NaN;
        return direction === "to-ves" ? amountNum * effectiveRate : amountNum;
    }, [amountNum, effectiveRate, direction]);

    const orderedRates = useMemo(() => {
        const priority = rates.filter((r) => EQUIVALENCE_PRIORITY.includes(r.code))
            .sort((a, b) => EQUIVALENCE_PRIORITY.indexOf(a.code) - EQUIVALENCE_PRIORITY.indexOf(b.code));
        const rest = rates.filter((r) => !EQUIVALENCE_PRIORITY.includes(r.code));
        return [...priority, ...rest];
    }, [rates]);

    const ratePct = activeRate?.percentageChange ?? null;
    const rateTrend = ratePct == null ? 0 : ratePct > 0 ? 1 : ratePct < 0 ? -1 : 0;

    return (
        <div className="relative rounded-2xl overflow-hidden border border-primary-500 bg-surface-1">
            <div className="px-6 py-4 border-b border-border-light flex items-center justify-between gap-3 flex-wrap">
                <div className="flex flex-col">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary-600 dark:text-primary-400">
                        Conversor BCV
                    </p>
                    {rateDate && (
                        <p className="text-[11px] text-foreground/50 mt-0.5 font-mono">
                            Tasa del {rateDate}
                        </p>
                    )}
                </div>
                {isFinite(rate) && (
                    <div className="inline-flex items-center gap-2 h-8 px-3 rounded-full border border-primary-500 bg-surface-2">
                        {ratePct != null && (
                            <span
                                className={[
                                    "inline-flex items-center gap-0.5",
                                    rateTrend > 0 ? "text-emerald-700 dark:text-emerald-300" : "",
                                    rateTrend < 0 ? "text-red-700 dark:text-red-300" : "",
                                    rateTrend === 0 ? "text-foreground/50" : "",
                                ].join(" ")}
                                aria-hidden
                            >
                                {rateTrend > 0 ? <TrendingUp size={11} /> : rateTrend < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
                            </span>
                        )}
                        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-foreground/55">
                            1 {code}
                        </span>
                        <span className="text-[11px] font-mono font-bold tabular-nums text-foreground">
                            Bs. {formatVes(effectiveRate, decimals)}
                        </span>
                        {ratePct != null && (
                            <span
                                className={[
                                    "text-[10px] font-mono font-bold tabular-nums",
                                    rateTrend > 0 ? "text-emerald-700 dark:text-emerald-300" : "",
                                    rateTrend < 0 ? "text-red-700 dark:text-red-300" : "",
                                    rateTrend === 0 ? "text-foreground/50" : "",
                                ].join(" ")}
                            >
                                {formatPercentage(ratePct)}
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="p-6 flex flex-col gap-5">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 items-end">
                    {/* Origin */}
                    <div className="flex flex-col gap-2 min-w-0">
                        <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/50 inline-flex items-center gap-1.5">
                            <Flag code={originMeta.countryCode} size={12} />
                            {originMeta.label}
                        </label>
                        <div className="flex items-stretch gap-2 min-w-0">
                            {direction === "from-ves" ? (
                                <div className="inline-flex items-center justify-center h-12 px-3 rounded-lg border border-border-light bg-surface-2 text-[14px] font-mono font-bold text-foreground/70 shrink-0 min-w-[72px]">
                                    Bs.
                                </div>
                            ) : (
                                <CurrencyInlineSelect
                                    value={code}
                                    onChange={setCode}
                                    ariaLabel="Moneda origen"
                                    size="lg"
                                />
                            )}
                            <BaseInput.Field
                                type="text"
                                value={amount}
                                onValueChange={setAmount}
                                placeholder="0,00"
                                className="flex-1 min-w-0"
                            />
                        </div>
                    </div>

                    {/* Swap button — horizontal arrow on desktop, vertical on mobile */}
                    <div className="flex items-center justify-center md:pb-0 -my-1 md:my-0">
                        <motion.button
                            type="button"
                            onClick={toggleDirection}
                            aria-label={direction === "to-ves" ? "Invertir: Bs. → Divisa" : "Invertir: Divisa → Bs."}
                            whileTap={{ scale: 0.92 }}
                            className={[
                                "group flex items-center justify-center h-12 w-12 rounded-full",
                                "border border-border-light bg-surface-1 text-foreground/70",
                                "hover:bg-primary-500 hover:border-primary-500 hover:text-white",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
                                "transition-colors duration-150",
                            ].join(" ")}
                        >
                            <motion.span
                                className="inline-flex md:-rotate-90"
                                animate={{ rotate: direction === "to-ves" ? 0 : 180 }}
                                transition={{ type: "spring", stiffness: 200, damping: 18 }}
                            >
                                <ArrowDownUp size={16} />
                            </motion.span>
                        </motion.button>
                    </div>

                    {/* Target */}
                    <div className="flex flex-col gap-2 min-w-0">
                        <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/50 inline-flex items-center gap-1.5">
                            <Flag code={targetMeta.countryCode} size={12} />
                            {targetMeta.label}
                        </label>
                        <div className="flex items-stretch gap-2 min-w-0">
                            {direction === "to-ves" ? (
                                <div className="inline-flex items-center justify-center h-12 px-3 rounded-lg border border-border-light bg-surface-2 text-[14px] font-mono font-bold text-foreground/70 shrink-0 min-w-[72px]">
                                    Bs.
                                </div>
                            ) : (
                                <CurrencyInlineSelect
                                    value={code}
                                    onChange={setCode}
                                    ariaLabel="Moneda destino"
                                    size="lg"
                                />
                            )}
                            <div
                                className="flex-1 min-w-0 h-12 rounded-lg px-4 flex items-center overflow-hidden border border-primary-500 bg-primary-500"
                                aria-live="polite"
                            >
                                <AnimatedNumber
                                    value={isFinite(converted) ? formatVes(converted, decimals) : "—"}
                                    className="text-[22px] sm:text-[26px] leading-none font-mono font-bold tabular-nums text-white truncate"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Equivalences table */}
                {isFinite(amountInVes) && rates.length > 0 && (
                    <div className="pt-5 border-t border-border-light">
                        <div className="flex items-baseline justify-between gap-2 mb-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/60">
                                Equivalente en todas las monedas
                            </p>
                            <p className="text-[10px] font-mono text-foreground/45 tabular-nums">
                                {formatVes(amountInVes, decimals)} Bs.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                            <EquivalenceCell
                                countryCode="VE"
                                code="VES"
                                value={formatVes(amountInVes, decimals)}
                                highlight={direction === "to-ves"}
                            />
                            {orderedRates.map((r) => {
                                const m = currencyMeta(r.code);
                                const sellR = roundToDecimals(r.sell, decimals);
                                const eq = sellR > 0 ? amountInVes / sellR : NaN;
                                return (
                                    <EquivalenceCell
                                        key={r.code}
                                        countryCode={m.countryCode}
                                        code={r.code}
                                        value={isFinite(eq) ? formatVes(eq, decimals) : "—"}
                                        highlight={r.code === code}
                                    />
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function EquivalenceCell({ countryCode, code, value, highlight }: { countryCode: string; code: string; value: string; highlight: boolean }) {
    return (
        <div
            className={[
                "rounded-lg px-3.5 py-3 flex flex-col gap-1 min-w-0",
                "transition-[transform,background-color,border-color] duration-200 ease-out",
                "motion-safe:hover:-translate-y-0.5",
                highlight
                    ? "bg-primary-500 border border-primary-500"
                    : "bg-surface-2 border border-transparent hover:border-border-medium",
            ].join(" ")}
        >
            <span
                className={[
                    "text-[10px] font-bold uppercase tracking-[0.12em] flex items-center gap-1.5 min-w-0",
                    highlight ? "text-white/85" : "text-foreground/55",
                ].join(" ")}
            >
                <Flag code={countryCode} size={11} />
                <span className="truncate">{code}</span>
            </span>
            <span
                className={[
                    "text-[14px] font-mono font-bold tabular-nums truncate [font-variant-numeric:tabular-nums]",
                    highlight ? "text-white" : "text-foreground",
                ].join(" ")}
            >
                {value}
            </span>
        </div>
    );
}
