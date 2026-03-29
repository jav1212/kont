"use client";

// Shared dashboard KPI card.
// Displays a single operational metric with a label and color-coded value.
// Reused across Payroll, Inventory, Documents, Accounting, and future module dashboards.
// Constraint: renders only display — no click or mutation logic.

interface DashboardKpiCardProps {
    label:    string;
    value:    string | number;
    color?:   "primary" | "success" | "danger" | "warning" | "default";
    loading?: boolean;
}

// Uses design-system semantic tokens where available; falls back to primary-500 for brand color.
const COLOR_CLASS: Record<NonNullable<DashboardKpiCardProps["color"]>, string> = {
    primary: "text-primary-500",
    success: "text-text-success",
    danger:  "text-danger-500",
    warning: "text-[var(--text-warning)]",
    default: "text-foreground",
};

export function DashboardKpiCard({
    label,
    value,
    color   = "default",
    loading = false,
}: DashboardKpiCardProps) {
    return (
        <div
            className="rounded-xl border border-border-light bg-surface-1 px-5 py-4"
            aria-label={label}
            aria-busy={loading}
        >
            <p className="font-mono text-[13px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] mb-2">
                {label}
            </p>
            <p
                className={`font-mono text-[24px] font-bold tabular-nums ${COLOR_CLASS[color]}`}
                aria-live="polite"
            >
                {loading ? (
                    <span
                        className="inline-block h-7 w-14 rounded bg-surface-2 animate-pulse"
                        aria-hidden="true"
                    />
                ) : value}
            </p>
        </div>
    );
}
