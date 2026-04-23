"use client";

import { useState } from "react";
import { RefreshCw, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { motion } from "framer-motion";
import { useBcvRates, type BcvRate } from "../hooks/use-bcv-rates";
import { CurrencyConverter } from "./currency-converter";
import { CrossConverter } from "./cross-converter";
import { RatesTable } from "./rates-table";
import { HistoryChart } from "./history-chart";
import { DatePickerRate } from "./date-picker-rate";
import { RateCard } from "./rate-card";
import { Flag } from "./flag";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseAccordion, accordionItemProps } from "@/src/shared/frontend/components/base-accordion";
import { formatRate, formatPercentage, formatIsoDateEs } from "../utils/format-number";

interface Props {
    variant: "public" | "authed";
    initialData?: { date: string; rates: BcvRate[] } | null;
}

// Stagger step (ms → Framer seconds) and common entry preset.
const STAGGER_STEP = 0.08;
const section = (i: number) => ({
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, delay: i * STAGGER_STEP, ease: "easeOut" as const },
});

export function ToolsShell({ variant, initialData }: Props) {
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const { rates, date, loading, error, refresh } = useBcvRates(selectedDate, initialData);

    const usd = rates.find((r) => r.code === "USD") ?? null;
    const eur = rates.find((r) => r.code === "EUR") ?? null;
    const cny = rates.find((r) => r.code === "CNY") ?? null;
    const today = new Date().toISOString().split("T")[0];

    const showSkeletons = loading && rates.length === 0;

    const containerCls = variant === "public"
        ? "max-w-[1200px] mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-6"
        : "max-w-[1400px] mx-auto w-full px-4 sm:px-8 py-6 sm:py-8 flex flex-col gap-6";

    return (
        <div className={containerCls}>
            <motion.div {...section(0)}>
                {variant === "public" ? (
                    <PublicHero
                        usd={usd}
                        date={date}
                        selectedDate={selectedDate}
                        onDateChange={setSelectedDate}
                        onRefresh={refresh}
                        loading={loading}
                        today={today}
                    />
                ) : (
                    <AuthedHeader
                        usd={usd}
                        eur={eur}
                        date={date}
                        selectedDate={selectedDate}
                        onDateChange={setSelectedDate}
                        onRefresh={refresh}
                        loading={loading}
                        today={today}
                    />
                )}
            </motion.div>

            {error && (
                <div
                    role="alert"
                    className="rounded-xl border border-red-500 bg-red-100 dark:bg-red-900 px-4 py-3 text-[13px] text-red-700 dark:text-red-300 font-mono"
                >
                    {error}
                </div>
            )}

            {/* Top rates — asymmetric grid on desktop: USD dominates */}
            {showSkeletons ? (
                <motion.div
                    {...section(1)}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr] gap-4"
                >
                    <div className="sm:col-span-2 lg:col-span-1">
                        <RateCard.Skeleton highlight />
                    </div>
                    <RateCard.Skeleton />
                    <RateCard.Skeleton />
                </motion.div>
            ) : (usd || eur || cny) ? (
                <motion.div
                    {...section(1)}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr] gap-4"
                >
                    {usd && (
                        <div className="sm:col-span-2 lg:col-span-1">
                            <RateCard rate={usd} highlight />
                        </div>
                    )}
                    {eur && <RateCard rate={eur} />}
                    {cny && <RateCard rate={cny} />}
                </motion.div>
            ) : null}

            {/* Converter — primary action */}
            <motion.div {...section(2)}>
                <CurrencyConverter rates={rates} rateDate={date} />
            </motion.div>

            {/* Cross converter */}
            <motion.div {...section(3)}>
                <CrossConverter rates={rates} />
            </motion.div>

            {/* History chart */}
            <motion.div {...section(4)}>
                <HistoryChart />
            </motion.div>

            {/* Rates table */}
            <motion.div {...section(5)}>
                <RatesTable rates={rates} loading={loading} />
            </motion.div>

            {variant === "public" && (
                <motion.div {...section(6)}>
                    <PublicFaq />
                </motion.div>
            )}
        </div>
    );
}

// ── Public hero ─────────────────────────────────────────────────────────────

interface HeroProps {
    usd: BcvRate | null;
    date: string | null;
    selectedDate: string | null;
    onDateChange: (d: string | null) => void;
    onRefresh: () => void;
    loading: boolean;
    today: string;
}

