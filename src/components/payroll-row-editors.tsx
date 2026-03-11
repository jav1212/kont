"use client";

// ============================================================================
// PAYROLL ROW EDITORS
// Self-contained line-item editor for each formula group.
// Each editor is stateless — receives a row object + update/remove callbacks.
// ============================================================================

import { BaseInput } from "@/src/components/base-input";
import { BonusRow, DeductionRow, EarningRow } from "../core/payroll-types";

// ── Shared micro-buttons ───────────────────────────────────────────────────

export const AddRowButton = ({ onClick }: { onClick: () => void }) => (
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

export const RemoveRowButton = ({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={[
            "flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md",
            "border border-border-light",
            "text-neutral-300 hover:text-error hover:border-error/40",
            "disabled:opacity-20 disabled:cursor-not-allowed",
            "disabled:hover:text-neutral-300 disabled:hover:border-border-light",
            "transition-colors duration-150",
        ].join(" ")}
    >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M1 1l8 8M9 1L1 9" />
        </svg>
    </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// EARNING ROW EDITOR
// ─────────────────────────────────────────────────────────────────────────────

export const EarningRowEditor = ({
    row, onChange, onRemove, canRemove, dailyRate,
}: {
    row:       EarningRow;
    onChange:  (updated: EarningRow) => void;
    onRemove:  () => void;
    canRemove: boolean;
    dailyRate: number;
}) => {
    const computed = row.useDaily
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
            <div className="flex-1 min-w-0">
                <BaseInput.Field
                    label="Subtotal VES"
                    value={computed.toFixed(2)}
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

// ─────────────────────────────────────────────────────────────────────────────
// DEDUCTION ROW EDITOR
// ─────────────────────────────────────────────────────────────────────────────

export const DeductionRowEditor = ({
    row, onChange, onRemove, canRemove, weeklyBase, monthlyBase,
}: {
    row:         DeductionRow;
    onChange:    (updated: DeductionRow) => void;
    onRemove:    () => void;
    canRemove:   boolean;
    weeklyBase:  number;
    monthlyBase: number;
}) => {
    const base    = row.base === "weekly" ? weeklyBase : monthlyBase;
    const computed = base * ((parseFloat(row.rate) || 0) / 100);

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
                    value={computed.toFixed(2)}
                    isDisabled
                />
            </div>
            <div className="pb-[1px]">
                <RemoveRowButton onClick={onRemove} disabled={!canRemove} />
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// BONUS ROW EDITOR
// ─────────────────────────────────────────────────────────────────────────────

export const BonusRowEditor = ({
    row, onChange, onRemove, canRemove, bcvRate,
}: {
    row:       BonusRow;
    onChange:  (updated: BonusRow) => void;
    onRemove:  () => void;
    canRemove: boolean;
    bcvRate:   number;
}) => {
    const computed = (parseFloat(row.amount) || 0) * bcvRate;

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
                    value={computed.toFixed(2)}
                    isDisabled
                />
            </div>
            <div className="pb-[1px]">
                <RemoveRowButton onClick={onRemove} disabled={!canRemove} />
            </div>
        </div>
    );
};