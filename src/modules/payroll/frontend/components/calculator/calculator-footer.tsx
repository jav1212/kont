"use client";

import { Download, RefreshCw } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { formatCurrency, formatUsd } from "./formatters";

// Bottom of the left calculator panel: per-batch summary chip + the
// primary "Generar PDF" / "Exportar Lote" CTA. Used by every sister
// calculator (vacations, social-benefits, profit-sharing, liquidations).

// ============================================================================
// FooterStat — one row inside the summary chip
// ============================================================================

export interface FooterStatProps {
    label: string;
    value: string;
    /** When set, value renders in a tone other than the default. */
    tone?: "default" | "amber" | "rose";
}

export function FooterStat({ label, value, tone = "default" }: FooterStatProps) {
    const valueCls = tone === "amber"
        ? "text-amber-500"
        : tone === "rose"
            ? "text-rose-600"
            : "text-foreground";
    return (
        <div className="flex justify-between font-mono text-[11px] uppercase tracking-wider">
            <span className="text-[var(--text-tertiary)]">{label}</span>
            <span className={`${valueCls} font-bold`}>{value}</span>
        </div>
    );
}

// ============================================================================
// FooterTotal — big right-aligned total row at the bottom of the chip
// ============================================================================

export interface FooterTotalProps {
    label:     string;
    valueBs:   number;
    bcvRate?:  number;
    /** Color of the big number (defaults to primary). */
    tone?:     "primary" | "success";
}

export function FooterTotal({ label, valueBs, bcvRate, tone = "primary" }: FooterTotalProps) {
    const numberCls = tone === "success" ? "text-emerald-500" : "text-primary-500";
    const usd       = bcvRate && bcvRate > 0 ? valueBs / bcvRate : null;
    return (
        <div className="flex justify-between items-baseline pt-2 border-t border-border-light/30">
            <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">
                {label}
            </span>
            <div className="text-right">
                <span className={`font-mono text-[15px] font-black ${numberCls} tabular-nums block leading-none`}>
                    {formatCurrency(valueBs)}
                </span>
                {usd != null && (
                    <span className="font-mono text-[10px] tabular-nums text-[var(--text-tertiary)] mt-1 block">
                        {formatUsd(usd)}
                    </span>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// CalculatorFooter
// ============================================================================

export interface CalculatorFooterProps {
    /** Stat rows + total inside the summary chip (typically built by the page). */
    children?: React.ReactNode;
    /** Primary CTA label (defaults to "Generar PDF"). */
    ctaLabel?: string;
    /** Generating spinner state — disables CTA and swaps the icon. */
    busy?:     boolean;
    /** Disable the CTA (e.g. no rows to export). */
    disabled?: boolean;
    onCta():   void | Promise<void>;
}

export function CalculatorFooter({
    children, ctaLabel = "Generar PDF", busy = false, disabled = false, onCta,
}: CalculatorFooterProps) {
    return (
        <div className="p-5 border-t border-border-light space-y-4 mt-auto bg-surface-2/[0.03]">
            {children && (
                <div className="space-y-2 mb-4 bg-surface-2/40 rounded-xl p-4 border border-border-light/50">
                    {children}
                </div>
            )}
            <BaseButton.Root
                variant="primary"
                className="w-full"
                onClick={() => { void onCta(); }}
                disabled={disabled || busy}
                leftIcon={busy ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            >
                {busy ? "Generando…" : ctaLabel}
            </BaseButton.Root>
        </div>
    );
}
