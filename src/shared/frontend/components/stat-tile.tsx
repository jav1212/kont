"use client";

// Shared compact KPI tile.
// A horizontal "icon + label + value + optional sublabel" card used as the
// summary strip above list/table pages (employees, products, etc.).
//
// Distinct from `<DashboardKpiCard>` which is the larger vertical card with
// container-query-driven typography on the dashboards. This tile prioritises
// horizontal density.
//
// Extracted from app/(app)/payroll/employees/page.tsx and
// app/(app)/inventory/products/page.tsx (REQ-003 — /impeccable distill).

import type { ComponentType, ReactNode } from "react";

export type StatTileTone =
    | "default"
    | "primary"
    | "success"
    | "warning"
    | "muted";

interface StatTileProps {
    label:     string;
    value:     ReactNode;
    sublabel?: ReactNode;
    icon:      ComponentType<{ size?: number; strokeWidth?: number }>;
    tone?:     StatTileTone;
    /** Extra classes merged onto the root. */
    className?: string;
}

const TONE_CLS: Record<StatTileTone, string> = {
    default: "bg-surface-2 text-foreground border-border-light",
    primary: "bg-primary-500/10 text-primary-500 border-primary-500/20",
    success: "bg-success/10 text-text-success border-success/20",
    warning: "bg-warning/10 text-text-warning border-warning/20",
    muted:   "bg-surface-2 text-[var(--text-tertiary)] border-border-light",
};

export function StatTile({
    label,
    value,
    sublabel,
    icon: Icon,
    tone = "default",
    className,
}: StatTileProps) {
    return (
        <div
            className={[
                "rounded-xl border border-border-light bg-surface-1 px-5 py-4 shadow-sm",
                "flex items-center gap-4",
                className ?? "",
            ].join(" ")}
        >
            <div
                className={[
                    "h-10 w-10 rounded-xl border flex items-center justify-center flex-shrink-0",
                    TONE_CLS[tone],
                ].join(" ")}
                aria-hidden="true"
            >
                <Icon size={18} strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                    {label}
                </p>
                <p className="font-mono text-[22px] font-semibold tabular-nums text-foreground leading-tight">
                    {value}
                </p>
                {sublabel && (
                    <p className="font-sans text-[12px] text-[var(--text-tertiary)] truncate">
                        {sublabel}
                    </p>
                )}
            </div>
        </div>
    );
}
