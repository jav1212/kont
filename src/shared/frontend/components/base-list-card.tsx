"use client";

import React from "react";
import { ChevronRight } from "lucide-react";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";

export interface ListCardRow {
    label: string;
    value: React.ReactNode;
    align?: "left" | "right";
    numeric?: boolean;
}

interface BaseListCardProps {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    badge?: React.ReactNode;
    rows?: ListCardRow[];
    status?: React.ReactNode;
    href?: string;
    onClick?: () => void;
    className?: string;
    chevron?: boolean;
}

const baseShellClasses = [
    "block w-full text-left",
    "rounded-xl border border-border-light bg-surface-1 shadow-sm",
    "transition-colors duration-150",
    "hover:bg-surface-2 hover:border-border-medium",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-1",
].join(" ");

export function BaseListCard({
    title,
    subtitle,
    badge,
    rows,
    status,
    href,
    onClick,
    className = "",
    chevron = true,
}: BaseListCardProps) {
    const interactive = Boolean(href || onClick);
    const hasFooter = Boolean(status) || (interactive && chevron);

    const body = (
        <>
            <div className="flex items-start gap-3 px-4 pt-3 pb-3">
                <div className="min-w-0 flex-1">
                    <p className="font-mono text-[12px] uppercase tracking-[0.12em] font-bold text-foreground truncate">
                        {title}
                    </p>
                    {subtitle && (
                        <p className="mt-0.5 font-sans text-[13px] text-[var(--text-secondary)] truncate leading-snug">
                            {subtitle}
                        </p>
                    )}
                </div>
                {badge && <div className="flex-shrink-0">{badge}</div>}
            </div>

            {rows && rows.length > 0 && (
                <ul className="border-t border-border-light divide-y divide-border-light/60">
                    {rows.map((row, idx) => (
                        <li
                            key={`${row.label}-${idx}`}
                            className="flex items-center justify-between gap-3 px-4 py-2.5"
                        >
                            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                                {row.label}
                            </span>
                            <span
                                className={[
                                    "text-[13px] text-foreground min-w-0 truncate",
                                    row.align === "left" ? "text-left" : "text-right",
                                    row.numeric ? "tabular-nums" : "",
                                ].join(" ")}
                            >
                                {row.value}
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            {hasFooter && (
                <div className="flex items-center justify-between gap-3 border-t border-border-light px-4 py-2.5">
                    <div className="min-w-0">{status}</div>
                    {interactive && chevron && (
                        <ChevronRight
                            size={16}
                            strokeWidth={2}
                            className="flex-shrink-0 text-[var(--text-tertiary)]"
                        />
                    )}
                </div>
            )}
        </>
    );

    const classes = [baseShellClasses, "min-h-[64px]", className].filter(Boolean).join(" ");

    if (href) {
        return (
            <Link href={href} className={classes}>
                {body}
            </Link>
        );
    }

    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={classes}>
                {body}
            </button>
        );
    }

    return <div className={classes}>{body}</div>;
}
