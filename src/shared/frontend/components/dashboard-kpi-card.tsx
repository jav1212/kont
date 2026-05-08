"use client";

// Shared dashboard KPI card.
// Displays a single operational metric with a label and color-coded value.
// Reused across Payroll, Inventory, Documents, Accounting, and future module dashboards.
// Constraint: renders only display — no click or mutation logic.
//
// Visual policy: numbers are the interface. No glow shadows, no ambient bloom,
// no hover-lift. Trend indicator + tabular numerics carry the information.
// (REQ-005 — /impeccable distill)

import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

type TrendDirection = "up" | "down" | "flat";

interface TrendValue {
    direction: TrendDirection;
    /** Already-formatted string, e.g. "4,2%" — shown as-is in mono tabular-nums. */
    label: string;
}

interface DashboardKpiCardProps {
    label:      string;
    value:      string | number;
    color?:     "primary" | "success" | "danger" | "warning" | "default";
    loading?:   boolean;
    icon?:      LucideIcon;
    /** Small secondary line under the value ("de 25 empleados"). */
    sublabel?:  string;
    /** Delta indicator rendered on the top-right of the card. */
    trend?:     TrendValue;
    /** Explanatory hint rendered as sans-serif footer ("Actualizado hace 3 h"). */
    hint?:      string;
    /** Extra classes merged onto the root (e.g. `h-full` when wrapped in a Link inside a grid). */
    className?: string;
}

// ============================================================================
// STYLE MAP — token-driven colour system, light/dark parity via CSS vars
// ============================================================================

const COLOR_CONFIG: Record<
    NonNullable<DashboardKpiCardProps["color"]>,
    { text: string; bg: string; border: string }
> = {
    primary: {
        text:   "text-primary-500",
        bg:     "bg-primary-500/10",
        border: "border-primary-500/20",
    },
    success: {
        text:   "text-text-success",
        bg:     "bg-text-success/10",
        border: "border-text-success/20",
    },
    danger: {
        text:   "text-danger-500",
        bg:     "bg-danger-500/10",
        border: "border-danger-500/20",
    },
    warning: {
        text:   "text-[var(--text-warning)]",
        bg:     "bg-[var(--text-warning)]/10",
        border: "border-[var(--text-warning)]/20",
    },
    default: {
        text:   "text-foreground",
        bg:     "bg-surface-2",
        border: "border-border-light",
    },
};

const TREND_CONFIG: Record<TrendDirection, { icon: LucideIcon; cls: string }> = {
    up:   { icon: TrendingUp,   cls: "text-text-success" },
    down: { icon: TrendingDown, cls: "text-text-error" },
    flat: { icon: Minus,        cls: "text-[var(--text-tertiary)]" },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function DashboardKpiCard({
    label,
    value,
    color    = "default",
    loading  = false,
    icon: Icon,
    sublabel,
    trend,
    hint,
    className,
}: DashboardKpiCardProps) {
    const config = COLOR_CONFIG[color];

    return (
        <div
            className={[
                "@container rounded-2xl border bg-surface-1 p-5 shadow-sm",
                config.border,
                className ?? "",
            ].join(" ")}
            aria-label={label}
            aria-busy={loading}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1.5 min-w-0">
                    {/* ── label — mono 12 px uppercase 0.14em (canon) ───── */}
                    <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                        {label}
                    </p>

                    {/* ── value — kpi token: mono, tabular, tight; scales with card width via container queries ── */}
                    <p
                        className={`font-mono text-[18px] @[220px]:text-[20px] @[260px]:text-[22px] @[300px]:text-[24px] @[340px]:text-[26px] @[380px]:text-[28px] font-bold tabular-nums tracking-[-0.02em] leading-[1] break-words ${config.text}`}
                        aria-live="polite"
                    >
                        {loading ? (
                            <span
                                className="inline-block h-7 w-24 rounded bg-surface-2 animate-pulse"
                                aria-hidden="true"
                            />
                        ) : value}
                    </p>

                    {/* ── sublabel — sans, muted (prose-style) ─────────── */}
                    {sublabel && !loading && (
                        <p className="font-sans text-[11px] @[260px]:text-[12px] text-[var(--text-tertiary)] leading-snug break-words">
                            {sublabel}
                        </p>
                    )}
                </div>

                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {Icon && (
                        <div
                            className={[
                                "flex h-10 w-10 items-center justify-center rounded-xl border",
                                config.bg, config.text, config.border,
                            ].join(" ")}
                            aria-hidden="true"
                        >
                            {/* canon: strokeWidth 2.0 for icons > 16 px */}
                            <Icon size={20} strokeWidth={2} />
                        </div>
                    )}

                    {trend && !loading && (() => {
                        const { icon: TrendIcon, cls } = TREND_CONFIG[trend.direction];
                        return (
                            <span
                                className={[
                                    "inline-flex items-center gap-1",
                                    "font-mono text-[11px] font-semibold tracking-wide tabular-nums",
                                    cls,
                                ].join(" ")}
                                aria-label={`Tendencia ${trend.direction} ${trend.label}`}
                            >
                                <TrendIcon size={11} strokeWidth={2.2} />
                                {trend.label}
                            </span>
                        );
                    })()}
                </div>
            </div>

            {/* ── hint — footer line, prose, 1 sentence max ───────────── */}
            {hint && !loading && (
                <p className="mt-3 pt-3 border-t border-border-light font-sans text-[11px] text-[var(--text-tertiary)] leading-snug">
                    {hint}
                </p>
            )}
        </div>
    );
}
