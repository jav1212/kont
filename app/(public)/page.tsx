'use client';

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ModuleCarousel } from "@/src/shared/frontend/components/module-carousel";

interface Plan {
    id:                     string;
    name:                   string;
    moduleSlug:             string | null;
    maxCompanies:           number | null;
    maxEmployeesPerCompany: number | null;
    priceMonthlyUsd:        number;
    priceQuarterlyUsd:      number | null;
    priceAnnualUsd:         number | null;
}

type Cycle = "monthly" | "quarterly" | "annual";

// Modules that can have billing plans — order determines tab order.
const BILLABLE_MODULES: { slug: string; label: string }[] = [
    { slug: "payroll",   label: "Nómina"      },
    { slug: "inventory", label: "Inventario"  },
    { slug: "documents", label: "Documentos"  },
];

// Features to display when a module has no paid plans (i.e. it's free).
const FREE_MODULE_FEATURES: Record<string, string[]> = {
    documents: [
        "Carga y organización de archivos",
        "Carpetas por empresa",
        "Descarga desde cualquier dispositivo",
        "Sin límite de documentos",
    ],
};

const FREE_MODULE_FEATURES_FALLBACK = ["Sin costo adicional"];

const PANEL_ID = "pricing-panel";


export default function LandingPage() {

    // Lazy init reads URL hash/query params once — avoids setState-in-effect pattern
    const [systemMessage, setSystemMessage] = useState<{ type: 'error' | 'info', text: string } | null>(() => {
        if (typeof window === "undefined") return null;
        const hashParams  = new URLSearchParams(window.location.hash.substring(1));
        const queryParams = new URLSearchParams(window.location.search);
        const msg = hashParams.get('error_description') ?? queryParams.get('error_description');
        return msg ? { type: 'error', text: msg.replace(/\+/g, ' ') } : null;
    });
    const [plans,           setPlans]           = useState<Plan[]>([]);
    const [plansLoading,    setPlansLoading]    = useState<boolean>(true);
    const [plansError,      setPlansError]      = useState<boolean>(false);
    const [cycle,           setCycle]           = useState<Cycle>("monthly");
    const [activeModule,    setActiveModule]    = useState<string>("payroll");
    const [tabTransitioning, setTabTransitioning] = useState<boolean>(false);

    useEffect(() => {
        fetch("/api/billing/plans")
            .then((r) => r.json())
            .then((r) => {
                if (r.data) setPlans(r.data);
                else setPlansError(true);
            })
            .catch(() => setPlansError(true))
            .finally(() => setPlansLoading(false));
    }, []);

    const visiblePlans = useMemo(() => {
        return plans.filter((p) => p.moduleSlug === activeModule || p.moduleSlug === null);
    }, [plans, activeModule]);

    const activeModuleIsFree = !plansLoading && !plansError && visiblePlans.length === 0;

    // Compute average savings across all plans for the cycle toggle hints.
    const avgSavings = useMemo(() => {
        const withQuarterly = plans.filter((p) => p.priceQuarterlyUsd);
        const withAnnual    = plans.filter((p) => p.priceAnnualUsd);
        const quarterly = withQuarterly.length
            ? Math.round(withQuarterly.reduce((acc, p) => acc + (1 - p.priceQuarterlyUsd! / (p.priceMonthlyUsd * 3)), 0) / withQuarterly.length * 100)
            : null;
        const annual = withAnnual.length
            ? Math.round(withAnnual.reduce((acc, p) => acc + (1 - p.priceAnnualUsd! / (p.priceMonthlyUsd * 12)), 0) / withAnnual.length * 100)
            : null;
        return { quarterly, annual };
    }, [plans]);

    function changeTab(slug: string) {
        if (slug === activeModule) return;
        setTabTransitioning(true);
        setTimeout(() => {
            setActiveModule(slug);
            setTabTransitioning(false);
        }, 80);
    }

    function planPrice(p: Plan): number {
        if (cycle === "quarterly" && p.priceQuarterlyUsd) return p.priceQuarterlyUsd;
        if (cycle === "annual"    && p.priceAnnualUsd)    return p.priceAnnualUsd;
        return p.priceMonthlyUsd;
    }

    function planSavings(p: Plan): string | null {
        if (cycle === "quarterly" && p.priceQuarterlyUsd) {
            const pct = Math.round((1 - p.priceQuarterlyUsd / (p.priceMonthlyUsd * 3)) * 100);
            return pct > 0 ? `-${pct}%` : null;
        }
        if (cycle === "annual" && p.priceAnnualUsd) {
            const pct = Math.round((1 - p.priceAnnualUsd / (p.priceMonthlyUsd * 12)) * 100);
            return pct > 0 ? `-${pct}%` : null;
        }
        return null;
    }


    return (
        <div className="flex flex-col">

            {systemMessage && (
                <div className="w-full bg-red-500/10 border-b border-red-500/20 px-8 py-3 animate-pulse">
                    <div className="max-w-5xl mx-auto flex items-center gap-4">
                        <span className="font-mono text-[12px] text-red-400 font-bold uppercase tracking-widest">
                            [ SYSTEM_ERROR ]:
                        </span>
                        <span className="font-mono text-[12px] text-red-200/70 uppercase">
                            {systemMessage.text}
                        </span>
                        <button
                            onClick={() => setSystemMessage(null)}
                            className="ml-auto font-mono text-[12px] text-[var(--text-tertiary)] hover:text-foreground"
                        >
                            [ CERRAR ]
                        </button>
                    </div>
                </div>
            )}

            {/* ── HERO ──────────────────────────────────────────────────── */}
            <section className="px-8 pt-24 pb-20 max-w-5xl mx-auto w-full">

                <div className="flex items-center gap-3 mb-10">
                    <div className="h-px w-8 bg-primary-500/60" />
                    <span className="font-mono text-[12px] uppercase tracking-[0.28em] text-text-link">
                        Sistema de gestión · Venezuela
                    </span>
                </div>

                <h1
                    className="font-mono font-black uppercase leading-[0.92] tracking-tighter text-foreground"
                    style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}
                >
                    Gestión<br />
                    <span className="text-[var(--text-disabled)]">precisa.</span><br />
                    <span
                        className="text-transparent"
                        style={{ WebkitTextStroke: "1px rgba(8,145,178,0.7)" }}
                    >
                        siempre.
                    </span>
                </h1>

                <p className="mt-10 max-w-lg font-mono text-[15px] leading-relaxed text-text-tertiary tracking-wide">
                    Gestión contable, inventario y documentos en una sola plataforma. Indexación BCV
                    en tiempo real. Sin errores, sin hojas de cálculo sueltas.
                </p>

                <div className="flex items-center gap-4 mt-12">
                    <Link
                        href="/sign-in"
                        className={[
                            "inline-flex items-center gap-2.5 px-6 py-3",
                            "bg-primary-500 hover:bg-primary-400",
                            "font-mono text-[13px] uppercase tracking-[0.18em] text-white",
                            "rounded-lg transition-colors duration-150",
                        ].join(" ")}
                    >
                        Acceder al sistema
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 6h8M6 2l4 4-4 4" />
                        </svg>
                    </Link>
                    <Link
                        href="/sign-up"
                        className={[
                            "inline-flex items-center px-6 py-3",
                            "border border-foreground/10 hover:border-foreground/20",
                            "font-mono text-[13px] uppercase tracking-[0.18em] text-text-tertiary hover:text-text-secondary",
                            "rounded-lg transition-colors duration-150",
                        ].join(" ")}
                    >
                        Crear cuenta
                    </Link>
                </div>
            </section>

            {/* ── MODULE CAROUSEL ───────────────────────────────────────── */}
            <ModuleCarousel />

            {/* ── PRICING ───────────────────────────────────────────────── */}
            <section className="px-8 pb-20 max-w-5xl mx-auto w-full">

                {/* Header */}
                <div className="flex items-center gap-3 mb-3">
                    <div className="h-px w-8 bg-primary-500/60" />
                    <span className="font-mono text-[12px] uppercase tracking-[0.28em] text-text-link">
                        Planes
                    </span>
                </div>
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                    <h2 className="font-mono text-[28px] font-black uppercase tracking-tighter text-foreground leading-none">
                        Sin sorpresas.<br />
                        <span className="text-[var(--text-disabled)]">Precio fijo.</span>
                    </h2>

                    {/* Cycle toggle */}
                    <div className="flex items-center gap-1 p-1 rounded-lg border border-border-light bg-foreground/[0.03]">
                        {([
                            { key: "monthly",   label: "Mensual",    savings: null                   },
                            { key: "quarterly", label: "Trimestral", savings: avgSavings.quarterly   },
                            { key: "annual",    label: "Anual",      savings: avgSavings.annual      },
                        ] as { key: Cycle; label: string; savings: number | null }[]).map(({ key, label, savings }) => (
                            <button
                                key={key}
                                onClick={() => setCycle(key)}
                                className={[
                                    "relative px-3 py-1.5 rounded-md font-mono text-[12px] uppercase tracking-[0.18em] transition-colors duration-150",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50",
                                    cycle === key
                                        ? "bg-primary-500 text-white"
                                        : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
                                ].join(" ")}
                            >
                                {label}
                                {savings !== null && savings > 0 && cycle !== key && (
                                    <span className="ml-1.5 font-mono text-[10px] text-emerald-500 normal-case tracking-normal">
                                        -{savings}%
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Module selector tabs */}
                <div
                    role="tablist"
                    aria-label="Módulo de precios"
                    className="flex items-center gap-1 p-1 mb-8 rounded-xl border border-border-light bg-foreground/[0.02] w-fit"
                >
                    {BILLABLE_MODULES.map((tab) => (
                        <button
                            key={tab.slug}
                            role="tab"
                            id={`tab-${tab.slug}`}
                            aria-selected={activeModule === tab.slug}
                            aria-controls={PANEL_ID}
                            onClick={() => changeTab(tab.slug)}
                            className={[
                                "px-4 py-2 rounded-lg font-mono text-[12px] uppercase tracking-[0.18em] transition-all duration-150",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50",
                                activeModule === tab.slug
                                    ? "bg-surface-2 text-foreground border border-border-light shadow-sm"
                                    : "text-foreground/40 hover:text-foreground/70 border border-transparent",
                            ].join(" ")}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Cards */}
                <div
                    id={PANEL_ID}
                    role="tabpanel"
                    aria-labelledby={`tab-${activeModule}`}
                    className="transition-opacity duration-[80ms]"
                    style={{ opacity: tabTransitioning ? 0 : 1 }}
                >
                    {plansLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="h-64 rounded-xl border border-border-light bg-surface-2 animate-pulse" />
                            ))}
                        </div>
                    ) : plansError ? (
                        <div className="flex flex-col items-center gap-3 py-12">
                            <p className="font-mono text-[13px] text-[var(--text-tertiary)] uppercase tracking-[0.18em]">
                                No pudimos cargar los planes
                            </p>
                            <button
                                onClick={() => {
                                    setPlansError(false);
                                    setPlansLoading(true);
                                    fetch("/api/billing/plans")
                                        .then((r) => r.json())
                                        .then((r) => {
                                            if (r.data) setPlans(r.data);
                                            else setPlansError(true);
                                        })
                                        .catch(() => setPlansError(true))
                                        .finally(() => setPlansLoading(false));
                                }}
                                className={[
                                    "font-mono text-[12px] uppercase tracking-[0.18em] px-4 py-2 rounded-lg",
                                    "border border-border-light hover:border-border-medium text-[var(--text-secondary)]",
                                    "transition-colors duration-150",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50",
                                ].join(" ")}
                            >
                                Reintentar
                            </button>
                        </div>
                    ) : activeModuleIsFree ? (
                        <div className="flex justify-center">
                            <div className="relative flex flex-col rounded-xl border border-border-light bg-surface-1 p-6 w-full max-w-xs">
                                {/* Plan name */}
                                <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-[var(--text-tertiary)] mb-4">
                                    Gratuito
                                </p>

                                {/* Price */}
                                <div className="mb-1">
                                    <span className="font-mono text-[36px] font-black text-foreground tabular-nums leading-none">
                                        $0
                                    </span>
                                    <span className="font-mono text-[12px] text-[var(--text-tertiary)] ml-1">
                                        USD
                                    </span>
                                </div>
                                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] mb-4">
                                    Sin costo adicional
                                </p>

                                {/* Divider */}
                                <div className="h-px bg-border-light mb-5" />

                                {/* Features */}
                                <ul className="space-y-2.5 flex-1">
                                    {(FREE_MODULE_FEATURES[activeModule] ?? FREE_MODULE_FEATURES_FALLBACK).map((feature) => (
                                        <li key={feature} className="flex items-start gap-2">
                                            <svg className="mt-0.5 shrink-0 text-[var(--text-link)]" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <path d="M2 5.5l2 2 4-4" />
                                            </svg>
                                            <span className="font-mono text-[12px] text-[var(--text-secondary)] leading-snug">
                                                {feature}
                                            </span>
                                        </li>
                                    ))}
                                </ul>

                                {/* CTA */}
                                <Link
                                    href="/sign-up"
                                    aria-label="Comenzar gratis con Documentos"
                                    className={[
                                        "mt-6 flex items-center justify-center gap-2 h-9 rounded-lg",
                                        "font-mono text-[12px] uppercase tracking-[0.18em] transition-colors duration-150",
                                        "border border-border-default hover:border-border-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50",
                                    ].join(" ")}
                                >
                                    Comenzar gratis
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M2 5h6M5 2l3 3-3 3" />
                                    </svg>
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            {visiblePlans.map((plan, idx) => {
                                const highlighted = idx === Math.floor(visiblePlans.length / 2);
                                const price       = planPrice(plan);
                                const savings     = planSavings(plan);

                                return (
                                    <div
                                        key={plan.id}
                                        className={[
                                            "relative flex flex-col rounded-xl border p-6 transition-colors duration-200",
                                            highlighted
                                                ? "border-primary-500/40 bg-primary-500/[0.06]"
                                                : "border-border-light bg-surface-1 hover:bg-surface-2",
                                        ].join(" ")}
                                    >
                                        {highlighted && (
                                            <div className="absolute -top-px left-6 right-6 h-px bg-primary-500/60" />
                                        )}
                                        {highlighted && (
                                            <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-primary-500 font-mono text-[11px] uppercase tracking-[0.2em] text-white whitespace-nowrap">
                                                Popular
                                            </span>
                                        )}

                                        {/* Plan name */}
                                        <p className={[
                                            "font-mono text-[12px] uppercase tracking-[0.22em] mb-4",
                                            highlighted ? "text-primary-400" : "text-[var(--text-tertiary)]",
                                        ].join(" ")}>
                                            {plan.name}
                                        </p>

                                        {/* Price */}
                                        <div className="mb-1">
                                            <span className="font-mono text-[36px] font-black text-foreground tabular-nums leading-none">
                                                ${price}
                                            </span>
                                            <span className="font-mono text-[12px] text-[var(--text-tertiary)] ml-1">
                                                USD
                                            </span>
                                        </div>
                                        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] mb-1">
                                            {cycle === "monthly"   && "por mes"}
                                            {cycle === "quarterly" && "por trimestre"}
                                            {cycle === "annual"    && "por año"}
                                        </p>
                                        {savings && (
                                            <span className="inline-flex items-center font-mono text-[11px] text-emerald-500 mb-4">
                                                Ahorra {savings} vs mensual
                                            </span>
                                        )}
                                        {!savings && <div className="mb-4" />}

                                        {/* Divider */}
                                        <div className="h-px bg-border-light mb-5" />

                                        {/* Features */}
                                        <ul className="space-y-2.5 flex-1">
                                            <li className="flex items-start gap-2">
                                                <svg className="mt-0.5 shrink-0 text-[var(--text-link)]" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                    <path d="M2 5.5l2 2 4-4" />
                                                </svg>
                                                <span className="font-mono text-[12px] text-[var(--text-secondary)] leading-snug">
                                                    {plan.maxCompanies === null
                                                        ? "Empresas ilimitadas"
                                                        : `${plan.maxCompanies} empresa${plan.maxCompanies !== 1 ? "s" : ""}`}
                                                </span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <svg className="mt-0.5 shrink-0 text-[var(--text-link)]" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                    <path d="M2 5.5l2 2 4-4" />
                                                </svg>
                                                <span className="font-mono text-[12px] text-[var(--text-secondary)] leading-snug">
                                                    {plan.maxEmployeesPerCompany === null
                                                        ? "Empleados ilimitados"
                                                        : `Hasta ${plan.maxEmployeesPerCompany} empleados / empresa`}
                                                </span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <svg className="mt-0.5 shrink-0 text-[var(--text-link)]" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                    <path d="M2 5.5l2 2 4-4" />
                                                </svg>
                                                <span className="font-mono text-[12px] text-[var(--text-secondary)] leading-snug">
                                                    Recibos y reportes
                                                </span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <svg className="mt-0.5 shrink-0 text-[var(--text-link)]" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                    <path d="M2 5.5l2 2 4-4" />
                                                </svg>
                                                <span className="font-mono text-[12px] text-[var(--text-secondary)] leading-snug">
                                                    Indexación BCV
                                                </span>
                                            </li>
                                        </ul>

                                        {/* CTA */}
                                        <Link
                                            href="/sign-up"
                                            aria-label={`Elegir plan ${plan.name}`}
                                            className={[
                                                "mt-6 flex items-center justify-center gap-2 h-9 rounded-lg",
                                                "font-mono text-[12px] uppercase tracking-[0.18em] transition-colors duration-150",
                                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50",
                                                highlighted
                                                    ? "bg-primary-500 hover:bg-primary-400 text-white"
                                                    : "border border-border-default hover:border-border-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                                            ].join(" ")}
                                        >
                                            Elegir plan
                                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <path d="M2 5h6M5 2l3 3-3 3" />
                                            </svg>
                                        </Link>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Payment note */}
                <div className="mt-6 flex flex-col items-center gap-1">
                    <p className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                        Pago por transferencia · Zelle · Binance · PayPal
                    </p>
                    <p className="text-center font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                        Activación manual por el equipo · Sin acceso inmediato
                    </p>
                </div>
            </section>

            {/* ── BOTTOM CTA STRIP ──────────────────────────────────────── */}
            <section className="px-8 pb-20 max-w-5xl mx-auto w-full">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 px-8 py-6 border border-primary-500/20 rounded-xl bg-primary-500/[0.04]">
                    <div>
                        <p className="font-mono text-[13px] uppercase tracking-[0.18em] text-[var(--text-link)] mb-1">
                            ¿Listo para empezar?
                        </p>
                        <p className="font-mono text-[15px] text-[var(--text-secondary)]">
                            Configura tu primera empresa en menos de 5 minutos.
                        </p>
                    </div>
                    <Link
                        href="/sign-in"
                        className={[
                            "flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5",
                            "border border-primary-500/40 hover:border-primary-400/60 hover:bg-primary-500/10",
                            "font-mono text-[12px] uppercase tracking-[0.18em] text-primary-400",
                            "rounded-lg transition-all duration-150",
                        ].join(" ")}
                    >
                        Acceder
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 5h6M5 2l3 3-3 3" />
                        </svg>
                    </Link>
                </div>
            </section>

        </div>
    );
}
