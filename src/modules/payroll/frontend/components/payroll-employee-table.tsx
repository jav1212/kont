"use client";

// ============================================================================
// PAYROLL EMPLOYEE TABLE  v5
// ============================================================================

import React, { useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, FileDown, FileText, Scissors } from "lucide-react";
import { BaseTable }     from "@/src/shared/frontend/components/base-table";
import type { Column }   from "@/src/shared/frontend/components/base-table";
import { BaseInput }     from "@/src/shared/frontend/components/base-input";
import { AuditContainer, AuditRow } from "@/src/shared/frontend/components/base-audit";
import { ConfirmCompanyDialog, SummaryRow } from "@/src/shared/frontend/components/confirm-company-dialog";
import { useConfirmAction } from "@/src/shared/frontend/hooks/use-confirm-action";
import {
    EarningRowEditor,
    DeductionRowEditor,
    BonusRowEditor,
    HorasExtrasRowEditor,
    AddRowButton,
} from "./payroll-row-editors";
import type { EarningRow, DeductionRow, BonusRow, HorasExtrasRow } from "../types/payroll-types";
import { HORAS_EXTRAS_MULTIPLIER } from "../types/payroll-types";
import { generatePayrollPdf } from "../utils/payroll-pdf";
import { generatePayrollSummaryPdf } from "../utils/payroll-summary-pdf";
import type { PdfVisibility } from "../../backend/domain/payroll-settings";
import { computeAportes, downloadAportesCsv } from "../utils/aportes-patronales";
import { Employee, EmployeeEstado } from "../hooks/use-employee";

// ============================================================================
// TYPES
// ============================================================================

interface EmployeeOverride {
    extraEarnings:     EarningRow[];
    extraDeductions:   DeductionRow[];
    extraBonuses:      BonusRow[];
    extraHorasExtras:  HorasExtrasRow[];
    excludedGlobalIds: {
        earnings:    string[];
        bonuses:     string[];
        deductions:  string[];
        horasExtras: string[];
    };
}

type LineKind =
    | "earning" | "bonus" | "deduction" | "horas-extras"
    | "extra-earning" | "extra-bonus" | "extra-deduction" | "extra-horas-extras";

interface ComputedLine {
    label:      string;
    formula:    string;
    amount:     number;
    sourceId:   string;
    sourceKind: LineKind;
}

export interface EmployeeResult extends Employee {
    totalEarnings:   number;
    totalDeductions: number;
    totalBonuses:    number;
    gross:           number;
    net:             number;
    netUSD:          number;
    earningLines:    ComputedLine[];
    deductionLines:  ComputedLine[];
    bonusLines:      ComputedLine[];
    hasOverrides:    boolean;
    // Sprint 2: alícuotas
    alicuotaUtil:    number;
    alicuotaBono:    number;
    salarioIntegral: number;
    // Sprint 3: multi-moneda
    salarioVES:      number;   // siempre en VES, independiente de moneda
}

// ============================================================================
// ENGINE
// ============================================================================

function computeEmployee(
    emp:                    Employee,
    earningRows:            EarningRow[],
    deductRows:             DeductionRow[],
    bonusRows:              BonusRow[],
    overrides:              EmployeeOverride,
    mondaysInMonth:         number,
    bcvRate:                number,
    diasUtilidades:         number,
    diasBonoVacacional:     number,
    horasExtrasGlobal:      HorasExtrasRow[],
    salarioMinimo:          number,
    salaryMode:             "mensual" | "integral" = "mensual",
    // quincena is used to apply period-specific deduction rules (e.g. FAOV second-half rule)
    quincena:               1 | 2 = 1,
): EmployeeResult {
    // Sprint 3: convertir USD → VES para todos los cálculos
    const salarioVES = emp.moneda === "USD"
        ? emp.salarioMensual * (bcvRate || 1)
        : emp.salarioMensual;

    // Alícuotas (año comercial venezolano ÷ 360)
    const salarioDiarioPuro = salarioVES / 30;
    const alicuotaUtil      = salarioDiarioPuro * (diasUtilidades    / 360);
    const alicuotaBono      = salarioDiarioPuro * (diasBonoVacacional / 360);
    const salarioIntegral   = salarioVES + alicuotaUtil + alicuotaBono;

    // Base salarial según modo: mensual o integral
    const salarioBase = salaryMode === "integral" ? salarioIntegral : salarioVES;

    const daily      = salarioBase / 30;
    const weekly     = (salarioBase * 12) / 52;
    const weeklyBase = weekly * mondaysInMonth;

    // Filter globals by per-employee exclusions before mixing with extras.
    const excluded = overrides.excludedGlobalIds;
    const filteredEarningRows = earningRows.filter((r) => !excluded.earnings.includes(r.id));
    const filteredBonusRows   = bonusRows.filter((r)   => !excluded.bonuses.includes(r.id));

    // Apply period-specific rules: rows with quincenaRule "second-half" are excluded in Q1.
    // Extra deduction overrides per employee are never period-filtered.
    const periodFilteredDeductions = deductRows.filter(
        (r) => !(r.quincenaRule === "second-half" && quincena === 1) && !excluded.deductions.includes(r.id),
    );

    const hourlyRate = salarioVES / 30 / 8;

    const mapEarning = (r: EarningRow, kind: LineKind): ComputedLine => {
        const qty    = parseFloat(r.quantity)   || 0;
        const mult   = parseFloat(r.multiplier) || 1;
        const amount = r.useDaily ? qty * daily * mult : qty;
        return {
            label:      r.label || "—",
            formula:    r.useDaily ? `${qty}d x ${daily.toFixed(2)}${mult !== 1 ? ` x ${mult}` : ""}` : `${qty} VES`,
            amount,
            sourceId:   r.id,
            sourceKind: kind,
        };
    };

    const TIPO_LABEL = { diurna: "H.E. Diurnas", nocturna: "H.E. Nocturnas", feriado: "H.E. Feriado" };
    const mapHorasExtras = (r: HorasExtrasRow, kind: LineKind): ComputedLine => {
        const hrs    = parseFloat(r.hours) || 0;
        const mult   = HORAS_EXTRAS_MULTIPLIER[r.tipo];
        return {
            label:      TIPO_LABEL[r.tipo],
            formula:    `${hrs}h x ${hourlyRate.toFixed(2)}/h x ${mult}`,
            amount:     hrs * hourlyRate * mult,
            sourceId:   r.id,
            sourceKind: kind,
        };
    };

    const earningLines: ComputedLine[] = [
        ...filteredEarningRows.map((r) => mapEarning(r, "earning")),
        ...overrides.extraEarnings.map((r) => mapEarning(r, "extra-earning")),
        ...horasExtrasGlobal
            .filter((r) => r.active && parseFloat(r.hours) > 0 && !excluded.horasExtras.includes(r.id))
            .map((r) => mapHorasExtras(r, "horas-extras")),
        ...overrides.extraHorasExtras
            .filter((r) => parseFloat(r.hours) > 0)
            .map((r) => mapHorasExtras(r, "extra-horas-extras")),
    ];

    const mapBonus = (r: BonusRow, kind: LineKind): ComputedLine => {
        const raw = parseFloat(r.amount) || 0;
        const isVes = r.currency === "VES";
        return {
            label:      r.label || "—",
            formula:    isVes ? `${raw} Bs` : `${raw}$ x ${bcvRate}`,
            amount:     isVes ? raw : raw * bcvRate,
            sourceId:   r.id,
            sourceKind: kind,
        };
    };

    const bonusLines: ComputedLine[] = [
        ...filteredBonusRows.map((r) => mapBonus(r, "bonus")),
        ...overrides.extraBonuses.map((r) => mapBonus(r, "extra-bonus")),
    ];

    // SSO cap: base máxima = 10 salarios mínimos (IVSS)
    const cappedWeekly = salarioMinimo > 0 ? Math.min(weeklyBase, 10 * salarioMinimo) : weeklyBase;

    const mapDeduction = (r: DeductionRow, kind: LineKind): ComputedLine => {
        if (r.mode === "fixed") {
            const amount = parseFloat(r.rate) || 0;
            return { label: r.label || "—", formula: `${amount.toFixed(2)} Bs fijo`, amount, sourceId: r.id, sourceKind: kind };
        }
        const rate = parseFloat(r.rate) || 0;
        const isCapped = r.base === "weekly-capped";
        const base = isCapped        ? cappedWeekly
                   : r.base === "weekly"   ? weeklyBase
                   : r.base === "integral" ? salarioIntegral
                   : salarioBase;
        const formula = isCapped
            ? `${cappedWeekly.toFixed(2)} (tope 10SM) x ${rate}%`
            : r.base === "weekly"
                ? `${weekly.toFixed(2)} x ${mondaysInMonth}L x ${rate}%`
                : r.base === "integral"
                    ? `${salarioIntegral.toFixed(2)} integral x ${rate}%`
                    : `${salarioBase.toFixed(2)} x ${rate}%`;
        return { label: r.label || "—", formula, amount: base * (rate / 100), sourceId: r.id, sourceKind: kind };
    };

    const deductionLines: ComputedLine[] = [
        ...periodFilteredDeductions.map((r) => mapDeduction(r, "deduction")),
        ...overrides.extraDeductions.map((r) => mapDeduction(r, "extra-deduction")),
    ];

    const totalEarnings   = earningLines.reduce((s, l)   => s + l.amount, 0);
    const totalBonuses    = bonusLines.reduce((s, l)     => s + l.amount, 0);
    const totalDeductions = deductionLines.reduce((s, l) => s + l.amount, 0);
    const gross = totalEarnings + totalBonuses;
    const net   = gross - totalDeductions;

    return {
        ...emp,
        totalEarnings, totalDeductions, totalBonuses,
        gross, net, netUSD: bcvRate > 0 ? net / bcvRate : 0,
        earningLines, deductionLines, bonusLines,
        hasOverrides:
            overrides.extraEarnings.length    > 0 ||
            overrides.extraDeductions.length  > 0 ||
            overrides.extraBonuses.length     > 0 ||
            overrides.extraHorasExtras.length > 0 ||
            excluded.earnings.length          > 0 ||
            excluded.bonuses.length           > 0 ||
            excluded.deductions.length        > 0 ||
            excluded.horasExtras.length       > 0,
        alicuotaUtil, alicuotaBono, salarioIntegral,
        salarioVES,
    };
}

