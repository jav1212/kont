"use client";

// ============================================================================
// PAYROLL ROW EDITORS  — compact 2-row layout
// Row 1: concept label input  +  remove button
// Row 2: numeric inputs  +  toggle  +  computed result chip
// ============================================================================

import { BonusRow, DeductionRow, EarningRow, HorasExtrasRow, HorasExtrasTipo, HORAS_EXTRAS_MULTIPLIER } from "../types/payroll-types";

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputCls = [
    "h-8 px-2.5 rounded-md border border-border-light bg-surface-1 outline-none",
    "font-mono text-[12px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium",
    "transition-colors duration-150 placeholder:text-foreground/25",
].join(" ");

const numInputCls = inputCls + " text-center w-16";

// ── Add row button ─────────────────────────────────────────────────────────────

export const AddRowButton = ({ onClick }: { onClick: () => void }) => (
    <button
        onClick={onClick}
        className="flex items-center gap-1.5 mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/35 hover:text-primary-500 transition-colors duration-150"
    >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M5.5 1v9M1 5.5h9" />
        </svg>
        Agregar fila
    </button>
);

// ── Remove row button ──────────────────────────────────────────────────────────

const RemoveButton = ({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md border border-border-light text-foreground/25 hover:text-red-400 hover:border-red-400/40 disabled:opacity-20 disabled:cursor-not-allowed transition-colors duration-150"
    >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M1 1l6 6M7 1L1 7" />
        </svg>
    </button>
);

// ── Result chip ───────────────────────────────────────────────────────────────

const Result = ({ value, negative }: { value: number; negative?: boolean }) => (
    <span className={[
        "ml-auto shrink-0 font-mono text-[11px] tabular-nums",
        negative ? "text-red-400" : "text-foreground/50",
    ].join(" ")}>
        {negative ? "−" : ""}{Math.abs(value).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
);

// ── Toggle button ─────────────────────────────────────────────────────────────

const Toggle = ({
    active, activeLabel, inactiveLabel, onClick,
}: { active: boolean; activeLabel: string; inactiveLabel: string; onClick: () => void }) => (
    <button
        onClick={onClick}
        className={[
            "h-8 px-2 rounded-md border font-mono text-[9px] uppercase tracking-[0.1em] shrink-0",
            "transition-colors duration-150 whitespace-nowrap",
            active
                ? "border-primary-500/40 bg-primary-500/10 text-primary-500"
                : "border-border-light bg-surface-1 text-foreground/40 hover:border-border-medium",
        ].join(" ")}
    >
        {active ? activeLabel : inactiveLabel}
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
        <div className="space-y-1.5">
            {/* Row 1: Concepto + remove */}
            <div className="flex items-center gap-1.5">
                <input
                    type="text"
                    value={row.label}
                    onChange={(e) => onChange({ ...row, label: e.target.value })}
                    placeholder="Concepto"
                    className={inputCls + " flex-1"}
                />
                <RemoveButton onClick={onRemove} disabled={!canRemove} />
            </div>
            {/* Row 2: Qty | Factor | Modo | → result */}
            <div className="flex items-center gap-1.5">
                <input
                    type="number"
                    value={row.quantity}
                    onChange={(e) => onChange({ ...row, quantity: e.target.value })}
                    placeholder="0"
                    className={numInputCls}
                />
                {row.useDaily && (
                    <input
                        type="number"
                        value={row.multiplier}
                        onChange={(e) => onChange({ ...row, multiplier: e.target.value })}
                        placeholder="1.0"
                        className={numInputCls}
                        step="0.5"
                    />
                )}
                <Toggle
                    active={row.useDaily}
                    activeLabel="× diario"
                    inactiveLabel="VES fijo"
                    onClick={() => onChange({ ...row, useDaily: !row.useDaily })}
                />
                <Result value={computed} />
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// DEDUCTION ROW EDITOR
// ─────────────────────────────────────────────────────────────────────────────

const BASE_CYCLE = ["weekly", "weekly-capped", "monthly", "integral"] as const;
const BASE_LABELS: Record<string, string> = {
    weekly:         "semanal",
    "weekly-capped": "semanal (tope)",
    monthly:        "mensual",
    integral:       "integral",
};

export const DeductionRowEditor = ({
    row, onChange, onRemove, canRemove, weeklyBase, monthlyBase, integralBase, cappedWeeklyBase,
}: {
    row:              DeductionRow;
    onChange:         (updated: DeductionRow) => void;
    onRemove:         () => void;
    canRemove:        boolean;
    weeklyBase:       number;
    monthlyBase:      number;
    integralBase:     number;
    cappedWeeklyBase: number; // min(weeklyBase, 10×salMin)
}) => {
    const isFixed    = row.mode === "fixed";
    const isIntegral = row.base === "integral";
    const isCapped   = row.base === "weekly-capped";

    const baseValue = isFixed       ? 1
                    : isCapped      ? cappedWeeklyBase
                    : row.base === "weekly"    ? weeklyBase
                    : row.base === "integral"  ? integralBase
                    : monthlyBase;

    const computed = isFixed
        ? (parseFloat(row.rate) || 0)
        : baseValue * ((parseFloat(row.rate) || 0) / 100);

    const cycleBase = () => {
        const idx = BASE_CYCLE.indexOf(row.base as typeof BASE_CYCLE[number]);
        onChange({ ...row, base: BASE_CYCLE[(idx + 1) % BASE_CYCLE.length] });
    };

    const toggleMode = () => onChange({
        ...row,
        mode: isFixed ? "rate" : "fixed",
        rate: "0",
        base: isFixed ? "weekly" : row.base,
    });

    return (
        <div className="space-y-1.5">
            {/* Row 1: Concepto + remove */}
            <div className="flex items-center gap-1.5">
                <input
                    type="text"
                    value={row.label}
                    onChange={(e) => onChange({ ...row, label: e.target.value })}
                    placeholder="Concepto"
                    className={inputCls + " flex-1"}
                />
                <RemoveButton onClick={onRemove} disabled={!canRemove} />
            </div>
            {/* Row 2: amount/rate | base | mode toggle | → result */}
            <div className="flex items-center gap-1.5">
                <div className="relative">
                    <input
                        type="number"
                        value={row.rate}
                        onChange={(e) => onChange({ ...row, rate: e.target.value })}
                        placeholder="0"
                        className={numInputCls}
                        step={isFixed ? "10" : "0.5"}
                    />
                    {!isFixed && (
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 font-mono text-[9px] text-foreground/30 pointer-events-none">%</span>
                    )}
                </div>
                {!isFixed && (
                    <button
                        onClick={cycleBase}
                        className={[
                            "h-8 px-2 rounded-md border font-mono text-[9px] uppercase tracking-[0.1em] shrink-0",
                            "transition-colors duration-150 whitespace-nowrap",
                            isIntegral  ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                            : isCapped  ? "border-red-500/40 bg-red-500/[0.08] text-red-400"
                            : row.base === "weekly" ? "border-primary-500/40 bg-primary-500/10 text-primary-500"
                            : "border-border-light bg-surface-1 text-foreground/40 hover:border-border-medium",
                        ].join(" ")}
                        title="Click para cambiar base"
                    >
                        {BASE_LABELS[row.base]}
                    </button>
                )}
                <button
                    onClick={toggleMode}
                    className={[
                        "h-8 px-2 rounded-md border font-mono text-[9px] uppercase tracking-[0.1em] shrink-0",
                        "transition-colors duration-150 whitespace-nowrap",
                        isFixed
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                            : "border-border-light bg-surface-1 text-foreground/35 hover:border-border-medium",
                    ].join(" ")}
                    title={isFixed ? "Modo: monto fijo VES" : "Modo: porcentaje"}
                >
                    {isFixed ? "Bs fijo" : "% base"}
                </button>
                <Result value={computed} negative />
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// HORAS EXTRAS ROW EDITOR  (Art. 118 LOTTT)
// ─────────────────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<HorasExtrasTipo, string> = {
    diurna:   "Diurna +25%",
    nocturna: "Nocturna +45%",
    feriado:  "Feriado +100%",
};

const TIPO_CYCLE: HorasExtrasTipo[] = ["diurna", "nocturna", "feriado"];

const TIPO_CLS: Record<HorasExtrasTipo, string> = {
    diurna:   "border-primary-500/40 bg-primary-500/10 text-primary-500",
    nocturna: "border-amber-500/40 bg-amber-500/10 text-amber-500",
    feriado:  "border-red-500/40 bg-red-500/10 text-red-400",
};

export const HorasExtrasRowEditor = ({
    row, onChange, onRemove, canRemove, hourlyRate,
}: {
    row:        HorasExtrasRow;
    onChange:   (updated: HorasExtrasRow) => void;
    onRemove:   () => void;
    canRemove:  boolean;
    hourlyRate: number; // salarioVES / 30 / 8
}) => {
    const mult     = HORAS_EXTRAS_MULTIPLIER[row.tipo];
    const computed = (parseFloat(row.hours) || 0) * hourlyRate * mult;

    const cycleTipo = () => {
        const idx = TIPO_CYCLE.indexOf(row.tipo);
        onChange({ ...row, tipo: TIPO_CYCLE[(idx + 1) % TIPO_CYCLE.length] });
    };

    return (
        <div className="flex items-center gap-1.5">
            <button
                onClick={cycleTipo}
                className={["h-8 px-2 rounded-md border font-mono text-[9px] uppercase tracking-[0.1em] shrink-0 transition-colors duration-150 whitespace-nowrap", TIPO_CLS[row.tipo]].join(" ")}
                title="Click para cambiar tipo: diurna → nocturna → feriado"
            >
                {TIPO_LABELS[row.tipo]}
            </button>
            <input
                type="number"
                value={row.hours}
                onChange={(e) => onChange({ ...row, hours: e.target.value })}
                placeholder="0"
                className={numInputCls}
                min="0"
                step="0.5"
            />
            <span className="font-mono text-[9px] text-foreground/30 shrink-0">h</span>
            <RemoveButton onClick={onRemove} disabled={!canRemove} />
            <Result value={computed} />
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
        <div className="space-y-1.5">
            {/* Row 1: Concepto + remove */}
            <div className="flex items-center gap-1.5">
                <input
                    type="text"
                    value={row.label}
                    onChange={(e) => onChange({ ...row, label: e.target.value })}
                    placeholder="Concepto"
                    className={inputCls + " flex-1"}
                />
                <RemoveButton onClick={onRemove} disabled={!canRemove} />
            </div>
            {/* Row 2: Monto USD | → VES result */}
            <div className="flex items-center gap-1.5">
                <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-foreground/30 pointer-events-none">$</span>
                    <input
                        type="number"
                        value={row.amount}
                        onChange={(e) => onChange({ ...row, amount: e.target.value })}
                        placeholder="0.00"
                        className={numInputCls + " pl-5 w-24"}
                        step="5"
                    />
                </div>
                <Result value={computed} />
            </div>
        </div>
    );
};
