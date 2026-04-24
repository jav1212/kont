"use client";

import { useId } from "react";
import { User, Building2 } from "lucide-react";
import { motion } from "framer-motion";
import type { TaxpayerType } from "../data/types";

interface TaxpayerTypeToggleProps {
    value: TaxpayerType;
    onChange: (v: TaxpayerType) => void;
}

const OPTIONS: { value: TaxpayerType; label: string; icon: typeof User }[] = [
    { value: "ordinario", label: "Ordinario", icon: User },
    { value: "especial",  label: "Especial",  icon: Building2 },
];

export function TaxpayerTypeToggle({ value, onChange }: TaxpayerTypeToggleProps) {
    const pillId = useId();

    return (
        <div
            role="group"
            aria-label="Tipo de contribuyente"
            className="inline-flex items-center p-0.5 rounded-lg bg-surface-3 border border-border-light"
        >
            {OPTIONS.map((opt) => {
                const isActive = value === opt.value;
                const Icon = opt.icon;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        aria-pressed={isActive}
                        className={[
                            "relative inline-flex items-center gap-1.5 h-8 px-3 rounded-md",
                            "text-[11px] font-mono font-bold uppercase tracking-[0.12em]",
                            "transition-colors duration-150 cursor-pointer select-none",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1",
                            isActive ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary",
                        ].join(" ")}
                    >
                        {isActive && (
                            <motion.span
                                layoutId={`taxpayer-pill-${pillId}`}
                                aria-hidden
                                className="absolute inset-0 rounded-md bg-surface-1 border border-border-default shadow-[var(--shadow-sm)]"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
                            />
                        )}
                        <Icon size={12} strokeWidth={1.75} className="relative flex-shrink-0" aria-hidden />
                        <span className="relative">{opt.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
