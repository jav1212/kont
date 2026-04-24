"use client";

import { AlertTriangle, Clock, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import type { CountdownState } from "../hooks/use-countdown";
import { MONTHS_ES_SHORT } from "../utils/date-helpers";
import { CATEGORY_STYLES } from "../utils/category-colors";
import { AnimatedNumber } from "@/src/modules/tools/frontend/components/animated-number";

interface CountdownBannerProps {
    countdown: CountdownState;
    onViewDetails?: () => void;
}

// Progress bar: maps days remaining to a 0–1 fill
// 0 days = full fill (100%), 30+ days = nearly empty
function daysToProgress(days: number): number {
    if (days <= 0) return 1;
    if (days >= 30) return 0.05;
    return Math.max(0.05, 1 - days / 30);
}

export function CountdownBanner({ countdown, onViewDetails }: CountdownBannerProps) {
    const { entry, days, severity } = countdown;

    if (severity === "none" || !entry) return null;

    const config = {
        urgent: {
            containerCls:  "border-badge-error-border bg-badge-error-bg dark:border-badge-error-border dark:bg-badge-error-bg",
            iconBadgeCls:  "bg-badge-error-bg border-badge-error-border text-text-error",
            textCls:       "text-text-error",
            subCls:        "text-text-error/75",
            pillCls:       "bg-badge-error-bg border-badge-error-border text-text-error",
            progressCls:   "bg-text-error/60",
            trackCls:      "bg-badge-error-border/40",
            icon:          AlertTriangle,
            pulse:         true,
        },
        warning: {
            containerCls:  "border-badge-warning-border bg-badge-warning-bg dark:border-badge-warning-border dark:bg-badge-warning-bg",
            iconBadgeCls:  "bg-badge-warning-bg border-badge-warning-border text-text-warning",
            textCls:       "text-text-warning",
            subCls:        "text-text-warning/75",
            pillCls:       "bg-badge-warning-bg border-badge-warning-border text-text-warning",
            progressCls:   "bg-text-warning/60",
            trackCls:      "bg-badge-warning-border/40",
            icon:          Clock,
            pulse:         false,
        },
        normal: {
            containerCls:  "border-border-light bg-surface-1",
            iconBadgeCls:  "bg-surface-2 border-border-light text-text-tertiary",
            textCls:       "text-text-primary",
            subCls:        "text-text-tertiary",
            pillCls:       "bg-surface-2 border-border-light text-text-secondary",
            progressCls:   "bg-primary-400",
            trackCls:      "bg-border-light",
            icon:          Calendar,
            pulse:         false,
        },
    }[severity];

    const Icon = config.icon;
    const catStyle = CATEGORY_STYLES[entry.category];
    const CatIcon = catStyle.icon;

    const [, monthStr, dayStr] = entry.dueDate.split("-");
    const month = MONTHS_ES_SHORT[parseInt(monthStr, 10) - 1];
    const day = parseInt(dayStr, 10);

    const daysDisplay = days === 0 ? "hoy" : days === 1 ? "mañana" : String(days);
    const daysUnit    = days > 1 ? "días" : null;
    const progress    = daysToProgress(days);

    return (
        <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={["rounded-2xl border overflow-hidden", config.containerCls].join(" ")}
            role="status"
            aria-live="polite"
            aria-label={`Próxima obligación tributaria: ${entry.title}, vence ${days === 0 ? "hoy" : `en ${days} días`}`}
        >
            <div className="px-4 sm:px-5 py-4 flex items-center gap-3 sm:gap-4">
                {/* Icon badge */}
                <div
                    className={[
                        "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border",
                        config.iconBadgeCls,
                    ].join(" ")}
                    aria-hidden
                >
                    <Icon
                        size={18}
                        strokeWidth={2}
                        className={config.pulse ? "animate-icon-pulse" : ""}
                    />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className={["text-[11px] font-mono uppercase tracking-[0.14em] font-medium", config.subCls].join(" ")}>
                            Próximo vencimiento
                        </p>
                        {/* Category badge */}
                        <span
                            className={[
                                "inline-flex items-center gap-1 h-4 px-1.5 rounded border",
                                "text-[9px] font-mono uppercase tracking-[0.12em]",
                                catStyle.borderClass, catStyle.bgClass, catStyle.textClass,
                            ].join(" ")}
                            aria-hidden
                        >
                            <CatIcon size={8} strokeWidth={2.5} />
                            {catStyle.label}
                        </span>
                    </div>
                    <p className={["text-[14px] font-mono font-semibold leading-snug truncate", config.textCls].join(" ")}>
                        {entry.shortTitle}
                        <span className={["font-normal ml-2 tabular-nums text-[13px]", config.subCls].join(" ")}>
                            {day} {month}
                        </span>
                    </p>

                    {/* Progress bar */}
                    <div className={["mt-1 h-1 rounded-full overflow-hidden", config.trackCls].join(" ")} aria-hidden>
                        <motion.div
                            className={["h-full rounded-full", config.progressCls].join(" ")}
                            initial={{ width: 0 }}
                            animate={{ width: `${progress * 100}%` }}
                            transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
                        />
                    </div>
                </div>

                {/* Countdown pill */}
                <div
                    className={[
                        "flex-shrink-0 flex flex-col items-center justify-center px-3 py-2 rounded-xl border min-w-[56px]",
                        config.pillCls,
                    ].join(" ")}
                    aria-hidden
                >
                    <AnimatedNumber
                        value={daysDisplay}
                        className={["text-[22px] font-mono font-bold tabular-nums leading-none", config.textCls].join(" ")}
                    />
                    {daysUnit && (
                        <span className={["text-[9px] font-mono uppercase tracking-[0.12em] mt-0.5", config.subCls].join(" ")}>
                            {daysUnit}
                        </span>
                    )}
                </div>

                {onViewDetails && (
                    <button
                        onClick={onViewDetails}
                        className={[
                            "hidden sm:flex flex-shrink-0 text-[11px] font-mono underline underline-offset-2",
                            "hover:opacity-80 transition-opacity duration-150 whitespace-nowrap",
                            config.subCls,
                        ].join(" ")}
                    >
                        Ver detalles
                    </button>
                )}
            </div>
        </motion.div>
    );
}
