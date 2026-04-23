"use client";

import { User, Building2 } from "lucide-react";
import type { TaxpayerType } from "../data/types";

interface TaxpayerTypeToggleProps {
    value: TaxpayerType;
    onChange: (v: TaxpayerType) => void;
}

const OPTIONS: { value: TaxpayerType; label: string; sublabel: string; icon: typeof User }[] = [
    { value: "ordinario", label: "Ordinario", sublabel: "Contribuyente general", icon: User },
    { value: "especial", label: "Especial", sublabel: "Sujeto pasivo especial", icon: Building2 },
];

export function TaxpayerTypeToggle({ value, onChange }: TaxpayerTypeToggleProps) {
    return (
        <div
            className="flex gap-2 items-center"
            role="group"
            aria-label="Tipo de contribuyente"
        >
            {OPTIONS.map((opt) => {
                const isActive = value === opt.value;
                const Icon = opt.icon;
                return (
                    <button
                        key={opt.value}
                        onClick={() => onChange(opt.value)}
                        className={[
                            "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors duration-150 select-none min-w-[100px]",
                            "focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-1 outline-none",
                            isActive
                                ? "border-primary-500 bg-primary-50 text-text-primary dark:bg-primary-50/10 dark:border-primary-500"
                                : "border-border-light bg-surface-1 text-text-tertiary hover:border-border-medium hover:bg-surface-2",
                        ].join(" ")}
                        aria-pressed={isActive}
                    >
                        <Icon size={14} strokeWidth={1.5} className="flex-shrink-0" />
                        <div className="flex flex-col items-start">
                            <span className="text-[11px] font-mono uppercase tracking-[0.14em] font-medium">
                                {opt.label}
                            </span>
                            <span className="text-[9px] font-mono text-text-disabled hidden sm:block">
                                {opt.sublabel}
                            </span>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
