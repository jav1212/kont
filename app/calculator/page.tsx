"use client";

import React, { useState, useMemo, useCallback } from "react";
import { BaseInput } from "@/src/components/base-input";
import { accordionItemProps, BaseAccordion } from "@/src/components/base-accordion";
import { calculateWeeklyFactor, getMondaysCount } from "@/src/utils/payroll-helper";
import { AuditContainer, AuditRow } from "@/src/components/base-audit";

// ============================================================================
// TYPES
// ============================================================================

interface EarningRow {
    id:         string;
    label:      string;
    quantity:   string;   // days / units
    multiplier: string;   // weight factor (e.g. 1.5 for sundays)
    useDaily:   boolean;  // if true: quantity × dailyRate × multiplier
                          // if false: quantity is the full VES amount
}

interface DeductionRow {
    id:       string;
    label:    string;
    rate:     string;   // percentage
    base:     "weekly" | "monthly";  // which base to apply rate to
}

interface BonusRow {
    id:     string;
    label:  string;
    amount: string;   // USD amount
}

// ============================================================================
// HELPERS
// ============================================================================

let _seq = 0;
const uid = (prefix: string) => `${prefix}_${++_seq}_${Date.now()}`;

const AddRowButton = ({ onClick }: { onClick: () => void }) => (
    <button
        onClick={onClick}
        className={[
            "flex items-center gap-2 mt-2",
            "font-mono text-[10px] uppercase tracking-[0.18em]",
            "text-neutral-400 hover:text-primary-500",
            "transition-colors duration-150",
        ].join(" ")}
    >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 1v10M1 6h10" />
        </svg>
        Agregar fila
    </button>
);