// ============================================================================
// HELPERS
// ============================================================================

let _seq = 0;
const uid = (p: string) => `${p}_${++_seq}_${Date.now()}`;

// Derive the stable key for an employee override map entry.
const getEmployeeKey = (emp: Employee) => emp.cedula;

// Empty override — overtime rows are now global, not per-employee seeded.
function buildDefaultOverride(): EmployeeOverride {
    return {
        extraEarnings: [], extraDeductions: [], extraBonuses: [], extraHorasExtras: [],
        excludedGlobalIds: { earnings: [], bonuses: [], deductions: [], horasExtras: [] },
    };
}

const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const toolbarBtnBase = [
    "h-8 px-3 rounded-lg flex items-center gap-1.5 border border-border-light bg-surface-1",
    "hover:border-border-medium hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed",
    "font-mono text-[12px] uppercase tracking-[0.18em] text-foreground transition-colors duration-150",
].join(" ");

const STATUS_CLS: Record<Employee["estado"], string> = {
    activo:   "bg-success/10 text-success border-success/20",
    inactivo: "bg-error/10 text-error border-error/20",
    vacacion: "bg-warning/10 text-warning border-warning/20",
};

const StatusBadge = ({ estado }: { estado: Employee["estado"] }) => (
    <span className={["inline-flex px-2 py-0.5 rounded-md border font-mono text-[11px] uppercase tracking-[0.16em]", STATUS_CLS[estado]].join(" ")}>
        {estado}
    </span>
);

const ExpandBtn = ({ open, onClick }: { open: boolean; onClick: () => void }) => (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
        style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        className={["w-6 h-6 flex items-center justify-center rounded-md border", open ? "border-primary-500/40 bg-primary-500/[0.08] text-primary-500" : "border-border-light text-[var(--text-tertiary)] hover:border-border-medium"].join(" ")}
    >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4l3 3 3-3" />
        </svg>
    </button>
);

const OverrideBadge = () => (
    <span className="inline-flex px-1.5 py-0.5 rounded border border-primary-500/30 bg-primary-500/[0.08] font-mono text-[8px] uppercase tracking-widest text-primary-500">+extras</span>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-400 mb-2 mt-4">{children}</p>
);

const ExcludedChip = ({ label, onRestore }: { label: string; onRestore: () => void }) => (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-amber-500/30 bg-surface-1 font-mono text-[11px] text-[var(--text-secondary)]">
        <span className="line-through text-[var(--text-disabled)]">{label}</span>
        <button
            type="button"
            onClick={onRestore}
            title="Restaurar línea para este empleado"
            aria-label="Restaurar línea"
            className="w-4 h-4 flex items-center justify-center rounded text-amber-500 hover:bg-amber-500/15 transition-colors"
        >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 5a3 3 0 1 1 1 2.2" />
                <path d="M2 2v3h3" />
            </svg>
        </button>
    </span>
);

const TablePlaceholder = ({ loading }: { loading: boolean }) => (
    <div className="flex items-center justify-center h-32 border border-border-light rounded-xl">
        {loading ? (
            <div className="flex items-center gap-2 text-neutral-400">
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
                    <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span className="font-mono text-[13px] uppercase tracking-widest">Cargando empleados...</span>
            </div>
        ) : (
            <span className="font-mono text-[13px] text-neutral-300 uppercase tracking-widest">Sin empleados. Agrega empleados en la sección de Empleados.</span>
        )}
    </div>
);

const CheckIcon = () => (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success">
        <path d="M2 6l3 3 5-5" />
    </svg>
);

// ============================================================================
// EXPANDED PANEL
// ============================================================================

interface ExpandedPanelProps {
    result:             EmployeeResult;
    override:           EmployeeOverride;
    mondaysInMonth:     number;
    bcvRate:            number;
    diasUtilidades:     number;
    diasBonoVacacional: number;
    salarioMinimo:      number;
    earningRows:        EarningRow[];
    bonusRows:          BonusRow[];
    deductionRows:      DeductionRow[];
    horasExtrasGlobal:  HorasExtrasRow[];
    onChange:           (updated: EmployeeOverride) => void;
}

