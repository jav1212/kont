"use client";

import type { CalendarEntry } from "../data/types";
import { CATEGORY_STYLES } from "../utils/category-colors";
import { MONTHS_ES_SHORT, daysBetween, todayLocalIso } from "../utils/date-helpers";

interface ObligationCardProps {
    entry: CalendarEntry;
    variant?: "upcoming" | "past" | "next";
    compact?: boolean;
}

export function ObligationCard({ entry, variant, compact = false }: ObligationCardProps) {
    const today = todayLocalIso();
    const resolvedVariant = variant ?? (entry.dueDate < today ? "past" : "upcoming");
    const style = CATEGORY_STYLES[entry.category];
    const Icon = style.icon;

    const [, monthStr, dayStr] = entry.dueDate.split("-");
    const monthName = MONTHS_ES_SHORT[parseInt(monthStr, 10) - 1];
    const day = parseInt(dayStr, 10);
    const daysLeft = daysBetween(today, entry.dueDate);
    const daysLabel =
        daysLeft < 0
            ? `hace ${Math.abs(daysLeft)} d.`
            : daysLeft === 0
            ? "hoy"
            : daysLeft === 1
            ? "mañana"
            : `${daysLeft} d.`;

    const containerCls = {
        upcoming:
            "rounded-xl border border-border-light bg-surface-1 transition-[border-color,box-shadow,opacity] duration-150 ease-out hover:border-border-default hover:shadow-[var(--shadow-sm)]",
        past:
            "rounded-xl border border-border-light bg-surface-2 opacity-45",
        next:
            "rounded-xl border border-primary-400 bg-primary-50 dark:bg-primary-50/8 dark:border-primary-400/60 shadow-[var(--shadow-sm),0_0_0_1px_var(--primary-400)_inset]",
    }[resolvedVariant];

    return (
        <div className={`${containerCls} px-3.5 py-3 flex items-start gap-3`}>
            {/* Date column */}
            <div className="flex flex-col items-center justify-center w-10 flex-shrink-0 text-center pt-0.5">
                <span
                    className={[
                        "font-mono font-bold tabular-nums leading-none",
                        compact ? "text-[20px]" : "text-[22px] sm:text-[26px]",
                        resolvedVariant === "next" ? "text-primary-600 dark:text-primary-400" : "text-foreground",
                    ].join(" ")}
                >
                    {day}
                </span>
                <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-foreground/40 mt-0.5">
                    {monthName}
                </span>
            </div>

            {/* Vertical divider */}
            <div
                className={[
                    "w-px self-stretch flex-shrink-0",
                    resolvedVariant === "next" ? "bg-primary-200 dark:bg-primary-800" : "bg-border-light",
                ].join(" ")}
            />

            {/* Content */}
            <div className="flex flex-col gap-1 min-w-0 flex-1">
                {/* Top row: badge + days */}
                <div className="flex items-center justify-between gap-2">
                    <span
                        className={[
                            "inline-flex items-center gap-1 h-5 px-1.5 rounded border",
                            "text-[10px] font-mono uppercase tracking-[0.14em]",
                            style.borderClass, style.bgClass, style.textClass,
                        ].join(" ")}
                    >
                        <Icon size={9} strokeWidth={2.5} aria-hidden />
                        {style.label}
                    </span>
                    <span
                        className={[
                            "text-[10px] font-mono tabular-nums whitespace-nowrap font-medium",
                            resolvedVariant === "next"
                                ? "text-primary-600 dark:text-primary-400"
                                : "text-foreground/45",
                        ].join(" ")}
                    >
                        {daysLabel}
                    </span>
                </div>

                {/* Title */}
                <p
                    className={[
                        "text-[13px] font-mono font-semibold leading-snug",
                        compact ? "truncate" : "line-clamp-2",
                        resolvedVariant === "next" ? "text-foreground" : "text-foreground",
                    ].join(" ")}
                >
                    {entry.title}
                </p>

                {/* Legal basis (non-compact only) */}
                {!compact && entry.legalBasis && (
                    <p className="text-[11px] font-mono text-foreground/45 leading-snug line-clamp-2">
                        {entry.legalBasis}
                    </p>
                )}

                {/* Rolled note */}
                {entry.rolled && (
                    <p className="text-[10px] font-mono text-foreground/35">
                        Orig. {entry.originalDate} — ajustada por feriado/fin de semana
                    </p>
                )}
            </div>
        </div>
    );
}
