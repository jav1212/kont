"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { CURRENCIES, VES, currencyMeta } from "../utils/currency-codes";
import { formatRate, formatVes, parseUserNumber } from "../utils/format-number";
import type { BcvRate } from "../hooks/use-bcv-rates";

interface Props {
    rates: BcvRate[];
    rateDate: string | null;
}

type Direction = "to-ves" | "from-ves";

export function CurrencyConverter({ rates, rateDate }: Props) {
    const [code, setCode] = useState<string>("USD");
    const [direction, setDirection] = useState<Direction>("to-ves");
    const [amount, setAmount] = useState<string>("100");

    const amountNum = parseUserNumber(amount);
    const rate = useMemo(() => rates.find((r) => r.code === code)?.sell ?? NaN, [rates, code]);

    const converted = useMemo(() => {
        if (!isFinite(amountNum) || !isFinite(rate)) return NaN;
        return direction === "to-ves" ? amountNum * rate : amountNum / rate;
    }, [amountNum, rate, direction]);

    const originMeta = direction === "to-ves" ? currencyMeta(code) : VES;
    const targetMeta = direction === "to-ves" ? VES : currencyMeta(code);

    const toggleDirection = () => setDirection((d) => (d === "to-ves" ? "from-ves" : "to-ves"));

    // Equivalences — convert to VES once, then derive all other currencies.
    const amountInVes = useMemo(() => {
        if (!isFinite(amountNum) || !isFinite(rate)) return NaN;
        return direction === "to-ves" ? amountNum * rate : amountNum;
    }, [amountNum, rate, direction]);

    return (
        <div className="rounded-2xl border border-border-light bg-surface-1 overflow-hidden shadow-sm shadow-black/5">
            <div className="px-6 py-4 border-b border-border-light bg-surface-1/60 flex items-center justify-between">
                <div className="flex flex-col">
                    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                        Conversor BCV
                    </p>
                    {rateDate && (
                        <p className="text-[11px] text-foreground/50 mt-0.5">
                            Tasa del {rateDate}
                        </p>
                    )}
                </div>
                {isFinite(rate) && (
                    <span className="text-[11px] font-mono tabular-nums text-foreground/60">
                        1 {code} = Bs. {formatRate(rate)}
                    </span>
                )}
            </div>

            <div className="p-6 flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 items-center">
                    {/* Origin */}
                    <div className="flex flex-col gap-1.5 min-w-0">
                        <label className="text-[12px] font-bold uppercase tracking-[0.12em] text-foreground/60">
                            {originMeta.flag} {originMeta.label}
                        </label>
                        <div className="flex items-center gap-2 min-w-0">
                            {direction === "from-ves" ? (
                                <span className="text-[15px] font-mono text-foreground/50 shrink-0 w-12">Bs.</span>
                            ) : (
                                <select
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    className="h-11 rounded-lg border border-border-light bg-surface-2 px-2 text-[14px] font-mono font-bold shrink-0 focus:outline-none focus:border-primary-500"
                                    aria-label="Moneda"
                                >
                                    {CURRENCIES.map((c) => (
                                        <option key={c.code} value={c.code}>{c.code}</option>
                                    ))}
                                </select>
                            )}
                            <input
                                type="text"
                                inputMode="decimal"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="flex-1 min-w-0 h-11 rounded-lg border border-border-light bg-surface-2 px-4 text-[18px] font-mono font-bold tabular-nums focus:outline-none focus:border-primary-500"
                                placeholder="0,00"
                            />
                        </div>
                    </div>

                    {/* Swap button */}
                    <button
                        type="button"
                        onClick={toggleDirection}
                        aria-label="Invertir conversión"
                        className="flex items-center justify-center h-11 w-11 rounded-full border border-border-light bg-surface-2 hover:bg-surface-3 hover:border-primary-500 transition-colors mx-auto shrink-0"
                    >
                        <ArrowRightLeft size={18} />
                    </button>

                    {/* Target */}
                    <div className="flex flex-col gap-1.5 min-w-0">
                        <label className="text-[12px] font-bold uppercase tracking-[0.12em] text-foreground/60">
                            {targetMeta.flag} {targetMeta.label}
                        </label>
                        <div className="flex items-center gap-2 min-w-0">
                            {direction === "to-ves" ? (
                                <span className="text-[15px] font-mono text-foreground/50 shrink-0 w-12">Bs.</span>
                            ) : (
                                <select
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    className="h-11 rounded-lg border border-border-light bg-surface-2 px-2 text-[14px] font-mono font-bold shrink-0 focus:outline-none focus:border-primary-500"
                                    aria-label="Moneda destino"
                                >
                                    {CURRENCIES.map((c) => (
                                        <option key={c.code} value={c.code}>{c.code}</option>
                                    ))}
                                </select>
                            )}
                            <div className="flex-1 min-w-0 h-11 rounded-lg border border-primary-500/40 bg-primary-500/5 px-4 flex items-center text-[18px] font-mono font-bold tabular-nums text-foreground truncate">
                                {isFinite(converted) ? formatVes(converted, 2) : "—"}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Equivalences table */}
                {isFinite(amountInVes) && rates.length > 0 && (
                    <div className="mt-4 pt-5 border-t border-border-light">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground/50 mb-3">
                            Equivalente en todas las monedas
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                            <EquivalenceCell
                                flag="🇻🇪"
                                code="VES"
                                value={formatVes(amountInVes, 2)}
                                highlight={direction === "to-ves"}
                            />
                            {rates.map((r) => {
                                const m = currencyMeta(r.code);
                                const eq = r.sell > 0 ? amountInVes / r.sell : NaN;
                                return (
                                    <EquivalenceCell
                                        key={r.code}
                                        flag={m.flag}
                                        code={r.code}
                                        value={isFinite(eq) ? formatVes(eq, 2) : "—"}
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

function EquivalenceCell({ flag, code, value, highlight }: { flag: string; code: string; value: string; highlight: boolean }) {
    return (
        <div className={[
            "rounded-lg px-3 py-2.5 flex flex-col transition-colors",
            highlight
                ? "bg-primary-500/10 border border-primary-500/40"
                : "bg-surface-2 border border-transparent",
        ].join(" ")}>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/50 flex items-center gap-1">
                <span>{flag}</span>{code}
            </span>
            <span className="text-[14px] font-mono font-bold tabular-nums text-foreground mt-0.5 truncate">
                {value}
            </span>
        </div>
    );
}
