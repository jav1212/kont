"use client";

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS_LONG = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

export function currentPurchasePeriod(): string {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function purchasePeriodLabel(key: string): string {
    const [year, month] = key.split("-");
    return `${MONTHS_LONG[(Number(month) - 1) | 0] ?? ""} ${year}`;
}

function shiftPurchasePeriod(key: string, delta: number): string {
    const [year, month] = key.split("-").map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function PurchasePeriodPicker({ period, onChange, allowAll = false, onAll }: { period: string; onChange: (period: string) => void; allowAll?: boolean; onAll?: () => void }) {
    const today = currentPurchasePeriod();
    const isCurrent = period === today;
    const isAll = period === "all";

    return (
        <div className="inline-flex h-9 items-center gap-1 rounded-lg border border-border-light bg-surface-1 px-1">
            {allowAll && <button type="button" onClick={onAll} className={["h-7 rounded px-2 font-sans text-[11px] font-medium transition-colors", isAll ? "bg-primary-500/10 text-primary-500" : "text-[var(--text-secondary)] hover:bg-surface-2"].join(" ")}>Todos</button>}
            <button type="button" onClick={() => onChange(shiftPurchasePeriod(isAll ? today : period, -1))} className="flex size-7 items-center justify-center rounded text-[var(--text-tertiary)] transition-colors hover:bg-surface-2 hover:text-foreground" aria-label="Mes anterior"><ChevronLeft size={14} strokeWidth={2} /></button>
            <div className="flex min-w-[140px] items-center justify-center gap-1.5 px-2">
                <Calendar size={12} strokeWidth={2} className="text-[var(--text-tertiary)]" />
                <span className="font-sans text-[12px] font-medium uppercase tracking-[0.12em] text-foreground tabular-nums">{isAll ? "Todos los períodos" : purchasePeriodLabel(period)}</span>
            </div>
            <button type="button" onClick={() => onChange(shiftPurchasePeriod(isAll ? today : period, 1))} className="flex size-7 items-center justify-center rounded text-[var(--text-tertiary)] transition-colors hover:bg-surface-2 hover:text-foreground" aria-label="Mes siguiente"><ChevronRight size={14} strokeWidth={2} /></button>
            {!isAll && !isCurrent && <button type="button" onClick={() => onChange(today)} className="ml-1 h-7 rounded px-2 font-sans text-[10px] font-medium uppercase tracking-[0.14em] text-primary-500 transition-colors hover:bg-primary-500/10">Hoy</button>}
        </div>
    );
}
