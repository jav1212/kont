"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Module definitions ────────────────────────────────────────────────────────

const MODULES = [
    {
        id: "payroll",
        label: "Nómina",
        desc: "Cálculo LOTTT con indexación BCV automática, liquidaciones, vacaciones y utilidades.",
        icon: (
            <svg width="22" height="22" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1" y="1" width="11" height="11" rx="1.5" />
                <path d="M4 5h5M4 7.5h3" />
            </svg>
        ),
    },
    {
        id: "inventory",
        label: "Inventario",
        desc: "Control de entradas, salidas y libros reglamentarios con reportes ISLR 177.",
        icon: (
            <svg width="22" height="22" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M1 4l5.5-3 5.5 3v5l-5.5 3L1 9V4z" />
                <path d="M6.5 1v11M1 4l5.5 3 5.5-3" />
            </svg>
        ),
    },
    {
        id: "companies",
        label: "Empresas",
        desc: "Gestión multiempresa desde una sola cuenta. Cambia de contexto en un clic.",
        icon: (
            <svg width="22" height="22" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1" y="4" width="11" height="8" rx="1" />
                <path d="M4 4V2.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5V4" />
                <path d="M5 8h3M6.5 6.5v3" />
            </svg>
        ),
    },
    {
        id: "billing",
        label: "Facturación",
        desc: "Planes, suscripciones y acceso modular por empresa. Control total del ciclo de cobro.",
        icon: (
            <svg width="22" height="22" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1" y="3" width="11" height="7" rx="1" />
                <path d="M1 6h11M4.5 8.5h2" />
            </svg>
        ),
    },
    {
        id: "documents",
        label: "Documentos",
        desc: "Repositorio de archivos por empresa con carpetas, plantillas y firma digital.",
        icon: (
            <svg width="22" height="22" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 1h5l3 3v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" />
                <path d="M8 1v3h3M5 7h3M5 9.5h2" />
            </svg>
        ),
    },
] as const;

const TOTAL = MODULES.length;
const AUTO_ADVANCE_MS = 4000;

// ── Component ─────────────────────────────────────────────────────────────────

