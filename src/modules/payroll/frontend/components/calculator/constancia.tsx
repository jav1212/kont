"use client";

import {
    AlertTriangle, Clock, FileText, Sparkles, Users,
} from "lucide-react";
import { formatCurrency, formatDateLong, formatDateUpper, formatUsd } from "./formatters";

// All the visual fragments of a payroll "constancia" preview card.
// Composed by every sister calculator's right-hand panel:
//   ConstanciaShell    — the document frame (header / employee strip / KPI band / body / footer)
//   ConstanciaWarning  — compact yellow card shown when calc cannot run
//   LiquidoTotal       — the big "Líquido a recibir" / "Monto a Pagar" panel
//   CalcRow            — single-row entry inside a concept list
//   ConceptsTable      — pre-built 12-col concept grid (used by multiple calcs)

// ============================================================================
// ConstanciaWarning
// ============================================================================

export interface ConstanciaWarningProps {
    employeeName:   string;
    employeeCedula: string;
    message:        string;
}

export function ConstanciaWarning({ employeeName, employeeCedula, message }: ConstanciaWarningProps) {
    return (
        <div className="bg-amber-500/5 rounded-2xl overflow-hidden border border-amber-500/30 shadow-sm mb-6">
            <div className="px-6 py-4 flex items-center justify-between gap-4 border-l-[3px] border-amber-500">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 shrink-0">
                        <AlertTriangle size={16} />
                    </div>
                    <div className="min-w-0">
                        <p className="font-mono text-[13px] font-bold uppercase tracking-tight text-foreground truncate">{employeeName}</p>
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] mt-0.5">CI {employeeCedula}</p>
                    </div>
                </div>
                <span className="font-mono text-[11px] text-amber-700 font-bold uppercase tracking-[0.14em] bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-md shrink-0">
                    {message}
                </span>
            </div>
        </div>
    );
}

// ============================================================================
// ConstanciaShell
// ============================================================================

export interface ConstanciaKpi {
    label:  string;
    value:  string;
    /** Tone of the value text (defaults to neutral foreground). */
    tone?:  "default" | "primary" | "success" | "amber" | "rose";
}

export interface ConstanciaShellProps {
    // Header
    companyName:    string;
    companyLogoUrl?: string;
    showLogo?:      boolean;
    title:          string;            // "Constancia de Liquidación Laboral"
    legalNote:      string;            // "Art. 142 LOTTT — Renuncia voluntaria"
    /** Right side of the header: typically a date label + emitido stamp. */
    headerRight:    React.ReactNode;

    // Employee strip
    employeeName:   string;
    employeeCedula: string;
    employeeCargo?: string;
    yearsOfService: number;
    /** Optional extra label after years (e.g. "210d") shown inside the antigüedad pill. */
    extraTenureLabel?: string;

    // KPI band — 2 to 4 entries
    kpis: ConstanciaKpi[];

    // Body slot (concepts table + total)
    children: React.ReactNode;

    // Footer
    documentId:  string;
    footerNote?: string;
}

const KPI_TONE_CLS: Record<NonNullable<ConstanciaKpi["tone"]>, string> = {
    default: "text-foreground",
    primary: "text-primary-500",
    success: "text-emerald-500",
    amber:   "text-amber-500",
    rose:    "text-rose-600",
};

