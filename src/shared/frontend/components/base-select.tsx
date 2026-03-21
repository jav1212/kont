"use client";

import React, { useCallback } from "react";
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
    [key: string]: any;
}

export interface BaseSelectProps<T extends SelectItemData> {
    items: T[];
    selectedKeys: Set<string | number> | "all";
    onSelectionChange: (keys: Set<string | number>) => void;
    label?: string;
    placeholder?: string;
    className?: string;
    isDisabled?: boolean;
    showAvatar?: boolean;
    maxChips?: number;
    variant?: "flat" | "bordered" | "faded" | "underlined";
    color?: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
    selectionMode?: "single" | "multiple";
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
    label,
    placeholder = "Seleccionar...",
    className = "",
    isDisabled = false,
    showAvatar = true,
    maxChips = 2,
    variant = "bordered",
    color = "primary",
    selectionMode = "multiple",
}: BaseSelectProps<T>) => {

    const handleChipClose = useCallback(
        (keyToRemove: string | number) => {
            if (selectedKeys === "all") return;
            const next = new Set(selectedKeys);
            next.delete(String(keyToRemove));
            next.delete(Number(keyToRemove));
            onSelectionChange(next);
        },
        [selectedKeys, onSelectionChange]
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
        selectedKeys !== "all"
            ? new Set(Array.from(selectedKeys).map(String))
            : null;

    return (
        <div className={`w-full ${className}`}>
            <Select
                items={items}
                label={label}
                placeholder={placeholder}
                selectionMode={selectionMode}
                selectedKeys={selectedKeys}
                onSelectionChange={(keys) =>
                    onSelectionChange(keys as Set<string | number>)
                }
                variant={variant}
                color={color}
                isDisabled={isDisabled}
                labelPlacement="outside"
                isMultiline
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
                        "min-h-[38px] h-auto py-1.5 px-3",
                        "bg-surface-1",
                        "border border-border-light",
                        "rounded-lg",
                        "shadow-[inset_0_1px_2px_rgba(0,0,0,.03)]",
                        "dark:shadow-[inset_0_1px_2px_rgba(0,0,0,.15)]",
                        "transition-all duration-150",
                        "data-[hover=true]:border-border-medium",
                        "data-[open=true]:border-primary-400",
                        "data-[open=true]:ring-2 data-[open=true]:ring-primary-500/10",
                        "data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed",
                    ].join(" "),

                    value: "flex flex-wrap gap-1 w-full items-center",

                    selectorIcon: [
                        "absolute right-2.5 top-1/2 -translate-y-1/2",
                        "text-neutral-400 dark:text-neutral-500",
                        "pointer-events-none",
                    ].join(" "),

                    popoverContent: [
                        "bg-surface-1",
                        "border border-border-light",
                        "shadow-[0_4px_12px_rgba(0,0,0,.08),0_1px_3px_rgba(0,0,0,.05)]",
                        "dark:shadow-[0_4px_12px_rgba(0,0,0,.4),0_1px_3px_rgba(0,0,0,.3)]",
                        "rounded-xl overflow-hidden",
                        "z-[9999]",
                    ].join(" "),

                    listbox: "p-1.5 gap-0",
                }}
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
                                            `font-mono ${APP_SIZES.text.selectItem} font-medium truncate`,
                                            isSelected
                                                ? "text-primary-700 dark:text-primary-300"
                                                : "text-foreground",
                                        ].join(" ")}>
                                            {item.name}
                                        </p>
                                        {item.subtitle && (
                                            <p className={`font-mono ${APP_SIZES.text.selectSubtitle} text-neutral-400 dark:text-neutral-500 mt-0.5 truncate`}>
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