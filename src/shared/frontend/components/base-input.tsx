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
    error?: string;
    value?: string;
    onValueChange?: ValueChangeHandler;
}

// ============================================================================
// STYLES — alineados al canon: border-light, rounded-lg, mono, sobrio
// ============================================================================

const INPUT_STYLES = {
    inputWrapper: [
        "bg-surface-1",
        "border border-border-light",
        "rounded-lg",
        "shadow-[inset_0_1px_2px_rgba(0,0,0,.03)]",
        "dark:shadow-[inset_0_1px_2px_rgba(0,0,0,.15)]",
        "transition-all duration-150",
        "hover:border-border-medium",
        "group-data-[focus=true]:border-primary-400",
        "group-data-[focus=true]:ring-2 group-data-[focus=true]:ring-primary-500/10",
        "group-data-[invalid=true]:border-error/60",
        "group-data-[invalid=true]:ring-2 group-data-[invalid=true]:ring-error/10",
        "group-data-[disabled=true]:opacity-50 group-data-[disabled=true]:cursor-not-allowed",
    ].join(" "),

    input: [
        "w-full outline-none bg-transparent",
        `font-mono ${APP_SIZES.text.input} text-foreground`,
        "placeholder:text-neutral-400 dark:placeholder:text-neutral-600",
        `placeholder:font-mono placeholder:${APP_SIZES.text.placeholder}`,
        "transition-colors duration-150",
        "tabular-nums",
    ].join(" "),
} as const;

// ============================================================================
// ICONS — mínimos, trazo fino
// ============================================================================

const ErrorIcon = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
        className="text-error flex-shrink-0 mt-[1px]"
    >
        <circle cx="6.5" cy="6.5" r="5.5" />
        <path d="M4.5 4.5l4 4M8.5 4.5l-4 4" />
    </svg>
);

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

export abstract class BaseInput {
    protected static readonly STYLES = INPUT_STYLES;

    static Field = ({
        label,
        placeholder,
        helperText,
        error,
        value: externalValue,
        onValueChange,
        type = "text",
        className = "",
        startContent,
        endContent,
        ...props
    }: BaseInputFields) => {
        const id = useId();
        const [internalValue, setInternalValue] = useState("");

        const isControlled = externalValue !== undefined;
        const value = isControlled ? externalValue : internalValue;
        const isInvalid = !!error;

        const handleChange = useCallback(
            (e: React.ChangeEvent<HTMLInputElement>) => {
                const next = e.target.value;
                if (!isControlled) setInternalValue(next);
                onValueChange?.(next);
            },
            [isControlled, onValueChange]
        );

        return (
            <div className={`flex flex-col gap-0 w-full ${className}`}>

                {/* ── label ──────────────────────────────────────────────── */}
                {label && (
                    <label
                        htmlFor={id}
                        className={[
                            `font-mono ${APP_SIZES.text.label} uppercase block ${APP_SIZES.spacing.labelBottom}`,
                            "transition-colors duration-150",
                            isInvalid
                                ? "text-error/80"
                                : "text-neutral-500 dark:text-neutral-400",
                        ].join(" ")}
                    >
                        {label}
                    </label>
                )}

                {/* ── input ──────────────────────────────────────────────── */}
                <Input
                    id={id}
                    type={type}
                    value={value}
                    onChange={handleChange}
                    placeholder={placeholder}
                    isInvalid={isInvalid}
                    variant="bordered"
                    startContent={startContent}
                    endContent={isInvalid && !endContent ? <ErrorIcon /> : endContent}
                    classNames={{
                        inputWrapper: INPUT_STYLES.inputWrapper,
                        input: INPUT_STYLES.input,
                        label: "hidden",
                        innerWrapper: "gap-2",
                    }}
                    className="group min-h-[40px]"
                    {...props}
                />

                {/* ── helper / error ─────────────────────────────────────── */}
                {(helperText || error) && (
                    <div className={`flex items-start gap-1.5 ${APP_SIZES.spacing.helperTop}`}>
                        {error ? <ErrorIcon /> : <InfoIcon />}
                        <p className={[
                            `font-mono ${APP_SIZES.text.helper} leading-snug`,
                            error
                                ? "text-error/80"
                                : "text-neutral-400 dark:text-neutral-500",
                        ].join(" ")}>
                            {error || helperText}
                        </p>
                    </div>
                )}
            </div>
        );
    };
}