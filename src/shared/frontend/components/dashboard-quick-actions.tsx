"use client";

// Shared dashboard quick-actions panel.
// Renders a responsive grid of navigation links for fast module access.
// Designed for both web and PWA/mobile usage — touch targets are >= 44px tall.
// Constraint: navigation only, no mutation or side effects.

import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

export interface QuickAction {
    href:  string;
    label: string;
    desc?: string;
    icon?: LucideIcon;
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
        <div className="flex flex-col gap-4">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)] flex items-center gap-2">
                <span className="w-1 h-3 rounded-full bg-primary-500/50" />
                {title}
            </h2>
            <div className={`grid ${gridCols} gap-4`}>
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
                                className="flex items-center gap-4 rounded-2xl border border-border-light bg-surface-1 p-4 hover:bg-surface-2 hover:border-primary-500/30 transition-all duration-200 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                            >
                                {Icon && (
                                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-surface-2 text-[var(--text-tertiary)] group-hover:bg-primary-500/10 group-hover:text-primary-500 transition-colors border border-border-light group-hover:border-primary-500/20">
                                        <Icon size={22} strokeWidth={2} />
                                    </div>
                                )}
                                <div className="flex flex-col">
                                    <span className="text-[14px] font-semibold text-foreground group-hover:text-primary-500 transition-colors">
                                        {action.label}
                                    </span>
                                    {action.desc && (
                                        <span className="text-[12px] text-[var(--text-tertiary)] line-clamp-1">
                                            {action.desc}
                                        </span>
                                    )}
                                </div>
                            </Link>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
