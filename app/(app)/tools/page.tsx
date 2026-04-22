"use client";

// Tools module dashboard. Currently hosts the BCV currency calculator as its
// first free utility. Built for easy expansion to more free tools.

import Link from "next/link";
import { ArrowRight, Coins, RefreshCw, Activity } from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useBcvRates } from "@/src/modules/tools/frontend/hooks/use-bcv-rates";
import { RateCard } from "@/src/modules/tools/frontend/components/rate-card";

export default function ToolsDashboard() {
    const { rates, date, loading, refresh } = useBcvRates();
    const top = rates.filter((r) => ["USD", "EUR", "CNY"].includes(r.code));

    return (
        <div className="flex flex-col min-h-full bg-surface-2 selection:bg-primary-500/30 font-mono">
            <PageHeader title="Herramientas" subtitle="Utilidades gratuitas para tu día a día">
                <BaseButton.Root
                    as={Link}
                    href="/tools/divisas"
                    variant="primary"
                    size="md"
                    rightIcon={<ArrowRight size={16} strokeWidth={2.5} />}
                >
                    Calculadora BCV
                </BaseButton.Root>
            </PageHeader>

            <div className="flex flex-col gap-8 px-8 py-8 max-w-[1400px] mx-auto w-full">

                {/* Top rates preview */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-foreground/60">
                            Cotización BCV del día
                        </h2>
                        {date && (
                            <p className="text-[11px] text-foreground/40 mt-0.5">Actualizada: {date}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={refresh}
                        disabled={loading}
                        className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border-light bg-surface-1 hover:bg-surface-2 text-[12px] font-mono uppercase tracking-[0.12em] text-foreground/70 hover:text-foreground disabled:opacity-50 transition-colors"
                    >
                        <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                        Actualizar
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {loading && top.length === 0 ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="rounded-2xl border border-border-light bg-surface-1 h-[110px] animate-pulse" />
                        ))
                    ) : (
                        top.map((r) => <RateCard key={r.code} rate={r} />)
                    )}
                </div>

                {/* Available tools */}
                <div className="flex flex-col gap-4">
                    <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)] flex items-center gap-2">
                        <span className="w-1 h-3 rounded-full bg-primary-500/50" />
                        Herramientas disponibles
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Link
                            href="/tools/divisas"
                            className="group rounded-2xl border border-border-light bg-surface-1 hover:border-primary-500/40 hover:shadow-md transition-all px-6 py-5 flex items-start gap-4"
                        >
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-500/10 text-primary-500 shrink-0">
                                <Coins size={22} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="text-[15px] font-bold text-foreground">Calculadora de Divisas BCV</h3>
                                    <ArrowRight size={16} className="text-foreground/30 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all" />
                                </div>
                                <p className="text-[13px] text-foreground/60 leading-relaxed">
                                    Convierte entre bolívares y divisas con tasa oficial BCV. Lista de todas las monedas, histórico de 30 días y conversión cruzada.
                                </p>
                            </div>
                        </Link>

                        <Link
                            href="/tools/status"
                            className="group rounded-2xl border border-border-light bg-surface-1 hover:border-primary-500/40 hover:shadow-md transition-all px-6 py-5 flex items-start gap-4"
                        >
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                                <Activity size={22} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="text-[15px] font-bold text-foreground">Estatus de Portales VE</h3>
                                    <ArrowRight size={16} className="text-foreground/30 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all" />
                                </div>
                                <p className="text-[13px] text-foreground/60 leading-relaxed">
                                    Verifica en tiempo real si SENIAT, IVSS, INCES, BANAVIH, SAREN y otros portales gubernamentales están operativos antes de declarar.
                                </p>
                            </div>
                        </Link>
                    </div>
                </div>

            </div>
        </div>
    );
}
