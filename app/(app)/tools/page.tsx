"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import {
    Activity,
    Calculator,
    CalendarDays,
    DollarSign,
    RefreshCw,
    TrendingDown,
    TrendingUp,
    Minus,
} from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { DualRateChart } from "@/src/modules/tools/frontend/components/dual-rate-chart";
import { Flag } from "@/src/modules/tools/frontend/components/flag";
import { ToolCard } from "@/src/modules/tools/frontend/components/tool-card";
import { ToolCardStatusMetrics } from "@/src/modules/tools/frontend/components/tool-card-status-metrics";
import { ToolHighlight } from "@/src/modules/tools/frontend/components/tool-highlight";
import { useBcvRates, type BcvRate } from "@/src/modules/tools/frontend/hooks/use-bcv-rates";
import { useStatusServices } from "@/src/modules/tools/frontend/status/hooks/use-status-services";
import { formatPercentage, formatRate } from "@/src/modules/tools/frontend/utils/format-number";

// Stagger step (s) + entry preset — mirrors `tools-shell.tsx`.
const STAGGER_STEP = 0.08;
const section = (i: number) => ({
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, delay: i * STAGGER_STEP, ease: "easeOut" as const },
});

export default function ToolsDashboard() {
    const { rates, loading: ratesLoading, refresh: refreshRates } = useBcvRates();
    const { summary, loading: statusLoading, refresh: refreshStatus } = useStatusServices();
    const [chartLoading, setChartLoading] = useState(false);
    const onChartLoadingChange = useCallback((l: boolean) => setChartLoading(l), []);

    const refreshing = ratesLoading || statusLoading || chartLoading;
    const refreshAll = useCallback(() => {
        refreshRates();
        refreshStatus();
    }, [refreshRates, refreshStatus]);

    const usd = rates.find((r) => r.code === "USD") ?? null;

    return (
        <div className="flex flex-col min-h-full bg-surface-2">
            <PageHeader
                title="Herramientas"
                subtitle="Selecciona una utilidad para comenzar"
            >
                <button
                    type="button"
                    onClick={refreshAll}
                    disabled={refreshing}
                    aria-label="Actualizar tasas BCV y estatus de portales"
                    className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border-light bg-surface-1 hover:bg-surface-2 text-[12px] font-mono uppercase tracking-[0.12em] text-foreground/70 hover:text-foreground disabled:opacity-50 transition-colors"
                >
                    <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
                    Actualizar
                </button>
            </PageHeader>

            <div className="max-w-[1400px] mx-auto w-full px-4 sm:px-8 py-6 sm:py-8 flex flex-col gap-8">
                {/* Bloque destacado ────────────────────────────────────── */}
                <motion.section
                    {...section(0)}
                    aria-labelledby="highlight-heading"
                    className="flex flex-col gap-3"
                >
                    <SectionHeading id="highlight-heading" label="Bloque destacado" />
                    <ToolHighlight
                        icon={<DollarSign size={20} strokeWidth={2.25} />}
                        label="Divisas BCV"
                        title="Calculadora de divisas BCV"
                        description="Tasa oficial del Banco Central de Venezuela con histórico de 30 días y conversores directo y cruzado."
                        href="/tools/divisas"
                        ctaLabel="Abrir calculadora"
                        meta={<MiniUsdRate usd={usd} loading={ratesLoading && !usd} />}
                    >
                        <DualRateChart onLoadingChange={onChartLoadingChange} />
                    </ToolHighlight>
                </motion.section>

                {/* Todas las herramientas ───────────────────────────────── */}
                <motion.section
                    {...section(1)}
                    aria-labelledby="all-tools-heading"
                    className="flex flex-col gap-3"
                >
                    <SectionHeading id="all-tools-heading" label="Todas las herramientas" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <ToolCard
                            variant="active"
                            icon={<Activity size={20} strokeWidth={2.25} />}
                            title="Status de Portales"
                            description="Monitorea SENIAT, IVSS y el resto de portales oficiales en tiempo real."
                            href="/tools/status"
                            metrics={
                                <ToolCardStatusMetrics
                                    summary={summary}
                                    loading={statusLoading && !summary}
                                />
                            }
                        />
                        <ToolCard
                            variant="active"
                            icon={<CalendarDays size={20} strokeWidth={2.25} />}
                            title="Calendario Tributario SENIAT"
                            description="Fechas clave de ISLR, IVA y retenciones 2026 del SENIAT según último dígito del RIF."
                            href="/tools/calendario-seniat"
                        />
                        <ToolCard
                            variant="soon"
                            icon={<Calculator size={20} strokeWidth={2.25} />}
                            title="Prestaciones Rápidas"
                            description="Simula prestaciones LOTTT sin abrir un caso de nómina completo."
                        />
                    </div>
                </motion.section>
            </div>
        </div>
    );
}

// ── Section heading ────────────────────────────────────────────────────────

function SectionHeading({ id, label }: { id: string; label: string }) {
    return (
        <h2
            id={id}
            className="text-[11px] font-mono font-bold uppercase tracking-[0.18em] text-foreground/55"
        >
            {label}
        </h2>
    );
}

// ── Mini USD rate (sidebar meta in the highlight card) ─────────────────────
// Kept local to the page since it's the only consumer. Mirrors the QuickRate
// treatment from `tools-shell.tsx` but compacted for the 280px sidebar.

function MiniUsdRate({ usd, loading }: { usd: BcvRate | null; loading: boolean }) {
    if (loading) {
        return (
            <div
                aria-busy="true"
                className="h-[54px] rounded-lg border border-border-light bg-surface-2 animate-pulse"
            />
        );
    }

    const pct = usd?.percentageChange ?? null;
    const trend = pct == null ? 0 : pct > 0 ? 1 : pct < 0 ? -1 : 0;

    return (
        <div className="rounded-lg border border-border-light bg-surface-2 px-3 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
                <Flag code="US" size={14} />
                <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-foreground/55 leading-none">
                        USD · Venta
                    </span>
                    <span className="text-[15px] font-mono font-bold tabular-nums text-foreground leading-tight mt-0.5">
                        {usd ? `Bs. ${formatRate(usd.sell)}` : "—"}
                    </span>
                </div>
            </div>
            {pct != null && (
                <span
                    className={[
                        "inline-flex items-center gap-0.5 text-[10px] font-mono tabular-nums font-bold px-1.5 py-0.5 rounded shrink-0",
                        trend > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" : "",
                        trend < 0 ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" : "",
                        trend === 0 ? "bg-surface-1 text-foreground/55" : "",
                    ].join(" ")}
                >
                    {trend > 0 ? <TrendingUp size={10} /> : trend < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                    {formatPercentage(pct)}
                </span>
            )}
        </div>
    );
}
