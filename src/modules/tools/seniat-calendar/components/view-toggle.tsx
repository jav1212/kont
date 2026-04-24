"use client";

import { useId } from "react";
import { LayoutGrid, List } from "lucide-react";
import { motion } from "framer-motion";

interface ViewToggleProps {
    value: "grid" | "lista";
    onChange: (v: "grid" | "lista") => void;
}

const OPTIONS: { value: "grid" | "lista"; label: string; icon: typeof LayoutGrid }[] = [
    { value: "grid",  label: "Mensual", icon: LayoutGrid },
    { value: "lista", label: "Lista",   icon: List },
];

export function ViewToggle({ value, onChange }: ViewToggleProps) {
    const pillId = useId();

    return (
        <div
            role="tablist"
            aria-label="Vista del calendario"
            className="inline-flex items-center p-0.5 rounded-lg bg-surface-3 border border-border-light"
        >
            {OPTIONS.map((opt) => {
                const isActive = value === opt.value;
                const Icon = opt.icon;
                return (
                    <button
                        key={opt.value}
                        role="tab"
                        type="button"
                        aria-selected={isActive}
                        aria-controls={opt.value === "grid" ? "calendar-grid-panel" : "obligation-list-panel"}
                        onClick={() => onChange(opt.value)}
                        className={[
                            "relative inline-flex items-center gap-1.5 h-8 px-3 rounded-md",
                            "text-[11px] font-mono font-bold uppercase tracking-[0.12em]",
                            "transition-colors duration-150 cursor-pointer",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1",
                            isActive ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary",
                        ].join(" ")}
                    >
                        {isActive && (
                            <motion.span
                                layoutId={`view-pill-${pillId}`}
                                aria-hidden
                                className="absolute inset-0 rounded-md bg-surface-1 border border-border-default shadow-[var(--shadow-sm)]"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
                            />
                        )}
                        <Icon size={12} strokeWidth={1.75} className="relative" aria-hidden />
                        <span className="relative">{opt.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
