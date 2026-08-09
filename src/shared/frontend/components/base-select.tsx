"use client";

import React, { useCallback, useMemo } from "react";
import { Select, SelectItem, Chip, SelectedItems } from "@heroui/react";
import { APP_SIZES } from "@/src/shared/frontend/sizes";

// ============================================================================
// TYPES
// ============================================================================

export interface SelectItemData {
    id: string | number;
    name: string;
    avatar?: string;
    subtitle?: string;
    [key: string]: unknown;
}

export interface BaseSelectProps<T extends SelectItemData> {
    items: T[];
    selectedKeys?: Set<string | number> | "all";
    onSelectionChange?: (keys: Set<string | number>) => void;
    value?: string | number;
    onValueChange?: (value: string) => void;
    label?: string;
    placeholder?: string;
    className?: string;
    isDisabled?: boolean;
    showAvatar?: boolean;
    maxChips?: number;
    variant?: "flat" | "bordered" | "faded" | "underlined";
    color?: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
    selectionMode?: "single" | "multiple";
    size?: "sm" | "md" | "lg";
    error?: string;
    isRequired?: boolean;
}

// ============================================================================
// ICONS
// ============================================================================

const CheckIcon = () => (
    <svg width="11" height="9" viewBox="0 0 11 9" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
        <path d="M1 4.5L4 7.5L10 1" />
    </svg>
);

const ChevronIcon = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
        className="transition-transform duration-150"
    >
        <path d="M3 5L6.5 8.5L10 5" />
    </svg>
);

// ============================================================================
// HELPERS
// ============================================================================

const initials = (name: string) =>
    name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// ============================================================================
// COMPONENT
// ============================================================================