const ExpandedPanel = ({
    result, override, mondaysInMonth, bcvRate, diasUtilidades, diasBonoVacacional, salarioMinimo,
    earningRows, bonusRows, deductionRows, horasExtrasGlobal, onChange,
}: ExpandedPanelProps) => {
    // Usar salarioVES para que las tasas de los extras sean consistentes con el cálculo principal
    const empDailyRate      = result.salarioVES / 30;
    const empHourlyRate     = empDailyRate / 8;
    const empWeeklyRate     = (result.salarioVES * 12) / 52;
    const empWeeklyBase     = empWeeklyRate * mondaysInMonth;
    const empCappedWeekly   = salarioMinimo > 0 ? Math.min(empWeeklyBase, 10 * salarioMinimo) : empWeeklyBase;
    const empIntegralBase   = result.salarioIntegral;

    const addXE    = () => onChange({ ...override, extraEarnings:   [...override.extraEarnings,   { id: uid("xe"), label: "", quantity: "0", multiplier: "1.0", useDaily: true }] });
    const updateXE = (id: string, u: EarningRow)   => onChange({ ...override, extraEarnings:   override.extraEarnings.map((r)   => r.id === id ? u : r) });
    const removeXE = (id: string)                   => onChange({ ...override, extraEarnings:   override.extraEarnings.filter((r)   => r.id !== id) });

    const addXB    = () => onChange({ ...override, extraBonuses:    [...override.extraBonuses,    { id: uid("xb"), label: "", amount: "0.00", currency: "USD" }] });
    const updateXB = (id: string, u: BonusRow)     => onChange({ ...override, extraBonuses:    override.extraBonuses.map((r)    => r.id === id ? u : r) });
    const removeXB = (id: string)                  => onChange({ ...override, extraBonuses:    override.extraBonuses.filter((r)    => r.id !== id) });

    const addXD    = () => onChange({ ...override, extraDeductions: [...override.extraDeductions, { id: uid("xd"), label: "", rate: "0", base: "monthly" as const, mode: "rate" as const }] });
    const addLoan  = () => onChange({ ...override, extraDeductions: [...override.extraDeductions, { id: uid("xd"), label: "Préstamo / Anticipo", rate: "0", base: "monthly" as const, mode: "fixed" as const }] });
    const updateXD = (id: string, u: DeductionRow) => onChange({ ...override, extraDeductions: override.extraDeductions.map((r) => r.id === id ? u : r) });
    const removeXD = (id: string)                  => onChange({ ...override, extraDeductions: override.extraDeductions.filter((r) => r.id !== id) });

    const addXH    = () => onChange({ ...override, extraHorasExtras: [...override.extraHorasExtras, { id: uid("xh"), tipo: "diurna" as const, hours: "0", active: true }] });
    const updateXH = (id: string, u: HorasExtrasRow) => onChange({ ...override, extraHorasExtras: override.extraHorasExtras.map((r) => r.id === id ? u : r) });
    const removeXH = (id: string)                    => onChange({ ...override, extraHorasExtras: override.extraHorasExtras.filter((r) => r.id !== id) });

    // Exclude a global row (sólo para este empleado).
    const excludeGlobal = (group: keyof EmployeeOverride["excludedGlobalIds"], id: string) =>
        onChange({
            ...override,
            excludedGlobalIds: {
                ...override.excludedGlobalIds,
                [group]: override.excludedGlobalIds[group].includes(id)
                    ? override.excludedGlobalIds[group]
                    : [...override.excludedGlobalIds[group], id],
            },
        });

    // Restore a previously excluded global row.
    const restoreGlobal = (group: keyof EmployeeOverride["excludedGlobalIds"], id: string) =>
        onChange({
            ...override,
            excludedGlobalIds: {
                ...override.excludedGlobalIds,
                [group]: override.excludedGlobalIds[group].filter((x) => x !== id),
            },
        });

    // Unified handler: an X click on any audit line either drops an extra or excludes a global.
    const removeAuditLine = (kind: LineKind, sourceId: string) => {
        switch (kind) {
            case "extra-earning":      return removeXE(sourceId);
            case "extra-bonus":        return removeXB(sourceId);
            case "extra-deduction":    return removeXD(sourceId);
            case "extra-horas-extras": return removeXH(sourceId);
            case "earning":            return excludeGlobal("earnings",    sourceId);
            case "bonus":              return excludeGlobal("bonuses",     sourceId);
            case "deduction":          return excludeGlobal("deductions",  sourceId);
            case "horas-extras":       return excludeGlobal("horasExtras", sourceId);
        }
    };

    const excluded = override.excludedGlobalIds;
    const excludedEarnings    = excluded.earnings.map((id)    => ({ id, label: earningRows.find((r)       => r.id === id)?.label ?? id })).filter((x) => x.label);
    const excludedBonuses     = excluded.bonuses.map((id)     => ({ id, label: bonusRows.find((r)         => r.id === id)?.label ?? id })).filter((x) => x.label);
    const excludedDeductions  = excluded.deductions.map((id)  => ({ id, label: deductionRows.find((r)     => r.id === id)?.label ?? id })).filter((x) => x.label);
    const excludedHorasExtras = excluded.horasExtras.map((id) => {
        const r = horasExtrasGlobal.find((x) => x.id === id);
        return { id, label: r ? (r.tipo === "diurna" ? "H.E. Diurnas" : r.tipo === "nocturna" ? "H.E. Nocturnas" : "H.E. Feriado") : id };
    });
    const totalExcluded = excludedEarnings.length + excludedBonuses.length + excludedDeductions.length + excludedHorasExtras.length;

    const firstName = result.nombre.split(" ")[0];

    return (
        <div className="bg-surface-2 border-t border-border-light px-6 py-5">
            {/* Alícuotas chip */}
            <div className="flex items-center gap-3 mb-4 p-3 rounded-lg border border-border-light bg-surface-1 flex-wrap">
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] shrink-0">Sal. Integral</span>
                <span className="font-mono text-[12px] tabular-nums text-foreground font-medium">Bs. {fmt(result.salarioIntegral)}</span>
                <span className="font-mono text-[11px] text-[var(--text-disabled)] mx-1">=</span>
                <span className="font-mono text-[12px] text-[var(--text-secondary)]">
                    {result.moneda === "USD"
                        ? `$${fmt(result.salarioMensual)} (Bs. ${fmt(result.salarioVES)})`
                        : `Bs. ${fmt(result.salarioVES)}`}
                </span>
                <span className="font-mono text-[11px] text-[var(--text-disabled)]">+</span>
                <span className="font-mono text-[11px] text-amber-500" title={`Alíc. Utilidades (${diasUtilidades}d)`}>util {fmt(result.alicuotaUtil)}</span>
                <span className="font-mono text-[11px] text-[var(--text-disabled)]">+</span>
                <span className="font-mono text-[11px] text-amber-500" title={`Alíc. Bono Vacacional (${diasBonoVacacional}d)`}>bono vac {fmt(result.alicuotaBono)}</span>
            </div>
            {/* Audit columns */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <AuditContainer title="Asignaciones" total={result.totalEarnings} type="income">
                    {result.earningLines.map((l) => (
                        <AuditRow
                            key={`${l.sourceKind}:${l.sourceId}`}
                            label={l.label} formula={l.formula} value={l.amount}
                            onRemove={() => removeAuditLine(l.sourceKind, l.sourceId)}
                        />
                    ))}
                </AuditContainer>
                <AuditContainer title="Bonificaciones" total={result.totalBonuses} type="income">
                    {result.bonusLines.map((l) => (
                        <AuditRow
                            key={`${l.sourceKind}:${l.sourceId}`}
                            label={l.label} formula={l.formula} value={l.amount}
                            onRemove={() => removeAuditLine(l.sourceKind, l.sourceId)}
                        />
                    ))}
                </AuditContainer>
                <AuditContainer title="Deducciones" total={result.totalDeductions} type="deduction">
                    {result.deductionLines.map((l) => (
                        <AuditRow
                            key={`${l.sourceKind}:${l.sourceId}`}
                            label={l.label} formula={l.formula} value={l.amount} isNegative
                            onRemove={() => removeAuditLine(l.sourceKind, l.sourceId)}
                        />
                    ))}
                </AuditContainer>
            </div>

            {totalExcluded > 0 && (
                <div className="mt-4 p-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.05]">
                    <div className="flex items-center gap-2 mb-2">
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-amber-500">
                            <path d="M6 1v6M6 9.5v.5" /><circle cx="6" cy="6" r="5" />
                        </svg>
                        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-amber-500">Líneas excluidas para {firstName}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {excludedEarnings.map((x) => (
                            <ExcludedChip key={`e:${x.id}`} label={x.label} onRestore={() => restoreGlobal("earnings", x.id)} />
                        ))}
                        {excludedBonuses.map((x) => (
                            <ExcludedChip key={`b:${x.id}`} label={x.label} onRestore={() => restoreGlobal("bonuses", x.id)} />
                        ))}
                        {excludedDeductions.map((x) => (
                            <ExcludedChip key={`d:${x.id}`} label={x.label} onRestore={() => restoreGlobal("deductions", x.id)} />
                        ))}
                        {excludedHorasExtras.map((x) => (
                            <ExcludedChip key={`h:${x.id}`} label={x.label} onRestore={() => restoreGlobal("horasExtras", x.id)} />
                        ))}
                    </div>
                </div>
            )}

            <div className="flex items-center gap-3 mt-6 mb-1">
                <div className="flex-1 border-t border-dashed border-border-light" />
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-300">Extras exclusivos — {firstName}</span>
                <div className="flex-1 border-t border-dashed border-border-light" />
            </div>

            <SectionLabel>Horas extras (Art. 118 LOTTT)</SectionLabel>
            {override.extraHorasExtras.length === 0 && <p className="font-mono text-[12px] text-neutral-300 italic mb-1">Sin horas extras.</p>}
            <div className="space-y-2">
                {override.extraHorasExtras.map((row) => (
                    <HorasExtrasRowEditor key={row.id} row={row} hourlyRate={empHourlyRate} canRemove onChange={(u) => updateXH(row.id, u)} onRemove={() => removeXH(row.id)} />
                ))}
            </div>
            <AddRowButton onClick={addXH} />

            <SectionLabel>Asignaciones adicionales</SectionLabel>
            {override.extraEarnings.length === 0 && <p className="font-mono text-[12px] text-neutral-300 italic mb-1">Sin asignaciones extra.</p>}
            <div className="space-y-2">
                {override.extraEarnings.map((row) => (
                    <EarningRowEditor key={row.id} row={row} dailyRate={empDailyRate} canRemove onChange={(u) => updateXE(row.id, u)} onRemove={() => removeXE(row.id)} />
                ))}
            </div>
            <AddRowButton onClick={addXE} />

            <SectionLabel>Bonos adicionales</SectionLabel>
            {override.extraBonuses.length === 0 && <p className="font-mono text-[12px] text-neutral-300 italic mb-1">Sin bonos extra.</p>}
            <div className="space-y-2">
                {override.extraBonuses.map((row) => (
                    <BonusRowEditor key={row.id} row={row} bcvRate={bcvRate} canRemove onChange={(u) => updateXB(row.id, u)} onRemove={() => removeXB(row.id)} />
                ))}
            </div>
            <AddRowButton onClick={addXB} />

            <SectionLabel>Deducciones adicionales</SectionLabel>
            {override.extraDeductions.length === 0 && <p className="font-mono text-[12px] text-neutral-300 italic mb-1">Sin deducciones extra.</p>}
            <div className="space-y-2">
                {override.extraDeductions.map((row) => (
                    <DeductionRowEditor key={row.id} row={row} weeklyBase={empWeeklyBase} monthlyBase={result.salarioMensual} integralBase={empIntegralBase} cappedWeeklyBase={empCappedWeekly} canRemove onChange={(u) => updateXD(row.id, u)} onRemove={() => removeXD(row.id)} />
                ))}
            </div>
            <div className="flex items-center gap-4">
                <AddRowButton onClick={addXD} />
                <button
                    onClick={addLoan}
                    className="flex items-center gap-1.5 mt-1 font-mono text-[12px] uppercase tracking-[0.18em] text-amber-500/60 hover:text-amber-500 transition-colors duration-150"
                >
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M5.5 1v9M1 5.5h9" />
                    </svg>
                    Préstamo / Anticipo
                </button>
            </div>
        </div>
    );
};

