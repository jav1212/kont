"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowRight, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { DualRateChart } from "@/src/modules/tools/frontend/components/dual-rate-chart";
import { useBcvRates } from "@/src/modules/tools/frontend/hooks/use-bcv-rates";
import { useStatusServices } from "@/src/modules/tools/frontend/status/hooks/use-status-services";

export default function ToolsDashboard() {
    const { loading: ratesLoading, refresh: refreshRates } = useBcvRates();
    const { summary, loading: statusLoading, refresh: refreshStatus } = useStatusServices();
    const [chartLoading, setChartLoading] = useState(false);
    const onChartLoadingChange = useCallback((l: boolean) => setChartLoading(l), []);

    const refreshing = ratesLoading || statusLoading || chartLoading;
    function refreshAll() {
        refreshRates();
        refreshStatus();
    }

    const total = summary?.total ?? 0;
    const operational = summary?.operational ?? 0;
    const degraded = summary?.degraded ?? 0;
    const down = summary?.down ?? 0;

    return (
        <div className="flex flex-col min-h-full bg-surface-2 selection:bg-primary-500/30">
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

            <div className="flex flex-col gap-8 px-8 py-8 max-w-[1400px] mx-auto w-full">

                {/* ── Divisas BCV ─────────────────────────────────────────── */}
                <section aria-labelledby="divisas-heading" className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between flex-wrap gap-2">
                        <h2 id="divisas-heading" className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground/70 flex items-center gap-2">
                            <span className="w-1 h-3 rounded-full bg-emerald-500/60" />
                            Divisas BCV
                        </h2>
                        <Link href="/tools/divisas" className="text-[11px] font-mono font-bold uppercase tracking-[0.12em] text-foreground/50 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors inline-flex items-center gap-1">
                            Abrir calculadora
                            <ArrowRight size={12} />
                        </Link>
                    </div>
                    <DualRateChart onLoadingChange={onChartLoadingChange} />
                </section>

                {/* ── Estatus de Portales ─────────────────────────────────── */}
                <section aria-labelledby="status-heading" className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between flex-wrap gap-2">
                        <h2 id="status-heading" className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground/70 flex items-center gap-2">
                            <span className="w-1 h-3 rounded-full bg-blue-500/60" />
                            Estatus de Portales
                        </h2>
                        <Link href="/tools/status" className="text-[11px] font-mono font-bold uppercase tracking-[0.12em] text-foreground/50 hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-flex items-center gap-1">
                            Ver detalle
                            <ArrowRight size={12} />
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <StatusStatCard
                            href="/tools/status?filter=operational"
                            icon={<CheckCircle2 size={22} strokeWidth={2.25} />}
                            label="Disponibles"
                            value={operational}
                            total={total}
                            tone="emerald"
                            loading={statusLoading && !summary}
                        />
                        <StatusStatCard
                            href="/tools/status?filter=degraded"
                            icon={<AlertTriangle size={22} strokeWidth={2.25} />}
                            label="Degradados"
                            value={degraded}
                            total={total}
                            tone="amber"
                            loading={statusLoading && !summary}
                        />
                        <StatusStatCard
                            href="/tools/status?filter=down"
                            icon={<XCircle size={22} strokeWidth={2.25} />}
                            label="Caídos"
                            value={down}
                            total={total}
                            tone="red"
                            loading={statusLoading && !summary}
                        />
                    </div>
                </section>

            </div>
        </div>
    );
}

interface StatusStatCardProps {
    href: string;
    icon: React.ReactNode;
    label: string;
    value: number;
    total: number;
    tone: "emerald" | "amber" | "red";
    loading?: boolean;
}

function StatusStatCard({ href, icon, label, value, total, tone, loading }: StatusStatCardProps) {
    const toneClasses = {
        emerald: { border: "hover:border-emerald-500/40", bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
        amber:   { border: "hover:border-amber-500/40",   bg: "bg-amber-500/10",   text: "text-amber-600 dark:text-amber-400"    },
        red:     { border: "hover:border-red-500/40",     bg: "bg-red-500/10",     text: "text-red-600 dark:text-red-400"        },
    }[tone];

    if (loading) {
        return <div className="rounded-2xl border border-border-light bg-surface-1 h-[110px] animate-pulse" aria-busy="true" />;
    }

    return (
        <Link
            href={href}
            aria-label={`${label}: ${value} de ${total} portales`}
            className={[
                "group rounded-2xl border border-border-light bg-surface-1 px-5 py-4 flex items-center gap-4 transition-all hover:bg-surface-2",
                toneClasses.border,
            ].join(" ")}
        >
            <div className={["flex h-12 w-12 items-center justify-center rounded-xl shrink-0", toneClasses.bg, toneClasses.text].join(" ")}>
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <p className={["text-[11px] font-bold uppercase tracking-[0.12em]", toneClasses.text].join(" ")}>
                    {label}
                </p>
                <p className="text-[24px] font-mono font-bold tabular-nums text-foreground leading-tight mt-0.5">
                    {value}
                    <span className="text-[13px] font-normal text-foreground/40 ml-1">/ {total}</span>
                </p>
            </div>
            <ArrowRight size={14} className="text-foreground/20 group-hover:text-foreground/50 group-hover:translate-x-0.5 transition-all shrink-0" />
        </Link>
    );
}
