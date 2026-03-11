"use client";

import React from "react";
import { Checkbox, CheckboxProps } from "@heroui/react";

interface BaseCheckboxProps extends Omit<CheckboxProps, "color" | "size" | "radius"> {
    label?: string;
    rate?: string;
}

export abstract class BaseCheckbox {
    static Field = ({ label, rate, className = "", ...props }: BaseCheckboxProps) => (
        <Checkbox
            color="primary"
            disableAnimation
            classNames={{
                base: `inline-flex max-w-full w-full items-center gap-2 py-1 px-0 m-0 ${className}`,
                wrapper: [
                    "!w-3.5 !h-3.5 !min-w-[14px] !min-h-[14px]", // Tamaño técnico forzado
                    "m-0 rounded-[3px] border-border-light",
                    "after:bg-primary-500 before:border-border-medium",
                ].join(" "),
                label: "flex-1 p-0",
            }}
            {...props}
        >
            <div className="flex items-center justify-between gap-2 w-full font-mono leading-none">
                {label && (
                    <span className="text-[11px] uppercase tracking-wider text-foreground">
                        {label.replace(/ /g, "_")}
                    </span>
                )}
                
                {rate && (
                    <span className="text-[10px] text-neutral-500 tabular-nums px-1 bg-neutral-100 rounded border border-border-light/30">
                        {rate}
                    </span>
                )}
            </div>
        </Checkbox>
    );
}