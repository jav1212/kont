"use client";

import { RefreshCw, Users, type LucideIcon } from "lucide-react";

// Two right-panel placeholder atoms shared across the four calculators.
//
//   <CalculatorLoading>     — centered spinner + uppercase mono label
//   <CalculatorEmptyState>  — icon tile + bold title + sans description
//
// The four calculators previously hand-rolled these in slightly different
// flavours; this consolidates them so the contador sees the same waiting and
// empty surfaces no matter which calculator they open.

// ============================================================================
// CalculatorLoading
// ============================================================================

export interface CalculatorLoadingProps {
    label?: string;
}

export function CalculatorLoading({ label = "Cargando datos…" }: CalculatorLoadingProps) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--text-tertiary)]">
            <RefreshCw size={24} className="animate-spin text-primary-500/50" />
            <span className="font-mono text-[13px] font-bold uppercase tracking-widest">{label}</span>
        </div>
    );
}

// ============================================================================
// CalculatorEmptyState
// ============================================================================

export interface CalculatorEmptyStateProps {
    title?:        string;
    description:   React.ReactNode;
    icon?:         LucideIcon;
}

export function CalculatorEmptyState({
    title = "Sistema listo",
    description,
    icon: Icon = Users,
}: CalculatorEmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-5 text-[var(--text-disabled)] max-w-sm mx-auto animate-in fade-in duration-500">
            <div className="w-20 h-20 rounded-[1.5rem] bg-surface-1 border border-border-light flex items-center justify-center shadow-sm text-border-medium">
                <Icon strokeWidth={1.5} size={32} />
            </div>
            <div className="text-center space-y-2">
                <p className="font-mono text-[14px] font-bold uppercase tracking-widest text-foreground">{title}</p>
                <p className="text-[13px] font-medium text-[var(--text-secondary)] leading-relaxed">{description}</p>
            </div>
        </div>
    );
}
