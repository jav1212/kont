// Shared page header component for CRUD and catalog pages.
// Renders title, optional subtitle, and an action slot (toolbar buttons).
// Architectural role: shared UI primitive — must not contain business-specific logic.

import type { ReactNode } from "react";

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    /** Action buttons rendered in the right slot. */
    children?: ReactNode;
}

export function PageHeader({ title, subtitle, children }: PageHeaderProps) {
    return (
        <div className="px-8 py-6 border-b border-border-light bg-surface-1">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-[16px] font-bold uppercase tracking-[0.14em] text-foreground">
                        {title}
                    </h1>
                    {subtitle && (
                        <p className="text-[12px] text-foreground/50 uppercase tracking-[0.12em] mt-0.5">
                            {subtitle}
                        </p>
                    )}
                </div>
                {children && (
                    <div className="flex items-center gap-2">
                        {children}
                    </div>
                )}
            </div>
        </div>
    );
}
