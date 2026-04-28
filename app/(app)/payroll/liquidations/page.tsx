"use client";

import { useState, useMemo, useCallback } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import {
    Calendar,
    Gavel, Scale, UserMinus,
    Coins, ShieldAlert, PieChart, Plane, Gift,
    ChevronRight, Users, Wallet, Receipt, TrendingUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCompany }  from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import type { Employee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { generateLiquidationPdf } from "@/src/modules/payroll/frontend/utils/liquidaciones-pdf";
import type { LiquidationEmployee, LiquidationOptions } from "@/src/modules/payroll/frontend/utils/liquidaciones-pdf";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";

import {
    formatCurrency,
    formatNumber,
    formatUsd,
    LABEL_CLS,
    useCalculatorBcv,
    SectionHeader,
    CalculatorPanelHeader,
    OnlyActiveToggle,
    EmployeeSelect,
    EmployeeInfoCard,
    BcvRateField,
    CalculatorFooter,
    FooterStat,
    FooterTotal,
    CalculatorLoading,
    CalculatorEmptyState,
} from "@/src/modules/payroll/frontend/components/calculator";

// ============================================================================
// LIQUIDATION ENGINE
// ============================================================================

type LiquidationReason = "renuncia" | "despido_justificado" | "despido_injustificado";

interface LiquidationResult {
    employee:               Employee;
    salaryVES:              number;
    integratedDailySalary:  number;
    yearsOfService:         number;
    totalDays:              number;
    daysSeniority:          number;
    daysSeniorityQuarterly: number;
    daysSeniorityExtra:     number;
    socialBenefits:         number;
    daysInCurrentYear:      number;
    daysSinceAnniversary:   number;
    fractionalProfitSharing: number;
    fractionalVacations:    number;
    fractionalVacationBonus: number;
    terminationIndemnity:   number;
    total:                  number;
    warning?:               string;
}

function calculateLiquidation(
    employee:          Employee,
    terminationDate:   string,
    reason:            LiquidationReason,
    profitSharingDays: number,
    vacationBonusDays: number,
    bcvRate:           number,
): LiquidationResult {
    const base: LiquidationResult = {
        employee, salaryVES: 0, integratedDailySalary: 0,
        yearsOfService: 0, totalDays: 0,
        daysSeniority: 0, daysSeniorityQuarterly: 0, daysSeniorityExtra: 0,
        socialBenefits: 0, daysInCurrentYear: 0, daysSinceAnniversary: 0,
        fractionalProfitSharing: 0, fractionalVacations: 0, fractionalVacationBonus: 0,
        terminationIndemnity: 0, total: 0,
    };

    if (!employee.fechaIngreso) return { ...base, warning: "Sin fecha de ingreso" };
    const hireDate = new Date(employee.fechaIngreso + "T00:00:00");
    const termDate = new Date(terminationDate + "T00:00:00");
    if (termDate <= hireDate) return { ...base, warning: "Egreso anterior a ingreso" };

    const salaryVES = employee.moneda === "USD" ? employee.salarioMensual * bcvRate : employee.salarioMensual;
    if (salaryVES <= 0) return { ...base, salaryVES, warning: "Salario cero" };

    const msPerDay   = 86400000;
    const totalDays  = Math.floor((termDate.getTime() - hireDate.getTime()) / msPerDay);
    const yearsOfService = Math.floor(totalDays / 365);

    // ── SOCIAL BENEFITS (PRESTACIONES) (Art. 142 LOTTT) ──────────────────
    const totalMonths            = Math.floor(totalDays / 30.4375);
    const daysSeniorityQuarterly = totalMonths * 5;

    const daysOfLastYear = totalDays % 365;
    const daysExtraFull  = yearsOfService <= 16
        ? yearsOfService * Math.max(0, yearsOfService - 1)
        : 240 + 30 * (yearsOfService - 16);
    const daysSeniorityExtra = daysExtraFull
        + (yearsOfService >= 1 && daysOfLastYear > 182 ? Math.min(30, 2 * yearsOfService) : 0);
    const daysSeniority      = daysSeniorityQuarterly + daysSeniorityExtra;

    const baseDailySalary = salaryVES / 30;
    const profitSharingQuota = baseDailySalary * profitSharingDays / 360;
    const vacationBonusQuota = baseDailySalary * vacationBonusDays / 360;
    const integratedDailySalary = baseDailySalary + profitSharingQuota + vacationBonusQuota;

    const socialBenefits = daysSeniority * integratedDailySalary;

    // ── FRACTIONAL PROFIT SHARING ─────────────────────────────────────────
    const yearStart        = new Date(termDate.getFullYear(), 0, 1);
    const refStartDate      = hireDate > yearStart ? hireDate : yearStart;
    const daysInCurrentYear = Math.floor((termDate.getTime() - refStartDate.getTime()) / msPerDay);

    const fractionalProfitSharing = (salaryVES / 30) * profitSharingDays * (daysInCurrentYear / 365);

    // ── FRACTIONAL VACATIONS & BONUS ──────────────────────────────────────
    const daysSinceAnniversary = yearsOfService >= 1 ? daysOfLastYear : totalDays;
    const baseVacationDays     = Math.max(15, 15 + Math.max(0, yearsOfService - 1));

    const fractionalVacations     = (salaryVES / 30) * baseVacationDays * (daysSinceAnniversary / 365);
    const fractionalVacationBonus = (salaryVES / 30) * vacationBonusDays * (daysSinceAnniversary / 365);

    const terminationIndemnity = reason === "despido_injustificado" ? socialBenefits : 0;
    const total = socialBenefits + fractionalProfitSharing + fractionalVacations + fractionalVacationBonus + terminationIndemnity;

    return {
        employee, salaryVES, integratedDailySalary,
        yearsOfService, totalDays,
        daysSeniority, daysSeniorityQuarterly, daysSeniorityExtra,
        socialBenefits, daysInCurrentYear, daysSinceAnniversary,
        fractionalProfitSharing, fractionalVacations, fractionalVacationBonus, terminationIndemnity, total,
    };
}

// ============================================================================
// REASON META
// ============================================================================

type ReasonTone = "neutral" | "amber" | "rose";

const REASON_META: Record<LiquidationReason, {
    label: string;
    short: string;
    tone:  ReasonTone;
    icon:  typeof UserMinus;
    note:  string;
}> = {
    renuncia: {
        label: "Renuncia voluntaria",
        short: "Renuncia",
        tone:  "neutral",
        icon:  UserMinus,
        note:  "Sin indemnización adicional",
    },
    despido_justificado: {
        label: "Despido justificado",
        short: "Justificado",
        tone:  "amber",
        icon:  Gavel,
        note:  "Sin indemnización (causa justa)",
    },
    despido_injustificado: {
        label: "Despido injustificado",
        short: "Injustificado",
        tone:  "rose",
        icon:  Scale,
        note:  "+ Indemnización Art. 92 (igual al monto de prestaciones)",
    },
};

const REASON_TONE_CLS: Record<ReasonTone, { active: string; activeIcon: string; dotBg: string }> = {
    neutral: {
        active:     "bg-primary-500/10 border-primary-500/50 text-primary-600 shadow-sm",
        activeIcon: "text-primary-500",
        dotBg:      "bg-primary-500/70",
    },
    amber: {
        active:     "bg-amber-500/10 border-amber-500/50 text-amber-700 shadow-sm",
        activeIcon: "text-amber-500",
        dotBg:      "bg-amber-500/70",
    },
    rose: {
        active:     "bg-rose-500/10 border-rose-500/50 text-rose-700 shadow-sm",
        activeIcon: "text-rose-500",
        dotBg:      "bg-rose-500/70",
    },
};

type IconType = typeof UserMinus;

// ============================================================================
// KPI TILE — dashboard strip atom
// ============================================================================

type KpiTone = "default" | "primary" | "rose";

interface KpiTileProps {
    label:      string;
    icon:       IconType;
    tone?:      KpiTone;
    /** When set, render as a count (no Bs prefix, big tabular number). */
    countValue?: number;
    /** Currency value when not in count mode. */
    valueBs?:   number;
    bcvRate?:   number;
}

function KpiTile({ label, icon: Icon, tone = "default", countValue, valueBs, bcvRate }: KpiTileProps) {
    const valueCls =
        tone === "primary" ? "text-primary-500" :
        tone === "rose"    ? "text-rose-600"    :
        "text-foreground";
    const iconWrapCls =
        tone === "primary" ? "bg-primary-500/10 border-primary-500/30 text-primary-500" :
        tone === "rose"    ? "bg-rose-500/10 border-rose-500/30 text-rose-500" :
        "bg-surface-2 border-border-light text-[var(--text-secondary)]";
    const isCount = countValue !== undefined;

    return (
        <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm p-4 flex flex-col justify-between gap-3 min-h-[104px]">
            <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                    {label}
                </p>
                <div className={`w-7 h-7 rounded-md border flex items-center justify-center ${iconWrapCls}`}>
                    <Icon size={13} strokeWidth={2} />
                </div>
            </div>
            <div>
                {isCount ? (
                    <p className={`font-mono text-[28px] font-black tabular-nums leading-none tracking-[-0.02em] ${valueCls}`}>
                        {countValue}
                    </p>
                ) : (
                    <>
                        <p className={`font-mono text-[20px] font-black tabular-nums leading-none tracking-[-0.01em] ${valueCls}`}>
                            {valueBs && valueBs > 0
                                ? `Bs. ${formatNumber(valueBs)}`
                                : <span className="text-[var(--text-disabled)]">—</span>}
                        </p>
                        {bcvRate && bcvRate > 0 && valueBs && valueBs > 0 && (
                            <p className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)] mt-1.5">
                                ≈ {formatUsd(valueBs / bcvRate)}
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// KPI TOTAL TILE — primary highlight tile for the grand total
// ============================================================================

function KpiTotalTile({ valueBs, bcvRate }: { valueBs: number; bcvRate: number }) {
    return (
        <div className="rounded-xl border border-primary-500/30 bg-primary-500/[0.04] shadow-sm p-4 flex flex-col justify-between gap-3 min-h-[104px] relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-primary-500/15 blur-2xl pointer-events-none" />
            <div className="absolute -left-4 -bottom-4 w-16 h-16 rounded-full bg-primary-500/10 blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between relative">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-primary-600">
                    Total Líquido
                </p>
                <div className="w-7 h-7 rounded-md bg-primary-500/15 border border-primary-500/40 flex items-center justify-center text-primary-500">
                    <TrendingUp size={13} strokeWidth={2} />
                </div>
            </div>
            <div className="relative">
                <p className="font-mono text-[24px] font-black tabular-nums leading-none tracking-[-0.02em] text-primary-600">
                    {valueBs > 0 ? `Bs. ${formatNumber(valueBs)}` : <span className="text-primary-500/40">—</span>}
                </p>
                {bcvRate > 0 && valueBs > 0 && (
                    <p className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)] mt-1.5 font-medium">
                        ≈ {formatUsd(valueBs / bcvRate)}
                        <span className="text-[var(--text-tertiary)] ml-1.5">· BCV {bcvRate.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</span>
                    </p>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// DISTRIBUTION STRIP — aggregate stacked bar
// ============================================================================

interface DistributionSegment {
    key:    string;
    label:  string;
    amount: number;
    bg:     string;
}

function DistributionStrip({ segments }: { segments: DistributionSegment[] }) {
    const total = segments.reduce((s, x) => s + x.amount, 0);
    if (total <= 0) return null;
    const visible = segments.filter(s => s.amount > 0);
    return (
        <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                    Distribución del egreso
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] tabular-nums">
                    {visible.length} concepto{visible.length !== 1 ? "s" : ""}
                </p>
            </div>
            <div className="flex w-full h-2.5 rounded-full overflow-hidden bg-border-light/40 border border-border-light/60">
                {visible.map((seg) => (
                    <div
                        key={seg.key}
                        className={`${seg.bg} h-full transition-[width] duration-300 ease-out`}
                        style={{ width: `${(seg.amount / total) * 100}%` }}
                        title={`${seg.label} · ${((seg.amount / total) * 100).toFixed(1)}%`}
                    />
                ))}
            </div>
            <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2">
                {visible.map((seg) => (
                    <div key={seg.key} className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-sm ${seg.bg} shrink-0`} />
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-secondary)] truncate font-semibold">
                            {seg.label}
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">
                            {((seg.amount / total) * 100).toFixed(1)}%
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ============================================================================
// LIQUIDATIONS TABLE
// ============================================================================

interface LiquidationsTableProps {
    results:           LiquidationResult[];
    bcvRate:           number;
    showIndem:         boolean;
    profitSharingDays: string;
    vacationBonusDays: string;
}

function LiquidationsTable({ results, bcvRate, showIndem, profitSharingDays, vacationBonusDays }: LiquidationsTableProps) {
    const cols = showIndem
        ? "grid-cols-[minmax(180px,1.6fr)_88px_minmax(110px,0.9fr)_minmax(130px,1.1fr)_minmax(130px,1.1fr)_minmax(130px,1.1fr)_minmax(140px,1.2fr)_28px]"
        : "grid-cols-[minmax(180px,1.6fr)_88px_minmax(110px,0.9fr)_minmax(130px,1.1fr)_minmax(130px,1.1fr)_minmax(140px,1.2fr)_28px]";

    return (
        <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm overflow-hidden">
            <div className={`grid ${cols} gap-3 px-5 py-3 bg-surface-2/40 border-b border-border-light`}>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Empleado</p>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-tertiary)] text-right">Antig.</p>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-tertiary)] text-right">S.Integral</p>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-tertiary)] text-right">Prestaciones</p>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-tertiary)] text-right">Fracciones</p>
                {showIndem && (
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-rose-500 text-right">Indemniz.</p>
                )}
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-tertiary)] text-right">Total</p>
                <span />
            </div>
            <div className="divide-y divide-border-light">
                {results.map((result) => (
                    <LiquidationsTableRow
                        key={result.employee.cedula}
                        result={result}
                        bcvRate={bcvRate}
                        showIndem={showIndem}
                        cols={cols}
                        profitSharingDays={profitSharingDays}
                        vacationBonusDays={vacationBonusDays}
                    />
                ))}
            </div>
        </div>
    );
}

interface LiquidationsTableRowProps {
    result:            LiquidationResult;
    bcvRate:           number;
    showIndem:         boolean;
    cols:              string;
    profitSharingDays: string;
    vacationBonusDays: string;
}

function LiquidationsTableRow({
    result, bcvRate, showIndem, cols, profitSharingDays, vacationBonusDays,
}: LiquidationsTableRowProps) {
    const [expanded, setExpanded] = useState(false);
    const fracciones = result.fractionalProfitSharing + result.fractionalVacations + result.fractionalVacationBonus;

    if (result.warning) {
        return (
            <div className="px-5 py-3.5 flex items-center justify-between gap-4 bg-amber-500/[0.04]">
                <div className="min-w-0 flex flex-col gap-0.5">
                    <span className="font-mono text-[13px] font-bold text-foreground truncate">{result.employee.nombre}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                        CI {result.employee.cedula}
                        {result.employee.cargo && <span className="text-[var(--text-disabled)]"> · {result.employee.cargo}</span>}
                    </span>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] font-bold text-amber-700 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-md whitespace-nowrap">
                    {result.warning}
                </span>
            </div>
        );
    }

    return (
        <div>
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                aria-expanded={expanded}
                className={`w-full grid ${cols} gap-3 px-5 py-3.5 items-center text-left transition-colors duration-150 hover:bg-surface-2/40 cursor-pointer ${expanded ? "bg-surface-2/30" : ""}`}
            >
                {/* Empleado */}
                <div className="min-w-0 flex flex-col gap-0.5">
                    <span className="font-mono text-[13px] font-bold text-foreground truncate">
                        {result.employee.nombre}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] truncate">
                        CI {result.employee.cedula}
                        {result.employee.cargo && <span className="text-[var(--text-disabled)]"> · {result.employee.cargo}</span>}
                    </span>
                </div>
                {/* Antigüedad */}
                <div className="text-right">
                    <span className="inline-flex items-center font-mono text-[11px] font-bold tabular-nums text-foreground bg-surface-2 border border-border-light px-2 py-0.5 rounded-md">
                        {result.yearsOfService}a {result.totalDays % 365}d
                    </span>
                </div>
                {/* Salario integral */}
                <div className="text-right">
                    <p className="font-mono text-[12px] font-bold tabular-nums text-foreground leading-none">
                        {formatCurrency(result.integratedDailySalary)}
                    </p>
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] mt-1">/ día</p>
                </div>
                {/* Prestaciones */}
                <NumberCell amount={result.socialBenefits} bcvRate={bcvRate} />
                {/* Fracciones */}
                <NumberCell amount={fracciones} bcvRate={bcvRate} />
                {/* Indemnización (condicional) */}
                {showIndem && (
                    <NumberCell amount={result.terminationIndemnity} bcvRate={bcvRate} tone="rose" />
                )}
                {/* Total */}
                <NumberCell amount={result.total} bcvRate={bcvRate} bold />
                {/* Caret */}
                <ChevronRight
                    size={14}
                    className={`justify-self-end text-[var(--text-tertiary)] transition-transform duration-200 ${expanded ? "rotate-90 text-primary-500" : ""}`}
                />
            </button>
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                    >
                        <BreakdownPanel
                            result={result}
                            bcvRate={bcvRate}
                            profitSharingDays={profitSharingDays}
                            vacationBonusDays={vacationBonusDays}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ============================================================================
// NUMBER CELL — dual VES/USD right-aligned cell
// ============================================================================

function NumberCell({ amount, bcvRate, tone, bold }: {
    amount:   number;
    bcvRate:  number;
    tone?:    "rose";
    bold?:    boolean;
}) {
    const valueCls = tone === "rose" ? "text-rose-600" : "text-foreground";
    const sizeCls  = bold ? "text-[14px] font-black" : "text-[13px] font-bold";
    return (
        <div className="text-right">
            <p className={`font-mono ${sizeCls} tabular-nums leading-none ${valueCls}`}>
                {amount > 0 ? `Bs. ${formatNumber(amount)}` : <span className="text-[var(--text-disabled)] font-medium">—</span>}
            </p>
            {bcvRate > 0 && amount > 0 && (
                <p className="font-mono text-[10px] tabular-nums text-[var(--text-tertiary)] mt-1">
                    ≈ {formatUsd(amount / bcvRate)}
                </p>
            )}
        </div>
    );
}

// ============================================================================
// BREAKDOWN PANEL — inline expanded detail per employee
// ============================================================================

interface BreakdownLineData {
    icon:      IconType;
    label:     string;
    sublabel?: string;
    formula:   string;
    chip:      string;
    amount:    number;
    tone?:     "rose";
}

function BreakdownPanel({
    result, bcvRate, profitSharingDays, vacationBonusDays,
}: {
    result:            LiquidationResult;
    bcvRate:           number;
    profitSharingDays: string;
    vacationBonusDays: string;
}) {
    const baseDailySalary  = result.salaryVES / 30;
    const baseVacationDays = Math.max(15, 15 + Math.max(0, result.yearsOfService - 1));
    const fractionPercent  = result.daysSinceAnniversary > 0
        ? (result.daysSinceAnniversary / 365) * 100
        : 0;
    const yearProgressPercent = result.daysInCurrentYear > 0
        ? (result.daysInCurrentYear / 365) * 100
        : 0;

    const lines: BreakdownLineData[] = [];
    if (result.socialBenefits > 0) {
        lines.push({
            icon:     Coins,
            label:    "Prestaciones sociales",
            sublabel: "Art. 142 LOTTT",
            formula:  result.daysSeniorityExtra > 0
                ? `${result.daysSeniorityQuarterly}d trim. + ${result.daysSeniorityExtra}d adic. × Bs. ${formatNumber(result.integratedDailySalary)} integral`
                : `${result.daysSeniorityQuarterly}d × Bs. ${formatNumber(result.integratedDailySalary)} integral`,
            chip:     `${result.daysSeniority} días`,
            amount:   result.socialBenefits,
        });
    }
    if (result.fractionalProfitSharing > 0) {
        lines.push({
            icon:     PieChart,
            label:    "Utilidades fraccionadas",
            sublabel: "Art. 131 LOTTT",
            formula:  `${profitSharingDays} d utilidad × Bs. ${formatNumber(baseDailySalary)} / día`,
            chip:     `${yearProgressPercent.toFixed(1)}% del año`,
            amount:   result.fractionalProfitSharing,
        });
    }
    if (result.fractionalVacations > 0) {
        lines.push({
            icon:     Plane,
            label:    "Vacaciones fraccionadas",
            sublabel: "Art. 196 LOTTT",
            formula:  `${baseVacationDays} d vacación × Bs. ${formatNumber(baseDailySalary)} / día`,
            chip:     `${fractionPercent.toFixed(1)}% desde aniv.`,
            amount:   result.fractionalVacations,
        });
    }
    if (result.fractionalVacationBonus > 0) {
        lines.push({
            icon:     Gift,
            label:    "Bono vacacional fraccionado",
            sublabel: "Art. 192 LOTTT",
            formula:  `${vacationBonusDays} d bono × Bs. ${formatNumber(baseDailySalary)} / día`,
            chip:     `${fractionPercent.toFixed(1)}% desde aniv.`,
            amount:   result.fractionalVacationBonus,
        });
    }
    if (result.terminationIndemnity > 0) {
        lines.push({
            icon:     ShieldAlert,
            label:    "Indemnización por despido",
            sublabel: "Art. 92 LOTTT",
            formula:  "Equivalente al monto de prestaciones sociales",
            chip:     "Despido injustificado",
            amount:   result.terminationIndemnity,
            tone:     "rose",
        });
    }

    return (
        <div className="bg-surface-2/40 border-t border-border-light px-5 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-5">
                {/* Líneas de desglose */}
                <div className="space-y-1">
                    {lines.length === 0 ? (
                        <p className="font-sans text-[12px] text-[var(--text-secondary)] text-center py-6">
                            Sin acreencias devengadas para este empleado.
                        </p>
                    ) : lines.map((line, i) => (
                        <BreakdownLine key={`${result.employee.cedula}-${line.label}-${i}`} {...line} bcvRate={bcvRate} />
                    ))}
                </div>
                {/* Card de salarios + total */}
                <div className="lg:border-l lg:border-border-light/60 lg:pl-5">
                    <div className="rounded-lg bg-surface-1 border border-border-light p-3.5">
                        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 font-bold">
                            Líquido a recibir
                        </p>
                        <p className="font-mono text-[20px] font-black tabular-nums leading-none tracking-[-0.01em] text-foreground">
                            Bs. {formatNumber(result.total)}
                        </p>
                        {bcvRate > 0 && (
                            <p className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)] mt-2 font-medium">
                                ≈ {formatUsd(result.total / bcvRate)}
                            </p>
                        )}
                        <div className="mt-3.5 pt-3 border-t border-border-light/60 space-y-1.5">
                            <div className="flex justify-between items-baseline">
                                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Salario mens.</span>
                                <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">{formatCurrency(result.salaryVES)}</span>
                            </div>
                            <div className="flex justify-between items-baseline">
                                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Salario base</span>
                                <span className="font-mono text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]">{formatCurrency(baseDailySalary)} /d</span>
                            </div>
                            <div className="flex justify-between items-baseline">
                                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Salario integral</span>
                                <span className="font-mono text-[11px] font-bold tabular-nums text-primary-500">{formatCurrency(result.integratedDailySalary)} /d</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function BreakdownLine({
    icon: Icon, label, sublabel, formula, chip, amount, tone, bcvRate,
}: BreakdownLineData & { bcvRate: number }) {
    const iconCls = tone === "rose"
        ? "bg-rose-500/10 border-rose-500/30 text-rose-600"
        : "bg-surface-1 border-border-light text-[var(--text-secondary)]";
    const amountCls = tone === "rose" ? "text-rose-600" : "text-foreground";
    return (
        <div className="grid grid-cols-[28px_1fr_auto_auto] gap-3 items-center py-2.5 px-1">
            <div className={`w-7 h-7 rounded-md border flex items-center justify-center ${iconCls}`}>
                <Icon size={13} strokeWidth={2} />
            </div>
            <div className="min-w-0">
                <p className="font-mono text-[12px] font-bold text-foreground tracking-tight truncate">
                    {label}
                    {sublabel && (
                        <span className="font-medium text-[var(--text-tertiary)] ml-2 text-[10px] uppercase tracking-[0.14em]">
                            · {sublabel}
                        </span>
                    )}
                </p>
                <p className="font-mono text-[10.5px] text-[var(--text-tertiary)] mt-0.5 tabular-nums truncate">
                    {formula}
                </p>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--text-secondary)] bg-surface-1 border border-border-light/80 px-2 py-0.5 rounded-md whitespace-nowrap">
                {chip}
            </span>
            <div className="text-right min-w-[120px]">
                <p className={`font-mono text-[13px] font-black tabular-nums leading-none ${amountCls}`}>
                    Bs. {formatNumber(amount)}
                </p>
                {bcvRate > 0 && (
                    <p className="font-mono text-[10px] tabular-nums text-[var(--text-tertiary)] mt-1">
                        ≈ {formatUsd(amount / bcvRate)}
                    </p>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// PAGE
// ============================================================================

export default function LiquidacionesPage() {
    const { companyId, company } = useCompany();
    const { employees, loading } = useEmployee(companyId);

    const today = getTodayIsoDate();

    const [terminationDate,   setTerminationDate]   = useState(today);
    const [reason,            setReason]            = useState<LiquidationReason>("renuncia");
    const [profitSharingDays, setProfitSharingDays] = useState("120");
    const [vacationBonusDays, setVacationBonusDays] = useState("15");
    const [onlyActive,        setOnlyActive]        = useState(true);
    const [selectedIdNumber,  setSelectedIdNumber]  = useState<string>("");

    const selectedEmp = useMemo(
        () => employees.find(e => e.cedula === selectedIdNumber),
        [employees, selectedIdNumber],
    );

    // ── BCV via shared hook ────────────────────────────────────────────────
    const {
        exchangeRate, setExchangeRate,
        bcvRate, bcvLoading, bcvFetchError, fetchBcvRate,
    } = useCalculatorBcv();

    // ── Filtered batch + results ────────────────────────────────────────────
    const filteredEmployees = useMemo(() => {
        const pool = onlyActive ? employees.filter((e) => e.estado === "activo") : employees;
        if (!selectedIdNumber) return pool;
        return pool.filter((e) => e.cedula === selectedIdNumber);
    }, [employees, onlyActive, selectedIdNumber]);

    const liquidationResults = useMemo<LiquidationResult[]>(() =>
        filteredEmployees.map(emp => calculateLiquidation(
            emp, terminationDate, reason,
            parseFloat(profitSharingDays) || 120,
            parseFloat(vacationBonusDays) || 15,
            bcvRate,
        )),
        [filteredEmployees, terminationDate, reason, profitSharingDays, vacationBonusDays, bcvRate],
    );

    const validResults = useMemo(() => liquidationResults.filter(r => !r.warning), [liquidationResults]);
    const totalAmount  = useMemo(() => validResults.reduce((s, r) => s + r.total, 0), [validResults]);
    const observationsCount = liquidationResults.length - validResults.length;
    const indemnizacionTotal = useMemo(
        () => validResults.reduce((s, r) => s + r.terminationIndemnity, 0),
        [validResults],
    );
    const totalPrestaciones = useMemo(
        () => validResults.reduce((s, r) => s + r.socialBenefits, 0),
        [validResults],
    );
    const totalUtilidadesFrac = useMemo(
        () => validResults.reduce((s, r) => s + r.fractionalProfitSharing, 0),
        [validResults],
    );
    const totalVacacionesFrac = useMemo(
        () => validResults.reduce((s, r) => s + r.fractionalVacations, 0),
        [validResults],
    );
    const totalBonoVacFrac = useMemo(
        () => validResults.reduce((s, r) => s + r.fractionalVacationBonus, 0),
        [validResults],
    );
    const totalFracciones = totalUtilidadesFrac + totalVacacionesFrac + totalBonoVacFrac;

    const showIndem = reason === "despido_injustificado";

    const distributionSegments = useMemo<DistributionSegment[]>(() => {
        const segs: DistributionSegment[] = [
            { key: "prestaciones", label: "Prestaciones",     amount: totalPrestaciones,  bg: "bg-primary-500" },
            { key: "utilidades",   label: "Utilidades frac.", amount: totalUtilidadesFrac, bg: "bg-primary-500/70" },
            { key: "vacaciones",   label: "Vacaciones frac.", amount: totalVacacionesFrac, bg: "bg-primary-500/40" },
            { key: "bono",         label: "Bono vac. frac.",  amount: totalBonoVacFrac,    bg: "bg-primary-500/25" },
        ];
        if (showIndem && indemnizacionTotal > 0) {
            segs.push({ key: "indemnizacion", label: "Indemnización", amount: indemnizacionTotal, bg: "bg-rose-500/70" });
        }
        return segs;
    }, [totalPrestaciones, totalUtilidadesFrac, totalVacacionesFrac, totalBonoVacFrac, indemnizacionTotal, showIndem]);

    // ── Export ──────────────────────────────────────────────────────────────
    const handlePdf = useCallback(() => {
        const pdfEmployees: LiquidationEmployee[] = validResults.map(r => {
            const integratedDailySalary = r.socialBenefits > 0 ? r.socialBenefits / r.daysSeniority : r.salaryVES / 30;
            const simpleDailySalary      = r.salaryVES / 30;
            const lines = [
                {
                    label:   "Prestaciones sociales (Art. 142)",
                    days:    r.daysSeniority,
                    formula: r.daysSeniorityExtra > 0
                        ? `${r.daysSeniorityQuarterly}d trimestr. + ${r.daysSeniorityExtra}d adic.`
                        : `${r.daysSeniorityQuarterly}d × 5d/mes`,
                    salary:  integratedDailySalary,
                    amount:  r.socialBenefits,
                },
                {
                    label:   "Utilidades fraccionadas",
                    formula: `${r.daysInCurrentYear}d en año × ${profitSharingDays}d util / 365`,
                    amount:  r.fractionalProfitSharing,
                },
                {
                    label:   "Vacaciones fraccionadas",
                    formula: `${r.daysSinceAnniversary}d / 365 × ${Math.max(15, 15 + Math.max(0, r.yearsOfService - 1))}d vac.`,
                    salary:  simpleDailySalary,
                    amount:  r.fractionalVacations,
                },
                {
                    label:   "Bono vacacional fraccionado",
                    formula: `${r.daysSinceAnniversary}d / 365 × ${vacationBonusDays}d bono`,
                    salary:  simpleDailySalary,
                    amount:  r.fractionalVacationBonus,
                },
                ...(r.terminationIndemnity > 0
                    ? [{ label: "Indemnización por despido (Art. 92)", days: r.daysSeniority, salary: integratedDailySalary, amount: r.terminationIndemnity, highlight: "amber" as const }]
                    : []),
            ].filter(l => l.amount > 0 || l.days !== undefined);
            return {
                name:            r.employee.nombre,
                idNumber:        r.employee.cedula,
                role:            r.employee.cargo,
                hireDate:        r.employee.fechaIngreso ?? "",
                terminationDate,
                yearsOfService:  r.yearsOfService,
                daysOfService:   r.totalDays,
                reason,
                lines,
                total: r.total,
            };
        });
        const opts: LiquidationOptions = {
            companyName:   company?.name ?? "Empresa",
            companyId:     company?.id,
            documentDate:  new Date().toISOString().split("T")[0],
            bcvRate:       bcvRate || undefined,
            logoUrl:       company?.logoUrl,
            showLogoInPdf: company?.showLogoInPdf,
        };
        generateLiquidationPdf(pdfEmployees, opts);
    }, [validResults, terminationDate, reason, profitSharingDays, vacationBonusDays, bcvRate, company]);

    return (
        <div className="min-h-full bg-surface-2 flex flex-col overflow-hidden">
            <PageHeader
                title="Liquidaciones"
                subtitle="Cálculo de finiquito y prestaciones al egreso (Art. 142 LOTTT)"
            >
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-light bg-surface-1 h-8 shadow-sm">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">BCV</span>
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
                        {bcvLoading ? "..." : bcvRate.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                    </span>
                    {bcvFetchError && <span className="w-1.5 h-1.5 rounded-full bg-red-400" title={bcvFetchError} />}
                </div>
            </PageHeader>

            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* ══ LEFT PANEL ══════════════════════════════════════════════ */}
                <aside className="w-full lg:w-96 shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border-light bg-surface-1 overflow-y-auto">

                    <CalculatorPanelHeader />

                    {/* ── Motivo de Egreso ──────────────────────────────────── */}
                    <div className="px-5 py-5 border-b border-border-light">
                        <label className={LABEL_CLS}>Motivo de Egreso</label>
                        <div className="grid grid-cols-3 gap-2">
                            {(Object.keys(REASON_META) as LiquidationReason[]).map(r => {
                                const meta   = REASON_META[r];
                                const Icon   = meta.icon;
                                const active = reason === r;
                                const tone   = REASON_TONE_CLS[meta.tone];
                                return (
                                    <button
                                        key={r}
                                        type="button"
                                        onClick={() => setReason(r)}
                                        className={[
                                            "group flex flex-col items-center justify-center gap-1.5 h-16 rounded-lg border font-mono text-[11px] uppercase tracking-[0.1em] transition-all duration-150",
                                            active
                                                ? tone.active
                                                : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium hover:bg-surface-2/40",
                                        ].join(" ")}
                                    >
                                        <Icon size={15} className={active ? tone.activeIcon : "text-[var(--text-tertiary)] group-hover:text-foreground transition-colors"} />
                                        <span className="font-bold">{meta.short}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-surface-2/40 border border-border-light/60">
                            <span className={`mt-0.5 inline-block w-1.5 h-1.5 rounded-full ${REASON_TONE_CLS[REASON_META[reason].tone].dotBg} shrink-0`} />
                            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-secondary)] font-medium leading-relaxed">
                                {REASON_META[reason].note}
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 divide-y divide-border-light">
                        {/* ── Empleados y fecha (merged Alcance + Egreso) ──── */}
                        <div className="px-5 py-4 space-y-4">
                            <SectionHeader label="Empleados y fecha" />
                            <EmployeeSelect
                                employees={employees}
                                selectedCedula={selectedIdNumber}
                                onChange={setSelectedIdNumber}
                                onlyActive={onlyActive}
                            />
                            {selectedEmp && <EmployeeInfoCard employee={selectedEmp} />}
                            <BaseInput.Field
                                label="Fecha de egreso"
                                type="date"
                                value={terminationDate}
                                max={today}
                                onValueChange={setTerminationDate}
                                startContent={<Calendar size={14} className="text-[var(--text-tertiary)]" />}
                            />
                            <OnlyActiveToggle checked={onlyActive} onChange={setOnlyActive} />
                        </div>

                        {/* ── Parámetros LOTTT ─────────────────────────────── */}
                        <div className="px-5 py-5 space-y-4">
                            <SectionHeader label="Parámetros LOTTT" />
                            <div className="grid grid-cols-2 gap-3">
                                <BaseInput.Field
                                    label="Días utilidad"
                                    type="number"
                                    min={15}
                                    step={1}
                                    value={profitSharingDays}
                                    onValueChange={setProfitSharingDays}
                                    suffix="d"
                                    inputClassName="text-right"
                                />
                                <BaseInput.Field
                                    label="Días bono vac."
                                    type="number"
                                    min={15}
                                    step={1}
                                    value={vacationBonusDays}
                                    onValueChange={setVacationBonusDays}
                                    suffix="d"
                                    inputClassName="text-right"
                                />
                            </div>
                            <p className="font-sans text-[12px] text-[var(--text-secondary)] leading-relaxed">
                                Las utilidades y el bono vacacional se fraccionan proporcional al tiempo trabajado en el año en curso. Mínimos legales: <span className="font-mono font-semibold text-foreground">30d</span> utilidad / <span className="font-mono font-semibold text-foreground">15d</span> bono. Art. 131 / 192 / 196 LOTTT.
                            </p>
                        </div>

                        {/* ── Tasa BCV ──────────────────────────────────────── */}
                        <div className="px-5 py-4">
                            <BcvRateField
                                value={exchangeRate}
                                onChange={setExchangeRate}
                                onRefresh={fetchBcvRate}
                                loading={bcvLoading}
                                error={bcvFetchError}
                            />
                        </div>
                    </div>

                    {/* ── Footer ────────────────────────────────────────────── */}
                    <CalculatorFooter
                        ctaLabel="Generar PDF"
                        disabled={validResults.length === 0}
                        onCta={handlePdf}
                    >
                        {validResults.length > 0 && (
                            <>
                                <FooterStat label="Empleados" value={String(validResults.length)} />
                                {observationsCount > 0 && (
                                    <FooterStat label="Observaciones" value={String(observationsCount)} tone="amber" />
                                )}
                                <FooterTotal label="Total Gral." valueBs={totalAmount} bcvRate={bcvRate} />
                            </>
                        )}
                    </CalculatorFooter>
                </aside>

                {/* ══ RIGHT PANEL — DASHBOARD ══════════════════════════════════ */}
                <main className="flex-1 overflow-y-auto bg-surface-2 p-6 lg:p-8">
                    {loading ? (
                        <CalculatorLoading />
                    ) : liquidationResults.length === 0 ? (
                        <CalculatorEmptyState
                            description={
                                <>
                                    Selecciona un empleado y ajusta los parámetros para calcular liquidaciones por{" "}
                                    <strong className="text-foreground">{REASON_META[reason].label.toLowerCase()}</strong>.
                                </>
                            }
                        />
                    ) : (
                        <div className="max-w-7xl mx-auto space-y-5">
                            {/* ── KPI strip ──────────────────────────────── */}
                            <motion.div
                                initial={{ y: 8, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ duration: 0.3, ease: "easeOut" }}
                                className={`grid gap-3 grid-cols-2 ${showIndem ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
                            >
                                <KpiTile
                                    label="Empleados"
                                    icon={Users}
                                    countValue={validResults.length}
                                />
                                <KpiTile
                                    label="Prestaciones"
                                    icon={Wallet}
                                    valueBs={totalPrestaciones}
                                    bcvRate={bcvRate}
                                />
                                <KpiTile
                                    label="Fracciones"
                                    icon={Receipt}
                                    valueBs={totalFracciones}
                                    bcvRate={bcvRate}
                                />
                                {showIndem && (
                                    <KpiTile
                                        label="Indemnización"
                                        icon={ShieldAlert}
                                        valueBs={indemnizacionTotal}
                                        bcvRate={bcvRate}
                                        tone="rose"
                                    />
                                )}
                                <KpiTotalTile valueBs={totalAmount} bcvRate={bcvRate} />
                            </motion.div>

                            {/* ── Distribution band ──────────────────────── */}
                            {totalAmount > 0 && (
                                <motion.div
                                    initial={{ y: 8, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ duration: 0.3, delay: 0.05, ease: "easeOut" }}
                                >
                                    <DistributionStrip segments={distributionSegments} />
                                </motion.div>
                            )}

                            {/* ── Tabla de empleados ─────────────────────── */}
                            <motion.div
                                initial={{ y: 8, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ duration: 0.3, delay: 0.1, ease: "easeOut" }}
                            >
                                <LiquidationsTable
                                    results={liquidationResults}
                                    bcvRate={bcvRate}
                                    showIndem={showIndem}
                                    profitSharingDays={profitSharingDays}
                                    vacationBonusDays={vacationBonusDays}
                                />
                            </motion.div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