// ============================================================================
// MOBILE EMPLOYEE CARD  — replaces BaseTable on viewports < lg
// ============================================================================

interface EmployeeMobileCardProps {
    result:             EmployeeResult;
    expanded:           boolean;
    onToggleExpand:     () => void;
    override:           EmployeeOverride;
    mondaysInMonth:     number;
    bcvRate:            number;
    diasUtilidades:     number;
    diasBonoVacacional: number;
    salarioMinimo:      number;
    earningRows:        EarningRow[];
    bonusRows:          BonusRow[];
    deductionRows:      DeductionRow[];
    horasExtrasGlobal:  HorasExtrasRow[];
    onOverrideChange:   (updated: EmployeeOverride) => void;
}

const EmployeeMobileCard = ({
    result, expanded, onToggleExpand,
    override, mondaysInMonth, bcvRate, diasUtilidades, diasBonoVacacional, salarioMinimo,
    earningRows, bonusRows, deductionRows, horasExtrasGlobal,
    onOverrideChange,
}: EmployeeMobileCardProps) => (
    <div
        className="rounded-xl border border-border-light bg-surface-1 shadow-sm overflow-hidden cursor-pointer"
        onClick={onToggleExpand}
        onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                onToggleExpand();
            }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={expanded}
    >
        <div className="px-4 py-3 space-y-3">
            {/* Header: nombre + estado + extras badge */}
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className="font-mono text-[13px] font-bold uppercase tracking-[0.06em] text-foreground leading-tight truncate">
                        {result.nombre}
                    </p>
                    <p className="font-mono text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest mt-0.5">
                        {result.cedula}{result.cargo ? ` · ${result.cargo}` : ""}
                    </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {result.hasOverrides && <OverrideBadge />}
                    <StatusBadge estado={result.estado as EmployeeEstado} />
                </div>
            </div>

            {/* Salario row */}
            <div className="flex items-center justify-between font-mono text-[12px]">
                <span className="text-[var(--text-tertiary)] uppercase tracking-[0.16em]">Salario</span>
                <div className="flex items-center gap-1.5 tabular-nums">
                    {result.moneda === "USD" ? (
                        <>
                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-primary-500/30 bg-primary-500/[0.08] text-primary-400 uppercase tracking-widest">USD</span>
                            <span>${fmt(result.salarioMensual)}</span>
                        </>
                    ) : (
                        <span>Bs. {fmt(result.salarioMensual)}</span>
                    )}
                </div>
            </div>

            <div className="border-t border-border-light/70" />

            {/* Numeric breakdown */}
            <dl className="space-y-1.5 font-mono text-[12px] tabular-nums">
                <div className="flex items-center justify-between">
                    <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.16em]">Bruto</dt>
                    <dd className="text-[var(--text-secondary)]">Bs. {fmt(result.gross)}</dd>
                </div>
                <div className="flex items-center justify-between">
                    <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.16em]">Deducciones</dt>
                    <dd className="text-error/80">−Bs. {fmt(result.totalDeductions)}</dd>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-border-light/40">
                    <dt className="text-[var(--text-link)] uppercase tracking-[0.16em] font-bold">Neto VES</dt>
                    <dd className="text-[16px] font-black text-primary-500">Bs. {fmt(result.net)}</dd>
                </div>
                <div className="flex items-center justify-between">
                    <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.16em]">Neto USD</dt>
                    <dd className="text-[var(--text-secondary)]">${fmt(result.netUSD)}</dd>
                </div>
            </dl>

            {/* Expand toggle */}
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
                className={[
                    "w-full h-9 rounded-lg border flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors",
                    expanded
                        ? "border-primary-500/40 bg-primary-500/[0.08] text-primary-500"
                        : "border-border-light bg-surface-2 text-[var(--text-secondary)] hover:border-border-medium",
                ].join(" ")}
            >
                {expanded ? "Ocultar detalle" : "Ver detalle"}
                <svg
                    width="10" height="10" viewBox="0 0 10 10" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
                >
                    <path d="M2 4l3 3 3-3" />
                </svg>
            </button>
        </div>

        {expanded && (
            <div
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                className="cursor-auto"
            >
                <ExpandedPanel
                    result={result}
                    override={override}
                    mondaysInMonth={mondaysInMonth}
                    bcvRate={bcvRate}
                    diasUtilidades={diasUtilidades}
                    diasBonoVacacional={diasBonoVacacional}
                    salarioMinimo={salarioMinimo}
                    earningRows={earningRows}
                    bonusRows={bonusRows}
                    deductionRows={deductionRows}
                    horasExtrasGlobal={horasExtrasGlobal}
                    onChange={onOverrideChange}
                />
            </div>
        )}
    </div>
);

// ============================================================================
// APORTES PATRONALES PANEL
// ============================================================================

interface AportesPanelProps {
    results:        EmployeeResult[];
    mondaysInMonth: number;
    salarioMinimo:  number;
    periodLabel?:   string;
    companyName:    string;
    quincena:       1 | 2;
}

