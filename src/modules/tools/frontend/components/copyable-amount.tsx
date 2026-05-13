"use client";

import React, { useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { useCopyAmount } from "../hooks/use-copy-amount";

interface CopyableAmountProps {
    /** Plain text that ends up in the clipboard. Never includes Bs. or code. */
    value: string;
    /** Visual content (e.g. "Bs. 1.234,56" or just "1.234,56"). */
    children: React.ReactNode;
    /** Unique key used to single-flash this surface across re-renders. Defaults to `value`. */
    copyKey?: string;
    /** Accessible label for the button (screen reader + tooltip-less). */
    ariaLabel?: string;
    /** Reduce the copied-chip typography for tight surfaces (rate-card mini, table rows). */
    compact?: boolean;
    /** Merge classes onto the wrapping button. */
    className?: string;
    /** Wrap chip + content in this tag. Default: span (inline). Use "div" inside flex columns. */
    as?: "span" | "div";
    /**
     * Block-level surface (cards, full-width result panels). Uses `block` display
     * and the inner content fills the surface, allowing the entire area to be the
     * tap target.
     */
    block?: boolean;
}

const COPY_CHIP_BASE = [
    "absolute inset-0 flex items-center justify-center gap-1 pointer-events-none",
    "rounded-md",
    "bg-emerald-100 text-emerald-700",
    "dark:bg-emerald-900/70 dark:text-emerald-200",
    "font-mono font-bold uppercase tracking-[0.14em] tabular-nums",
].join(" ");

/**
 * Wraps any numeric surface to make it copy-on-tap. Visual is unchanged at rest;
 * on hover a dashed outline appears, on press the value enters the clipboard and
 * an "✓ Copiado" chip flashes in place for 1.5s.
 */
export function CopyableAmount({
    value,
    children,
    copyKey,
    ariaLabel,
    compact = false,
    className = "",
    as = "span",
    block = false,
}: CopyableAmountProps) {
    const { copy, copiedKey } = useCopyAmount();
    const key = copyKey ?? value;
    const isCopied = copiedKey === key;
    const reduceMotion = useReducedMotion();

    const onClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            void copy(value, key);
        },
        [copy, value, key]
    );

    const Wrapper = as;
    const baseDisplay = block ? "block" : "inline-flex items-baseline";
    const innerDisplay = block ? "block w-full h-full" : "inline-flex items-baseline";

    return (
        <Wrapper
            className={[
                "relative",
                baseDisplay,
                "cursor-pointer select-none",
                "rounded-md",
                "transition-[outline-color] duration-150",
                "outline outline-1 outline-dashed outline-offset-2 outline-transparent",
                "hover:outline-border-medium",
                "focus-visible:outline-primary-500 focus-visible:outline-solid",
                "active:scale-[0.98] motion-safe:transition-transform motion-safe:duration-100",
                "[touch-action:manipulation]",
                className,
            ].join(" ")}
            role="button"
            tabIndex={0}
            aria-label={ariaLabel ?? `Copiar ${value}`}
            onClick={onClick}
            onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void copy(value, key);
                }
            }}
        >
            <span
                aria-hidden={isCopied}
                className={[
                    innerDisplay,
                    "transition-opacity duration-150",
                    isCopied ? "opacity-25" : "opacity-100",
                ].join(" ")}
            >
                {children}
            </span>
            <AnimatePresence>
                {isCopied && (
                    <motion.span
                        key="chip"
                        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className={[COPY_CHIP_BASE, compact ? "text-[9px] px-1" : "text-[11px] px-2"].join(" ")}
                        aria-live="polite"
                    >
                        <Check size={compact ? 9 : 12} strokeWidth={3} />
                        Copiado
                    </motion.span>
                )}
            </AnimatePresence>
        </Wrapper>
    );
}

interface CopyInputButtonProps {
    /** Plain text that ends up in the clipboard. */
    value: string;
    /** Accessible label. Defaults to "Copiar monto". */
    ariaLabel?: string;
}

/**
 * Compact copy button intended for the `endContent` slot of BaseInput.Field.
 * Tapping does NOT focus the input — `stopPropagation` keeps the typing flow
 * intact when the user wants to edit.
 */
export function CopyInputButton({ value, ariaLabel = "Copiar monto" }: CopyInputButtonProps) {
    const { copy, copiedKey } = useCopyAmount();
    const isCopied = copiedKey === value;

    return (
        <button
            type="button"
            onMouseDown={(e) => e.preventDefault()} // keep input from losing focus on click
            onClick={(e) => {
                e.stopPropagation();
                void copy(value, value);
            }}
            aria-label={ariaLabel}
            className={[
                "inline-flex items-center justify-center h-7 w-7 rounded-md",
                "text-foreground/45 hover:text-primary-600 dark:hover:text-primary-400",
                "hover:bg-surface-2",
                "transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-1",
                "[touch-action:manipulation]",
            ].join(" ")}
        >
            {isCopied ? (
                <Check size={13} strokeWidth={2.5} className="text-emerald-600 dark:text-emerald-400" />
            ) : (
                <Copy size={13} />
            )}
        </button>
    );
}
