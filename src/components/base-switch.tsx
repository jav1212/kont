"use client";

import React from "react";
import { Switch, SwitchProps } from "@heroui/react";

// ============================================================================
// TYPES
// ============================================================================

type SwitchSize = "sm" | "md" | "lg";

interface BaseSwitchProps extends Omit<SwitchProps, "size" | "color"> {
    size?:       SwitchSize;
    label?:      string;
    description?: string;
    rate?:       string;  // optional annotation (e.g. "4%", "days")
}

// ============================================================================
// SIZE MAP
// ============================================================================

const SIZE_MAP: Record<SwitchSize, {
    track:  string;
    thumb:  string;
    label:  string;
    desc:   string;
}> = {
    sm: {
        track: "w-7 h-[15px]",
        thumb: "w-[11px] h-[11px] top-[2px] group-data-[selected=true]:translate-x-[14px] translate-x-[2px]",
        label: "font-mono text-[11px]",
        desc:  "font-mono text-[10px]",
    },
    md: {
        track: "w-9 h-5",
        thumb: "w-3.5 h-3.5 top-[3px] group-data-[selected=true]:translate-x-[18px] translate-x-[3px]",
        label: "font-mono text-[12px]",
        desc:  "font-mono text-[11px]",
    },
    lg: {
        track: "w-11 h-6",
        thumb: "w-[18px] h-[18px] top-[3px] group-data-[selected=true]:translate-x-[22px] translate-x-[3px]",
        label: "font-mono text-[13px]",
        desc:  "font-mono text-[12px]",
    },
};

// ============================================================================
// COMPONENT
// ============================================================================

export abstract class BaseSwitch {

    /**
     * Standard labeled switch.
     *
     * @example
     * <BaseSwitch.Field
     *   label="SSO"
     *   rate="4%"
     *   isSelected={deductions.sso}
     *   onValueChange={v => setDeductions(d => ({ ...d, sso: v }))}
     * />
     */
    static Field = ({
        label,
        description,
        rate,
        size = "sm",
        isSelected,
        onValueChange,
        isDisabled,
        className = "",
        ...props
    }: BaseSwitchProps) => {
        const s = SIZE_MAP[size];

        return (
            <Switch
                isSelected={isSelected}
                onValueChange={onValueChange}
                isDisabled={isDisabled}
                classNames={{
                    base: [
                        "inline-flex flex-row-reverse items-center justify-between",
                        "gap-2 cursor-pointer select-none group",
                        "data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed",
                        className,
                    ].join(" "),

                    wrapper: [
                        // track
                        s.track,
                        "rounded-full relative flex-shrink-0",
                        "transition-colors duration-200",
                        "bg-neutral-200 dark:bg-neutral-700",
                        "group-data-[selected=true]:bg-primary-500",
                        // focus ring on wrapper
                        "group-data-[focus-visible=true]:ring-2",
                        "group-data-[focus-visible=true]:ring-primary-500/30",
                        "group-data-[focus-visible=true]:ring-offset-1",
                    ].join(" "),

                    thumb: [
                        // knob
                        s.thumb,
                        "absolute rounded-full bg-white shadow-sm",
                        "transition-transform duration-200",
                    ].join(" "),

                    label: "flex-1 flex items-center gap-2",

                    startContent: "",
                    endContent:   "",
                    hiddenInput:  "",
                }}
                {...props}
            >
                {/* Label + rate annotation */}
                {(label || rate) && (
                    <div className="flex flex-col gap-0">
                        {label && (
                            <span className={[
                                s.label,
                                "text-foreground leading-none",
                                isDisabled ? "text-neutral-400" : "",
                            ].join(" ")}>
                                {label}
                            </span>
                        )}
                        {description && (
                            <span className={`${s.desc} text-neutral-400 dark:text-neutral-500 mt-0.5`}>
                                {description}
                            </span>
                        )}
                    </div>
                )}
                {rate && (
                    <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500 tabular-nums ml-auto">
                        {rate}
                    </span>
                )}
            </Switch>
        );
    };

    /**
     * Icon switch — no label, square icon-only style.
     * Useful for toolbar toggles or compact settings.
     *
     * @example
     * <BaseSwitch.Icon isSelected={darkMode} onValueChange={setDarkMode}>
     *   <MoonIcon />
     * </BaseSwitch.Icon>
     */
    static Icon = ({
        children,
        isSelected,
        onValueChange,
        isDisabled,
        className = "",
        ...props
    }: Omit<BaseSwitchProps, "label" | "description" | "rate" | "size">) => (
        <Switch
            isSelected={isSelected}
            onValueChange={onValueChange}
            isDisabled={isDisabled}
            classNames={{
                base: [
                    "inline-flex items-center justify-center cursor-pointer group",
                    "w-8 h-8 rounded-lg border transition-colors duration-150",
                    "select-none",
                    isSelected
                        ? "bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400"
                        : "bg-surface-1 border-border-light text-neutral-400 hover:border-border-medium hover:text-foreground",
                    "data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed",
                    "group-data-[focus-visible=true]:ring-2 group-data-[focus-visible=true]:ring-primary-500/30",
                    className,
                ].join(" "),
                wrapper: "hidden",
                thumb:   "hidden",
                label:   "flex items-center justify-center w-full h-full",
                hiddenInput: "",
            }}
            {...props}
        >
            {children}
        </Switch>
    );
}