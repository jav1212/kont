"use client";

// ============================================================================
// PAYROLL ACCORDION SECTIONS
// Each export is the JSX content of one BaseAccordion.Item panel.
// Sections are purely presentational: no state, no side-effects.
// They receive rows + computed values + mutator callbacks from the page.
// ============================================================================

import { AuditContainer, AuditRow } from "@/src/components/base-audit";
import { BaseInput } from "@/src/components/base-input";
import { EarningRow, EarningValue, DeductionRow, DeductionValue, BonusRow, BonusValue } from "../core/payroll-types";
import { EarningRowEditor, AddRowButton, DeductionRowEditor, BonusRowEditor } from "./payroll-row-editors";



// ─────────────────────────────────────────────────────────────────────────────
// PARAMS SECTION  — 01. Parámetros Generales
// ─────────────────────────────────────────────────────────────────────────────

export const ParamsSection = ({
    payrollDate,
    exchangeRate,
    monthlySalary,
    dailyRate,
    weeklyRate,
    mondaysInMonth,
    onDateChange,
    onExchangeRateChange,
    onMonthlySalaryChange,
}: {
    payrollDate:           string;
    exchangeRate:          string;
    monthlySalary:         string;
    dailyRate:             number;
    weeklyRate:            number;
    mondaysInMonth:        number;
    onDateChange:          (v: string) => void;
    onExchangeRateChange:  (v: string) => void;
    onMonthlySalaryChange: (v: string) => void;
}) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4">
        <BaseInput.Field
            label="Fecha de Nómina" type="date"
            value={payrollDate} onValueChange={onDateChange}
        />
        <BaseInput.Field
            label="Tasa BCV (VES/$)"
            value={exchangeRate} onValueChange={onExchangeRateChange}
        />
        <BaseInput.Field
            label="Salario Mensual"
            value={monthlySalary} onValueChange={onMonthlySalaryChange}
        />
        <BaseInput.Field
            label="Salario Diario"
            value={dailyRate.toFixed(4)} isDisabled helperText="// Base 30 días"
        />
        <BaseInput.Field
            label="Factor Semanal"
            value={weeklyRate.toFixed(4)} isDisabled helperText="// (M×12)/52"
        />
        <BaseInput.Field
            label="Lunes del Mes"
            value={String(mondaysInMonth)} isDisabled helperText="// Periodo de cálculo"
        />
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// EARNINGS SECTION  — 02. Asignaciones
// ─────────────────────────────────────────────────────────────────────────────

export const EarningsSection = ({
    rows, values, total,
    dailyRate, weeklyRate, mondaysInMonth,
    onUpdate, onRemove, onAdd,
}: {
    rows:           EarningRow[];
    values:         EarningValue[];
    total:          number;
    dailyRate:      number;
    weeklyRate:     number;
    mondaysInMonth: number;
    onUpdate: (id: string, updated: EarningRow) => void;
    onRemove: (id: string) => void;
    onAdd:    (blank: EarningRow) => void;
}) => (
    <div className="space-y-3 py-4">
        {rows.map((row) => (
            <EarningRowEditor
                key={row.id}
                row={row}
                dailyRate={dailyRate}
                canRemove={rows.length > 1}
                onChange={(updated) => onUpdate(row.id, updated)}
                onRemove={() => onRemove(row.id)}
            />
        ))}
        <AddRowButton onClick={() => onAdd({
            id: `e_${Date.now()}`, label: "", quantity: "0", multiplier: "1.0", useDaily: true,
        })} />
        <AuditContainer title="Subtotal Asignaciones" total={total} type="income">
            {values.map((r) => (
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
);

// ─────────────────────────────────────────────────────────────────────────────
// DEDUCTIONS SECTION  — 03. Deducciones
// ─────────────────────────────────────────────────────────────────────────────

export const DeductionsSection = ({
    rows, values, total,
    weeklyBase, weeklyRate, mondaysInMonth, monthlySalary,
    onUpdate, onRemove, onAdd,
}: {
    rows:           DeductionRow[];
    values:         DeductionValue[];
    total:          number;
    weeklyBase:     number;
    weeklyRate:     number;
    mondaysInMonth: number;
    monthlySalary:  string;
    onUpdate: (id: string, updated: DeductionRow) => void;
    onRemove: (id: string) => void;
    onAdd:    (blank: DeductionRow) => void;
}) => (
    <div className="space-y-3 py-4">
        {rows.map((row) => (
            <DeductionRowEditor
                key={row.id}
                row={row}
                weeklyBase={weeklyBase}
                monthlyBase={parseFloat(monthlySalary) || 0}
                canRemove={rows.length > 1}
                onChange={(updated) => onUpdate(row.id, updated)}
                onRemove={() => onRemove(row.id)}
            />
        ))}
        <AddRowButton onClick={() => onAdd({
            id: `d_${Date.now()}`, label: "", rate: "0", base: "monthly",
        })} />
        <AuditContainer title="Total Retenciones" total={total} type="deduction">
            {values.map((r) => (
                <AuditRow
                    key={r.id}
                    label={r.label || "—"}
                    formula={`${
                        r.base === "weekly"
                            ? `${weeklyRate.toFixed(2)} × ${mondaysInMonth}L`
                            : monthlySalary
                    } × ${r.rate}%`}
                    value={r.computed}
                    isNegative
                />
            ))}
        </AuditContainer>
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// BONUSES SECTION  — 04. Bonos y Extras
// ─────────────────────────────────────────────────────────────────────────────

export const BonusesSection = ({
    rows, values, total,
    bcvRate,
    onUpdate, onRemove, onAdd,
}: {
    rows:    BonusRow[];
    values:  BonusValue[];
    total:   number;
    bcvRate: number;
    onUpdate: (id: string, updated: BonusRow) => void;
    onRemove: (id: string) => void;
    onAdd:    (blank: BonusRow) => void;
}) => (
    <div className="space-y-3 py-4">
        {rows.map((row) => (
            <BonusRowEditor
                key={row.id}
                row={row}
                bcvRate={bcvRate}
                canRemove={rows.length > 1}
                onChange={(updated) => onUpdate(row.id, updated)}
                onRemove={() => onRemove(row.id)}
            />
        ))}
        <AddRowButton onClick={() => onAdd({
            id: `b_${Date.now()}`, label: "", amount: "0.00",
        })} />
        <AuditContainer title="Total Bonificaciones" total={total} type="income">
            {values.map((r) => (
                <AuditRow
                    key={r.id}
                    label={r.label || "—"}
                    formula={`${r.amount}$ × ${bcvRate}`}
                    value={r.computed}
                />
            ))}
        </AuditContainer>
    </div>
);