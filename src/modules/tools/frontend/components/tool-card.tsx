"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

interface ToolCardBaseProps {
    /** Lucide icon rendered inside the icon tile. */
    icon: ReactNode;
    title: string;
    description: string;
    /** Optional content slot rendered below the description — e.g. status mini-stats. */
    metrics?: ReactNode;
    /** Optional badge label (tone-neutral, used for "Próximamente" etc). */
    badge?: string;
}

interface ToolCardActiveProps extends ToolCardBaseProps {
    variant: "active";
    href: string;
}

interface ToolCardSoonProps extends ToolCardBaseProps {
    variant: "soon";
    /** `soon` cards are never anchors — href is forbidden. */
    href?: never;
}

type ToolCardProps = ToolCardActiveProps | ToolCardSoonProps;

/**
 * Card for the /tools dashboard grid.
 *
 * Variants:
 *  - `active` — whole card is a single `<Link>`. Children (metrics slot) are
 *    purely decorative divs — never nest another anchor inside.
 *  - `soon` — rendered as `<div aria-disabled="true">`. Not focusable, not
 *    clickable. A discreet "Próximamente" badge is shown.
 */
export function ToolCard(props: ToolCardProps) {
    const { icon, title, description, metrics, badge, variant } = props;

    const content = (
        <>
            <div className="flex items-start justify-between gap-3">
                <div
                    className={[
                        "flex h-11 w-11 items-center justify-center rounded-xl border",
                        variant === "active"
                            ? "border-primary-500 bg-surface-2 text-primary-600 dark:text-primary-400"
                            : "border-border-light bg-surface-2 text-foreground/50",
                    ].join(" ")}
                >
                    {icon}
                </div>

                {variant === "soon" && (
                    <span className="inline-flex items-center h-6 px-2 rounded-md border border-border-light bg-surface-2 text-[10px] font-mono uppercase tracking-[0.14em] text-foreground/60">
                        {badge ?? "Próximamente"}
                    </span>
                )}
                {variant === "active" && badge && (
                    <span className="inline-flex items-center h-6 px-2 rounded-md border border-primary-500 bg-surface-2 text-[10px] font-mono uppercase tracking-[0.14em] text-primary-600 dark:text-primary-400">
                        {badge}
                    </span>
                )}
            </div>

            <div className="flex flex-col gap-1.5 min-w-0 mt-4">
                <h3 className="text-[16px] font-mono font-bold tracking-[-0.01em] text-foreground leading-tight">
                    {title}
                </h3>
                <p className="text-[13px] text-foreground/60 leading-relaxed">
                    {description}
                </p>
            </div>

            {metrics && <div className="mt-4 min-w-0">{metrics}</div>}

            {variant === "active" && (
                <div className="mt-5 flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-[0.12em] text-foreground/55 group-hover:text-foreground transition-colors">
                        Abrir herramienta
                    </span>
                    <ArrowRight
                        size={14}
                        className="text-foreground/30 group-hover:text-foreground transition-transform group-hover:translate-x-0.5"
                    />
                </div>
            )}
            {variant === "soon" && (
                <div className="mt-5">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-[0.12em] text-foreground/40">
                        En desarrollo
                    </span>
                </div>
            )}
        </>
    );

    if (variant === "active") {
        return (
            <Link
                href={props.href}
                className="group relative flex flex-col rounded-xl border border-border-light bg-surface-1 p-5 hover:border-border-medium transition-colors"
            >
                {content}
            </Link>
        );
    }

    return (
        <div
            aria-disabled="true"
            className="relative flex flex-col rounded-xl border border-border-light bg-surface-1 p-5 opacity-70 cursor-not-allowed"
        >
            {content}
        </div>
    );
}
