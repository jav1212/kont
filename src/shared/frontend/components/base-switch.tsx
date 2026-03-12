"use client";

import React from "react";
import { Switch, SwitchProps } from "@heroui/react";

// ============================================================================
// TYPES
// ============================================================================

interface BaseSwitchProps extends Omit<SwitchProps, "color" | "size"> {
    label?:       string;
    rate?:        string;   // right-side annotation — e.g. "4%", "days"
    description?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export abstract class BaseSwitch {

    static Field = ({
        label,
        rate,
        description,
        className = "",
        ...props
    }: BaseSwitchProps) => (
        <Switch
            color="primary"
            size="sm"
            classNames={{
                base: [
                    "group cursor-pointer select-none",
                    "inline-flex items-center gap-2",
                    className,
                ].join(" "),
                wrapper: [
                    // Fixed size + overflow-hidden to clip the thumb
                    "!w-8 !h-4 !min-w-[2rem]",
                    "!rounded-full !overflow-hidden",
                    "!p-0 !m-0",
                    // Colors
                    "!bg-neutral-200 dark:!bg-neutral-700",
                    "group-data-[selected=true]:!bg-primary-500",
                    "transition-colors duration-200",
                ].join(" "),
                thumb: [
                    // Must be smaller than track height (16px) with room for padding
                    "!w-3 !h-3",
                    "!bg-white !shadow-sm !rounded-full",
                    "transition-transform duration-200",
                ].join(" "),
                label: "flex-1 min-w-0",
            }}
            {...props}
        >
            {(label || rate || description) && (
                <span className="flex items-center justify-between gap-1 min-w-0">
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
                    {rate && (
                        <span className="ml-1 font-mono text-[10px] text-neutral-400 tabular-nums shrink-0">
                            {rate}
                        </span>
                    )}
                </span>
            )}
        </Switch>
    );
}