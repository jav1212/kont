"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

interface ToolHighlightProps {
    /** Lucide icon component (rendered inside the icon tile). */
    icon: ReactNode;
    /** Uppercase category label shown above the title. */
    label: string;
    title: string;
    description: string;
    href: string;
    ctaLabel: string;
    /** Optional meta slot rendered between description and CTA — e.g. the mini USD rate. */
    meta?: ReactNode;
    /** The big preview slot on the right — e.g. the DualRateChart. */
    children: ReactNode;
}

/**
 * Hero-adjacent "featured tool" card. Split layout: a meta sidebar (280px on lg)
 * with icon tile + label + title + description + optional meta + CTA, and a
 * preview slot (the chart / map / etc.) on the right that fills the remainder.
 *
 * The CTA is a plain Link (not a nested anchor) — callers pass interactive
 * children (the chart renders inside a non-link container).
 */
export function ToolHighlight({
    icon,
    label,
    title,
    description,
    href,
    ctaLabel,
    meta,
    children,
}: ToolHighlightProps) {
    return (
        <div className="rounded-2xl border border-border-light bg-surface-1 overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
                {/* Sidebar — meta */}
                <aside className="flex flex-col gap-4 p-5 sm:p-6 border-b border-border-light lg:border-b-0 lg:border-r lg:border-border-light">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary-500 bg-surface-2 text-primary-600 dark:text-primary-400">
                        {icon}
                    </div>

                    <div className="flex flex-col gap-2 min-w-0">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-foreground/55">
                            {label}
                        </span>
                        <h3 className="text-[20px] sm:text-[22px] font-mono font-bold tracking-[-0.01em] leading-tight text-foreground">
                            {title}
                        </h3>
                        <p className="text-[13px] text-foreground/60 leading-relaxed">
                            {description}
                        </p>
                    </div>

                    {meta && <div className="min-w-0">{meta}</div>}

                    <Link
                        href={href}
                        className="mt-auto inline-flex items-center gap-1.5 self-start h-9 px-3 rounded-lg border border-border-light bg-surface-2 hover:border-border-medium hover:bg-background text-[11px] font-mono font-bold uppercase tracking-[0.12em] text-foreground/70 hover:text-foreground transition-colors group"
                    >
                        {ctaLabel}
                        <ArrowRight
                            size={12}
                            className="transition-transform group-hover:translate-x-0.5"
                        />
                    </Link>
                </aside>

                {/* Preview slot */}
                <div className="p-5 sm:p-6 min-w-0">{children}</div>
            </div>
        </div>
    );
}
