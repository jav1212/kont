"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

// ============================================================================
// TYPES
// ============================================================================

export interface InlineSelectOption<T extends string = string> {
    value: T;
    label: string;
}

export interface InlineSelectProps<T extends string = string> {
    value: T | undefined;
    onChange: (value: T) => void;
    options: InlineSelectOption<T>[];
    /** Shown when value is undefined/empty */
    placeholder?: string;
    /** "sm" = h-8 (32px) for dense table rows · "md" = h-9 (36px) default */
    size?: "sm" | "md";
    ariaLabel?: string;
    disabled?: boolean;
    className?: string;
    /** Allow clearing the selection (emits "" cast to T) */
    clearable?: boolean;
    clearLabel?: string;
}

// ============================================================================
// STYLE CONSTANTS
// ============================================================================

const SIZE: Record<"sm" | "md", { trigger: string; text: string }> = {
    sm: { trigger: "h-8 px-2.5 text-[12px]", text: "text-[12px]" },
    md: { trigger: "h-9 px-3 text-[13px]", text: "text-[13px]" },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function InlineSelect<T extends string = string>({
    value,
    onChange,
    options,
    placeholder = "Seleccionar…",
    size = "sm",
    ariaLabel,
    disabled = false,
    className = "",
    clearable = false,
    clearLabel = "Sin sector",
}: InlineSelectProps<T>) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const listboxId = useId();

    const selected = options.find((o) => o.value === value);
    const displayLabel = selected?.label ?? placeholder;

    // ── Click-outside ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!open) return;
        function handle(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handle);
        return () => document.removeEventListener("mousedown", handle);
    }, [open]);

    // ── Escape key ───────────────────────────────────────────────────────────
    useEffect(() => {
        if (!open) return;
        function handle(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }
        document.addEventListener("keydown", handle);
        return () => document.removeEventListener("keydown", handle);
    }, [open]);

    function handleSelect(optValue: T | "") {
        onChange(optValue as T);
        setOpen(false);
    }

    const sizeStyle = SIZE[size];

    return (
        <div ref={ref} className={`relative inline-block w-full ${className}`}>
            {/* ── Trigger ──────────────────────────────────────────────────── */}
            <button
                type="button"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-label={ariaLabel}
                disabled={disabled}
                onClick={() => setOpen((v) => !v)}
                className={[
                    "w-full flex items-center justify-between gap-1.5",
                    "bg-surface-1 border rounded-lg",
                    "font-mono tabular-nums",
                    "transition-all duration-150",
                    "shadow-[inset_0_1px_2px_rgba(0,0,0,.03)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,.15)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/20",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    open
                        ? "border-primary-400 ring-2 ring-primary-500/10"
                        : "border-border-light hover:border-border-medium",
                    sizeStyle.trigger,
                ].join(" ")}
            >
                <span
                    className={[
                        "truncate text-left flex-1",
                        sizeStyle.text,
                        selected ? "text-foreground" : "text-[var(--text-disabled)]",
                    ].join(" ")}
                >
                    {displayLabel}
                </span>
                <ChevronDown
                    size={12}
                    strokeWidth={1.75}
                    aria-hidden
                    className={[
                        "flex-shrink-0 text-[var(--text-tertiary)] transition-transform duration-200",
                        open ? "rotate-180" : "",
                    ].join(" ")}
                />
            </button>

            {/* ── Dropdown panel ───────────────────────────────────────────── */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        key="panel"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12, ease: "easeOut" }}
                        className={[
                            "absolute left-0 top-full mt-1 z-[9999]",
                            "min-w-full w-max max-w-[280px]",
                            "rounded-xl border border-border-light bg-surface-1",
                            "shadow-[0_4px_12px_rgba(0,0,0,.08),0_1px_3px_rgba(0,0,0,.05)]",
                            "dark:shadow-[0_4px_12px_rgba(0,0,0,.4),0_1px_3px_rgba(0,0,0,.3)]",
                            "overflow-hidden",
                        ].join(" ")}
                    >
                        <ul
                            id={listboxId}
                            role="listbox"
                            aria-label={ariaLabel ?? "Opciones"}
                            className="p-1"
                        >
                            {/* Optional clear option */}
                            {clearable && (
                                <li role="option" aria-selected={!value}>
                                    <button
                                        type="button"
                                        onClick={() => handleSelect("")}
                                        className={[
                                            "w-full flex items-center justify-between gap-2",
                                            "px-2.5 py-1.5 rounded-md text-left",
                                            "transition-colors duration-100",
                                            "font-mono text-[12px]",
                                            !value
                                                ? "bg-surface-2 text-foreground"
                                                : "text-[var(--text-tertiary)] hover:bg-surface-2 hover:text-foreground",
                                        ].join(" ")}
                                    >
                                        <span className="truncate">{clearLabel}</span>
                                        {!value && (
                                            <Check
                                                size={12}
                                                strokeWidth={2.25}
                                                aria-hidden
                                                className="text-primary-500 flex-shrink-0"
                                            />
                                        )}
                                    </button>
                                </li>
                            )}

                            {/* Options */}
                            {options.map((opt) => {
                                const isSelected = opt.value === value;
                                return (
                                    <li key={opt.value} role="option" aria-selected={isSelected}>
                                        <button
                                            type="button"
                                            onClick={() => handleSelect(opt.value)}
                                            className={[
                                                "w-full flex items-center justify-between gap-2",
                                                "px-2.5 py-1.5 rounded-md text-left",
                                                "transition-colors duration-100",
                                                "font-mono text-[12px]",
                                                isSelected
                                                    ? "bg-surface-2 text-foreground"
                                                    : "hover:bg-surface-2 text-foreground",
                                            ].join(" ")}
                                        >
                                            <span className="truncate">{opt.label}</span>
                                            {isSelected && (
                                                <Check
                                                    size={12}
                                                    strokeWidth={2.25}
                                                    aria-hidden
                                                    className="text-primary-500 flex-shrink-0"
                                                />
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
