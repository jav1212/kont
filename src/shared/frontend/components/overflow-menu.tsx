"use client";

// Compact overflow / kebab menu — toolbar action collapser for mobile.
// Renders a button (default: MoreHorizontal icon) that toggles a popover with
// the supplied items. Use to fold secondary actions when the toolbar gets
// crowded on narrow viewports (REQ-006 — /impeccable adapt).
//
// The menu auto-dismisses on outside click, Esc, or after picking an item.

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ComponentType,
    type ReactNode,
} from "react";
import { MoreHorizontal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface OverflowMenuItem {
    label:     string;
    onClick:   () => void;
    icon?:     ComponentType<{ size?: number; strokeWidth?: number }>;
    disabled?: boolean;
    /** Show a small loader on the item; useful for in-flight imports. */
    loading?:  boolean;
    /** When true, render with a destructive tone. */
    danger?:   boolean;
    title?:    string;
}

interface OverflowMenuProps {
    items:        OverflowMenuItem[];
    /** Optional trigger element. Defaults to a MoreHorizontal icon button. */
    trigger?:     ReactNode;
    /** Tailwind classes merged onto the trigger button when using the default. */
    triggerClassName?: string;
    /** Side the menu opens on. Defaults to "right". */
    align?:       "left" | "right";
    /** ARIA label for the default trigger. Defaults to "Más acciones". */
    ariaLabel?:   string;
}

export function OverflowMenu({
    items,
    trigger,
    triggerClassName,
    align     = "right",
    ariaLabel = "Más acciones",
}: OverflowMenuProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const close = useCallback(() => setOpen(false), []);

    useEffect(() => {
        if (!open) return;
        const onPointer = (e: MouseEvent | TouchEvent) => {
            if (!rootRef.current) return;
            if (rootRef.current.contains(e.target as Node)) return;
            close();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        window.addEventListener("mousedown", onPointer);
        window.addEventListener("touchstart", onPointer);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("mousedown", onPointer);
            window.removeEventListener("touchstart", onPointer);
            window.removeEventListener("keydown", onKey);
        };
    }, [open, close]);

    const enabledItems = items.filter((item) => !item.loading || !item.disabled);
    if (enabledItems.length === 0) return null;

    return (
        <div ref={rootRef} className="relative inline-block">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={ariaLabel}
                className={
                    triggerClassName ??
                    "inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border-default bg-surface-1 text-foreground hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
                }
            >
                {trigger ?? <MoreHorizontal size={16} strokeWidth={2} />}
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: -4 }}
                        transition={{ duration: 0.12 }}
                        role="menu"
                        className={[
                            "absolute z-[var(--z-dropdown,30)] mt-1 min-w-[200px]",
                            "rounded-lg border border-border-light bg-surface-1 shadow-lg overflow-hidden",
                            align === "right" ? "right-0" : "left-0",
                        ].join(" ")}
                    >
                        <ul className="py-1">
                            {items.map((item, idx) => {
                                const Icon = item.icon;
                                return (
                                    <li key={idx} role="none">
                                        <button
                                            type="button"
                                            role="menuitem"
                                            disabled={item.disabled || item.loading}
                                            title={item.title}
                                            onClick={() => {
                                                if (item.disabled || item.loading) return;
                                                item.onClick();
                                                close();
                                            }}
                                            className={[
                                                "w-full flex items-center gap-2.5 px-3 py-2 text-left",
                                                "font-mono text-[12px] uppercase tracking-[0.10em]",
                                                "transition-colors",
                                                "disabled:opacity-50 disabled:cursor-not-allowed",
                                                item.danger
                                                    ? "text-text-error hover:bg-error/10"
                                                    : "text-foreground hover:bg-surface-2",
                                            ].join(" ")}
                                        >
                                            {Icon && (
                                                <Icon
                                                    size={14}
                                                    strokeWidth={2}
                                                />
                                            )}
                                            <span className="flex-1">{item.label}</span>
                                            {item.loading && (
                                                <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                                                    …
                                                </span>
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
