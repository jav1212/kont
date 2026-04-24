"use client";

import { useId } from "react";
import { motion } from "framer-motion";

interface YearSelectorProps {
    value: number;
    onChange: (year: number) => void;
    years: number[];
}

export function YearSelector({ value, onChange, years }: YearSelectorProps) {
    const pillId = useId();

    return (
        <div
            role="group"
            aria-label="Seleccionar año fiscal"
            className="inline-flex items-center p-0.5 rounded-lg bg-surface-3 border border-border-light"
        >
            {years.map((year) => {
                const isActive = year === value;
                return (
                    <button
                        key={year}
                        type="button"
                        onClick={() => onChange(year)}
                        aria-pressed={isActive}
                        className={[
                            "relative h-8 px-3 rounded-md",
                            "text-[11px] font-mono font-bold uppercase tracking-[0.12em] tabular-nums",
                            "transition-colors duration-150 cursor-pointer whitespace-nowrap flex-shrink-0",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1",
                            isActive ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary",
                        ].join(" ")}
                    >
                        {isActive && (
                            <motion.span
                                layoutId={`year-pill-${pillId}`}
                                aria-hidden
                                className="absolute inset-0 rounded-md bg-surface-1 border border-border-default shadow-[var(--shadow-sm)]"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
                            />
                        )}
                        <span className="relative">{year}</span>
                    </button>
                );
            })}
        </div>
    );
}