export function ConstanciaShell({
    companyName, companyLogoUrl, showLogo, title, legalNote, headerRight,
    employeeName, employeeCedula, employeeCargo, yearsOfService, extraTenureLabel,
    kpis, children,
    documentId, footerNote = "Documento de conformidad · Original",
}: ConstanciaShellProps) {
    const kpiCols = kpis.length >= 4 ? "lg:grid-cols-4" : kpis.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";
    return (
        <div className="mb-2 bg-surface-1 rounded-[1.5rem] overflow-hidden shadow-sm shadow-black/5 border border-border-light max-w-3xl mx-auto flex flex-col">
            {/* ── Header ──────────────────────────────────────────────── */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-2/30 flex items-start justify-between gap-6">
                <div className="flex flex-row items-center gap-4 min-w-0">
                    {(showLogo && companyLogoUrl) && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={companyLogoUrl} alt="Logo" className="max-h-12 w-auto object-contain shrink-0" />
                    )}
                    <div className="min-w-0">
                        <p className="text-[20px] font-black uppercase tracking-tight text-foreground leading-none truncate">{companyName}</p>
                        <p className="font-mono text-[11px] text-[var(--text-tertiary)] mt-2 uppercase tracking-[0.2em] font-semibold">{title}</p>
                        <p className="font-mono text-[11px] text-[var(--text-secondary)] mt-0.5 font-medium">{legalNote}</p>
                    </div>
                </div>
                <div className="text-right shrink-0">{headerRight}</div>
            </div>

            {/* ── Employee strip ──────────────────────────────────────── */}
            <div className="px-8 py-5 border-b border-border-light flex items-center bg-surface-1">
                <div className="flex items-center gap-4 w-full">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center border border-border-light text-[var(--text-tertiary)]">
                        <Users size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[16px] font-bold text-foreground tracking-tight truncate">{employeeName}</p>
                        {employeeCargo && (
                            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-secondary)] font-medium mt-0.5 truncate">
                                {employeeCargo}
                            </p>
                        )}
                    </div>
                    <div className="text-right shrink-0 pl-5 md:pr-4 border-l border-border-light">
                        <p className="font-mono text-[13px] font-bold text-foreground tabular-nums">CI {employeeCedula}</p>
                        <div className="inline-flex items-center gap-1.5 mt-1 font-mono text-[11px] text-[var(--text-secondary)] font-medium bg-surface-2 px-2 py-0.5 rounded border border-border-light">
                            <Clock size={12} className="text-[var(--text-tertiary)]" />
                            {yearsOfService} año{yearsOfService !== 1 ? "s" : ""}
                            {extraTenureLabel && (
                                <>
                                    <span className="text-[var(--text-tertiary)]">·</span>
                                    {extraTenureLabel}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── KPI band ────────────────────────────────────────────── */}
            <div className={`px-8 py-5 grid grid-cols-2 ${kpiCols} gap-6 border-b border-border-light bg-surface-2/20`}>
                {kpis.map(({ label, value, tone = "default" }) => (
                    <div key={label}>
                        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-tertiary)] mb-1 font-bold">{label}</p>
                        <p className={`font-mono text-[13px] font-bold tabular-nums ${KPI_TONE_CLS[tone]}`}>{value}</p>
                    </div>
                ))}
            </div>

            {/* ── Body (concepts + total) ─────────────────────────────── */}
            <div className="px-8 py-6">{children}</div>

            {/* ── Footer ──────────────────────────────────────────────── */}
            <div className="bg-surface-2/30 px-8 py-4 border-t border-border-light flex items-center justify-between mt-auto">
                <p className="font-mono text-[10px] text-[var(--text-tertiary)] leading-relaxed uppercase tracking-[0.15em] font-semibold">
                    {footerNote}
                </p>
                <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
                    <FileText size={14} />
                    <span className="font-mono text-[10px] font-bold tracking-[0.18em] uppercase">ID {documentId}</span>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// LiquidoTotal — the "Líquido a recibir" / "Monto a Pagar" panel
// ============================================================================

export interface LiquidoTotalProps {
    /** Header label, defaults to "Líquido a recibir". */
    label?:    string;
    valueBs:   number;
    /** When provided, also shows ≈ $X,XX USD · BCV X,XX */
    bcvRate?:  number;
    /** Optional accent in the right slot (e.g. indemnización pill). */
    rightSlot?: React.ReactNode;
}

export function LiquidoTotal({
    label = "Líquido a recibir", valueBs, bcvRate, rightSlot,
}: LiquidoTotalProps) {
    const totalUsd = bcvRate && bcvRate > 0 ? valueBs / bcvRate : null;
    return (
        <div className="mt-5 p-5 rounded-2xl bg-surface-2/60 border border-border-light flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
                <p className="font-mono text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 flex items-center gap-2">
                    <Sparkles size={11} className="text-primary-500" />
                    {label}
                </p>
                <p className="text-[28px] font-black tabular-nums text-foreground leading-none tracking-tight font-mono">
                    {formatCurrency(valueBs)}
                </p>
                {totalUsd != null && (
                    <p className="font-mono text-[12px] tabular-nums text-[var(--text-secondary)] mt-2 font-medium">
                        ≈ {formatUsd(totalUsd)}
                        <span className="text-[var(--text-tertiary)]"> · BCV {bcvRate!.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</span>
                    </p>
                )}
            </div>
            {rightSlot}
        </div>
    );
}

// ============================================================================
// CalcRow — single row inside a concept list
// ============================================================================

export interface CalcRowProps {
    label:    string;
    formula?: string;
    value:    string;
    accent?:  "green" | "amber";
    dim?:     boolean;
}

export function CalcRow({ label, formula, value, accent, dim }: CalcRowProps) {
    const valCls = dim
        ? "text-[var(--text-tertiary)]"
        : accent === "green"
            ? "text-emerald-500"
            : accent === "amber"
                ? "text-amber-500"
                : "text-foreground";
    return (
        <div className="flex items-start justify-between gap-2 py-1.5 border-b border-border-light/60 last:border-0">
            <div className="min-w-0">
                <span className="font-mono text-[13px] text-[var(--text-secondary)] leading-snug">{label}</span>
                {formula && (
                    <div className="font-mono text-[12px] text-[var(--text-tertiary)] mt-0.5 tabular-nums">{formula}</div>
                )}
            </div>
            <span className={`font-mono text-[13px] font-bold tabular-nums shrink-0 ${valCls}`}>{value}</span>
        </div>
    );
}

// Re-export utility formatters so consumers can grab everything from a single
// import path: `import { formatCurrency, ConstanciaShell } from ".../calculator"`.
export { formatCurrency, formatDateLong, formatDateUpper, formatUsd };
