"use client";

import { CalendarDays } from "lucide-react";
import type { CalendarEntry } from "../data/types";
import { MONTHS_ES_SHORT, daysBetween, todayLocalIso } from "../utils/date-helpers";

interface HeroProps {
    nextEntry: CalendarEntry | null;
    hasRif: boolean;
}

function NextObligationCard({ entry }: { entry: CalendarEntry | null }) {
    const today = todayLocalIso();

    if (!entry) {
        return (
            <div className="min-w-[240px] rounded-xl border border-border-light bg-surface-1 px-5 py-4">
                <div className="animate-pulse flex flex-col gap-2">
                    <div className="h-3 bg-surface-3 rounded-md w-24" />
                    <div className="h-7 bg-surface-3 rounded-md w-40" />
                    <div className="h-3 bg-surface-3 rounded-md w-20" />
                </div>
            </div>
        );
    }

    const [, monthStr, dayStr] = entry.dueDate.split("-");
    const month = MONTHS_ES_SHORT[parseInt(monthStr, 10) - 1];
    const day = parseInt(dayStr, 10);
    const daysLeft = daysBetween(today, entry.dueDate);
    const daysLabel = daysLeft === 0 ? "hoy" : daysLeft === 1 ? "mañana" : `${daysLeft} días`;
    const severity = daysLeft <= 3 ? "urgent" : daysLeft <= 7 ? "warning" : "normal";

    const badgeCls = {
        urgent: "bg-badge-error-bg border-badge-error-border text-text-error",
        warning: "bg-badge-warning-bg border-badge-warning-border text-text-warning",
        normal: "bg-surface-2 border-border-light text-text-secondary",
    }[severity];

    return (
        <div className="min-w-[240px] rounded-xl border border-primary-500 bg-surface-1 px-5 py-4">
            <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-text-tertiary block mb-2">
                Próximo vencimiento
            </span>
            <p className="text-[13px] font-sans font-semibold text-text-primary leading-snug mb-2 line-clamp-2">
                {entry.title}
            </p>
            <div className="flex items-baseline gap-1.5">
                <span className="text-[28px] font-mono font-bold tabular-nums leading-none text-text-primary">
                    {day}
                </span>
                <span className="text-[12px] font-mono uppercase tracking-[0.14em] text-text-tertiary">
                    {month}
                </span>
            </div>
            <span className={`inline-flex items-center h-5 px-2 rounded-md border text-[10px] font-mono uppercase tracking-[0.14em] mt-2 ${badgeCls}`}>
                {daysLabel}
            </span>
        </div>
    );
}

export function Hero({ nextEntry, hasRif }: HeroProps) {
    return (
        <header className="relative rounded-2xl overflow-hidden border border-border-light bg-surface-1">
            <div className="relative px-5 sm:px-8 py-6 sm:py-8 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-start md:items-center">
                {/* Left column */}
                <div className="flex flex-col gap-4 min-w-0">
                    <div className="flex flex-col gap-2">
                        {/* Badge */}
                        <span className="inline-flex self-start items-center gap-1.5 h-6 px-2.5 rounded-full border border-border-light bg-surface-2 text-[10px] font-mono uppercase tracking-[0.18em] text-text-tertiary">
                            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                            Providencia SNAT/2025/000091 · SENIAT
                        </span>

                        {/* H1 */}
                        <h1 className="text-[28px] sm:text-[34px] font-mono font-bold tracking-[-0.02em] leading-[1.05] text-text-primary flex items-center gap-3">
                            <CalendarDays size={28} strokeWidth={1.5} className="text-primary-500 flex-shrink-0 hidden sm:block" />
                            Calendario Tributario SENIAT
                        </h1>

                        {/* Tagline */}
                        <p className="text-[13px] sm:text-[14px] text-text-tertiary max-w-[520px] leading-relaxed font-mono">
                            Consulta tus fechas de declaración y pago de impuestos en Venezuela. Gratis, sin registro.
                        </p>
                    </div>
                </div>

                {/* Right column — next obligation card */}
                <NextObligationCard entry={hasRif ? nextEntry : null} />
            </div>
        </header>
    );
}
