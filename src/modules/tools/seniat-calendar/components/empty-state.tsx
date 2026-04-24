"use client";

import { CalendarDays, Receipt, FileText, Banknote, FlaskConical } from "lucide-react";

const HINT_ITEMS = [
    { icon: Receipt,      label: "IVA mensual",   color: "var(--badge-info-border)" },
    { icon: FileText,     label: "ISLR anual",    color: "var(--badge-error-border)" },
    { icon: Banknote,     label: "IGTF",          color: "var(--border-default)" },
    { icon: FlaskConical, label: "LOCTI",         color: "var(--badge-success-border)" },
] as const;

export function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center gap-6 py-20 text-center px-4">
            {/* Icon cluster */}
            <div className="relative w-20 h-20 flex items-center justify-center flex-shrink-0">
                {/* Outer ring */}
                <div className="absolute inset-0 rounded-full border-2 border-dashed border-border-light opacity-60" aria-hidden />
                {/* Center icon */}
                <div className="w-14 h-14 rounded-2xl border border-border-light bg-surface-1 shadow-[var(--shadow-sm)] flex items-center justify-center">
                    <CalendarDays className="w-7 h-7 text-text-tertiary" strokeWidth={1.5} />
                </div>
            </div>

            <div className="flex flex-col gap-2 max-w-[380px]">
                <h3 className="text-[15px] font-mono font-semibold text-text-primary">
                    Ingresa tu RIF para consultar
                </h3>
                <p className="text-[13px] font-mono text-text-tertiary leading-relaxed">
                    Visualiza todas tus fechas límite de declaración y pago ante el SENIAT en un solo calendario.
                </p>
            </div>

            {/* Category hint row */}
            <div className="flex items-center gap-2 flex-wrap justify-center" aria-hidden>
                {HINT_ITEMS.map((item) => {
                    const Icon = item.icon;
                    return (
                        <span
                            key={item.label}
                            className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border border-border-light bg-surface-1 text-[10px] font-mono text-text-tertiary"
                        >
                            <Icon size={9} strokeWidth={2} style={{ color: item.color }} />
                            {item.label}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