function PublicHero({ usd, date, selectedDate, onDateChange, onRefresh, loading, today }: HeroProps) {
    const pct = usd?.percentageChange ?? null;
    const trend = pct == null ? 0 : pct > 0 ? 1 : pct < 0 ? -1 : 0;
    const isHistorical = !!selectedDate;
    const isLive = !selectedDate;

    return (
        <header className="relative rounded-2xl overflow-hidden border border-border-light bg-surface-1">
            <div className="relative px-5 sm:px-8 py-6 sm:py-8 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 md:gap-8 items-start md:items-center">
                {/* Left — title + description */}
                <div className="flex flex-col gap-4 min-w-0">
                    <div className="flex flex-col gap-2">
                        <span className="inline-flex self-start items-center gap-1.5 h-6 px-2.5 rounded-full border border-primary-500 bg-surface-2 text-[10px] font-mono uppercase tracking-[0.18em] text-primary-600 dark:text-primary-400">
                            {isLive ? (
                                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />
                            ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-foreground/30" />
                            )}
                            BCV · Tasa oficial
                        </span>
                        <h1 className="text-[28px] sm:text-[38px] font-mono font-bold tracking-[-0.02em] leading-[1.05] text-foreground">
                            Calculadora de divisas BCV
                        </h1>
                        <p className="text-[13px] sm:text-[14px] text-foreground/60 max-w-[520px] leading-relaxed">
                            Convierte bolívares a dólares, euros y más monedas con la tasa oficial del Banco Central de Venezuela. Actualizada diariamente, gratis.
                        </p>
                    </div>
                </div>

                {/* Right — big USD quote */}
                <div className="relative flex flex-col gap-2 min-w-0 md:min-w-[260px] rounded-xl border border-primary-500 bg-surface-1 px-5 py-4">
                    <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-foreground/55">
                            <Flag code="US" size={13} />
                            USD · Venta
                        </span>
                        {pct != null && usd && (
                            <span
                                className={[
                                    "inline-flex items-center gap-0.5 text-[11px] font-mono tabular-nums font-bold px-1.5 py-0.5 rounded",
                                    trend > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" : "",
                                    trend < 0 ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" : "",
                                    trend === 0 ? "bg-surface-2 text-foreground/55" : "",
                                ].join(" ")}
                            >
                                {trend > 0 ? <TrendingUp size={11} /> : trend < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
                                {formatPercentage(pct)}
                            </span>
                        )}
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-[12px] font-mono uppercase tracking-[0.14em] text-foreground/50">
                            Bs.
                        </span>
                        <span className="text-[32px] sm:text-[40px] leading-none font-mono font-bold tabular-nums text-foreground tracking-tight">
                            {usd ? formatRate(usd.sell) : "—"}
                        </span>
                    </div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-foreground/50">
                        {date ? `Tasa del ${formatIsoDateEs(date)}` : "Cargando…"}
                    </div>
                </div>
            </div>

            {/* Controls strip — date picker + refresh. Visually unified with the hero above */}
            <div className="relative border-t border-border-light bg-surface-2 px-5 sm:px-8 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                    <DatePickerRate value={selectedDate} onChange={onDateChange} maxDate={today} />
                    {isHistorical && (
                        <span className="inline-flex items-center h-7 px-2.5 rounded-md bg-surface-1 border border-border-light text-[10px] font-mono uppercase tracking-[0.14em] text-foreground/60">
                            Histórico
                        </span>
                    )}
                </div>
                <BaseButton.Root
                    variant="secondary"
                    size="sm"
                    onClick={onRefresh}
                    isDisabled={loading}
                    leftIcon={<RefreshCw size={12} className={loading ? "animate-spin" : ""} />}
                >
                    Actualizar
                </BaseButton.Root>
            </div>
        </header>
    );
}

// ── Authed compact strip ────────────────────────────────────────────────────

function AuthedHeader({ usd, eur, date, selectedDate, onDateChange, onRefresh, loading, today }: HeroProps & { eur: BcvRate | null }) {
    return (
        <div
            className={[
                "rounded-xl border border-border-light bg-surface-1",
                "px-4 sm:px-5 py-3",
                // Tablet+: compact horizontal strip. Mobile: grid to avoid crowded wrapping.
                "grid grid-cols-2 gap-3 items-center",
                "md:flex md:flex-row md:items-center md:justify-between",
            ].join(" ")}
        >
            <div className="flex items-center gap-4 md:gap-6 flex-wrap col-span-2 md:col-auto">
                <QuickRate code="USD" countryCode="US" rate={usd} />
                <span aria-hidden className="hidden md:inline-block w-px h-6 bg-border-light" />
                <QuickRate code="EUR" countryCode="EU" rate={eur} />
                {date && (
                    <>
                        <span aria-hidden className="hidden md:inline-block w-px h-6 bg-border-light" />
                        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-foreground/55">
                            {formatIsoDateEs(date)}
                        </span>
                    </>
                )}
            </div>
            <div className="flex items-center gap-2 flex-wrap col-span-2 md:col-auto justify-start md:justify-end">
                <DatePickerRate value={selectedDate} onChange={onDateChange} maxDate={today} />
                <BaseButton.Root
                    variant="secondary"
                    size="sm"
                    onClick={onRefresh}
                    isDisabled={loading}
                    leftIcon={<RefreshCw size={12} className={loading ? "animate-spin" : ""} />}
                >
                    Actualizar
                </BaseButton.Root>
            </div>
        </div>
    );
}

function QuickRate({ code, countryCode, rate }: { code: string; countryCode: string; rate: BcvRate | null }) {
    const pct = rate?.percentageChange ?? null;
    const trend = pct == null ? 0 : pct > 0 ? 1 : pct < 0 ? -1 : 0;
    return (
        <div className="flex items-center gap-2 min-w-0">
            <Flag code={countryCode} size={18} />
            <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-foreground/55">
                    {code}
                </span>
                <div className="flex items-baseline gap-1.5">
                    <span className="text-[15px] font-mono font-bold tabular-nums text-foreground leading-none">
                        {rate ? `Bs. ${formatRate(rate.sell)}` : "—"}
                    </span>
                    {pct != null && (
                        <span
                            className={[
                                "text-[10px] font-mono tabular-nums font-bold",
                                trend > 0 ? "text-emerald-700 dark:text-emerald-300" : "",
                                trend < 0 ? "text-red-700 dark:text-red-300" : "",
                                trend === 0 ? "text-foreground/50" : "",
                            ].join(" ")}
                        >
                            {formatPercentage(pct)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Public FAQ ──────────────────────────────────────────────────────────────

function PublicFaq() {
    return (
        <section className="mt-10 pt-8 border-t border-border-light flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-foreground/50">
                    Preguntas frecuentes
                </span>
                <h2 className="text-[22px] sm:text-[24px] font-mono font-bold tracking-[-0.01em] text-foreground leading-tight">
                    Sobre la tasa BCV
                </h2>
            </div>
            <div className="rounded-2xl border border-border-light bg-surface-1 p-2">
                <BaseAccordion.Root selectionMode="single" defaultExpandedKeys={["bcv"]}>
                    <BaseAccordion.Item key="bcv" {...accordionItemProps({ title: "¿Qué es la tasa BCV?" })}>
                        <p className="text-[13px] text-foreground/70 leading-relaxed font-mono">
                            Es la tasa oficial de cambio publicada por el Banco Central de Venezuela. Es la referencia legal para operaciones contables y fiscales en el país.
                        </p>
                    </BaseAccordion.Item>
                    <BaseAccordion.Item key="frequency" {...accordionItemProps({ title: "¿Con qué frecuencia se actualiza?" })}>
                        <p className="text-[13px] text-foreground/70 leading-relaxed font-mono">
                            El BCV publica tasas en días hábiles. Esta calculadora sincroniza automáticamente con la última publicación disponible.
                        </p>
                    </BaseAccordion.Item>
                    <BaseAccordion.Item key="free" {...accordionItemProps({ title: "¿Es gratuita?" })}>
                        <p className="text-[13px] text-foreground/70 leading-relaxed font-mono">
                            Sí. La calculadora de divisas BCV es 100% gratis y no requiere registro.
                        </p>
                    </BaseAccordion.Item>
                    <BaseAccordion.Item key="currencies" {...accordionItemProps({ title: "¿Qué monedas están disponibles?" })}>
                        <p className="text-[13px] text-foreground/70 leading-relaxed font-mono">
                            Las que publica el BCV: USD, EUR, CNY, GBP, JPY, CAD, MXN, BRL, AED, TRY y RUB, entre otras.
                        </p>
                    </BaseAccordion.Item>
                </BaseAccordion.Root>
            </div>
        </section>
    );
}
