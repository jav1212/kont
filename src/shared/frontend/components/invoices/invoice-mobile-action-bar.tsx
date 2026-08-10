"use client";

import type { ReactNode } from "react";

interface InvoiceMobileActionBarProps {
    itemCount: number;
    totalLabel: string;
    primaryAction: ReactNode;
    secondaryAction?: ReactNode;
}

export function InvoiceMobileActionBar({ itemCount, totalLabel, primaryAction, secondaryAction }: InvoiceMobileActionBarProps) {
    return (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border-default bg-background/95 px-3 pt-2.5 shadow-[0_-10px_30px_rgba(8,9,16,0.14)] backdrop-blur-md md:hidden">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{itemCount} {itemCount === 1 ? "producto" : "productos"}</span>
                <span className="truncate text-right font-mono text-[14px] font-bold tabular-nums text-foreground">{totalLabel}</span>
            </div>
            <div className={`grid gap-2 ${secondaryAction ? "grid-cols-[auto_1fr]" : "grid-cols-1"}`}>
                {secondaryAction}
                {primaryAction}
            </div>
            <div className="h-[max(0.75rem,env(safe-area-inset-bottom))]" />
        </div>
    );
}
