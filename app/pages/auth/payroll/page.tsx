"use client";

// ============================================================================
// PAYROLL CALCULATOR — page (orchestration only)
//
// Component tree:
//   PayrollCalculator
//   ├─ BaseAccordion
//   │  ├─ ParamsSection            payroll-accordion-sections.tsx
//   │  ├─ EarningsSection          payroll-accordion-sections.tsx
//   │  ├─ DeductionsSection        payroll-accordion-sections.tsx
//   │  └─ BonusesSection           payroll-accordion-sections.tsx
//   └─ PayrollEmployeeTable        payroll-employee-table.tsx
//        ├─ BaseTable (native mode, renderExpandedRow)
//        ├─ ExpandedAudit (per-row, on demand)
//        └─ TotalsBar
// ============================================================================

import { useState, useMemo, useCallback } from "react";
import { accordionItemProps, BaseAccordion } from "@/src/frontend/components/base-accordion";
import { calculateWeeklyFactor, getMondaysCount } from "@/src/frontend/utils/payroll-helper";
import { ParamsSection, EarningsSection, DeductionsSection, BonusesSection } from "@/src/frontend/components/payroll-accordion-sections";
import { PayrollEmployeeTable } from "@/src/frontend/components/payroll-employee-table";
import { EarningRow, DeductionRow, BonusRow, EarningValue, DeductionValue, BonusValue } from "@/src/frontend/core/payroll-types";


// ============================================================================
// DEFAULTS
// ============================================================================

let _seq = 0;
const uid = (p: string) => `${p}_${++_seq}_${Date.now()}`;

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
// PAGE
// ============================================================================

