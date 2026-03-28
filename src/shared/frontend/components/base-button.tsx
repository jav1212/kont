"use client";

import React from "react";
import type { ElementType } from "react";
import { Button, ButtonProps } from "@heroui/react";
import { APP_SIZES } from "@/src/shared/frontend/sizes";

// ============================================================================
// TYPES
// ============================================================================

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "dangerOutline";
type ButtonSize    = "sm" | "md" | "lg";

interface BaseButtonProps extends Omit<ButtonProps, "variant" | "color" | "size"> {
    variant?:    ButtonVariant;
    size?:       ButtonSize;
    leftIcon?:   React.ReactNode;
    rightIcon?:  React.ReactNode;
    loading?:    boolean;
    fullWidth?:  boolean;
    // Polymorphic rendering — pass as={Link} href="/path" for Next.js client navigation.
    // HeroUI Button forwards these to the underlying element.
    as?:         ElementType;
    href?:       string;
}

// ============================================================================
// STYLE MAP — canon: border-light, rounded-lg, mono, minimal
// ============================================================================

const VARIANT_STYLES: Record<ButtonVariant, string> = {
    primary: [
        "bg-primary-500 text-white",
        "border border-primary-500",
        "hover:bg-primary-600 hover:border-primary-600",
        "active:bg-primary-700",
        "shadow-[0_1px_2px_rgba(0,0,0,.08)]",
    ].join(" "),

    secondary: [
        "bg-surface-2 text-foreground",
        "border border-border-light",
        "hover:bg-neutral-100 dark:hover:bg-neutral-800",
        "hover:border-border-medium",
        "active:bg-neutral-200 dark:active:bg-neutral-700",
    ].join(" "),

    ghost: [
        "bg-transparent text-neutral-600 dark:text-neutral-400",
        "border border-transparent",
        "hover:bg-neutral-100 dark:hover:bg-neutral-800/60",
        "hover:text-foreground",
        "active:bg-neutral-200 dark:active:bg-neutral-800",
    ].join(" "),

    danger: [
        "bg-error text-white",
        "border border-error",
        "hover:bg-error/90 hover:border-error/90",
        "active:bg-error/80",
        "shadow-[0_1px_2px_rgba(0,0,0,.08)]",
    ].join(" "),

    outline: [
        "bg-transparent text-foreground",
        "border border-border-light",
        "hover:border-border-medium",
        "hover:bg-neutral-50 dark:hover:bg-neutral-900/40",
        "active:bg-neutral-100 dark:active:bg-neutral-900",
    ].join(" "),

    // Soft red outline — used for destructive bulk actions before confirmation.
    dangerOutline: [
        "bg-red-500/5 text-red-500",
        "border border-red-500/30",
        "hover:bg-red-500/10 hover:border-red-500/40",
        "active:bg-red-500/15",
    ].join(" "),
};

const SIZE_STYLES: Record<ButtonSize, string> = {
    sm: APP_SIZES.button.sm,
    md: APP_SIZES.button.md,
    lg: APP_SIZES.button.lg,
};

// ============================================================================
// LOADING SPINNER
// ============================================================================

const Spinner = ({ variant }: { variant: ButtonVariant }) => {
    const color = variant === "primary" || variant === "danger"
        ? "text-white/70"
        : "text-neutral-400";
    return (
        <svg
            width="13" height="13" viewBox="0 0 13 13"
            fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round"
            className={`animate-spin flex-shrink-0 ${color}`}
        >
            <circle cx="6.5" cy="6.5" r="5" strokeDasharray="10 20" />
        </svg>
    );
};

// ============================================================================
// COMPONENT
// ============================================================================

// Namespace-style export — keeps BaseButton.Root / BaseButton.Icon call
// sites unchanged while removing the abstract-class anti-pattern.
const ButtonRoot = ({
    children,
    variant   = "primary",
    size      = "md",
    leftIcon,
    rightIcon,
    loading   = false,
    fullWidth = false,
    className = "",
    isDisabled,
    ...props
}: BaseButtonProps) => {
    const disabled = isDisabled || loading;

    return (
        <Button
            isDisabled={disabled}
            disableRipple
            className={[
                // base
                "inline-flex items-center justify-center",
                "font-mono uppercase tracking-[0.1em] font-medium",
                "rounded-lg",
                "transition-colors duration-150",
                "select-none outline-none",
                "focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-1",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                // size
                SIZE_STYLES[size],
                // variant
                VARIANT_STYLES[variant],
                // width
                fullWidth ? "w-full" : "",
                className,
            ].join(" ")}
            {...props}
        >
            {loading
                ? <Spinner variant={variant} />
                : leftIcon && <span className="flex-shrink-0">{leftIcon}</span>
            }
            {children && (
                <span className={loading ? "opacity-50" : ""}>{children}</span>
            )}
            {!loading && rightIcon && (
                <span className="flex-shrink-0">{rightIcon}</span>
            )}
        </Button>
    );
};

/** Icon-only button */
const ButtonIcon = ({
    children,
    variant   = "ghost",
    size      = "md",
    loading   = false,
    className = "",
    isDisabled,
    ...props
}: Omit<BaseButtonProps, "leftIcon" | "rightIcon" | "fullWidth">) => {
    const disabled = isDisabled || loading;

    const iconSize: Record<ButtonSize, string> = {
        sm: APP_SIZES.iconButton.sm,
        md: APP_SIZES.iconButton.md,
        lg: APP_SIZES.iconButton.lg,
    };

    return (
        <Button
            isDisabled={disabled}
            disableRipple
            isIconOnly
            className={[
                "inline-flex items-center justify-center flex-shrink-0",
                "rounded-lg",
                "transition-colors duration-150",
                "select-none outline-none",
                "focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-1",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                iconSize[size],
                VARIANT_STYLES[variant],
                className,
            ].join(" ")}
            {...props}
        >
            {loading ? <Spinner variant={variant} /> : children}
        </Button>
    );
};

export const BaseButton = {
    Root: ButtonRoot,
    Icon: ButtonIcon,
} as const;
