"use client";

import { Calendar } from "lucide-react";

interface Props {
    value: string | null;
    onChange: (date: string | null) => void;
    maxDate?: string;
}

export function DatePickerRate({ value, onChange, maxDate }: Props) {
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 h-10 rounded-lg border border-border-light bg-surface-2 px-3">
                <Calendar size={14} className="text-foreground/50" />
                <input
                    type="date"
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value || null)}
                    max={maxDate}
                    className="bg-transparent text-[13px] font-mono focus:outline-none"
                    aria-label="Fecha de la tasa"
                />
            </div>
            {value && (
                <button
                    type="button"
                    onClick={() => onChange(null)}
                    className="h-9 px-3 rounded-lg border border-border-light bg-surface-1 hover:bg-surface-2 text-[11px] font-mono uppercase tracking-[0.14em] text-foreground/70 hover:text-foreground transition-colors"
                >
                    Hoy
                </button>
            )}
        </div>
    );
}
