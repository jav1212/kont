"use client";

// Shared dashboard quick-actions panel.
// Renders a responsive grid of navigation links for fast module access.
// Designed for both web and PWA/mobile usage — touch targets are >= 44px tall.
// Constraint: navigation only, no mutation or side effects.

import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { BetaBadge } from "@/src/shared/frontend/components/beta-badge";

export interface QuickAction {
    href:  string;
    label: string;
    desc?: string;
    icon?: LucideIcon;
    /** Marca el card con un pill BETA junto al label. */
    beta?: boolean;
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
        <section className="flex flex-col gap-3">
            <h2 className="font-sans text-[13px] font-semibold text-foreground">
                {title}
            </h2>
            <div className={`grid ${gridCols} gap-2`}>
                {actions.map((action, index) => {
                    const Icon = action.icon;
                    return (
                        <motion.div
                            key={action.href}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05, duration: 0.3 }}
                        >
                            <Link
                                href={action.href}
                                className="group flex min-h-14 items-center gap-3 rounded-lg border border-border-light bg-surface-1 px-3 py-2.5 transition-colors hover:border-border-medium hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
                            >
                                {Icon && (
                                    <div className="flex size-8 flex-shrink-0 items-center justify-center rounded-md bg-surface-2 text-[var(--text-secondary)] transition-colors group-hover:bg-primary-500/10 group-hover:text-primary-500">
                                        <Icon size={16} strokeWidth={1.9} />
                                    </div>
                                )}
                                <div className="flex flex-col min-w-0">
                                    <span className="flex items-center gap-1.5 font-sans text-[13px] font-medium text-foreground transition-colors group-hover:text-primary-500">
                                        <span className="truncate">{action.label}</span>
                                        {action.beta && <BetaBadge />}
                                    </span>
                                    {action.desc && (
                                        <span className="line-clamp-1 font-sans text-[11px] text-[var(--text-tertiary)]">
                                            {action.desc}
                                        </span>
                                    )}
                                </div>
                            </Link>
                        </motion.div>
                    );
                })}
            </div>
        </section>
    );
}
