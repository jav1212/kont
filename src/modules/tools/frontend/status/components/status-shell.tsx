"use client";

import { RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import type { ServicesResponse } from "@/app/api/status/services/route";
import { useStatusServices, type ServiceWithStatus } from "../hooks/use-status-services";
import { CategorySection } from "./category-section";
import { ClientVerifier } from "./client-verifier";
import { StatusTabs } from "./status-tabs";
import { UptimeSparkline } from "./uptime-sparkline";
import { AnimatedNumber } from "../../components/animated-number";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseAccordion, accordionItemProps } from "@/src/shared/frontend/components/base-accordion";

export type StatusFilter = "operational" | "degraded" | "down";

interface Props {
    variant:     "public" | "authed";
    initialData?: ServicesResponse | null;
    filter?:     StatusFilter | null;
}

const CATEGORY_TITLES: Record<"fiscal" | "laboral" | "mercantil", string> = {
    fiscal:    "Portales Fiscales",
    laboral:   "Portales Laborales y de Seguridad Social",
    mercantil: "Portales Mercantiles y Financieros",
};

// Stagger step matches the BCV module — keeps the whole tools family visually coherent.
const STAGGER_STEP = 0.08;
const section = (i: number) => ({
    initial:    { opacity: 0, y: 8 },
    animate:    { opacity: 1, y: 0 },
    transition: { duration: 0.35, delay: i * STAGGER_STEP, ease: "easeOut" as const },
});

interface Summary {
    operational: number;
    degraded:    number;
    down:        number;
    unknown:     number;
    total:       number;
}

const EMPTY_SUMMARY: Summary = { operational: 0, degraded: 0, down: 0, unknown: 0, total: 0 };

export function StatusShell({ variant, initialData, filter }: Props) {
    const { services, summary, lastServerCheckAt, loading, error, refresh } = useStatusServices(initialData);

    const hrefBase = variant === "public" ? "/herramientas/status" : "/tools/status";
    const resolvedSummary = summary ?? EMPTY_SUMMARY;
    const filterValue: StatusFilter | null = filter ?? null;

    const filteredServices: ServiceWithStatus[] = filterValue
        ? services.filter((s) => s.lastStatus === filterValue)
        : services;

    const byCategory = {
        fiscal:    filteredServices.filter((s) => s.category === "fiscal"),
        laboral:   filteredServices.filter((s) => s.category === "laboral"),
        mercantil: filteredServices.filter((s) => s.category === "mercantil"),
    };

    const wrapperClass = variant === "public"
        ? "max-w-[1200px] mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-6"
        : "max-w-[1400px] mx-auto w-full px-4 sm:px-8 py-6 sm:py-8 flex flex-col gap-6";

    return (
        <div className={wrapperClass}>
            <motion.div {...section(0)}>
                {variant === "public" ? (
                    <PublicHero
                        services={services}
                        summary={resolvedSummary}
                        lastServerCheckAt={lastServerCheckAt}
                        currentFilter={filterValue}
                        hrefBase={hrefBase}
                        onRefresh={refresh}
                        loading={loading}
                    />
                ) : (
                    <AuthedHeader
                        services={services}
                        summary={resolvedSummary}
                        lastServerCheckAt={lastServerCheckAt}
                        currentFilter={filterValue}
                        hrefBase={hrefBase}
                        onRefresh={refresh}
                        loading={loading}
                    />
                )}
            </motion.div>

            {error && (
                <motion.div
                    {...section(1)}
                    role="alert"
                    className="rounded-xl border border-red-500 bg-red-100 dark:bg-red-900 px-4 py-3 text-[13px] text-red-700 dark:text-red-300 font-mono"
                >
                    {error}
                </motion.div>
            )}

            {filterValue && filteredServices.length === 0 ? (
                <motion.div {...section(2)}>
                    <EmptyState filter={filterValue} />
                </motion.div>
            ) : (
                <>
                    <motion.div {...section(3)}>
                        <CategorySection title={CATEGORY_TITLES.fiscal} services={byCategory.fiscal} hrefBase={hrefBase} />
                    </motion.div>
                    <motion.div {...section(4)}>
                        <CategorySection title={CATEGORY_TITLES.laboral} services={byCategory.laboral} hrefBase={hrefBase} />
                    </motion.div>
                    <motion.div {...section(5)}>
                        <CategorySection title={CATEGORY_TITLES.mercantil} services={byCategory.mercantil} hrefBase={hrefBase} />
                    </motion.div>
                </>
            )}

            {variant === "public" && (
                <motion.div {...section(6)}>
                    <PublicFaq />
                </motion.div>
            )}

            {services.length > 0 && <ClientVerifier services={services} />}
        </div>
    );
}

// ── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: StatusFilter }) {
    const label = filter === "operational" ? "operacionales" : filter === "degraded" ? "degradados" : "caídos";
    return (
        <div className="rounded-2xl border border-border-light bg-surface-1 px-6 py-10 flex flex-col items-center gap-2 text-center">
            <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-foreground/50">
                Sin resultados
            </span>
            <p className="text-[14px] font-mono text-foreground/70">
                No hay portales {label} en este momento.
            </p>
        </div>
    );
}

