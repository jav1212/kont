"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { motion } from "framer-motion";
import type { BcvRate } from "../hooks/use-bcv-rates";
import { formatVes, parseUserNumber } from "../utils/format-number";
import { CurrencyInlineSelect } from "./currency-inline-select";
import { AnimatedNumber } from "./animated-number";
import { BaseInput } from "@/src/shared/frontend/components/base-input";

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
        return (amountNum * fromRate) / toRate;
    }, [amountNum, fromRate, toRate]);

    const crossRate = isFinite(fromRate) && isFinite(toRate) && toRate !== 0 ? fromRate / toRate : NaN;

    const swap = () => {
        setFrom(to);
        setTo(from);
    };

    return (
        <div className="rounded-2xl border border-border-light bg-surface-1 overflow-hidden">
            <div className="px-6 py-4 border-b border-border-light">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground">
                    Conversión cruzada
                </p>
                <p className="text-[11px] text-foreground/50 mt-0.5 font-mono">
                    De divisa a divisa usando el BCV como referencia
                </p>
            </div>

            <div className="p-6 flex flex-col gap-5">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 items-end">
                    {/* From */}
                    <div className="flex flex-col gap-2 min-w-0">
                        <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/50">
                            Desde
                        </label>
                        <div className="flex items-stretch gap-2 min-w-0">
                            <CurrencyInlineSelect
                                value={from}
                                onChange={setFrom}
                                ariaLabel="Moneda origen"
                                size="lg"
                            />
                            <BaseInput.Field
                                type="text"
                                value={amount}
                                onValueChange={setAmount}
                                placeholder="0,00"
                                className="flex-1 min-w-0"
                            />
                        </div>
                    </div>

                    {/* Swap — real button that inverts from/to */}
                    <div className="flex items-center justify-center md:pb-0 -my-1 md:my-0">
                        <motion.button
                            type="button"
                            onClick={swap}
                            aria-label={`Invertir: ${to} → ${from}`}
                            whileTap={{ scale: 0.92 }}
                            className={[
                                "flex items-center justify-center h-12 w-12 rounded-full",
                                "border border-border-light bg-surface-1 text-foreground/70",
                                "hover:bg-primary-500 hover:border-primary-500 hover:text-white",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
                                "transition-colors duration-150",
                            ].join(" ")}
                        >
                            <motion.span
                                className="inline-flex md:rotate-0 rotate-90"
                                animate={{ rotate: 0 }}
                                whileHover={{ rotate: 180 }}
                                transition={{ type: "spring", stiffness: 200, damping: 18 }}
                            >
                                <ArrowLeftRight size={16} />
                            </motion.span>
                        </motion.button>
                    </div>

                    {/* To */}
                    <div className="flex flex-col gap-2 min-w-0">
                        <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/50">
                            Hasta
                        </label>
                        <div className="flex items-stretch gap-2 min-w-0">
                            <CurrencyInlineSelect
                                value={to}
                                onChange={setTo}
                                ariaLabel="Moneda destino"
                                size="lg"
                            />
                            <div
                                className="flex-1 min-w-0 h-12 rounded-lg px-4 flex items-center overflow-hidden border border-primary-500 bg-primary-500"
                                aria-live="polite"
                            >
                                <AnimatedNumber
                                    value={isFinite(result) ? formatVes(result, 2) : "—"}
                                    className="text-[22px] sm:text-[26px] leading-none font-mono font-bold tabular-nums text-white truncate"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {isFinite(crossRate) && (
                    <div className="flex justify-center pt-1">
                        <div className="inline-flex items-center gap-2 rounded-full border border-border-light bg-surface-2 px-3 py-1.5">
                            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-foreground/50">
                                Tasa cruzada
                            </span>
                            <span className="text-[12px] font-mono font-bold tabular-nums text-foreground">
                                1 {from} ≈ {formatVes(crossRate, 4)} {to}
                            </span>
                            <span className="text-[10px] text-foreground/40">· vía BCV</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
