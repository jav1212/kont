"use client";

import React, { useId } from "react";

interface BaseSwitchProps {
    isSelected?:    boolean;
    onValueChange?: (value: boolean) => void;
    label?:         string;
    description?:   string;
    isDisabled?:    boolean;
    className?:     string;
}

const InputField = ({
    isSelected = false,
    onValueChange,
    label,
    description,
    isDisabled = false,
    className = "",
}: BaseSwitchProps) => {
    const id = useId();

    return (
        <label
            htmlFor={id}
            className={[
                "inline-flex items-center gap-2.5 select-none",
                isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                className,
            ].join(" ")}
        >
            <span
                id={id}
                role="switch"
                tabIndex={0}
                aria-checked={isSelected}
                onClick={() => { if (!isDisabled) onValueChange?.(!isSelected); }}
                onKeyDown={(e) => { if (!isDisabled && (e.key === " " || e.key === "Enter")) { e.preventDefault(); onValueChange?.(!isSelected); } }}
                className={[
                    "relative inline-flex items-center w-9 h-5 rounded-full transition-colors duration-150 flex-shrink-0 overflow-hidden",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-1",
                    isSelected
                        ? "bg-primary-500"
                        : "bg-neutral-300 dark:bg-neutral-600",
                ].join(" ")}
            >
                <span
                    aria-hidden
                    className={[
                        "inline-block w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-150",
                        isSelected ? "translate-x-[19px]" : "translate-x-[3px]",
                    ].join(" ")}
                />
            </span>

            {(label || description) && (
                <span className="flex flex-col min-w-0">
                    {label && (
                        <span className="font-mono text-[11px] text-foreground leading-none">
                            {label}
                        </span>
                    )}
                    {description && (
                        <span className="font-mono text-[10px] text-neutral-400 leading-tight mt-0.5">
                            {description}
                        </span>
                    )}
                </span>
            )}
        </label>
    );
};

export const BaseSwitch = {
    Field: InputField,
} as const;
