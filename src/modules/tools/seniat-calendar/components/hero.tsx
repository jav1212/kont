"use client";

import { CalendarDays, ArrowRight } from "lucide-react";
import type { CalendarEntry } from "../data/types";
import { MONTHS_ES_SHORT, daysBetween, todayLocalIso } from "../utils/date-helpers";
import { CATEGORY_STYLES } from "../utils/category-colors";

interface HeroProps {
    nextEntry: CalendarEntry | null;
    hasRif: boolean;
}

function NextObligationCard({ entry }: { entry: CalendarEntry | null }) {
    const today = todayLocalIso();

    if (!entry) {
        return (
            <div className="w-full md:w-[260px] rounded-xl border border-border-light bg-surface-1 px-5 py-4.5">
                <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-text-tertiary mb-3">
                    Próximo vencimiento
                </p>
                <div className="animate-pulse flex flex-col gap-2.5">
                    <div className="h-2.5 bg-surface-3 rounded-full w-3/4" />
                    <div className="h-8 bg-surface-3 rounded-lg w-1/2" />
                    <div className="h-2.5 bg-surface-3 rounded-full w-2/5" />
                </div>
            </div>
        );
    }

    const catStyle = CATEGORY_STYLES[entry.category];
    const CatIcon = catStyle.icon;
    const [, monthStr, dayStr] = entry.dueDate.split("-");
    const month = MONTHS_ES_SHORT[parseInt(monthStr, 10) - 1];
    const day = parseInt(dayStr, 10);
    const daysLeft = daysBetween(today, entry.dueDate);
    const daysLabel = daysLeft === 0 ? "Vence hoy" : daysLeft === 1 ? "Vence mañana" : `${daysLeft} días restantes`;
    const severity = daysLeft <= 3 ? "urgent" : daysLeft <= 7 ? "warning" : "normal";

    const pillarCls = {
        urgent:  "bg-badge-error-border",
        warning: "bg-badge-warning-border",
        normal:  "bg-primary-300",
    }[severity];

    const badgeCls = {
        urgent:  "bg-badge-error-bg border-badge-error-border text-text-error",
        warning: "bg-badge-warning-bg border-badge-warning-border text-text-warning",
        normal:  "bg-primary-50 border-primary-200 text-primary-600 dark:bg-primary-50/10 dark:border-primary-300/30 dark:text-primary-400",
    }[severity];

    return (
        <div className="w-full md:w-[260px] rounded-xl border border-primary-500/40 bg-surface-1 overflow-hidden shadow-[0_0_0_1px_var(--primary-500,transparent)_inset,var(--shadow-sm)]">
            {/* Top accent bar */}
            <div className={`h-0.5 w-full ${pillarCls}`} />
            <div className="px-4 py-4">
                <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-text-tertiary mb-2.5 flex items-center gap-1.5">
                    <CalendarDays size={10} strokeWidth={2} aria-hidden />
                    Próximo vencimiento
                </p>
                {/* Category badge */}
                <span
                    className={[
                        "inline-flex items-center gap-1 h-5 px-1.5 rounded border mb-2",
                        "text-[10px] font-mono uppercase tracking-[0.12em]",
                        catStyle.borderClass, catStyle.bgClass, catStyle.textClass,
                    ].join(" ")}
                >
                    <CatIcon size={9} strokeWidth={2.5} aria-hidden />
                    {catStyle.label}
                </span>
                {/* Title */}
                <p className="text-[12px] font-mono font-semibold text-text-primary leading-snug mb-3 line-clamp-2">
                    {entry.title}
                </p>
                <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-[32px] font-mono font-bold tabular-nums leading-none text-text-primary">
                            {day}
                        </span>
                        <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-text-tertiary">
                            {month}
                        </span>
                    </div>
                    <span className={`inline-flex items-center h-5 px-2 rounded-md border text-[10px] font-mono font-medium whitespace-nowrap ${badgeCls}`}>
                        {daysLabel}
                    </span>
                </div>
            </div>
        </div>
    );
}

export function Hero({ nextEntry, hasRif }: HeroProps) {
    return (
        <header className="relative rounded-2xl overflow-hidden border border-border-light bg-surface-1">
            {/* Subtle tinted background layer */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background:
                        "radial-gradient(ellipse 60% 80% at 0% 50%, color-mix(in srgb, var(--primary-500) 5%, transparent), transparent)",
                }}
                aria-hidden
            />
            <div className="relative px-5 sm:px-8 py-7 sm:py-9 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-start md:items-center">
                {/* Left column */}
                <div className="flex flex-col gap-5 min-w-0">
                    {/* Badge */}
                    <span className="inline-flex self-start items-center gap-1.5 h-6 px-2.5 rounded-full border border-border-light bg-surface-2 text-[10px] font-mono uppercase tracking-[0.18em] text-text-tertiary">
                        <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" aria-hidden />
                        Providencia SNAT/2025/000091 · SENIAT
                    </span>

                    <div className="flex flex-col gap-2">
                        {/* H1 */}
                        <h1 className="text-[26px] sm:text-[32px] font-mono font-bold tracking-[-0.025em] leading-[1.05] text-text-primary flex items-center gap-3">
                            <span
                                className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary-50 border border-primary-200 text-primary-500 flex items-center justify-center hidden sm:flex dark:bg-primary-50/10 dark:border-primary-300/20"
                                aria-hidden
                            >
                                <CalendarDays size={18} strokeWidth={1.75} />
                            </span>
                            Calendario Tributario SENIAT
                        </h1>

                        {/* Tagline */}
                        <p className="text-[13px] sm:text-[14px] text-text-tertiary max-w-[500px] leading-relaxed font-mono">
                            Fechas de declaración y pago de impuestos en Venezuela.{" "}
                            <span className="text-text-secondary font-medium">Gratis, sin registro.</span>
                        </p>
                    </div>

                    {/* Quick stats pills */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {(["IVA mensual", "ISLR anual", "IGTF", "LOCTI"] as const).map((label) => (
                            <span
                                key={label}
                                className="inline-flex items-center gap-1 h-5 px-2 rounded border border-border-light bg-surface-2 text-[10px] font-mono text-text-tertiary"
                            >
                                <ArrowRight size={8} strokeWidth={2.5} aria-hidden />
                                {label}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Right column — next obligation card */}
                <NextObligationCard entry={hasRif ? nextEntry : null} />
            </div>
        </header>
    );
}
