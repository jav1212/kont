"use client";

import { TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Calculator chrome — repeated tiny atoms used in every calculator's left
// panel: section labels, panel header line, and the "Solo activos" toggle.

// ============================================================================
// SectionHeader
// ============================================================================

export type SectionHeaderTone = "default" | "amber" | "green";

export interface SectionHeaderProps {
    label: string;
    tone?: SectionHeaderTone;
    /** When set, render a small right-aligned annotation (e.g. a count). */
    right?: React.ReactNode;
}

export function SectionHeader({ label, tone = "default", right }: SectionHeaderProps) {
    const colorCls = tone === "amber"
        ? "text-amber-500/70"
        : tone === "green"
            ? "text-emerald-500/70"
            : "text-[var(--text-tertiary)]";

    if (right) {
        return (
            <div className="flex items-center justify-between mb-2 pt-1">
                <p className={`font-mono text-[11px] uppercase tracking-[0.2em] ${colorCls}`}>{label}</p>
                {right}
            </div>
        );
    }

    return (
        <p className={`font-mono text-[11px] uppercase tracking-[0.2em] mb-2 pt-1 ${colorCls}`}>
            {label}
        </p>
    );
}

// ============================================================================
// CalculatorPanelHeader
// ============================================================================

export interface CalculatorPanelHeaderProps {
    title?: string;
    icon?: LucideIcon;
}

export function CalculatorPanelHeader({
    title = "Calculadora",
    icon: Icon = TrendingUp,
}: CalculatorPanelHeaderProps) {
    return (
        <div className="px-5 py-4 border-b border-border-light bg-surface-2/[0.03]">
            <p className="font-mono text-[13px] font-black uppercase tracking-widest text-foreground leading-none flex items-center gap-2">
                <Icon size={14} className="text-primary-500" />
                {title}
            </p>
        </div>
    );
}

// ============================================================================
// OnlyActiveToggle
// ============================================================================

export interface OnlyActiveToggleProps {
    checked: boolean;
    onChange(next: boolean): void;
    label?: string;
}

export function OnlyActiveToggle({
    checked,
    onChange,
    label = "Solo activos",
}: OnlyActiveToggleProps) {
    return (
        <label className="flex items-center gap-3 cursor-pointer group py-1">
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={[
                    "w-8 h-[18px] rounded-full transition-all duration-200 flex items-center px-0.5 cursor-pointer ring-offset-background group-hover:ring-2 ring-primary-500/10",
                    checked ? "bg-primary-500" : "bg-border-medium",
                ].join(" ")}
            >
                <span
                    className={[
                        "w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-200",
                        checked ? "translate-x-3.5" : "translate-x-0",
                    ].join(" ")}
                />
            </button>
            <span className="font-mono text-[11px] text-[var(--text-secondary)] uppercase tracking-[0.14em] font-medium group-hover:text-foreground">
                {label}
            </span>
        </label>
    );
}