const AportesPatronalesPanel = ({ results, mondaysInMonth, salarioMinimo, periodLabel, companyName, quincena }: AportesPanelProps) => {
    const [open, setOpen] = useState(false);

    const applyInces = quincena === 2;

    const aportes = useMemo(() =>
        results.map((r) => computeAportes(
            { salarioVES: r.salarioVES, gross: r.gross, cedula: r.cedula, nombre: r.nombre, cargo: r.cargo },
            { mondaysInMonth, salarioMinimo, applyInces },
        )),
        [results, mondaysInMonth, salarioMinimo, applyInces],
    );

    const totals = useMemo(() => aportes.reduce(
        (s, a) => ({ sso: s.sso + a.ssoPatronal, faov: s.faov + a.faovPatronal, inces: s.inces + a.incesPatronal, total: s.total + a.total }),
        { sso: 0, faov: 0, inces: 0, total: 0 },
    ), [aportes]);

    const handleCsv = useCallback(() => {
        downloadAportesCsv(aportes, { companyName, periodLabel: periodLabel ?? "" });
    }, [aportes, companyName, periodLabel]);

    const fmtN = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
        <div className="mt-4 border border-border-light rounded-xl overflow-hidden">
            {/* Header / toggle */}
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-3 bg-surface-1 hover:bg-surface-2 transition-colors duration-150"
            >
                <div className="flex items-center gap-3">
                    <span className="font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">Aportes Patronales</span>
                    <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
                        IVSS 9% · BANAVIH 2% · {applyInces ? "INCES 2%" : "INCES en última quincena"}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">{fmtN(totals.total)} Bs</span>
                    <svg
                        width="10" height="10" viewBox="0 0 10 10" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className="text-[var(--text-tertiary)] transition-transform duration-200 flex-shrink-0"
                        style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
                    >
                        <path d="M2 4l3 3 3-3" />
                    </svg>
                </div>
            </button>

            {open && (
                <div className="bg-surface-2 p-4 space-y-3">
                    {/* Desktop table (lg+) */}
                    <div className="hidden lg:block overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-border-light">
                                    {["Empleado", "Sal. Mensual", "SSO 9%", "BANAVIH 2%", "INCES 2%", "Total"].map((h) => (
                                        <th key={h} className="pb-2 pr-4 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {aportes.map((a) => (
                                    <tr key={a.cedula} className="border-b border-border-light/40 hover:bg-surface-1/50">
                                        <td className="py-2 pr-4">
                                            <p className="font-mono text-[12px] text-foreground">{a.nombre}</p>
                                            <p className="font-mono text-[11px] text-[var(--text-tertiary)]">{a.cedula}</p>
                                        </td>
                                        <td className="py-2 pr-4 font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">{fmtN(a.salarioVES)}</td>
                                        <td className="py-2 pr-4 font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">{fmtN(a.ssoPatronal)}</td>
                                        <td className="py-2 pr-4 font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">{fmtN(a.faovPatronal)}</td>
                                        <td className="py-2 pr-4 font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">{fmtN(a.incesPatronal)}</td>
                                        <td className="py-2 font-mono text-[12px] tabular-nums text-foreground font-medium">{fmtN(a.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t border-border-medium">
                                    <td className="pt-2 pr-4 font-mono text-[11px] uppercase tracking-widest text-[var(--text-tertiary)]">Total</td>
                                    <td className="pt-2 pr-4" />
                                    <td className="pt-2 pr-4 font-mono text-[12px] tabular-nums text-[var(--text-secondary)] font-medium">{fmtN(totals.sso)}</td>
                                    <td className="pt-2 pr-4 font-mono text-[12px] tabular-nums text-[var(--text-secondary)] font-medium">{fmtN(totals.faov)}</td>
                                    <td className="pt-2 pr-4 font-mono text-[12px] tabular-nums text-[var(--text-secondary)] font-medium">{fmtN(totals.inces)}</td>
                                    <td className="pt-2 font-mono text-[14px] tabular-nums text-primary-500 font-black">{fmtN(totals.total)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Mobile cards (< lg) */}
                    <div className="lg:hidden space-y-2">
                        {aportes.map((a) => (
                            <div key={a.cedula} className="rounded-lg border border-border-light bg-surface-1 p-3 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="font-mono text-[12px] text-foreground truncate">{a.nombre}</p>
                                        <p className="font-mono text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest">{a.cedula}</p>
                                    </div>
                                    <span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)] shrink-0">
                                        Sal. {fmtN(a.salarioVES)}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 font-mono text-[11px] tabular-nums">
                                    <div className="flex items-center justify-between rounded border border-border-light/60 bg-surface-2 px-2 py-1">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em]">SSO 9%</span>
                                        <span className="text-[var(--text-secondary)]">{fmtN(a.ssoPatronal)}</span>
                                    </div>
                                    <div className="flex items-center justify-between rounded border border-border-light/60 bg-surface-2 px-2 py-1">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em]">BANAVIH</span>
                                        <span className="text-[var(--text-secondary)]">{fmtN(a.faovPatronal)}</span>
                                    </div>
                                    <div className="flex items-center justify-between rounded border border-border-light/60 bg-surface-2 px-2 py-1">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em]">INCES</span>
                                        <span className="text-[var(--text-secondary)]">{fmtN(a.incesPatronal)}</span>
                                    </div>
                                    <div className="flex items-center justify-between rounded border border-primary-500/30 bg-primary-500/[0.06] px-2 py-1">
                                        <span className="text-[var(--text-link)] uppercase tracking-[0.14em] font-bold">Total</span>
                                        <span className="text-primary-500 font-black">{fmtN(a.total)}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {/* Mobile totals card */}
                        <div className="rounded-lg border border-border-medium bg-surface-1 p-3 space-y-2">
                            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Totales</p>
                            <div className="grid grid-cols-2 gap-2 font-mono text-[11px] tabular-nums">
                                <div className="flex items-center justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em]">SSO</span>
                                    <span className="text-[var(--text-secondary)] font-medium">{fmtN(totals.sso)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em]">BANAVIH</span>
                                    <span className="text-[var(--text-secondary)] font-medium">{fmtN(totals.faov)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em]">INCES</span>
                                    <span className="text-[var(--text-secondary)] font-medium">{fmtN(totals.inces)}</span>
                                </div>
                                <div className="flex items-center justify-between border-t border-border-light/50 col-span-2 pt-1.5 mt-0.5">
                                    <span className="text-[var(--text-link)] uppercase tracking-[0.16em] font-bold">Total general</span>
                                    <span className="text-[14px] text-primary-500 font-black">{fmtN(totals.total)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Info + CSV */}
                    <div className="flex items-start justify-between gap-2 pt-1 flex-wrap">
                        <p className="font-mono text-[11px] text-[var(--text-tertiary)] leading-relaxed flex-1 min-w-[200px]">
                            SSO: base semanal{salarioMinimo > 0 ? ` con tope ${(10 * salarioMinimo).toLocaleString("es-VE", { maximumFractionDigits: 0 })} Bs` : ""} · BANAVIH: salario mensual · INCES: {applyInces ? "salario mensual" : "se aporta solo en la última quincena (sobre salario mensual)"}
                        </p>
                        <button
                            onClick={handleCsv}
                            className="h-8 px-3 rounded-lg flex items-center gap-1.5 border border-border-light bg-surface-1 hover:border-border-medium hover:bg-surface-2 font-mono text-[12px] uppercase tracking-[0.18em] text-foreground transition-colors duration-150"
                        >
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 1v7M3 5l3 3 3-3" /><path d="M1 10h10" />
                            </svg>
                            <span className="hidden sm:inline">Exportar CSV</span>
                            <span className="sm:hidden">CSV</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// TOTALS BAR
// ============================================================================

const TotalsBar = ({ results }: { results: EmployeeResult[] }) => {
    const active = results.filter((r) => r.estado === "activo");
    const T = active.reduce((s, r) => ({ gross: s.gross + r.gross, ded: s.ded + r.totalDeductions, net: s.net + r.net, usd: s.usd + r.netUSD }), { gross: 0, ded: 0, net: 0, usd: 0 });
    return (
        <div className="px-4 sm:px-5 py-3 bg-surface-1 rounded-xl border border-border-light flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <span className="font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{active.length} empleados activos</span>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 tabular-nums lg:flex lg:items-center lg:gap-8">
                <div className="flex flex-col items-end">
                    <span className="font-mono text-[11px] uppercase text-[var(--text-tertiary)] tracking-widest">Bruto</span>
                    <span className="font-mono text-[12px] text-[var(--text-secondary)]">{fmt(T.gross)}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="font-mono text-[11px] uppercase text-[var(--text-tertiary)] tracking-widest">Deducciones</span>
                    <span className="font-mono text-[12px] text-red-500 dark:text-red-400">-{fmt(T.ded)}</span>
                </div>
                <div className="hidden lg:block w-px h-8 bg-border-light" />
                <div className="flex flex-col items-end">
                    <span className="font-mono text-[11px] uppercase text-[var(--text-tertiary)] tracking-widest">Neto VES</span>
                    <span className="font-mono text-[18px] font-black text-primary-500">{fmt(T.net)}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="font-mono text-[11px] uppercase text-[var(--text-tertiary)] tracking-widest">Neto USD</span>
                    <span className="font-mono text-[12px] text-[var(--text-secondary)]">${fmt(T.usd)}</span>
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

export interface PayrollEmployeeTableProps {
    employees:                Employee[];
    empLoading:               boolean;
    onConfirm?:               (results: EmployeeResult[]) => Promise<boolean>;
    onSaveDraft?:             (results: EmployeeResult[]) => Promise<{ runId: string | null }>;
    earningRows:              EarningRow[];
    deductionRows:            DeductionRow[];
    bonusRows:                BonusRow[];
    mondaysInMonth:           number;
    bcvRate:                  number;
    diasUtilidades:           number;
    diasBonoVacacional:       number;
    horasExtrasGlobal?:       HorasExtrasRow[];
    salarioMinimo?:           number;  // para tope SSO (10 SM)
    companyName:              string;
    companyId?:               string;
    companyLogoUrl?:          string;
    showLogoInPdf?:           boolean;
    payrollDate:              string;
    periodStart?:             string;
    periodLabel?:             string;
    periodAlreadyConfirmed?:  boolean;
    salaryMode?:              "mensual" | "integral";
    // REQ-005: period for FAOV/quincena rule application
    quincena?:                1 | 2;
    // REQ-005: per-company PDF segment visibility
    pdfVisibility?:           PdfVisibility;
}

export const PayrollEmployeeTable = ({
    employees, empLoading, onConfirm, onSaveDraft,
    earningRows, deductionRows, bonusRows, mondaysInMonth, bcvRate,
    diasUtilidades, diasBonoVacacional,
    horasExtrasGlobal = [], salarioMinimo = 0,
    companyName, companyId, companyLogoUrl, showLogoInPdf,
    payrollDate, periodStart, periodLabel,
    periodAlreadyConfirmed, salaryMode,
    quincena = 1, pdfVisibility,
}: PayrollEmployeeTableProps) => {

    const [expandedId,       setExpandedId]       = useState<string | null>(null);
    const [search,           setSearch]           = useState("");
    const [confirmOk,        setConfirmOk]        = useState(false);
    const [includeVacaciones, setIncludeVacaciones] = useState(true);
    const [draftSavedAt,     setDraftSavedAt]     = useState<Date | null>(null);
    const [pdfMenuOpen,      setPdfMenuOpen]      = useState(false);

    // Diálogo único de confirmación para los 3 disparadores (PDF, reporte, confirmar nómina).
    const dialog = useConfirmAction();

    const [overrides, setOverrides] = useState<Map<string, EmployeeOverride>>(new Map());
    const getOverride = useCallback(
        (id: string) => overrides.get(id) ?? buildDefaultOverride(),
        [overrides],
    );
    const setOverride = useCallback((id: string, updated: EmployeeOverride) => {
        setOverrides((prev) => { const next = new Map(prev); next.set(id, updated); return next; });
    }, []);

    // Inactivos excluidos siempre; vacaciones según toggle
    const activeEmployees = useMemo(
        () => employees.filter((e) => e.estado !== "inactivo" && (includeVacaciones || e.estado !== "vacacion")),
        [employees, includeVacaciones],
    );

    const results = useMemo<EmployeeResult[]>(() =>
        activeEmployees.map((emp) => computeEmployee(
            emp, earningRows, deductionRows, bonusRows,
            getOverride(getEmployeeKey(emp)), mondaysInMonth, bcvRate,
            diasUtilidades, diasBonoVacacional,
            horasExtrasGlobal, salarioMinimo,
            salaryMode, quincena,
        )),
        [activeEmployees, earningRows, deductionRows, bonusRows, mondaysInMonth, bcvRate, diasUtilidades, diasBonoVacacional, horasExtrasGlobal, salarioMinimo, salaryMode, quincena, getOverride]
    );

    const zeroSalaryCount = useMemo(() => results.filter((r) => r.salarioMensual <= 0).length, [results]);

    const handleExportPdf = useCallback(async (pdfMode: "simple" | "duplicado") => {
        if (!results.length) return;
        await generatePayrollPdf(
            results.map((r) => ({
                cedula: r.cedula, nombre: r.nombre, cargo: r.cargo, salarioMensual: r.salarioMensual, estado: r.estado,
                earningLines: r.earningLines, bonusLines: r.bonusLines, deductionLines: r.deductionLines,
                totalEarnings: r.totalEarnings, totalBonuses: r.totalBonuses, totalDeductions: r.totalDeductions,
                gross: r.gross, net: r.net, netUSD: r.netUSD,
                alicuotaUtil: r.alicuotaUtil, alicuotaBono: r.alicuotaBono, salarioIntegral: r.salarioIntegral,
            })),
            {
                companyName, companyId, payrollDate, periodStart, periodLabel, bcvRate, mondaysInMonth, salaryMode,
                logoUrl: companyLogoUrl, showLogoInPdf, pdfVisibility, pdfMode,
            }
        );

        // Auto-guardar como borrador para que el usuario tenga respaldo en BD.
        // Si el período ya está confirmado no se reescribe nada (es inmutable).
        if (!onSaveDraft || periodAlreadyConfirmed) return;
        const { runId } = await onSaveDraft(results);
        if (runId) {
            setDraftSavedAt(new Date());
            toast.success("Recibo exportado y nómina guardada como borrador");
        }
    }, [results, companyName, companyId, companyLogoUrl, showLogoInPdf, payrollDate, periodStart, periodLabel, bcvRate, mondaysInMonth, salaryMode, pdfVisibility, onSaveDraft, periodAlreadyConfirmed]);

    const handleExportSummaryPdf = useCallback(async () => {
        const active = results.filter((r) => r.estado === "activo");
        if (!active.length) return;
        await generatePayrollSummaryPdf(
            active.map((r) => ({
                cedula:          r.cedula,
                nombre:          r.nombre,
                cargo:           r.cargo,
                salarioMensual:  r.salarioMensual,
                totalEarnings:   r.totalEarnings,
                totalBonuses:    r.totalBonuses,
                totalDeductions: r.totalDeductions,
                net:             r.net,
                netUSD:          r.netUSD,
            })),
            {
                companyName,
                companyId,
                periodLabel: periodLabel ?? "",
                periodStart,
                periodEnd:   payrollDate,
                bcvRate,
            },
        );
    }, [results, companyName, companyId, periodLabel, periodStart, payrollDate, bcvRate]);

    const handleConfirmExecute = useCallback(async () => {
        if (!onConfirm || !results.length) return;
        setConfirmOk(false);
        const ok = await onConfirm(results);
        if (ok) setConfirmOk(true);
    }, [onConfirm, results]);

    const columns: Column<EmployeeResult>[] = [
        {
            key: "nombre", label: "Empleado", sortable: true, searchable: true,
            render: (_, r) => (
                <div className="flex flex-col gap-0.5 py-0.5">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] font-medium leading-tight">{r.nombre}</span>
                        {r.hasOverrides && <OverrideBadge />}
                    </div>
                    <span className="font-mono text-[11px] text-neutral-400 uppercase tracking-widest">{r.cedula}</span>
                </div>
            ),
        },
        { key: "cargo", label: "Cargo", sortable: true, searchable: true, render: (v) => <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-neutral-500">{String(v)}</span> },
        {
            key: "salarioMensual", label: "Salario", sortable: true, align: "end",
            render: (_, r) => (
                <div className="flex flex-col items-end gap-0.5">
                    {r.moneda === "USD" ? (
                        <>
                            <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-primary-500/30 bg-primary-500/[0.08] text-primary-400 uppercase tracking-widest">USD</span>
                                <span className="font-mono text-[12px] tabular-nums">${fmt(r.salarioMensual)}</span>
                            </div>
                            <span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">≈ Bs. {fmt(r.salarioVES)}</span>
                        </>
                    ) : (
                        <span className="font-mono text-[12px] tabular-nums">Bs. {fmt(r.salarioMensual)}</span>
                    )}
                </div>
            ),
        },
        { key: "estado", label: "Estado", align: "center", render: (v) => <StatusBadge estado={v as EmployeeEstado} /> },
        { key: "gross", label: "Bruto VES", sortable: true, align: "end", render: (_, r) => <span className="font-mono text-[12px] tabular-nums">{fmt(r.gross)}</span> },
        { key: "totalDeductions", label: "Deducciones", sortable: true, align: "end", render: (_, r) => <span className="font-mono text-[12px] tabular-nums text-error/70">-{fmt(r.totalDeductions)}</span> },
        { key: "net", label: "Neto VES", sortable: true, align: "end", render: (_, r) => <span className="font-mono text-[13px] font-semibold tabular-nums text-primary-500">{fmt(r.net)}</span> },
        { key: "netUSD", label: "Neto $", sortable: true, align: "end", render: (_, r) => <span className="font-mono text-[12px] tabular-nums text-neutral-400">{fmt(r.netUSD)}</span> },
        {
            key: "_expand" as string, label: "", align: "center", width: 48,
            render: (_, r) => <ExpandBtn open={expandedId === r.cedula} onClick={() => setExpandedId((prev) => prev === r.cedula ? null : r.cedula)} />,
        },
    ];

    const filteredResults = useMemo(() => {
        if (!search) return results;
        const q = search.toLowerCase();
        return results.filter((r) =>
            r.nombre.toLowerCase().includes(q) ||
            r.cedula.toLowerCase().includes(q) ||
            r.cargo.toLowerCase().includes(q)
        );
    }, [results, search]);

    const showTable = !empLoading && employees.length > 0;
    // ── Confirm modal totals ───────────────────────────────────────────────
    const activeResults = results.filter((r) => r.estado === "activo");
    const modalTotals   = activeResults.reduce(
        (s, r) => ({ gross: s.gross + r.gross, ded: s.ded + r.totalDeductions, net: s.net + r.net, usd: s.usd + r.netUSD }),
        { gross: 0, ded: 0, net: 0, usd: 0 }
    );

    return (
        <div className="space-y-4">

            {/* Toolbar */}
            <div className="flex items-end justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                    <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-neutral-400">Nómina / Empleados</p>
                    <h2 className="font-mono text-[15px] font-bold uppercase tracking-tighter text-foreground">
                        Resumen por Empleado
                        <span className="ml-2 font-normal text-[12px] text-[var(--text-tertiary)] tracking-normal normal-case">
                            {results.length} en cálculo
                            {employees.filter(e => e.estado === "inactivo").length > 0 && (
                                <span className="ml-1 text-[var(--text-disabled)] hidden sm:inline">· {employees.filter(e => e.estado === "inactivo").length} inactivo{employees.filter(e => e.estado === "inactivo").length > 1 ? "s" : ""} excluido{employees.filter(e => e.estado === "inactivo").length > 1 ? "s" : ""}</span>
                            )}
                        </span>
                    </h2>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Vacaciones toggle */}
                    {employees.some(e => e.estado === "vacacion") && (
                        <button
                            onClick={() => setIncludeVacaciones(v => !v)}
                            className={[
                                "h-8 px-3 rounded-lg flex items-center gap-1.5 border",
                                "font-mono text-[12px] uppercase tracking-[0.16em] transition-colors duration-150",
                                includeVacaciones
                                    ? "border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/[0.16]"
                                    : "border-border-light bg-surface-1 text-[var(--text-tertiary)] hover:border-border-medium",
                            ].join(" ")}
                        >
                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 1v10M1 6h10" />
                            </svg>
                            <span className="hidden sm:inline">Vacaciones {includeVacaciones ? "incluidas" : "excluidas"}</span>
                            <span className="sm:hidden">Vac. {includeVacaciones ? "in" : "ex"}</span>
                        </button>
                    )}
                    <div className="relative">
                        <button
                            onClick={() => setPdfMenuOpen((v) => !v)}
                            disabled={results.length === 0}
                            className={toolbarBtnBase}
                            aria-haspopup="menu"
                            aria-expanded={pdfMenuOpen}
                        >
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 2h5l3 3v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M7 2v3h3M4 7h4M4 9h2" />
                            </svg>
                            <span className="hidden sm:inline">Exportar PDF</span>
                            <span className="sm:hidden">PDF</span>
                            <ChevronDown size={11} strokeWidth={2} />
                        </button>
                        {pdfMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setPdfMenuOpen(false)} />
                                <div className="absolute right-0 top-full mt-1.5 z-50 rounded-xl border border-border-light bg-surface-1 shadow-lg p-1 min-w-[300px]">
                                    <button
                                        onClick={() => {
                                            setPdfMenuOpen(false);
                                            dialog.request({
                                                title: "Generar recibos PDF",
                                                subtitle: periodLabel ? `${activeResults.length} recibo(s) para el período ${periodLabel}.` : undefined,
                                                summary: (
                                                    <>
                                                        {periodLabel && <SummaryRow label="Período" value={periodLabel} />}
                                                        <SummaryRow label="Empleados activos" value={activeResults.length} />
                                                        <SummaryRow label="Tasa BCV" value={`Bs. ${fmt(bcvRate)} / USD`} />
                                                        <SummaryRow label="Modalidad" value="Cortable · Oficio" />
                                                    </>
                                                ),
                                                warning: !periodAlreadyConfirmed
                                                    ? "También se guardará un borrador en la base de datos para que tengas respaldo."
                                                    : undefined,
                                                confirmLabel: "Generar PDF",
                                                confirmIcon: <FileDown size={14} strokeWidth={2} />,
                                                run: () => handleExportPdf("duplicado"),
                                            });
                                        }}
                                        className="flex items-start gap-2.5 w-full px-3 py-2.5 rounded-lg text-left cursor-pointer transition-colors duration-150 hover:bg-surface-2"
                                    >
                                        <Scissors size={13} strokeWidth={1.8} className="mt-1 text-primary-500 shrink-0" />
                                        <div className="min-w-0">
                                            <div className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">Recibo cortable</div>
                                            <div className="font-sans text-[11px] text-[var(--text-tertiary)] mt-0.5 leading-snug">
                                                Oficio · 2 copias por hoja (Original + Copia) con línea de corte
                                            </div>
                                        </div>
                                    </button>
                                    <div className="my-1 border-t border-border-light" />
                                    <button
                                        onClick={() => {
                                            setPdfMenuOpen(false);
                                            dialog.request({
                                                title: "Generar recibos PDF",
                                                subtitle: periodLabel ? `${activeResults.length} recibo(s) para el período ${periodLabel}.` : undefined,
                                                summary: (
                                                    <>
                                                        {periodLabel && <SummaryRow label="Período" value={periodLabel} />}
                                                        <SummaryRow label="Empleados activos" value={activeResults.length} />
                                                        <SummaryRow label="Tasa BCV" value={`Bs. ${fmt(bcvRate)} / USD`} />
                                                        <SummaryRow label="Modalidad" value="Simple · A4" />
                                                    </>
                                                ),
                                                warning: !periodAlreadyConfirmed
                                                    ? "También se guardará un borrador en la base de datos para que tengas respaldo."
                                                    : undefined,
                                                confirmLabel: "Generar PDF",
                                                confirmIcon: <FileDown size={14} strokeWidth={2} />,
                                                run: () => handleExportPdf("simple"),
                                            });
                                        }}
                                        className="flex items-start gap-2.5 w-full px-3 py-2.5 rounded-lg text-left cursor-pointer transition-colors duration-150 hover:bg-surface-2"
                                    >
                                        <FileText size={13} strokeWidth={1.8} className="mt-1 text-[var(--text-secondary)] shrink-0" />
                                        <div className="min-w-0">
                                            <div className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">Recibo simple</div>
                                            <div className="font-sans text-[11px] text-[var(--text-tertiary)] mt-0.5 leading-snug">
                                                A4 · 1 recibo por hoja, sin copia para pagador
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                    <button
                        onClick={() => dialog.request({
                            title: "Generar reporte general",
                            subtitle: periodLabel ? `Resumen de ${activeResults.length} empleado(s) para el período ${periodLabel}.` : undefined,
                            summary: (
                                <>
                                    {periodLabel && <SummaryRow label="Período" value={periodLabel} />}
                                    <SummaryRow label="Empleados activos" value={activeResults.length} />
                                    <SummaryRow label="Total neto VES" value={`Bs. ${fmt(modalTotals.net)}`} emphasis />
                                    <SummaryRow label="Equivalente USD" value={`$${fmt(modalTotals.usd)}`} />
                                </>
                            ),
                            confirmLabel: "Generar PDF",
                            confirmIcon: <FileText size={14} strokeWidth={2} />,
                            run: handleExportSummaryPdf,
                        })}
                        disabled={results.filter(r => r.estado === "activo").length === 0}
                        className={toolbarBtnBase}
                    >
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="1.5" y="2" width="9" height="8" rx="0.5" /><path d="M1.5 5h9M4 2v8M7 2v8" />
                        </svg>
                        <span className="hidden sm:inline">Reporte general</span>
                        <span className="sm:hidden">Reporte</span>
                    </button>
                    {draftSavedAt ? (
                        <span
                            className="h-8 px-2 inline-flex items-center rounded-lg border border-border-light bg-surface-1 text-[var(--text-tertiary)] font-mono text-[11px] uppercase tracking-[0.16em]"
                        >
                            <span className="hidden sm:inline">Borrador guardado · </span>{draftSavedAt.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                    ) : null}
                    {onConfirm && (
                        <button
                            onClick={() => dialog.request({
                                title: "Confirmar nómina",
                                subtitle: periodLabel ?? undefined,
                                summary: (
                                    <>
                                        <SummaryRow label="Empleados activos" value={activeResults.length} />
                                        <SummaryRow label="Tasa BCV" value={`Bs. ${fmt(bcvRate)} / USD`} />
                                        <SummaryRow label="Total bruto" value={`Bs. ${fmt(modalTotals.gross)}`} />
                                        <SummaryRow label="Total deducciones" value={`-Bs. ${fmt(modalTotals.ded)}`} />
                                        <SummaryRow label="Neto a pagar VES" value={`Bs. ${fmt(modalTotals.net)}`} emphasis />
                                        <SummaryRow label="Equivalente USD" value={`$${fmt(modalTotals.usd)}`} />
                                    </>
                                ),
                                warning: zeroSalaryCount > 0
                                    ? `${zeroSalaryCount} empleado${zeroSalaryCount > 1 ? "s" : ""} con salario en cero. Verifica antes de confirmar. Esta acción guarda la nómina permanentemente y no se puede deshacer desde la aplicación.`
                                    : "Esta acción guarda la nómina permanentemente. No se puede deshacer desde la aplicación.",
                                confirmLabel: "Confirmar y guardar",
                                confirmIcon: <CheckCircle2 size={14} strokeWidth={2} />,
                                run: handleConfirmExecute,
                            })}
                            disabled={results.length === 0 || confirmOk || !!periodAlreadyConfirmed}
                            title={periodAlreadyConfirmed ? "Período ya confirmado" : undefined}
                            className={[
                                "h-8 px-3 rounded-lg flex items-center gap-1.5 border",
                                "font-mono text-[12px] uppercase tracking-[0.18em] transition-colors duration-150",
                                "disabled:opacity-40 disabled:cursor-not-allowed",
                                confirmOk || periodAlreadyConfirmed
                                    ? "border-success/30 bg-success/10 text-success"
                                    : "border-primary-500/40 bg-primary-500/10 text-primary-500 hover:bg-primary-500/[0.15]",
                            ].join(" ")}
                        >
                            {confirmOk || periodAlreadyConfirmed ? <CheckIcon /> : (
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M2 6l3 3 5-5" />
                                </svg>
                            )}
                            <span className="hidden sm:inline">{confirmOk ? "Confirmada" : periodAlreadyConfirmed ? "Ya confirmada" : "Confirmar nómina"}</span>
                            <span className="sm:hidden">{confirmOk ? "Confirmada" : periodAlreadyConfirmed ? "Confirmada" : "Confirmar"}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Search */}
            {showTable && (
                <BaseInput.Field
                    type="text"
                    placeholder="Buscar por nombre, cédula o cargo…"
                    value={search}
                    onValueChange={setSearch}
                    startContent={
                        <svg className="text-[var(--text-tertiary)]" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="5.5" cy="5.5" r="4" /><path d="M10.5 10.5l-2.5-2.5" />
                        </svg>
                    }
                />
            )}

            {/* Table (desktop) / Cards (mobile + tablet) */}
            {showTable ? (
                <>
                    {/* Desktop table — lg+ */}
                    <div className="hidden lg:block">
                        <BaseTable.Render
                            columns={columns} data={filteredResults} keyExtractor={(r) => r.cedula}
                            pagination
                            classNames={{ wrapper: "border border-border-light rounded-xl shadow-none" }}
                            onRowClick={(r) =>
                                setExpandedId((prev) => (prev === r.cedula ? null : r.cedula))
                            }
                            renderExpandedRow={(result) => {
                                if (expandedId !== result.cedula) return null;
                                return (
                                    <ExpandedPanel
                                        result={result} override={getOverride(getEmployeeKey(result))}
                                        mondaysInMonth={mondaysInMonth} bcvRate={bcvRate}
                                        diasUtilidades={diasUtilidades} diasBonoVacacional={diasBonoVacacional}
                                        salarioMinimo={salarioMinimo}
                                        earningRows={earningRows}
                                        bonusRows={bonusRows}
                                        deductionRows={deductionRows}
                                        horasExtrasGlobal={horasExtrasGlobal}
                                        onChange={(updated) => setOverride(getEmployeeKey(result), updated)}
                                    />
                                );
                            }}
                        />
                    </div>

                    {/* Mobile + tablet cards — < lg */}
                    <div className="lg:hidden space-y-3">
                        {filteredResults.length === 0 ? (
                            <p className="font-mono text-[13px] text-[var(--text-tertiary)] text-center py-6 border border-dashed border-border-light rounded-xl">
                                Ningún empleado coincide con la búsqueda.
                            </p>
                        ) : (
                            filteredResults.map((result) => (
                                <EmployeeMobileCard
                                    key={result.cedula}
                                    result={result}
                                    expanded={expandedId === result.cedula}
                                    onToggleExpand={() => setExpandedId((prev) => prev === result.cedula ? null : result.cedula)}
                                    override={getOverride(getEmployeeKey(result))}
                                    mondaysInMonth={mondaysInMonth}
                                    bcvRate={bcvRate}
                                    diasUtilidades={diasUtilidades}
                                    diasBonoVacacional={diasBonoVacacional}
                                    salarioMinimo={salarioMinimo}
                                    earningRows={earningRows}
                                    bonusRows={bonusRows}
                                    deductionRows={deductionRows}
                                    horasExtrasGlobal={horasExtrasGlobal}
                                    onOverrideChange={(updated) => setOverride(getEmployeeKey(result), updated)}
                                />
                            ))
                        )}
                    </div>

                    <TotalsBar results={results} />
                    <AportesPatronalesPanel
                        results={results}
                        mondaysInMonth={mondaysInMonth}
                        salarioMinimo={salarioMinimo}
                        periodLabel={periodLabel}
                        companyName={companyName}
                        quincena={quincena}
                    />
                </>
            ) : (
                <TablePlaceholder loading={empLoading} />
            )}

            {/* Diálogo único de confirmación (PDF / Reporte / Confirmar nómina) */}
            <ConfirmCompanyDialog
                isOpen={!!dialog.pending}
                onClose={dialog.clear}
                onConfirm={dialog.confirm}
                loading={dialog.loading}
                title={dialog.pending?.title ?? ""}
                subtitle={dialog.pending?.subtitle}
                summary={dialog.pending?.summary}
                warning={dialog.pending?.warning}
                confirmLabel={dialog.pending?.confirmLabel}
                confirmIcon={dialog.pending?.confirmIcon}
                destructive={dialog.pending?.destructive}
            />
        </div>
    );
};