const RemoveRowButton = ({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={[
            "flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md",
            "border border-border-light",
            "text-neutral-300 hover:text-error hover:border-error/40",
            "disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:text-neutral-300 disabled:hover:border-border-light",
            "transition-colors duration-150",
        ].join(" ")}
    >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M1 1l8 8M9 1L1 9" />
        </svg>
    </button>
);

// ============================================================================
// DEFAULT ROWS
// ============================================================================

const DEFAULT_EARNINGS: EarningRow[] = [
    { id: uid("e"), label: "Días Normales", quantity: "12", multiplier: "1.0", useDaily: true },
    { id: uid("e"), label: "Sábados",       quantity: "2",  multiplier: "1.0", useDaily: true },
    { id: uid("e"), label: "Domingos",      quantity: "2",  multiplier: "1.5", useDaily: true },
];

const DEFAULT_DEDUCTIONS: DeductionRow[] = [
    { id: uid("d"), label: "S.S.O",   rate: "4",   base: "weekly"  },
    { id: uid("d"), label: "R.P.E",   rate: "0.5", base: "weekly"  },
    { id: uid("d"), label: "F.A.O.V", rate: "1",   base: "monthly" },
];

const DEFAULT_BONUSES: BonusRow[] = [
    { id: uid("b"), label: "Bono Alimentación", amount: "40.00" },
    { id: uid("b"), label: "Bono Transporte",   amount: "20.00" },
];

// ============================================================================
// ROW EDITORS
// ============================================================================

const EarningRowEditor = ({
    row,
    onChange,
    onRemove,
    canRemove,
    dailyRate,
}: {
    row: EarningRow;
    onChange: (updated: EarningRow) => void;
    onRemove: () => void;
    canRemove: boolean;
    dailyRate: number;
}) => {
    const value = row.useDaily
        ? (parseFloat(row.quantity) || 0) * dailyRate * (parseFloat(row.multiplier) || 1)
        : (parseFloat(row.quantity) || 0);

    return (
        <div className="flex items-end gap-2">
            <div className="flex-[2] min-w-0">
                <BaseInput.Field
                    label="Concepto"
                    value={row.label}
                    onValueChange={(v) => onChange({ ...row, label: v })}
                    placeholder="Ej: Días Normales"
                />
            </div>
            <div className="flex-1 min-w-0">
                <BaseInput.Field
                    label="Cantidad"
                    value={row.quantity}
                    onValueChange={(v) => onChange({ ...row, quantity: v })}
                    placeholder="0"
                />
            </div>
            {row.useDaily && (
                <div className="flex-1 min-w-0">
                    <BaseInput.Field
                        label="Factor ×"
                        value={row.multiplier}
                        onValueChange={(v) => onChange({ ...row, multiplier: v })}
                        placeholder="1.0"
                    />
                </div>
            )}
            {/* computed preview */}
            <div className="flex-1 min-w-0">
                <BaseInput.Field
                    label="Subtotal VES"
                    value={value.toFixed(2)}
                    isDisabled
                />
            </div>
            {/* useDaily toggle */}
            <div className="flex flex-col gap-1 pb-[1px]">
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-400">
                    Modo
                </span>
                <button
                    onClick={() => onChange({ ...row, useDaily: !row.useDaily })}
                    className={[
                        "h-[38px] px-2.5 rounded-lg border font-mono text-[10px] uppercase tracking-[0.12em]",
                        "transition-colors duration-150 whitespace-nowrap",
                        row.useDaily
                            ? "border-primary-400 bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400"
                            : "border-border-light bg-surface-1 text-neutral-500 hover:border-border-medium",
                    ].join(" ")}
                >
                    {row.useDaily ? "× Diario" : "VES fijo"}
                </button>
            </div>
            <div className="pb-[1px]">
                <RemoveRowButton onClick={onRemove} disabled={!canRemove} />
            </div>
        </div>
    );
};

const DeductionRowEditor = ({
    row,
    onChange,
    onRemove,
    canRemove,
    weeklyBase,
    monthlyBase,
}: {
    row: DeductionRow;
    onChange: (updated: DeductionRow) => void;
    onRemove: () => void;
    canRemove: boolean;
    weeklyBase: number;
    monthlyBase: number;
}) => {
    const base = row.base === "weekly" ? weeklyBase : monthlyBase;
    const value = base * ((parseFloat(row.rate) || 0) / 100);

    return (
        <div className="flex items-end gap-2">
            <div className="flex-[2] min-w-0">
                <BaseInput.Field
                    label="Concepto"
                    value={row.label}
                    onValueChange={(v) => onChange({ ...row, label: v })}
                    placeholder="Ej: S.S.O"
                />
            </div>
            <div className="flex-1 min-w-0">
                <BaseInput.Field
                    label="Tasa %"
                    value={row.rate}
                    onValueChange={(v) => onChange({ ...row, rate: v })}
                    placeholder="0.00"
                />
            </div>
            {/* base toggle */}
            <div className="flex flex-col gap-1 pb-[1px]">
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-400">
                    Base
                </span>
                <button
                    onClick={() => onChange({ ...row, base: row.base === "weekly" ? "monthly" : "weekly" })}
                    className={[
                        "h-[38px] px-2.5 rounded-lg border font-mono text-[10px] uppercase tracking-[0.12em]",
                        "transition-colors duration-150 whitespace-nowrap",
                        "border-border-light bg-surface-1 text-neutral-500 hover:border-border-medium",
                    ].join(" ")}
                >
                    {row.base === "weekly" ? "Semanal" : "Mensual"}
                </button>
            </div>
            <div className="flex-1 min-w-0">
                <BaseInput.Field
                    label="Retención VES"
                    value={value.toFixed(2)}
                    isDisabled
                />
            </div>
            <div className="pb-[1px]">
                <RemoveRowButton onClick={onRemove} disabled={!canRemove} />
            </div>
        </div>
    );
};

const BonusRowEditor = ({
    row,
    onChange,
    onRemove,
    canRemove,
    bcvRate,
}: {
    row: BonusRow;
    onChange: (updated: BonusRow) => void;
    onRemove: () => void;
    canRemove: boolean;
    bcvRate: number;
}) => {
    const value = (parseFloat(row.amount) || 0) * bcvRate;

    return (
        <div className="flex items-end gap-2">
            <div className="flex-[2] min-w-0">
                <BaseInput.Field
                    label="Concepto"
                    value={row.label}
                    onValueChange={(v) => onChange({ ...row, label: v })}
                    placeholder="Ej: Bono Alimentación"
                />
            </div>
            <div className="flex-1 min-w-0">
                <BaseInput.Field
                    label="Monto USD"
                    value={row.amount}
                    onValueChange={(v) => onChange({ ...row, amount: v })}
                    placeholder="0.00"
                />
            </div>
            <div className="flex-1 min-w-0">
                <BaseInput.Field
                    label="Equivalente VES"
                    value={value.toFixed(2)}
                    isDisabled
                />
            </div>
            <div className="pb-[1px]">
                <RemoveRowButton onClick={onRemove} disabled={!canRemove} />
            </div>
        </div>
    );
};

// ============================================================================
// PAGE
// ============================================================================

export default function PayrollCalculator() {
    const [expandedKeys, setExpandedKeys] = useState<any>(
        new Set(["params", "earnings", "deductions", "bonuses"])
    );

    // --- BASE PARAMS ---
    const [exchangeRate,  setExchangeRate]  = useState("36.50");
    const [monthlySalary, setMonthlySalary] = useState("130.00");
    const [payrollDate,   setPayrollDate]   = useState(new Date().toISOString().split("T")[0]);

    // --- DYNAMIC ROWS ---
    const [earningRows,   setEarningRows]   = useState<EarningRow[]>(DEFAULT_EARNINGS);
    const [deductionRows, setDeductionRows] = useState<DeductionRow[]>(DEFAULT_DEDUCTIONS);
    const [bonusRows,     setBonusRows]     = useState<BonusRow[]>(DEFAULT_BONUSES);

    // --- COMPUTED BASE VALUES ---
    const mondaysInMonth = useMemo(() => getMondaysCount(payrollDate),                   [payrollDate]);
    const dailyRate      = useMemo(() => (parseFloat(monthlySalary) || 0) / 30,          [monthlySalary]);
    const weeklyRate     = useMemo(() => calculateWeeklyFactor(parseFloat(monthlySalary) || 0), [monthlySalary]);
    const bcvRate        = useMemo(() => parseFloat(exchangeRate) || 0,                  [exchangeRate]);
    const weeklyBase     = useMemo(() => weeklyRate * mondaysInMonth,                    [weeklyRate, mondaysInMonth]);

    // --- ROW CALCULATORS ---
    const earningValues = useMemo(() =>
        earningRows.map((r) => ({
            ...r,
            computed: r.useDaily
                ? (parseFloat(r.quantity) || 0) * dailyRate * (parseFloat(r.multiplier) || 1)
                : (parseFloat(r.quantity) || 0),
        })),
        [earningRows, dailyRate]
    );

    const deductionValues = useMemo(() =>
        deductionRows.map((r) => ({
            ...r,
            computed: (r.base === "weekly" ? weeklyBase : parseFloat(monthlySalary) || 0)
                    * ((parseFloat(r.rate) || 0) / 100),
        })),
        [deductionRows, weeklyBase, monthlySalary]
    );

    const bonusValues = useMemo(() =>
        bonusRows.map((r) => ({
            ...r,
            computed: (parseFloat(r.amount) || 0) * bcvRate,
        })),
        [bonusRows, bcvRate]
    );

    // --- TOTALS ---
    const totalEarnings   = useMemo(() => earningValues.reduce((s, r) => s + r.computed, 0),   [earningValues]);
    const totalDeductions = useMemo(() => deductionValues.reduce((s, r) => s + r.computed, 0), [deductionValues]);
    const totalBonuses    = useMemo(() => bonusValues.reduce((s, r) => s + r.computed, 0),     [bonusValues]);
    const totalGross      = totalEarnings + totalBonuses;
    const netAmount       = (totalGross - totalDeductions).toFixed(2);

    // --- ROW MUTATORS ---
    const updateEarning = useCallback((id: string, updated: EarningRow) =>
        setEarningRows((rows) => rows.map((r) => r.id === id ? updated : r)), []);
    const removeEarning = useCallback((id: string) =>
        setEarningRows((rows) => rows.filter((r) => r.id !== id)), []);
    const addEarning = useCallback(() =>
        setEarningRows((rows) => [...rows, { id: uid("e"), label: "", quantity: "0", multiplier: "1.0", useDaily: true }]), []);

    const updateDeduction = useCallback((id: string, updated: DeductionRow) =>
        setDeductionRows((rows) => rows.map((r) => r.id === id ? updated : r)), []);
    const removeDeduction = useCallback((id: string) =>
        setDeductionRows((rows) => rows.filter((r) => r.id !== id)), []);
    const addDeduction = useCallback(() =>
        setDeductionRows((rows) => [...rows, { id: uid("d"), label: "", rate: "0", base: "monthly" }]), []);

    const updateBonus = useCallback((id: string, updated: BonusRow) =>
        setBonusRows((rows) => rows.map((r) => r.id === id ? updated : r)), []);
    const removeBonus = useCallback((id: string) =>
        setBonusRows((rows) => rows.filter((r) => r.id !== id)), []);
    const addBonus = useCallback(() =>
        setBonusRows((rows) => [...rows, { id: uid("b"), label: "", amount: "0.00" }]), []);

    // ============================================================================
    // RENDER
    // ============================================================================

    return (
        <div className="min-h-screen bg-surface-2 p-8 font-mono">
            <div className="max-w-[1200px] mx-auto space-y-6">

                <header className="pb-4 border-b border-border-light text-foreground">
                    <nav className="text-[10px] uppercase text-neutral-400 mb-1 tracking-widest">
                        Nómina / Calculadora / v2.0
                    </nav>
                    <h1 className="text-xl font-bold uppercase tracking-tighter">
                        Panel de Configuración
                    </h1>
                </header>

                <BaseAccordion.Root selectedKeys={expandedKeys} onSelectionChange={setExpandedKeys}>

                    {/* ── 01. PARÁMETROS ─────────────────────────────────────────── */}
                    <BaseAccordion.Item key="params"
                        {...accordionItemProps({ title: "01. Parámetros Generales", subtitle: "Configuración base y tasas" })}
                    >
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4">
                            <BaseInput.Field label="Fecha de Nómina" type="date"
                                value={payrollDate} onValueChange={setPayrollDate} />
                            <BaseInput.Field label="Tasa BCV (VES/$)"
                                value={exchangeRate} onValueChange={setExchangeRate} />
                            <BaseInput.Field label="Salario Mensual"
                                value={monthlySalary} onValueChange={setMonthlySalary} />
                            <BaseInput.Field label="Salario Diario"
                                value={dailyRate.toFixed(4)} isDisabled helperText="// Base 30 días" />
                            <BaseInput.Field label="Factor Semanal"
                                value={weeklyRate.toFixed(4)} isDisabled helperText="// (M×12)/52" />
                            <BaseInput.Field label="Lunes del Mes"
                                value={String(mondaysInMonth)} isDisabled helperText="// Periodo de cálculo" />
                        </div>
                    </BaseAccordion.Item>

                    {/* ── 02. ASIGNACIONES ───────────────────────────────────────── */}
                    <BaseAccordion.Item key="earnings"
                        {...accordionItemProps({ title: "02. Asignaciones", subtitle: "Ingresos por días trabajados" })}
                    >
                        <div className="space-y-3 py-4">
                            {earningRows.map((row) => (
                                <EarningRowEditor
                                    key={row.id}
                                    row={row}
                                    dailyRate={dailyRate}
                                    canRemove={earningRows.length > 1}
                                    onChange={(updated) => updateEarning(row.id, updated)}
                                    onRemove={() => removeEarning(row.id)}
                                />
                            ))}
                            <AddRowButton onClick={addEarning} />

                            <AuditContainer title="Subtotal Asignaciones" total={totalEarnings} type="income">
                                {earningValues.map((r) => (
                                    <AuditRow
                                        key={r.id}
                                        label={r.label || "—"}
                                        formula={
                                            r.useDaily
                                                ? `${r.quantity}d × ${dailyRate.toFixed(2)}${parseFloat(r.multiplier) !== 1 ? ` × ${r.multiplier}` : ""}`
                                                : `${r.quantity} VES`
                                        }
                                        value={r.computed}
                                    />
                                ))}
                            </AuditContainer>
                        </div>
                    </BaseAccordion.Item>

                    {/* ── 03. DEDUCCIONES ────────────────────────────────────────── */}
                    <BaseAccordion.Item key="deductions"
                        {...accordionItemProps({ title: "03. Deducciones", subtitle: "Configuración de retenciones" })}
                    >
                        <div className="space-y-3 py-4">
                            {deductionRows.map((row) => (
                                <DeductionRowEditor
                                    key={row.id}
                                    row={row}
                                    weeklyBase={weeklyBase}
                                    monthlyBase={parseFloat(monthlySalary) || 0}
                                    canRemove={deductionRows.length > 1}
                                    onChange={(updated) => updateDeduction(row.id, updated)}
                                    onRemove={() => removeDeduction(row.id)}
                                />
                            ))}
                            <AddRowButton onClick={addDeduction} />

                            <AuditContainer title="Total Retenciones" total={totalDeductions} type="deduction">
                                {deductionValues.map((r) => (
                                    <AuditRow
                                        key={r.id}
                                        label={r.label || "—"}
                                        formula={`${r.base === "weekly"
                                            ? `${weeklyRate.toFixed(2)} × ${mondaysInMonth}L`
                                            : monthlySalary
                                        } × ${r.rate}%`}
                                        value={r.computed}
                                        isNegative
                                    />
                                ))}
                            </AuditContainer>
                        </div>
                    </BaseAccordion.Item>

                    {/* ── 04. BONOS ──────────────────────────────────────────────── */}
                    <BaseAccordion.Item key="bonuses"
                        {...accordionItemProps({ title: "04. Bonos y Extras", subtitle: "Pagos indexados a la tasa BCV" })}
                    >
                        <div className="space-y-3 py-4">
                            {bonusRows.map((row) => (
                                <BonusRowEditor
                                    key={row.id}
                                    row={row}
                                    bcvRate={bcvRate}
                                    canRemove={bonusRows.length > 1}
                                    onChange={(updated) => updateBonus(row.id, updated)}
                                    onRemove={() => removeBonus(row.id)}
                                />
                            ))}
                            <AddRowButton onClick={addBonus} />

                            <AuditContainer title="Total Bonificaciones" total={totalBonuses} type="income">
                                {bonusValues.map((r) => (
                                    <AuditRow
                                        key={r.id}
                                        label={r.label || "—"}
                                        formula={`${r.amount}$ × ${bcvRate}`}
                                        value={r.computed}
                                    />
                                ))}
                            </AuditContainer>
                        </div>
                    </BaseAccordion.Item>

                </BaseAccordion.Root>

                {/* ── FOOTER DE RESULTADOS ───────────────────────────────────────── */}
                <footer className="p-6 bg-foreground text-background rounded-2xl flex justify-between items-center shadow-2xl border border-white/10">
                    <div className="flex gap-12 items-center tabular-nums">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase opacity-40 mb-1 font-bold tracking-wider text-primary-400">
                                Neto Total a Pagar (VES)
                            </span>
                            <span className="text-4xl font-black tracking-tighter text-primary-400">
                                {netAmount}
                            </span>
                        </div>
                        <div className="h-12 w-px bg-white/10" />
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase opacity-40 mb-1 tracking-wider">
                                Equivalente en Divisas
                            </span>
                            <span className="text-2xl font-bold">
                                {(parseFloat(netAmount) / bcvRate).toFixed(2)}{" "}
                                <span className="text-xs opacity-40 italic font-mono">USD</span>
                            </span>
                        </div>
                        <div className="h-12 w-px bg-white/10" />
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase opacity-40 mb-1 tracking-wider">
                                Bruto (VES)
                            </span>
                            <span className="text-lg font-semibold opacity-70">
                                {totalGross.toFixed(2)}
                            </span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase opacity-40 mb-1 tracking-wider">
                                Retenciones (VES)
                            </span>
                            <span className="text-lg font-semibold text-red-400/80">
                                -{totalDeductions.toFixed(2)}
                            </span>
                        </div>
                    </div>
                </footer>

            </div>
        </div>
    );
}