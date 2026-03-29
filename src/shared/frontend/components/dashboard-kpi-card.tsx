"use client";

// Shared dashboard KPI card.
// Displays a single operational metric with a label and color-coded value.
// Reused across Payroll, Inventory, Documents, Accounting, and future module dashboards.
// Constraint: renders only display — no click or mutation logic.

import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

interface DashboardKpiCardProps {
    label:    string;
    value:    string | number;
    color?:   "primary" | "success" | "danger" | "warning" | "default";
    loading?: boolean;
    icon?:    LucideIcon;
}

const COLOR_CONFIG: Record<
    NonNullable<DashboardKpiCardProps["color"]>,
    { text: string; bg: string; border: string; glow: string }
> = {
    primary: {
        text:   "text-primary-500",
        bg:     "bg-primary-500/10",
        border: "border-primary-500/20",
        glow:   "shadow-[0_0_15px_rgba(var(--primary-500-rgb),0.1)]",
    },
    success: {
        text:   "text-text-success",
        bg:     "bg-text-success/10",
        border: "border-text-success/20",
        glow:   "shadow-[0_0_15px_rgba(var(--text-success-rgb),0.1)]",
    },
    danger: {
        text:   "text-danger-500",
        bg:     "bg-danger-500/10",
        border: "border-danger-500/20",
        glow:   "shadow-[0_0_15px_rgba(var(--danger-500-rgb),0.1)]",
    },
    warning: {
        text:   "text-[var(--text-warning)]",
        bg:     "bg-[var(--text-warning)]/10",
        border: "border-[var(--text-warning)]/20",
        glow:   "shadow-[0_0_15px_rgba(var(--text-warning-rgb),0.1)]",
    },
    default: {
        text:   "text-foreground",
        bg:     "bg-surface-2",
        border: "border-border-light",
        glow:   "",
    },
};

export function DashboardKpiCard({
    label,
    value,
    color   = "default",
    loading = false,
    icon: Icon,
}: DashboardKpiCardProps) {
    const config = COLOR_CONFIG[color];

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -2 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={`relative overflow-hidden rounded-2xl border ${config.border} bg-surface-1 p-5 transition-all duration-300 hover:shadow-lg ${config.glow}`}
            aria-label={label}
            aria-busy={loading}
        >
            {/* Subtle background gradient */}
            <div className={`absolute -right-4 -top-4 h-24 w-24 rounded-full ${config.bg} blur-3xl`} />

            <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1">
                    <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                        {label}
                    </p>
                    <p
                        className={`text-[28px] font-bold tabular-nums tracking-tight ${config.text}`}
                        aria-live="polite"
                    >
                        {loading ? (
                            <span
                                className="inline-block h-8 w-16 rounded bg-surface-2 animate-pulse"
                                aria-hidden="true"
                            />
                        ) : value}
                    </p>
                </div>

                {Icon && (
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${config.bg} ${config.text} border ${config.border}`}>
                        <Icon size={20} strokeWidth={2.5} />
                    </div>
                )}
            </div>
        </motion.div>
    );
}
