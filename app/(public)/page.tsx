'use client';

import Link from "next/link";
import { useEffect, useState } from "react";

interface Plan {
    id:                     string;
    name:                   string;
    maxCompanies:           number | null;
    maxEmployeesPerCompany: number | null;
    priceMonthlyUsd:        number;
    priceQuarterlyUsd:      number | null;
    priceAnnualUsd:         number | null;
}

type Cycle = "monthly" | "quarterly" | "annual";

const FEATURES = [
    {
        code: "01",
        label: "Cálculo LOTTT",
        desc: "Tasas SSO, RPE y FAOV aplicadas sobre base semanal o mensual según la ley.",
    },
    {
        code: "02",
        label: "Indexación BCV",
        desc: "Bonos y montos en USD convertidos automáticamente con la tasa del día.",
    },
    {
        code: "03",
        label: "Nómina por lotes",
        desc: "Fórmulas globales con sobrescritura por empleado. Extras individuales.",
    },
    {
        code: "04",
        label: "Auditoría en línea",
        desc: "Cada cálculo descompuesto en su fórmula. Sin cajas negras.",
    },
] as const;

const STATS = [
    { value: "LOTTT", label: "Marco legal" },
    { value: "BCV", label: "Tasa de cambio" },
    { value: "≥0", label: "Empleados" },
    { value: "0.00 %", label: "Margen de error" },
] as const;

