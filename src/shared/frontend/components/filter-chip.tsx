"use client";

// Shared filter chip for toolbars over tables/lists.
// A button that toggles a filter, optionally showing a count badge.
//
// Extracted from app/(app)/payroll/employees/page.tsx and
// app/(app)/inventory/products/page.tsx (REQ-003 — /impeccable distill).

import type { ReactNode } from "react";

interface FilterChipProps {
    active:    boolean;
    onClick:   () => void;
    children:  ReactNode;
    count?:    number;
    /** Extra classes merged onto the root. */
    className?: string;
}

export function FilterChip({
    active,
    onClick,
    children,
    count,
    className,
}: FilterChipProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={[
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border whitespace-nowrap",
                "font-mono text-[11px] uppercase tracking-[0.12em] font-medium",
                "transition-colors duration-150",
                "focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-1 outline-none",
                active
                    ? "border-primary-500 bg-primary-500/10 text-primary-500"
                    : "border-border-light bg-surface-1 text-[var(--text-secondary)] hover:border-border-default hover:bg-surface-2",
                className ?? "",
            ].join(" ")}
        >
            <span>{children}</span>
            {typeof count === "number" && (
                <span
                    className={[
                        "tabular-nums text-[10px] px-1 rounded",
                        active ? "bg-primary-500/15" : "bg-surface-2 border border-border-light",
                    ].join(" ")}
                >
                    {count}
                </span>
            )}
        </button>
    );
}
