"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useBcvRates, type BcvRate } from "../hooks/use-bcv-rates";
import { CurrencyConverter } from "./currency-converter";
import { CrossConverter } from "./cross-converter";
import { RatesTable } from "./rates-table";
import { HistoryChart } from "./history-chart";
import { DatePickerRate } from "./date-picker-rate";
import { RateCard } from "./rate-card";

interface Props {
    variant: "public" | "authed";
    initialData?: { date: string; rates: BcvRate[] } | null;
}

export function ToolsShell({ variant, initialData }: Props) {
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const { rates, date, loading, error, refresh } = useBcvRates(selectedDate, initialData);

    const topRates = rates.filter((r) => ["USD", "EUR", "CNY"].includes(r.code));
    const today = new Date().toISOString().split("T")[0];

    return (
        <div className={variant === "public" ? "max-w-[1200px] mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-6" : "max-w-[1400px] mx-auto w-full px-8 py-8 flex flex-col gap-6"}>

            {variant === "public" && (
                <header className="text-center mb-2">
                    <h1 className="text-[28px] sm:text-[36px] font-mono font-bold tracking-tight text-foreground">
                        Calculadora de Divisas BCV
                    </h1>
                    <p className="mt-2 text-[14px] text-foreground/60 max-w-[600px] mx-auto">
                        Convierte bolívares a dólares, euros y más monedas con la tasa oficial del Banco Central de Venezuela. Actualizada diariamente, gratis.
                    </p>
                </header>
            )}

            {/* Top rates row + controls */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <DatePickerRate value={selectedDate} onChange={setSelectedDate} maxDate={today} />
                <div className="flex items-center gap-3">
                    {date && (
                        <span className="text-[11px] text-foreground/50 font-mono uppercase tracking-[0.12em]">
                            Tasa del {date}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={refresh}
                        disabled={loading}
                        className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border-light bg-surface-1 hover:bg-surface-2 text-[12px] font-mono uppercase tracking-[0.12em] text-foreground/70 hover:text-foreground disabled:opacity-50 transition-colors"
                        aria-label="Actualizar tasas"
                    >
                        <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                        Actualizar
                    </button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[13px] text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            {/* Highlighted top rates */}
            {topRates.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {topRates.map((r) => (
                        <RateCard key={r.code} rate={r} />
                    ))}
                </div>
            )}

            {/* Converter */}
            <CurrencyConverter rates={rates} rateDate={date} />

            {/* Cross converter — its own row (needs full width for 3-col grid inside) */}
            <CrossConverter rates={rates} />

            {/* History chart */}
            <HistoryChart />

            {/* Rates table */}
            <RatesTable rates={rates} loading={loading} />

            {variant === "public" && (
                <section className="mt-10 pt-8 border-t border-border-light flex flex-col gap-6">
                    <div>
                        <h2 className="text-[20px] font-mono font-bold text-foreground">Preguntas frecuentes</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FaqItem q="¿Qué es la tasa BCV?">
                            Es la tasa oficial de cambio publicada por el Banco Central de Venezuela. Es la referencia legal para operaciones contables y fiscales en el país.
                        </FaqItem>
                        <FaqItem q="¿Con qué frecuencia se actualiza?">
                            El BCV publica tasas en días hábiles. Esta calculadora sincroniza automáticamente con la última publicación disponible.
                        </FaqItem>
                        <FaqItem q="¿Es gratuita?">
                            Sí. La calculadora de divisas BCV es 100% gratis y no requiere registro.
                        </FaqItem>
                        <FaqItem q="¿Qué monedas están disponibles?">
                            Las que publica el BCV: USD, EUR, CNY, GBP, JPY, CAD, MXN, BRL, AED, TRY y RUB, entre otras.
                        </FaqItem>
                    </div>
                </section>
            )}
        </div>
    );
}

function FaqItem({ q, children }: { q: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-border-light bg-surface-1 px-5 py-4">
            <h3 className="text-[14px] font-bold text-foreground mb-1.5">{q}</h3>
            <p className="text-[13px] text-foreground/60 leading-relaxed">{children}</p>
        </div>
    );
}
