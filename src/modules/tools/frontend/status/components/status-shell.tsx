"use client";

import Link from "next/link";
import { RefreshCw, X } from "lucide-react";
import type { ServicesResponse } from "@/app/api/status/services/route";
import { useStatusServices, type ServiceWithStatus } from "../hooks/use-status-services";
import { StatusSummary } from "./status-summary";
import { CategorySection } from "./category-section";
import { StatusBanner } from "./status-banner";
import { ClientVerifier } from "./client-verifier";

export type StatusFilter = "operational" | "degraded" | "down";

interface Props {
    variant: "public" | "authed";
    initialData?: ServicesResponse | null;
    filter?: StatusFilter | null;
}

const CATEGORY_TITLES: Record<"fiscal" | "laboral" | "mercantil", string> = {
    fiscal:    "Portales Fiscales",
    laboral:   "Portales Laborales y de Seguridad Social",
    mercantil: "Portales Mercantiles y Financieros",
};

const FILTER_LABELS: Record<StatusFilter, { label: string; tone: string }> = {
    operational: { label: "Disponibles", tone: "text-emerald-700 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10" },
    degraded:    { label: "Degradados",  tone: "text-amber-700 dark:text-amber-400 border-amber-500/40 bg-amber-500/10"       },
    down:        { label: "Caídos",      tone: "text-red-700 dark:text-red-400 border-red-500/40 bg-red-500/10"               },
};

export function StatusShell({ variant, initialData, filter }: Props) {
    const { services, summary, lastServerCheckAt, loading, error, refresh } = useStatusServices(initialData);

    const hrefBase = variant === "public" ? "/herramientas/status" : "/tools/status";
    const filteredServices: ServiceWithStatus[] = filter
        ? services.filter((s) => s.lastStatus === filter)
        : services;

    const byCategory = {
        fiscal:    filteredServices.filter((s) => s.category === "fiscal"),
        laboral:   filteredServices.filter((s) => s.category === "laboral"),
        mercantil: filteredServices.filter((s) => s.category === "mercantil"),
    };

    const wrapperClass = variant === "public"
        ? "max-w-[1100px] mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-6"
        : "max-w-[1400px] mx-auto w-full px-8 py-8 flex flex-col gap-6";

    return (
        <div className={wrapperClass}>
            {variant === "public" && (
                <header className="text-center mb-2">
                    <h1 className="text-[28px] sm:text-[36px] font-mono font-bold tracking-tight text-foreground">
                        Estatus de Portales Venezolanos
                    </h1>
                </header>
            )}

            <StatusSummary summary={summary} lastCheckAt={lastServerCheckAt} />

            <div className="flex items-center justify-between gap-4 flex-wrap">
                <StatusBanner />
                <button
                    type="button"
                    onClick={refresh}
                    disabled={loading}
                    className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border-light bg-surface-1 hover:bg-surface-2 text-[12px] font-mono uppercase tracking-[0.12em] text-foreground/70 hover:text-foreground disabled:opacity-50 transition-colors"
                    aria-label="Actualizar estatus"
                >
                    <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                    Actualizar
                </button>
            </div>

            {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[13px] text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            {filter && (
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-foreground/50">
                        Filtrando por
                    </span>
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-mono font-bold uppercase tracking-[0.1em] ${FILTER_LABELS[filter].tone}`}>
                        {FILTER_LABELS[filter].label}
                        <span className="text-foreground/40 font-normal">({filteredServices.length})</span>
                    </span>
                    <Link
                        href={hrefBase}
                        className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-[0.1em] text-foreground/50 hover:text-foreground transition-colors"
                    >
                        <X size={12} />
                        Quitar filtro
                    </Link>
                </div>
            )}

            <div className="flex flex-col gap-6">
                {filter && filteredServices.length === 0 ? (
                    <div className="rounded-xl border border-border-light bg-surface-1 px-6 py-10 text-center text-[12px] text-foreground/50 uppercase tracking-[0.12em]">
                        No hay portales en este estado
                    </div>
                ) : (
                    <>
                        <CategorySection title={CATEGORY_TITLES.fiscal}    services={byCategory.fiscal}    hrefBase={hrefBase} />
                        <CategorySection title={CATEGORY_TITLES.laboral}   services={byCategory.laboral}   hrefBase={hrefBase} />
                        <CategorySection title={CATEGORY_TITLES.mercantil} services={byCategory.mercantil} hrefBase={hrefBase} />
                    </>
                )}
            </div>

            {variant === "public" && (
                <section className="mt-10 pt-8 border-t border-border-light flex flex-col gap-6">
                    <h2 className="text-[20px] font-mono font-bold text-foreground">Preguntas frecuentes</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FaqItem q="¿Cómo se verifica si un portal está operativo?">
                            Combinamos dos fuentes: chequeos desde nuestro servidor en la nube y reportes anónimos
                            de visitantes desde Venezuela (tu navegador envía un ping al portal mientras lees esta página).
                            Esto permite detectar caídas que desde servidores fuera del país no serían visibles.
                        </FaqItem>
                        <FaqItem q="¿Con qué frecuencia se actualiza?">
                            Cada vez que alguien visita esta página. Si hace más de 2 minutos del último check,
                            disparamos uno nuevo automáticamente. Los datos de visitantes se registran al instante.
                        </FaqItem>
                        <FaqItem q="¿Qué significan los colores?">
                            Verde = operacional, amarillo = degradado (lento o con errores 4xx), rojo = caído
                            (timeout, error 5xx, sin respuesta), gris = sin datos para ese día.
                        </FaqItem>
                        <FaqItem q="¿Es gratis?">
                            Sí, 100% gratis y sin registro. Formamos parte de las herramientas gratuitas
                            de Konta para contadores y empresas venezolanas.
                        </FaqItem>
                    </div>
                </section>
            )}

            {services.length > 0 && <ClientVerifier services={services} />}
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