export function ModuleCarousel() {
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const advance = useCallback(() => {
        setIndex((i) => (i + 1) % TOTAL);
    }, []);

    const goTo = useCallback((i: number) => {
        setIndex(i);
    }, []);

    const prev = useCallback(() => {
        setIndex((i) => (i - 1 + TOTAL) % TOTAL);
    }, []);

    const next = useCallback(() => {
        setIndex((i) => (i + 1) % TOTAL);
    }, []);

    // Auto-advance timer — resets whenever index changes or paused state changes
    useEffect(() => {
        if (paused) return;
        timerRef.current = setTimeout(advance, AUTO_ADVANCE_MS);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [index, paused, advance]);

    // Arrow key navigation for keyboard users
    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === "ArrowLeft")  { e.preventDefault(); prev(); }
        if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    }

    return (
        <section
            className="px-8 py-20 max-w-5xl mx-auto w-full"
            aria-label="Módulos de la plataforma"
        >
            {/* ── Section header ────────────────────────────────────────── */}
            <div className="flex items-center gap-3 mb-3">
                <div className="h-px w-8 bg-primary-500/60" />
                <span className="font-mono text-[12px] uppercase tracking-[0.28em] text-text-link">
                    Plataforma
                </span>
            </div>
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                <h2 className="font-mono text-[28px] font-black uppercase tracking-tighter text-foreground leading-none">
                    Una plataforma.<br />
                    <span className="text-text-disabled">Todos tus procesos.</span>
                </h2>

                {/* Prev / Next arrow buttons */}
                <div className="flex items-center gap-2" role="group" aria-label="Controles del carrusel">
                    <button
                        onClick={prev}
                        aria-label="Módulo anterior"
                        className={[
                            "w-8 h-8 flex items-center justify-center rounded-lg border transition-colors duration-150",
                            "border-border-light text-text-tertiary",
                            "hover:border-border-medium hover:text-foreground",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                        ].join(" ")}
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M8 2L4 6l4 4" />
                        </svg>
                    </button>
                    <button
                        onClick={next}
                        aria-label="Módulo siguiente"
                        className={[
                            "w-8 h-8 flex items-center justify-center rounded-lg border transition-colors duration-150",
                            "border-border-light text-text-tertiary",
                            "hover:border-border-medium hover:text-foreground",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                        ].join(" ")}
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M4 2l4 4-4 4" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* ── Sliding track ─────────────────────────────────────────── */}
            {/*
                Layout math:
                  - The outer div clips overflow.
                  - The track is TOTAL * 100% wide, so each card is (1/TOTAL) of the track
                    = exactly 100% of the outer container width.
                  - We translate the track by -(index / TOTAL * 100)% of its own width,
                    which equals -(index * 100%) of the container — one full card step.
                  - This gives a clean 1-card-at-a-time slide with no JS breakpoint detection.
            */}
            <div
                className="overflow-hidden rounded-xl"
                onMouseEnter={() => setPaused(true)}
                onMouseLeave={() => setPaused(false)}
                onFocusCapture={() => setPaused(true)}
                onBlurCapture={() => setPaused(false)}
            >
                <div
                    role="region"
                    aria-label="Carrusel de módulos"
                    aria-live="polite"
                    onKeyDown={handleKeyDown}
                    tabIndex={0}
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-xl"
                >
                    <div
                        className="flex transition-transform duration-500 ease-in-out"
                        style={{
                            transform: `translateX(-${index * (100 / TOTAL)}%)`,
                            width: `${TOTAL * 100}%`,
                        }}
                    >
                        {MODULES.map((mod, i) => (
                            <ModuleCard
                                key={mod.id}
                                mod={mod}
                                active={i === index}
                                total={TOTAL}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Dot indicators ────────────────────────────────────────── */}
            <div
                className="flex items-center justify-center gap-2 mt-6"
                role="tablist"
                aria-label="Navegación de módulos"
            >
                {MODULES.map((mod, i) => (
                    <button
                        key={mod.id}
                        role="tab"
                        aria-selected={i === index}
                        aria-label={`Ir a ${mod.label}`}
                        onClick={() => goTo(i)}
                        className={[
                            "rounded-full transition-all duration-300",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1",
                            i === index
                                ? "w-5 h-1.5 bg-primary-500"
                                : "w-1.5 h-1.5 bg-border-medium hover:bg-border-strong",
                        ].join(" ")}
                    />
                ))}
            </div>
        </section>
    );
}

// ── Card sub-component ────────────────────────────────────────────────────────

type ModuleDef = (typeof MODULES)[number];

function ModuleCard({ mod, active, total }: { mod: ModuleDef; active: boolean; total: number }) {
    return (
        <div
            // Each card is 1/TOTAL of the track width = 100% of the container.
            // Horizontal padding creates visual breathing room without breaking the math.
            className="px-2 md:px-4"
            style={{ width: `${100 / total}%` }}
            aria-hidden={!active}
        >
            <div
                className={[
                    "h-full flex flex-col rounded-xl border p-8 transition-all duration-300",
                    active
                        ? "border-primary-500/30 bg-primary-500/4"
                        : "border-border-light bg-surface-1",
                ].join(" ")}
            >
                {/* Icon container */}
                <div className={[
                    "w-11 h-11 rounded-xl flex items-center justify-center mb-6 transition-colors duration-300",
                    active
                        ? "bg-primary-500/15 text-primary-500"
                        : "bg-surface-2 text-text-tertiary",
                ].join(" ")}>
                    {mod.icon}
                </div>

                {/* Module slug — acts as eyebrow label */}
                <p className={[
                    "font-mono text-[11px] uppercase tracking-[0.28em] mb-2 transition-colors duration-300",
                    active ? "text-text-link" : "text-text-tertiary",
                ].join(" ")}>
                    {mod.id}
                </p>

                {/* Module name */}
                <h3 className="font-mono text-[20px] font-black uppercase tracking-tight text-foreground mb-3 leading-none">
                    {mod.label}
                </h3>

                {/* Description */}
                <p className="font-mono text-[13px] leading-relaxed text-text-secondary flex-1">
                    {mod.desc}
                </p>

                {/* Active state bottom accent */}
                <div className={[
                    "mt-6 h-px transition-all duration-500",
                    active ? "bg-primary-500/40" : "bg-border-light",
                ].join(" ")} />
            </div>
        </div>
    );
}