// ── Public hero ─────────────────────────────────────────────────────────────

interface HeroProps {
    services:          ServiceWithStatus[];
    summary:           Summary;
    lastServerCheckAt: string | null;
    currentFilter:     StatusFilter | null;
    hrefBase:          string;
    onRefresh:         () => void;
    loading:           boolean;
}

function PublicHero({ services, summary, lastServerCheckAt, currentFilter, hrefBase, onRefresh, loading }: HeroProps) {
    const freshness = computeFreshness(lastServerCheckAt);

    return (
        <header className="relative rounded-2xl overflow-hidden border border-border-light bg-surface-1">
            <div className="relative px-5 sm:px-8 py-6 sm:py-8 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 md:gap-8 items-start md:items-center">
                {/* Left — title + description + pill */}
                <div className="flex flex-col gap-4 min-w-0">
                    <div className="flex flex-col gap-2">
                        <span className="inline-flex self-start items-center gap-1.5 h-6 px-2.5 rounded-full border border-primary-500 bg-surface-2 text-[10px] font-mono uppercase tracking-[0.18em] text-primary-600 dark:text-primary-400">
                            <span className={`w-1.5 h-1.5 rounded-full ${freshness.dot} ${freshness.pulse ? "animate-pulse" : ""}`} />
                            {freshness.label}
                        </span>
                        <h1 className="text-[28px] sm:text-[38px] font-mono font-bold tracking-[-0.02em] leading-[1.05] text-foreground">
                            Estatus de portales venezolanos
                        </h1>
                        <p className="text-[13px] sm:text-[14px] text-foreground/60 max-w-[520px] leading-relaxed">
                            Monitoreo en tiempo real de SENIAT, IVSS, INCES, BANAVIH y otros portales clave para contadores y empresas en Venezuela.
                        </p>
                    </div>
                </div>

                {/* Right — operational quote with sparkline */}
                <div className="relative flex flex-col gap-3 min-w-0 md:min-w-[280px] rounded-xl border border-primary-500 bg-surface-1 px-5 py-4">
                    <span className="inline-flex self-start items-center h-5 px-2 rounded-full border border-border-light bg-surface-2 text-[9px] font-mono uppercase tracking-[0.18em] text-foreground/55">
                        Estado actual
                    </span>
                    <div className="flex items-baseline gap-1.5">
                        <AnimatedNumber
                            value={String(summary.operational)}
                            className="text-[40px] leading-none font-mono font-bold tabular-nums text-foreground tracking-tight"
                        />
                        <span className="text-[20px] font-mono tabular-nums text-foreground/60">
                            / {summary.total}
                        </span>
                    </div>
                    <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-foreground/55">
                        Portales operacionales
                    </div>
                    <div className="pt-1">
                        <UptimeSparkline services={services} days={30} width={240} height={28} className="max-w-none w-full" />
                    </div>
                </div>
            </div>

            {/* Controls strip — tabs + refresh */}
            <div className="relative border-t border-border-light bg-surface-2 px-5 sm:px-8 py-3 flex items-center justify-between gap-3 flex-wrap">
                <StatusTabs summary={summary} currentFilter={currentFilter} hrefBase={hrefBase} />
                <BaseButton.Root
                    variant="secondary"
                    size="sm"
                    onClick={onRefresh}
                    isDisabled={loading}
                    leftIcon={<RefreshCw size={12} className={loading ? "animate-spin" : ""} />}
                    aria-label="Actualizar estatus"
                >
                    Actualizar
                </BaseButton.Root>
            </div>
        </header>
    );
}

// ── Authed compact strip ────────────────────────────────────────────────────