export const BaseSelect = <T extends SelectItemData>({
    items,
    selectedKeys,
    onSelectionChange,
    value,
    onValueChange,
    label,
    placeholder = "Seleccionar...",
    className = "",
    isDisabled = false,
    showAvatar = false,
    maxChips = 2,
    variant = "bordered",
    color = "default",
    selectionMode = "multiple",
    size = "md",
    error,
    isRequired = false,
}: BaseSelectProps<T>) => {

    const resolvedKeys = useMemo(
        () => selectedKeys ?? (value !== undefined ? new Set([String(value)]) : new Set<string>()),
        [selectedKeys, value]
    );

    const handleChipClose = useCallback(
        (keyToRemove: string | number) => {
            if (resolvedKeys === "all") return;
            const next = new Set(resolvedKeys);
            next.delete(String(keyToRemove));
            next.delete(Number(keyToRemove));
            onSelectionChange?.(next);
        },
        [resolvedKeys, onSelectionChange]
    );

    const renderValue = useCallback(
        (selectedItems: SelectedItems<T>) => {
            const visible = selectedItems.slice(0, maxChips);
            const overflow = selectedItems.length - maxChips;

            return (
                <div className="flex flex-wrap gap-1 max-w-[calc(100%-28px)] py-0.5">
                    {visible.map((item) => (
                        <Chip
                            key={item.key}
                            size="sm"
                            variant="flat"
                            classNames={{
                                base: [
                                    "h-[22px]",
                                    "bg-neutral-100 dark:bg-neutral-800",
                                    "border border-border-light",
                                    "rounded-md",
                                ].join(" "),
                                content: [
                                    `font-mono ${APP_SIZES.text.badge} uppercase`,
                                    "text-neutral-600 dark:text-neutral-400",
                                    "px-1",
                                ].join(" "),
                                closeButton: [
                                    "text-neutral-400 hover:text-neutral-600",
                                    "dark:hover:text-neutral-300",
                                    "transition-colors w-3 h-3",
                                ].join(" "),
                            }}
                            onClose={
                                selectionMode === "multiple"
                                    ? () => handleChipClose(item.key as string)
                                    : undefined
                            }
                        >
                            {item.data?.name}
                        </Chip>
                    ))}

                    {overflow > 0 && (
                        <div className={[
                            "inline-flex items-center px-1.5 h-[20px] rounded-md",
                            "bg-neutral-100 dark:bg-neutral-800",
                            "border border-border-light",
                            `font-mono ${APP_SIZES.text.badgeOverflow} text-neutral-500`,
                        ].join(" ")}>
                            +{overflow}
                        </div>
                    )}
                </div>
            );
        },
        [maxChips, handleChipClose, selectionMode]
    );

    const activeKeys =
        resolvedKeys !== "all"
            ? new Set(Array.from(resolvedKeys).map(String))
            : null;

    return (
        <div className={`w-full ${className}`}>
            <Select
                items={items}
                label={label}
                placeholder={placeholder}
                selectionMode={selectionMode}
                selectedKeys={resolvedKeys}
                onSelectionChange={(keys) => {
                    const next = keys as Set<string | number>;
                    onSelectionChange?.(next);
                    if (selectionMode === "single") {
                        onValueChange?.(String(Array.from(next)[0] ?? ""));
                    }
                }}
                variant={variant}
                color={color}
                isDisabled={isDisabled}
                isInvalid={Boolean(error)}
                isRequired={isRequired}
                labelPlacement="outside"
                isMultiline={selectionMode === "multiple"}
                disableAnimation={false}
                scrollShadowProps={{ isEnabled: false }}
                selectorIcon={<ChevronIcon />}
                classNames={{
                    base: "w-full",

                    label: [
                        `font-mono ${APP_SIZES.text.label} uppercase`,
                        "text-neutral-500 dark:text-neutral-400",
                        APP_SIZES.spacing.labelBottom,
                    ].join(" "),

                    trigger: [
                        size === "sm" ? "!min-h-9 py-1 px-2.5" : size === "lg" ? "!min-h-12 py-2 px-3.5" : "!min-h-10 py-1.5 px-3",
                        "bg-surface-1",
                        "!border !border-solid !border-[var(--control-border)]",
                        "rounded-lg",
                        "!shadow-[0_1px_2px_rgba(0,0,0,0.02)]",
                        "transition-[border-color,box-shadow,background-color] duration-150",
                        "data-[hover=true]:!border-[var(--control-border-hover)]",
                        "data-[open=true]:!border-[var(--control-border-focus)]",
                        "data-[open=true]:!shadow-[var(--control-focus-shadow)]",
                        "data-[invalid=true]:!border-error data-[invalid=true]:!shadow-[0_0_0_3px_rgba(220,38,38,0.10)]",
                        "data-[disabled=true]:!bg-[var(--control-disabled-bg)] data-[disabled=true]:opacity-100 data-[disabled=true]:cursor-not-allowed",
                    ].join(" "),

                    value: "flex flex-wrap gap-1 w-full items-center font-sans text-[14px] text-foreground data-[placeholder=true]:text-[var(--control-placeholder)]",

                    selectorIcon: [
                        "absolute right-3 top-1/2 -translate-y-1/2",
                        "size-4 text-[var(--text-tertiary)]",
                        "pointer-events-none",
                    ].join(" "),

                    popoverContent: [
                        "bg-surface-1",
                        "border border-[var(--control-border)]",
                        "shadow-[0_12px_28px_rgba(0,0,0,.12),0_2px_6px_rgba(0,0,0,.06)]",
                        "dark:shadow-[0_12px_28px_rgba(0,0,0,.45),0_2px_6px_rgba(0,0,0,.28)]",
                        "rounded-lg overflow-hidden",
                        "z-[9999]",
                    ].join(" "),

                    listbox: "p-1.5 gap-0",
                }}
                size={size}
                renderValue={renderValue}
            >
                {(item) => {
                    const isSelected = activeKeys?.has(String(item.id)) ?? false;

                    return (
                        <SelectItem
                            key={item.id}
                            textValue={item.name}
                            classNames={{
                                base: [
                                    "rounded-md px-2.5 py-1.5",
                                    "transition-colors duration-100",
                                    "data-[hover=true]:bg-neutral-50 dark:data-[hover=true]:bg-neutral-800/60",
                                    isSelected
                                        ? "bg-primary-50/50 dark:bg-primary-900/15"
                                        : "",
                                ].join(" "),
                            }}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    {showAvatar && (
                                        <div className={[
                                            "w-6 h-6 rounded-md flex-shrink-0",
                                            "flex items-center justify-center",
                                            `font-mono ${APP_SIZES.text.selectAvatar} font-bold`,
                                            isSelected
                                                ? "bg-primary-500 text-white"
                                                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400",
                                            "transition-colors duration-150",
                                        ].join(" ")}>
                                            {initials(item.name)}
                                        </div>
                                    )}

                                    <div className="min-w-0">
                                        <p className={[
                                            `font-sans ${APP_SIZES.text.selectItem} font-medium truncate`,
                                            isSelected
                                                ? "text-primary-700 dark:text-primary-300"
                                                : "text-foreground",
                                        ].join(" ")}>
                                            {item.name}
                                        </p>
                                        {item.subtitle && (
                                            <p className={`font-sans ${APP_SIZES.text.selectSubtitle} text-neutral-400 dark:text-neutral-500 mt-0.5 truncate`}>
                                                {item.subtitle}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* checkmark */}
                                <div className={[
                                    "w-4 h-4 rounded flex-shrink-0",
                                    "flex items-center justify-center",
                                    "transition-all duration-150",
                                    isSelected
                                        ? "bg-primary-500 text-white opacity-100"
                                        : "opacity-0",
                                ].join(" ")}>
                                    <CheckIcon />
                                </div>
                            </div>
                        </SelectItem>
                    );
                }}
            </Select>
        </div>
    );
};
