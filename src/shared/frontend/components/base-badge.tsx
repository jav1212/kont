"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import { APP_SIZES } from "@/src/shared/frontend/sizes";

// ============================================================================
// TYPES — canon: 11 px mono uppercase, tracking 0.08em, rounded-sm, 1 px border
// ============================================================================

type BadgeVariant =
    | "success"
    | "warning"
    | "error"
    | "info"
    | "neutral"
    | "primary";

type BadgeSize = "sm" | "md";

interface BaseBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?:  BadgeVariant;
    size?:     BadgeSize;
    /** Small coloured dot on the left — status-chip style */
    dot?:      boolean;
    /** Lucide icon on the left (mutually exclusive with dot; icon wins) */
    icon?:     LucideIcon;
    /** Numeric/slug chip that shouldn't be uppercased (e.g. "BCV · 79,59") */
    noUppercase?: boolean;
}

// ============================================================================
// STYLE MAP — semantic variants reuse the .badge-* utilities from globals.css
// so light/dark parity comes for free. Neutral + primary are custom because
// they don't have badge utility classes.
// ============================================================================

const VARIANT_STYLES: Record<BadgeVariant, string> = {
    success: "badge-success border",
    warning: "badge-warning border",
    error:   "badge-error   border",
    info:    "badge-info    border",

    neutral: [
        "bg-surface-2 border border-border-light",
        "text-[var(--text-secondary)]",
    ].join(" "),

    // "Nuevo" / primary tinted chip — uses the same recipe as the preview card
    primary: [
        "bg-primary-50 border border-primary-200",
        "text-primary-600",
        "dark:bg-primary-500/10 dark:border-primary-500/30",
        "dark:text-primary-500",
    ].join(" "),
};

const SIZE_STYLES: Record<BadgeSize, string> = {
    // sm → used inside dense tables (kardex, movements)
    sm: "h-[20px] px-1.5 gap-1",
    // md → default chip; status column
    md: "h-[22px] px-2 gap-1.5",
};

// ============================================================================
// COMPONENT
// ============================================================================

export function BaseBadge({
    variant = "neutral",
    size = "md",
    dot = false,
    icon: Icon,
    noUppercase = false,
    className = "",
    children,
    ...rest
}: BaseBadgeProps) {
    return (
        <span
            className={[
                "inline-flex items-center",
                "rounded-sm font-mono font-semibold",
                APP_SIZES.text.badge,        // 11 px tracking-wide
                "tabular-nums",
                noUppercase ? "" : "uppercase",
                SIZE_STYLES[size],
                VARIANT_STYLES[variant],
                className,
            ].join(" ")}
            {...rest}
        >
            {Icon
                ? <Icon size={size === "sm" ? 11 : 12} strokeWidth={2} className="flex-shrink-0" />
                : dot && (
                    <span
                        aria-hidden="true"
                        className="w-[6px] h-[6px] rounded-full bg-current flex-shrink-0"
                    />
                )
            }
            {children}
        </span>
    );
}