export default function PayrollCalculator() {
    const [expandedKeys, setExpandedKeys] = useState<any>(
        new Set(["params", "earnings", "deductions", "bonuses"])
    );

    // ── Base params ───────────────────────────────────────────────────────
    const [exchangeRate,  setExchangeRate]  = useState("79.59");
    const [monthlySalary, setMonthlySalary] = useState("130.00");
    const [payrollDate,   setPayrollDate]   = useState(new Date().toISOString().split("T")[0]);

    // ── Dynamic row lists ─────────────────────────────────────────────────
    const [earningRows,   setEarningRows]   = useState<EarningRow[]>(DEFAULT_EARNINGS);
    const [deductionRows, setDeductionRows] = useState<DeductionRow[]>(DEFAULT_DEDUCTIONS);
    const [bonusRows,     setBonusRows]     = useState<BonusRow[]>(DEFAULT_BONUSES);

    // ── Derived scalars ───────────────────────────────────────────────────
    const mondaysInMonth = useMemo(() => getMondaysCount(payrollDate),                          [payrollDate]);
    const dailyRate      = useMemo(() => (parseFloat(monthlySalary) || 0) / 30,                 [monthlySalary]);
    const weeklyRate     = useMemo(() => calculateWeeklyFactor(parseFloat(monthlySalary) || 0), [monthlySalary]);
    const bcvRate        = useMemo(() => parseFloat(exchangeRate) || 0,                         [exchangeRate]);
    const weeklyBase     = useMemo(() => weeklyRate * mondaysInMonth,                           [weeklyRate, mondaysInMonth]);

    // ── Computed row values (for audit trail in accordion sections) ───────
    const earningValues = useMemo<EarningValue[]>(() =>
        earningRows.map((r) => ({
            ...r,
            computed: r.useDaily
                ? (parseFloat(r.quantity) || 0) * dailyRate * (parseFloat(r.multiplier) || 1)
                : parseFloat(r.quantity) || 0,
        })), [earningRows, dailyRate]);

    const deductionValues = useMemo<DeductionValue[]>(() =>
        deductionRows.map((r) => ({
            ...r,
            computed: (r.base === "weekly" ? weeklyBase : parseFloat(monthlySalary) || 0)
                * ((parseFloat(r.rate) || 0) / 100),
        })), [deductionRows, weeklyBase, monthlySalary]);

    const bonusValues = useMemo<BonusValue[]>(() =>
        bonusRows.map((r) => ({
            ...r,
            computed: (parseFloat(r.amount) || 0) * bcvRate,
        })), [bonusRows, bcvRate]);

    const totalEarnings   = useMemo(() => earningValues.reduce((s, r)   => s + r.computed, 0), [earningValues]);
    const totalDeductions = useMemo(() => deductionValues.reduce((s, r) => s + r.computed, 0), [deductionValues]);
    const totalBonuses    = useMemo(() => bonusValues.reduce((s, r)     => s + r.computed, 0), [bonusValues]);

    // ── Earning mutators ──────────────────────────────────────────────────
    const updateEarning = useCallback((id: string, u: EarningRow) =>
        setEarningRows((rs) => rs.map((r) => r.id === id ? u : r)), []);
    const removeEarning = useCallback((id: string) =>
        setEarningRows((rs) => rs.filter((r) => r.id !== id)), []);
    const addEarning    = useCallback((b: EarningRow) =>
        setEarningRows((rs) => [...rs, b]), []);

    // ── Deduction mutators ────────────────────────────────────────────────
    const updateDeduction = useCallback((id: string, u: DeductionRow) =>
        setDeductionRows((rs) => rs.map((r) => r.id === id ? u : r)), []);
    const removeDeduction = useCallback((id: string) =>
        setDeductionRows((rs) => rs.filter((r) => r.id !== id)), []);
    const addDeduction    = useCallback((b: DeductionRow) =>
        setDeductionRows((rs) => [...rs, b]), []);

    // ── Bonus mutators ────────────────────────────────────────────────────
    const updateBonus = useCallback((id: string, u: BonusRow) =>
        setBonusRows((rs) => rs.map((r) => r.id === id ? u : r)), []);
    const removeBonus = useCallback((id: string) =>
        setBonusRows((rs) => rs.filter((r) => r.id !== id)), []);
    const addBonus    = useCallback((b: BonusRow) =>
        setBonusRows((rs) => [...rs, b]), []);

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-surface-2 p-8 font-mono">
            <div className="max-w-[1400px] mx-auto space-y-6">

                <header className="pb-4 border-b border-border-light text-foreground">
                    <nav className="text-[10px] uppercase text-neutral-400 mb-1 tracking-widest">
                        Nómina / Calculadora / v2.2
                    </nav>
                    <h1 className="text-xl font-bold uppercase tracking-tighter">
                        Panel de Configuración
                    </h1>
                </header>

                <BaseAccordion.Root selectedKeys={expandedKeys} onSelectionChange={setExpandedKeys}>

                    <BaseAccordion.Item key="params"
                        {...accordionItemProps({ title: "01. Parámetros Generales", subtitle: "Configuración base y tasas" })}
                    >
                        <ParamsSection
                            payrollDate={payrollDate}
                            exchangeRate={exchangeRate}
                            monthlySalary={monthlySalary}
                            dailyRate={dailyRate}
                            weeklyRate={weeklyRate}
                            mondaysInMonth={mondaysInMonth}
                            onDateChange={setPayrollDate}
                            onExchangeRateChange={setExchangeRate}
                            onMonthlySalaryChange={setMonthlySalary}
                        />
                    </BaseAccordion.Item>

                    <BaseAccordion.Item key="earnings"
                        {...accordionItemProps({ title: "02. Asignaciones", subtitle: "Ingresos por días trabajados" })}
                    >
                        <EarningsSection
                            rows={earningRows}
                            values={earningValues}
                            total={totalEarnings}
                            dailyRate={dailyRate}
                            weeklyRate={weeklyRate}
                            mondaysInMonth={mondaysInMonth}
                            onUpdate={updateEarning}
                            onRemove={removeEarning}
                            onAdd={addEarning}
                        />
                    </BaseAccordion.Item>

                    <BaseAccordion.Item key="deductions"
                        {...accordionItemProps({ title: "03. Deducciones", subtitle: "Configuración de retenciones" })}
                    >
                        <DeductionsSection
                            rows={deductionRows}
                            values={deductionValues}
                            total={totalDeductions}
                            weeklyBase={weeklyBase}
                            weeklyRate={weeklyRate}
                            mondaysInMonth={mondaysInMonth}
                            monthlySalary={monthlySalary}
                            onUpdate={updateDeduction}
                            onRemove={removeDeduction}
                            onAdd={addDeduction}
                        />
                    </BaseAccordion.Item>

                    <BaseAccordion.Item key="bonuses"
                        {...accordionItemProps({ title: "04. Bonos y Extras", subtitle: "Pagos indexados a la tasa BCV" })}
                    >
                        <BonusesSection
                            rows={bonusRows}
                            values={bonusValues}
                            total={totalBonuses}
                            bcvRate={bcvRate}
                            onUpdate={updateBonus}
                            onRemove={removeBonus}
                            onAdd={addBonus}
                        />
                    </BaseAccordion.Item>

                </BaseAccordion.Root>

                {/* ── EMPLOYEE TABLE (replaces PayrollResultFooter) ────────── */}
                <PayrollEmployeeTable
                    earningRows={earningRows}
                    deductionRows={deductionRows}
                    bonusRows={bonusRows}
                    mondaysInMonth={mondaysInMonth}
                    bcvRate={bcvRate}
                />

            </div>
        </div>
    );
}