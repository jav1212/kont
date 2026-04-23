"use client";

import { AlertTriangle, Clock, Calendar } from "lucide-react";
import type { CountdownState } from "../hooks/use-countdown";
import { MONTHS_ES_SHORT } from "../utils/date-helpers";

interface CountdownBannerProps {
    countdown: CountdownState;
    onViewDetails?: () => void;
}

export function CountdownBanner({ countdown, onViewDetails }: CountdownBannerProps) {
    const { entry, days, severity } = countdown;

    if (severity === "none" || !entry) return null;

    const config = {
        urgent: {
            bg: "bg-badge-error-bg",
            border: "border-badge-error-border",
            text: "text-text-error",
            icon: AlertTriangle,
            pulse: true,
        },
        warning: {
            bg: "bg-badge-warning-bg",
            border: "border-badge-warning-border",
            text: "text-text-warning",
            icon: Clock,
            pulse: false,
        },
        normal: {
            bg: "bg-surface-2",
            border: "border-border-light",
            text: "text-text-secondary",
            icon: Calendar,
            pulse: false,
        },
    }[severity];

    const Icon = config.icon;

    // Format the due date parts
    const [, monthStr, dayStr] = entry.dueDate.split("-");
    const month = MONTHS_ES_SHORT[parseInt(monthStr, 10) - 1];
    const day = parseInt(dayStr, 10);

    const daysLabel = days === 0 ? "hoy" : days === 1 ? "mañana" : `en ${days} días`;

    return (
        <div
            className={`rounded-xl border ${config.bg} ${config.border} px-4 py-3 flex items-center gap-3`}
            role="status"
            aria-live="polite"
            aria-label={`Próxima obligación tributaria: ${entry.title}, vence en ${days} días`}
        >
            <Icon
                size={16}
                className={[config.text, config.pulse ? "animate-icon-pulse" : ""].join(" ")}
                strokeWidth={2}
            />

            <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-mono ${config.text}`}>
                    <span className="font-bold">{entry.shortTitle}</span>
                    {" — "}
                    <span className="font-bold tabular-nums">
                        {day} {month}
                    </span>
                    {" · "}
                    <span className="tabular-nums">{daysLabel}</span>
                </p>
                <p className="text-[11px] font-mono text-text-tertiary truncate hidden sm:block">
                    {entry.title}
                </p>
            </div>

            {onViewDetails && (
                <button
                    onClick={onViewDetails}
                    className={`text-[11px] font-mono ${config.text} hover:opacity-80 transition-opacity whitespace-nowrap shrink-0 underline underline-offset-2`}
                >
                    Ver detalles
                </button>
            )}
        </div>
    );
}
