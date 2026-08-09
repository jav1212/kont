"use client";

import React, { useId, useState, useCallback } from "react";
import { Input, InputProps } from "@heroui/react";
import { APP_SIZES } from "@/src/shared/frontend/sizes";

// ============================================================================
// TYPES
// ============================================================================

type ValueChangeHandler = (value: string) => void;

interface BaseInputFields extends Omit<InputProps, "onValueChange"> {
    helperText?: string;
    error?:      string;
    value?:      string;
    onValueChange?: ValueChangeHandler;
    /**
     * Small uppercase affix rendered inside the input wrapper, left side.
     * Classic Konta use: `Bs.`, `USD`, `V-`, `RIF`, `%`.
     * Takes a short string (≤4 chars) — for icons pass startContent instead.
     */
    prefix?: string;
    /** Same as prefix but rendered on the right side. */
    suffix?: string;
    /**
     * Extra classes merged onto the inner <input> element (after the canonical
     * ones). Typical use: `text-right` for numeric fields, `tracking-wide` for
     * codes. Avoid using this to override colors/borders — the wrapper owns that.
     */
    inputClassName?: string;
    size?: "sm" | "md" | "lg";
}

// ============================================================================
// STYLES — canon: border-default (interactive), rounded-lg, mono, minimal
// ============================================================================

const INPUT_STYLES = {
    inputWrapper: [
        "bg-surface-1",
        // HeroUI's `bordered` variant ships `border-medium` (2px). Force 1px
        // with `!important` so our width wins — a 2px border antialiased over
        // rounded-lg reads as a double stroke on high-DPI displays.
        "!border !border-solid !border-[var(--control-border)]",
        "rounded-lg",
        "!shadow-[0_1px_2px_rgba(0,0,0,0.02)]",
        "transition-[border-color,box-shadow,background-color] duration-150",
        "hover:!border-[var(--control-border-hover)]",
        "group-data-[focus=true]:!border-[var(--control-border-focus)]",
        "group-data-[focus=true]:!shadow-[var(--control-focus-shadow)]",
        "group-data-[focus=true]:data-[hover=true]:!border-[var(--control-border-focus)]",
        "group-data-[focus-visible=true]:!outline-none",
        "group-data-[invalid=true]:!border-error/70",
        "group-data-[invalid=true]:!shadow-[0_0_0_3px_rgba(220,38,38,0.10)]",
        "group-data-[invalid=true]:data-[hover=true]:!border-error/70",
        "group-data-[disabled=true]:!bg-[var(--control-disabled-bg)] group-data-[disabled=true]:opacity-100 group-data-[disabled=true]:cursor-not-allowed",
        "group-data-[readonly=true]:!bg-[var(--control-readonly-bg)]",
    ].join(" "),

    input: [
        "w-full outline-none bg-transparent",
        "font-sans text-[14px] leading-5 text-foreground",
        "placeholder:text-[var(--control-placeholder)]",
        "placeholder:font-sans placeholder:text-[14px]",
        "transition-colors duration-150",
        "tabular-nums",
    ].join(" "),

    /** Affix tile rendered inside the input wrapper. */
    affix: [
        "inline-flex items-center justify-center h-full px-2",
        "font-mono text-[12px] font-semibold uppercase tracking-[0.12em]",
        "text-[var(--text-tertiary)]",
        "select-none",
    ].join(" "),
} as const;

const INPUT_SIZES = {
    sm: { wrapper: "!h-9 !min-h-9", input: "!text-[13px]" },
    md: { wrapper: "!h-10 !min-h-10", input: "!text-[14px]" },
    lg: { wrapper: "!h-12 !min-h-12", input: "!text-[15px]" },
} as const;

// ============================================================================
// ICONS — minimal, thin stroke (parity with BaseButton spinner language)
// ============================================================================

const InfoIcon = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
        className="text-neutral-400 flex-shrink-0 mt-[1px]"
    >
        <circle cx="6.5" cy="6.5" r="5.5" />
        <path d="M6.5 6v3M6.5 4.2h.01" />
    </svg>
);

// ============================================================================
// COMPONENT
// ============================================================================

// Namespace-style export — keeps BaseInput.Field call sites unchanged
// while avoiding the invalid-hook-in-class-static-method lint pattern.
const InputField = ({
    label,
    placeholder,
    helperText,
    error,
    value: externalValue,
    onValueChange,
    type = "text",
    className = "",
    inputClassName,
    startContent,
    endContent,
    prefix,
    suffix,
    isRequired,
    size = "md",
    ...props
}: BaseInputFields) => {
    const id = useId();
    const [internalValue, setInternalValue] = useState("");

    const isControlled = externalValue !== undefined;
    const value = isControlled ? externalValue : internalValue;

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const next = e.target.value;
            if (!isControlled) setInternalValue(next);
            onValueChange?.(next);
        },
        [isControlled, onValueChange]
    );

    // Build affix nodes that merge with any passed startContent/endContent.
    const prefixNode = prefix ? (
        <span className={INPUT_STYLES.affix} aria-hidden="true">{prefix}</span>
    ) : null;
    const suffixNode = suffix ? (
        <span className={INPUT_STYLES.affix} aria-hidden="true">{suffix}</span>
    ) : null;

    const resolvedStart = prefixNode ?? startContent;
    const resolvedEnd = suffixNode ?? endContent;

    return (
        <div className={`flex flex-col gap-0 w-full ${className}`}>

            {/* ── label ──────────────────────────────────────────────── */}
            {label && (
                <label
                    htmlFor={id}
                    className={[
                        `font-mono ${APP_SIZES.text.label} uppercase block ${APP_SIZES.spacing.labelBottom}`,
                        "transition-colors duration-150",
                        "text-neutral-500 dark:text-neutral-400",
                    ].join(" ")}
                >
                    {label}
                    {isRequired && (
                        <span className="text-error/80 ml-1" aria-hidden="true">*</span>
                    )}
                </label>
            )}

            {/* ── input ──────────────────────────────────────────────── */}
            <Input
                id={id}
                type={type}
                value={value}
                onChange={handleChange}
                placeholder={placeholder}
                isRequired={isRequired}
                variant="bordered"
                startContent={resolvedStart}
                endContent={resolvedEnd}
                classNames={{
                    inputWrapper: INPUT_STYLES.inputWrapper,
                    input:        [
                        INPUT_STYLES.input,
                        INPUT_SIZES[size].input,
                        inputClassName,
                    ].filter(Boolean).join(" "),
                    label:        "hidden",
                    innerWrapper: "gap-2",
                }}
                size={size}
                className={`group ${INPUT_SIZES[size].wrapper}`}
                {...props}
            />

            {/* ── helper ─────────────────────────────────────────────── */}
            {/* Error text intentionally NOT rendered here — errors go via
                `notify.error()` (toast). The `error` prop only flips the
                visual `isInvalid` flag (border + label color + icon). */}
            {helperText && !error && (
                <div className={`flex items-start gap-1.5 ${APP_SIZES.spacing.helperTop}`}>
                    <InfoIcon />
                    <p className={[
                        `${APP_SIZES.text.helper} leading-snug`,
                        "text-neutral-500 dark:text-neutral-400",
                    ].join(" ")}>
                        {helperText}
                    </p>
                </div>
            )}
        </div>
    );
};

export const BaseInput = {
    Field: InputField,
} as const;