export default function LandingPage() {

    const [systemMessage, setSystemMessage] = useState<{ type: 'error' | 'info', text: string } | null>(null);
    const [plans,  setPlans]  = useState<Plan[]>([]);
    const [cycle,  setCycle]  = useState<Cycle>("monthly");

    useEffect(() => {
        fetch("/api/billing/plans")
            .then((r) => r.json())
            .then((r) => { if (r.data) setPlans(r.data); });
    }, []);

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

    useEffect(() => {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const errorMsg = hashParams.get('error_description');

        const queryParams = new URLSearchParams(window.location.search);
        const queryError = queryParams.get('error_description');

        if (errorMsg || queryError) {
            const message = errorMsg || queryError;
            setSystemMessage({
                type: 'error',
                text: message?.replace(/\+/g, ' ') || "Error de sistema"
            });
        }
    }, []);

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
                    Nómina<br />
                    <span className="text-[var(--text-disabled)]">precisa.</span><br />
                    <span
                        className="text-transparent"
                        style={{ WebkitTextStroke: "1px rgba(8,145,178,0.7)" }}
                    >
                        siempre.
                    </span>
                </h1>

                <p className="mt-10 max-w-lg font-mono text-[15px] leading-relaxed text-text-tertiary tracking-wide">
                    Cálculo de nómina venezolana con base legal LOTTT, indexación BCV
                    en tiempo real y auditoría línea a línea. Sin errores, sin hojas de cálculo sueltas.
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

            {/* ── STAT STRIP ────────────────────────────────────────────── */}
            <section className="border-y border-border-light px-8 py-6">
                <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
                    {STATS.map((s) => (
                        <div key={s.label} className="flex flex-col gap-1">
                            <span className="font-mono text-[22px] font-black text-foreground tabular-nums tracking-tight">
                                {s.value}
                            </span>
                            <span className="font-mono text-[12px] uppercase tracking-[0.22em] text-text-tertiary">
                                {s.label}
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── FEATURE GRID ──────────────────────────────────────────── */}
            <section className="px-8 py-20 max-w-5xl mx-auto w-full">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border-light border border-border-light rounded-xl overflow-hidden">
                    {FEATURES.map((f) => (
                        <div
                            key={f.code}
                            className="bg-surface-1 p-8 hover:bg-surface-2 transition-colors duration-200 group"
                        >
                            <div className="flex items-start justify-between mb-5">
                                <span className="font-mono text-[12px] uppercase tracking-[0.22em] text-text-link">
                                    {f.code}
                                </span>
                                <div className="w-px h-4 bg-foreground/10 group-hover:bg-primary-500/30 transition-colors" />
                            </div>
                            <h3 className="font-mono text-[15px] font-bold uppercase tracking-[0.1em] text-foreground mb-3">
                                {f.label}
                            </h3>
                            <p className="font-mono text-[13px] leading-relaxed text-text-tertiary">
                                {f.desc}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── PRICING ───────────────────────────────────────────────── */}
            <section className="px-8 pb-20 max-w-5xl mx-auto w-full">

                {/* Header */}
                <div className="flex items-center gap-3 mb-3">
                    <div className="h-px w-8 bg-primary-500/60" />
                    <span className="font-mono text-[12px] uppercase tracking-[0.28em] text-text-link">
                        Planes
                    </span>
                </div>
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                    <h2 className="font-mono text-[28px] font-black uppercase tracking-tighter text-foreground leading-none">
                        Sin sorpresas.<br />
                        <span className="text-[var(--text-disabled)]">Precio fijo.</span>
                    </h2>

                    {/* Cycle toggle */}
                    <div className="flex items-center gap-1 p-1 rounded-lg border border-border-light bg-foreground/[0.03]">
                        {([
                            { key: "monthly",   label: "Mensual"     },
                            { key: "quarterly", label: "Trimestral"  },
                            { key: "annual",    label: "Anual"       },
                        ] as { key: Cycle; label: string }[]).map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => setCycle(key)}
                                className={[
                                    "px-3 py-1.5 rounded-md font-mono text-[12px] uppercase tracking-[0.18em] transition-colors duration-150",
                                    cycle === key
                                        ? "bg-primary-500 text-white"
                                        : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
                                ].join(" ")}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Cards */}
                {plans.length === 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="h-64 rounded-xl border border-border-light bg-surface-2 animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        {plans.map((plan, idx) => {
                            const highlighted = idx === 1;
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
                                            {savings} vs mensual
                                        </span>
                                    )}
                                    {!savings && <div className="mb-4" />}

                                    {/* Divider */}
                                    <div className="h-px bg-border-light mb-5" />

                                    {/* Features */}
                                    <ul className="space-y-2.5 flex-1">
                                        <li className="flex items-start gap-2">
                                            <svg className="mt-0.5 shrink-0 text-[var(--text-link)]" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M2 5.5l2 2 4-4" />
                                            </svg>
                                            <span className="font-mono text-[12px] text-[var(--text-secondary)] leading-snug">
                                                {plan.maxCompanies === null
                                                    ? "Empresas ilimitadas"
                                                    : `${plan.maxCompanies} empresa${plan.maxCompanies !== 1 ? "s" : ""}`}
                                            </span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <svg className="mt-0.5 shrink-0 text-[var(--text-link)]" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M2 5.5l2 2 4-4" />
                                            </svg>
                                            <span className="font-mono text-[12px] text-[var(--text-secondary)] leading-snug">
                                                {plan.maxEmployeesPerCompany === null
                                                    ? "Empleados ilimitados"
                                                    : `Hasta ${plan.maxEmployeesPerCompany} empleados / empresa`}
                                            </span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <svg className="mt-0.5 shrink-0 text-[var(--text-link)]" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M2 5.5l2 2 4-4" />
                                            </svg>
                                            <span className="font-mono text-[12px] text-[var(--text-secondary)] leading-snug">
                                                Cálculo LOTTT + BCV
                                            </span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <svg className="mt-0.5 shrink-0 text-[var(--text-link)]" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M2 5.5l2 2 4-4" />
                                            </svg>
                                            <span className="font-mono text-[12px] text-[var(--text-secondary)] leading-snug">
                                                Recibos de nómina
                                            </span>
                                        </li>
                                    </ul>

                                    {/* CTA */}
                                    <Link
                                        href="/sign-up"
                                        className={[
                                            "mt-6 flex items-center justify-center gap-2 h-9 rounded-lg",
                                            "font-mono text-[12px] uppercase tracking-[0.18em] transition-colors duration-150",
                                            highlighted
                                                ? "bg-primary-500 hover:bg-primary-400 text-white"
                                                : "border border-border-default hover:border-border-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                                        ].join(" ")}
                                    >
                                        Comenzar
                                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M2 5h6M5 2l3 3-3 3" />
                                        </svg>
                                    </Link>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Payment note */}
                <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-disabled)]">
                    Pago por transferencia · Zelle · Binance · PayPal — Activación manual por el equipo
                </p>
            </section>

            {/* ── BOTTOM CTA STRIP ──────────────────────────────────────── */}
            <section className="px-8 pb-20 max-w-5xl mx-auto w-full">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 px-8 py-6 border border-primary-500/20 rounded-xl bg-primary-500/[0.04]">
                    <div>
                        <p className="font-mono text-[13px] uppercase tracking-[0.18em] text-[var(--text-link)] mb-1">
                            ¿Listo para empezar?
                        </p>
                        <p className="font-mono text-[15px] text-[var(--text-secondary)]">
                            Configura tu primera nómina en menos de 5 minutos.
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
