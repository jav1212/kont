// Shared page header component for CRUD and catalog pages.
// Renders title, optional subtitle, and an action slot (toolbar buttons).
// Architectural role: shared UI primitive — must not contain business-specific logic.

import type { ReactNode } from "react";
import { BetaBadge } from "@/src/shared/frontend/components/beta-badge";

interface PageHeaderProps {
    title: string;
    subtitle?: ReactNode;
    /** Action buttons rendered in the right slot. */
    children?: ReactNode;
    /** When true, renders a BETA pill next to the title. */
    beta?: boolean;
}

export function PageHeader({ title, subtitle, children, beta = false }: PageHeaderProps) {
    return (
        <div className="px-4 sm:px-6 md:px-8 py-4 md:py-6 border-b border-border-light bg-surface-1">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-[16px] font-mono font-bold uppercase tracking-[0.14em] text-foreground">
                            {title}
                        </h1>
                        {beta && <BetaBadge size="sm" />}
                    </div>
                    {subtitle && (
                        <div className="text-[12px] font-mono text-foreground/50 uppercase tracking-[0.12em] mt-0.5">
                            {subtitle}
                        </div>
                    )}
                </div>
                {children && (
                    <div className="flex items-center gap-2 flex-wrap">
                        {children}
                    </div>
                )}
            </div>
        </div>
    );
}
