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
    const resolvedVariant = variant ?? (
        entry.dueDate < today ? "past" : "upcoming"
    );
    const style = CATEGORY_STYLES[entry.category];
    const Icon = style.icon;

    const [, monthStr, dayStr] = entry.dueDate.split("-");
    const monthName = MONTHS_ES_SHORT[parseInt(monthStr, 10) - 1];
    const day = parseInt(dayStr, 10);
    const daysLeft = daysBetween(today, entry.dueDate);
    const daysLabel = daysLeft < 0
        ? `hace ${Math.abs(daysLeft)} d.`
        : daysLeft === 0
        ? "hoy"
        : daysLeft === 1
        ? "mañana"
        : `${daysLeft} días`;

    const containerCls = {
        upcoming: "rounded-xl border border-border-light bg-surface-1 px-4 py-3 flex items-start gap-4 transition-all duration-200 hover:border-border-medium hover:shadow-md hover:-translate-y-px",
        past: "rounded-xl border border-border-light bg-surface-2 px-4 py-3 flex items-start gap-4 opacity-55",
        next: "rounded-xl border border-primary-500 bg-primary-50 px-4 py-3 flex items-start gap-4 shadow-sm dark:bg-primary-50/8 dark:border-primary-500",
    }[resolvedVariant];

    return (
        <div className={`${containerCls} min-h-[80px]`}>
            {/* Date column */}
            <div className="flex flex-col items-center w-12 flex-shrink-0 text-center">
                <span className={`${compact ? "text-[18px]" : "text-[22px] sm:text-[28px]"} font-mono font-bold tabular-nums leading-none text-text-primary`}>
                    {day}
                </span>
                <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-text-tertiary">
                    {monthName}
                </span>
            </div>

            {/* Vertical divider */}
            <div className="w-px self-stretch bg-border-light flex-shrink-0" />

            {/* Content */}
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    {/* Badge */}
                    <span
                        className={`inline-flex items-center gap-1 h-5 px-2 rounded-md border text-[10px] font-mono uppercase tracking-[0.14em] ${style.borderClass} ${style.bgClass} ${style.textClass}`}
                    >
                        <Icon size={10} strokeWidth={2} />
                        {style.label}
                    </span>
                    {/* Days to */}
                    <span className="text-[10px] font-mono tabular-nums text-text-tertiary whitespace-nowrap">
                        {daysLabel}
                    </span>
                </div>
                <p className="text-[13px] font-sans font-semibold text-text-primary leading-snug truncate">
                    {entry.title}
                </p>
                {!compact && (
                    <p className="text-[11px] font-mono text-text-tertiary leading-snug line-clamp-2">
                        {entry.legalBasis}
                    </p>
                )}
                {entry.rolled && (
                    <p className="text-[10px] font-mono text-text-disabled">
                        Orig. {entry.originalDate} — ajustada por feriado/fin de semana
                    </p>
                )}
            </div>
        </div>
    );
}
