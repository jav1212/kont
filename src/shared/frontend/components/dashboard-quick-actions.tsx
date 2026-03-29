"use client";

// Shared dashboard quick-actions panel.
// Renders a responsive grid of navigation links for fast module access.
// Designed for both web and PWA/mobile usage — touch targets are >= 44px tall.
// Constraint: navigation only, no mutation or side effects.

import Link from "next/link";

export interface QuickAction {
    href:  string;
    label: string;
    desc?: string;
}

interface DashboardQuickActionsProps {
    title?:   string;
    actions:  QuickAction[];
    columns?: 2 | 3;
}

export function DashboardQuickActions({
    title   = "Acciones rápidas",
    actions,
    columns = 3,
}: DashboardQuickActionsProps) {
    const gridCols =
        columns === 2
            ? "grid-cols-1 sm:grid-cols-2"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

    return (
        <div className="flex flex-col gap-3">
            {/* Section heading — maintains document outline for AT */}
            <h2 className="font-mono text-[13px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                {title}
            </h2>
            <div className={`grid ${gridCols} gap-3`}>
                {actions.map((action) => (
                    <Link
                        key={action.href}
                        href={action.href}
                        className="flex flex-col gap-1 min-h-[44px] justify-center rounded-xl border border-border-light bg-surface-1 px-5 py-4 hover:bg-surface-2 hover:border-border-medium transition-colors duration-150 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-1"
                    >
                        <span className="font-mono text-[13px] font-medium text-foreground group-hover:text-primary-500 transition-colors">
                            {action.label}
                        </span>
                        {action.desc && (
                            <span className="font-mono text-[12px] text-[var(--text-tertiary)]">
                                {action.desc}
                            </span>
                        )}
                    </Link>
                ))}
            </div>
        </div>
    );
}
