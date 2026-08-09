"use client";

import { useId, type TextareaHTMLAttributes } from "react";
import { CircleAlert } from "lucide-react";
import { APP_SIZES } from "@/src/shared/frontend/sizes";

export interface BaseTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    helperText?: string;
    error?: string;
    size?: "sm" | "md" | "lg";
}

const SIZES = {
    sm: "min-h-[72px] px-2.5 py-2 text-[13px]",
    md: "min-h-[88px] px-3 py-2.5 text-[14px]",
    lg: "min-h-[104px] px-3.5 py-3 text-[15px]",
} as const;

export function BaseTextarea({
    label,
    helperText,
    error,
    size = "md",
    id: externalId,
    className = "",
    required,
    ...props
}: BaseTextareaProps) {
    const generatedId = useId();
    const id = externalId ?? generatedId;
    const invalid = Boolean(error);

    return (
        <div className="flex w-full flex-col gap-0">
            {label && (
                <label
                    htmlFor={id}
                    className={`mb-1.5 block font-mono ${APP_SIZES.text.label} uppercase text-neutral-500 dark:text-neutral-400`}
                >
                    {label}
                    {required && <span className="ml-1 text-error" aria-hidden="true">*</span>}
                </label>
            )}
            <div className="relative">
                <textarea
                    id={id}
                    data-slot="textarea"
                    required={required}
                    aria-invalid={invalid || undefined}
                    className={[
                        "w-full resize-y rounded-lg border bg-surface-1 font-sans leading-5 text-foreground outline-none",
                        "border-[var(--control-border)] placeholder:text-[var(--control-placeholder)]",
                        "shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-[border-color,box-shadow,background-color] duration-150",
                        "hover:border-[var(--control-border-hover)] focus:border-[var(--control-border-focus)] focus:shadow-[var(--control-focus-shadow)]",
                        "disabled:cursor-not-allowed disabled:bg-[var(--control-disabled-bg)] disabled:text-[var(--text-disabled)]",
                        "read-only:bg-[var(--control-readonly-bg)] read-only:text-[var(--text-secondary)]",
                        invalid ? "!border-error pr-9 !shadow-[0_0_0_3px_rgba(220,38,38,0.10)]" : "",
                        SIZES[size],
                        className,
                    ].join(" ")}
                    {...props}
                />
                {invalid && (
                    <CircleAlert aria-hidden="true" size={15} className="pointer-events-none absolute right-3 top-3 text-error" />
                )}
            </div>
            {helperText && !error && (
                <p className="mt-1.5 font-sans text-[12px] leading-snug text-neutral-500 dark:text-neutral-400">
                    {helperText}
                </p>
            )}
        </div>
    );
}