function AuthedHeader({ services, summary, lastServerCheckAt, currentFilter, hrefBase, onRefresh, loading }: HeroProps) {
    const warn = summary.degraded > 0 || summary.down > 0;
    const freshness = computeFreshness(lastServerCheckAt);

    return (
        <div
            className={[
                "rounded-xl border border-border-light bg-surface-1",
                "px-4 sm:px-5 py-3",
                "grid grid-cols-1 gap-3 items-center",
                "md:flex md:flex-row md:items-center md:justify-between md:flex-wrap",
            ].join(" ")}
        >
            <div className="flex items-center gap-4 md:gap-5 flex-wrap">
                <div className="flex items-baseline gap-1.5">
                    <AnimatedNumber
                        value={String(summary.operational)}
                        className="text-[18px] font-mono font-bold tabular-nums text-foreground leading-none"
                    />
                    <span className="text-[13px] font-mono tabular-nums text-foreground/55 leading-none">
                        / {summary.total}
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-foreground/55 ml-1">
                        operacionales
                    </span>
                </div>

                <span aria-hidden className="hidden md:inline-block w-px h-6 bg-border-light" />

                {summary.down > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 dark:bg-red-900 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-[0.1em] text-red-700 dark:text-red-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        <AnimatedNumber value={String(summary.down)} />
                        <span>{summary.down === 1 ? "caído" : "caídos"}</span>
                    </span>
                )}
                {summary.down === 0 && summary.degraded > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-[0.1em] text-amber-700 dark:text-amber-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <AnimatedNumber value={String(summary.degraded)} />
                        <span>{summary.degraded === 1 ? "degradado" : "degradados"}</span>
                    </span>
                )}
                {!warn && summary.total > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-[0.1em] text-emerald-700 dark:text-emerald-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Todos activos
                    </span>
                )}

                <span aria-hidden className="hidden md:inline-block w-px h-6 bg-border-light" />

                <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${freshness.dot} ${freshness.pulse ? "animate-pulse" : ""}`} />
                    <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-foreground/55">
                        {freshness.shortLabel}
                    </span>
                </div>

                <UptimeSparkline services={services} days={30} width={80} height={20} className="max-w-[80px]" />
            </div>

            <div className="flex items-center gap-2 flex-wrap md:justify-end">
                <StatusTabs summary={summary} currentFilter={currentFilter} hrefBase={hrefBase} compact />
                <BaseButton.Root
                    variant="secondary"
                    size="sm"
                    onClick={onRefresh}
                    isDisabled={loading}
                    leftIcon={<RefreshCw size={12} className={loading ? "animate-spin" : ""} />}
                    aria-label="Actualizar estatus"
                >
                    Actualizar
                </BaseButton.Root>
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
                    Sobre el monitoreo
                </h2>
            </div>
            <div className="rounded-2xl border border-border-light bg-surface-1 p-2">
                <BaseAccordion.Root selectionMode="single" defaultExpandedKeys={["metodologia"]}>
                    <BaseAccordion.Item key="metodologia" {...accordionItemProps({ title: "¿Cómo se verifica si un portal está operativo?" })}>
                        <p className="text-[13px] text-foreground/70 leading-relaxed font-mono">
                            Combinamos dos fuentes: chequeos desde nuestro servidor en la nube y reportes anónimos de visitantes desde Venezuela. Tu navegador envía un ping silencioso al portal mientras lees esta página. Esto permite detectar caídas que desde servidores fuera del país no serían visibles.
                        </p>
                    </BaseAccordion.Item>
                    <BaseAccordion.Item key="frequency" {...accordionItemProps({ title: "¿Con qué frecuencia se actualiza?" })}>
                        <p className="text-[13px] text-foreground/70 leading-relaxed font-mono">
                            Cada vez que alguien visita esta página. Si hace más de 2 minutos del último check, disparamos uno nuevo automáticamente. Los datos de visitantes se registran al instante.
                        </p>
                    </BaseAccordion.Item>
                    <BaseAccordion.Item key="colors" {...accordionItemProps({ title: "¿Qué significan los colores?" })}>
                        <p className="text-[13px] text-foreground/70 leading-relaxed font-mono">
                            Verde = operacional, ámbar = degradado (lento o con errores 4xx), rojo = caído (timeout, error 5xx, sin respuesta), gris = sin datos para ese día.
                        </p>
                    </BaseAccordion.Item>
                    <BaseAccordion.Item key="free" {...accordionItemProps({ title: "¿Es gratis?" })}>
                        <p className="text-[13px] text-foreground/70 leading-relaxed font-mono">
                            Sí, 100% gratis y sin registro. Formamos parte de las herramientas gratuitas de Konta para contadores y empresas venezolanas.
                        </p>
                    </BaseAccordion.Item>
                    <BaseAccordion.Item key="sources" {...accordionItemProps({ title: "¿De dónde salen los datos que veo?" })}>
                        <p className="text-[13px] text-foreground/70 leading-relaxed font-mono">
                            Las verificaciones combinan chequeos desde nuestro servidor más aportes anónimos de visitantes desde Venezuela. Si ves un portal como caído desde tu conexión, al cargar esta página tu navegador ayuda a confirmarlo automáticamente.
                        </p>
                    </BaseAccordion.Item>
                </BaseAccordion.Root>
            </div>
        </section>
    );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface Freshness {
    label:      string;
    shortLabel: string;
    dot:        string;
    pulse:      boolean;
}

function computeFreshness(iso: string | null): Freshness {
    if (!iso) {
        return { label: "Cargando", shortLabel: "Cargando", dot: "bg-foreground/30", pulse: false };
    }
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    if (mins < 5) {
        return { label: "En vivo · Tiempo real", shortLabel: `hace ${Math.max(mins, 0)}m`, dot: "bg-emerald-500", pulse: true };
    }
    if (mins < 30) {
        return { label: "Actualizando", shortLabel: `hace ${mins}m`, dot: "bg-amber-500", pulse: false };
    }
    if (mins < 60) {
        return { label: "Desactualizado", shortLabel: `hace ${mins}m`, dot: "bg-red-500", pulse: false };
    }
    const hours = Math.round(mins / 60);
    if (hours < 24) {
        return { label: "Desactualizado", shortLabel: `hace ${hours}h`, dot: "bg-red-500", pulse: false };
    }
    const days = Math.round(hours / 24);
    return { label: "Desactualizado", shortLabel: `hace ${days}d`, dot: "bg-red-500", pulse: false };
}
