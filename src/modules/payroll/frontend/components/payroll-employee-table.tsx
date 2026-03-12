"use client";

// ============================================================================
// PAYROLL EMPLOYEE TABLE  v5
// ============================================================================

import React, { useMemo, useState, useCallback, useRef } from "react";
import { BaseTable }     from "@/src/shared/frontend/components/base-table";
import type { Column }   from "@/src/shared/frontend/components/base-table";
import { AuditContainer, AuditRow } from "@/src/shared/frontend/components/base-audit";
import {
    EarningRowEditor,
    DeductionRowEditor,
    BonusRowEditor,
    AddRowButton,
} from "./payroll-row-editors";
import type { EarningRow, DeductionRow, BonusRow } from "../types/payroll-types";
import { employeesToCsv, downloadCsv, parseCsv } from "../utils/employee-csv";
import { generatePayrollPdf, PdfEmployeeResult } from "../utils/payroll-pdf";
import { Employee } from "../hooks/use-employee";

// ============================================================================
// TYPES
// ============================================================================

interface EmployeeOverride {
    extraEarnings:   EarningRow[];
    extraDeductions: DeductionRow[];
    extraBonuses:    BonusRow[];
}

interface ComputedLine { label: string; formula: string; amount: number }

interface EmployeeResult extends Employee {
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
}

// ============================================================================
// ENGINE
// ============================================================================

function computeEmployee(
    emp:            Employee,
    earningRows:    EarningRow[],
    deductRows:     DeductionRow[],
    bonusRows:      BonusRow[],
    overrides:      EmployeeOverride,
    mondaysInMonth: number,
    bcvRate:        number,
): EmployeeResult {
    const daily      = emp.salarioMensual / 30;
    const weekly     = (emp.salarioMensual * 12) / 52;
    const weeklyBase = weekly * mondaysInMonth;

    const allEarnings   = [...earningRows, ...overrides.extraEarnings];
    const allDeductions = [...deductRows,  ...overrides.extraDeductions];
    const allBonuses    = [...bonusRows,   ...overrides.extraBonuses];

    const earningLines: ComputedLine[] = allEarnings.map((r) => {
        const qty    = parseFloat(r.quantity)   || 0;
        const mult   = parseFloat(r.multiplier) || 1;
        const amount = r.useDaily ? qty * daily * mult : qty;
        return {
            label:   r.label || "—",
            formula: r.useDaily ? `${qty}d x ${daily.toFixed(2)}${mult !== 1 ? ` x ${mult}` : ""}` : `${qty} VES`,
            amount,
        };
    });

    const bonusLines: ComputedLine[] = allBonuses.map((r) => {
        const usd = parseFloat(r.amount) || 0;
        return { label: r.label || "—", formula: `${usd}$ x ${bcvRate}`, amount: usd * bcvRate };
    });

    const deductionLines: ComputedLine[] = allDeductions.map((r) => {
        const base = r.base === "weekly" ? weeklyBase : emp.salarioMensual;
        const rate = parseFloat(r.rate) || 0;
        return {
            label:   r.label || "—",
            formula: r.base === "weekly" ? `${weekly.toFixed(2)} x ${mondaysInMonth}L x ${rate}%` : `${emp.salarioMensual} x ${rate}%`,
            amount: base * (rate / 100),
        };
    });

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
            overrides.extraEarnings.length   > 0 ||
            overrides.extraDeductions.length > 0 ||
            overrides.extraBonuses.length    > 0,
    };
}

// ============================================================================
// HELPERS
// ============================================================================

let _seq = 0;
const uid = (p: string) => `${p}_${++_seq}_${Date.now()}`;
const EMPTY_OVERRIDE = (): EmployeeOverride => ({ extraEarnings: [], extraDeductions: [], extraBonuses: [] });
const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const inputCls = (error?: boolean, ok?: boolean) => [
    "h-8 px-2 rounded-lg border bg-surface-1 outline-none",
    "font-mono text-[12px] tabular-nums text-foreground",
    "focus:ring-2 focus:ring-primary-500/10 transition-colors duration-150 disabled:opacity-50",
    error  ? "border-error/60 focus:border-error"
    : ok   ? "border-success/60 focus:border-success"
           : "border-border-light focus:border-primary-400 hover:border-border-medium",
].join(" ");

const toolbarBtnBase = [
    "h-8 px-3 rounded-lg flex items-center gap-1.5 border border-border-light bg-surface-1",
    "hover:border-border-medium hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed",
    "font-mono text-[10px] uppercase tracking-[0.18em] text-foreground transition-colors duration-150",
].join(" ");

const STATUS_CLS: Record<Employee["estado"], string> = {
    activo:   "bg-success/10 text-success border-success/20",
    inactivo: "bg-error/10 text-error border-error/20",
    vacacion: "bg-warning/10 text-warning border-warning/20",
};

const StatusBadge = ({ estado }: { estado: Employee["estado"] }) => (
    <span className={["inline-flex px-2 py-0.5 rounded-md border font-mono text-[9px] uppercase tracking-[0.16em]", STATUS_CLS[estado]].join(" ")}>
        {estado}
    </span>
);

const ExpandBtn = ({ open, onClick }: { open: boolean; onClick: () => void }) => (
    <button onClick={onClick}
        style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        className={["w-6 h-6 flex items-center justify-center rounded-md border", open ? "border-primary-400 bg-primary-50 text-primary-500" : "border-border-light text-neutral-400 hover:border-border-medium"].join(" ")}
    >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4l3 3 3-3" />
        </svg>
    </button>
);

const OverrideBadge = () => (
    <span className="inline-flex px-1.5 py-0.5 rounded border border-primary-400/30 bg-primary-50 font-mono text-[8px] uppercase tracking-widest text-primary-500">+extras</span>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-400 mb-2 mt-4">{children}</p>
);

const TablePlaceholder = ({ loading, error }: { loading: boolean; error: string | null }) => (
    <div className="flex items-center justify-center h-32 border border-border-light rounded-xl">
        {loading ? (
            <div className="flex items-center gap-2 text-neutral-400">
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
                    <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span className="font-mono text-[11px] uppercase tracking-widest">Cargando empleados...</span>
            </div>
        ) : error ? (
            <span className="font-mono text-[11px] text-error">{error}</span>
        ) : (
            <span className="font-mono text-[11px] text-neutral-300 uppercase tracking-widest">Sin empleados. Importa un CSV para comenzar.</span>
        )}
    </div>
);

const Spinner = () => (
    <svg className="animate-spin text-neutral-400" width="13" height="13" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

const CheckIcon = () => (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success">
        <path d="M2 6l3 3 5-5" />
    </svg>
);

// ============================================================================
// BATCH SALARY PANEL
// ============================================================================

interface BatchSalaryPanelProps {
    employees: Employee[];
    onSave:    (updated: Omit<Employee, "id" | "companyId">[]) => Promise<string | null>;
}

const BatchSalaryPanel = ({ employees, onSave }: BatchSalaryPanelProps) => {
    const active = employees.filter((e) => e.estado === "activo");

    const [mode,      setMode]      = useState<"percent" | "fixed">("percent");
    const [value,     setValue]     = useState("");
    const [direction, setDirection] = useState<"increase" | "decrease">("increase");
    const [selected,  setSelected]  = useState<Set<string>>(new Set(active.map((e) => e.cedula)));
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState<string | null>(null);
    const [ok,        setOk]        = useState(false);

    const allSelected  = selected.size === active.length && active.length > 0;
    const noneSelected = selected.size === 0;

    const toggleAll = () => setSelected(allSelected ? new Set() : new Set(active.map((e) => e.cedula)));
    const toggleEmp = (cedula: string) => setSelected((prev) => {
        const next = new Set(prev);
        next.has(cedula) ? next.delete(cedula) : next.add(cedula);
        return next;
    });

    const preview = useMemo(() => {
        const num = parseFloat(value);
        if (isNaN(num) || num <= 0) return null;
        return active
            .filter((e) => selected.has(e.cedula))
            .map((e) => {
                let next = mode === "fixed"
                    ? num
                    : direction === "increase"
                        ? e.salarioMensual * (1 + num / 100)
                        : e.salarioMensual * (1 - num / 100);
                return { emp: e, next: Math.max(0, parseFloat(next.toFixed(2))) };
            });
    }, [active, selected, mode, direction, value]);

    const handleApply = async () => {
        if (!preview || preview.length === 0) return;
        setLoading(true); setError(null); setOk(false);
        const err = await onSave(preview.map(({ emp, next }) => ({
            cedula: emp.cedula, nombre: emp.nombre, cargo: emp.cargo,
            salarioMensual: next, estado: emp.estado,
        })));
        setLoading(false);
        if (err) { setError(err); } else { setOk(true); setValue(""); setTimeout(() => setOk(false), 2500); }
    };

    const modeBtn = (label: string, active2: boolean, onClick: () => void) => (
        <button onClick={onClick} className={[
            "h-7 px-3 rounded-md font-mono text-[9px] uppercase tracking-[0.15em] border transition-colors duration-150",
            active2 ? "border-primary-400 bg-primary-50 text-primary-600" : "border-border-light bg-surface-1 text-neutral-500 hover:border-border-medium",
        ].join(" ")}>{label}</button>
    );

    const totalBefore = preview?.reduce((s, p) => s + p.emp.salarioMensual, 0) ?? 0;
    const totalAfter  = preview?.reduce((s, p) => s + p.next, 0) ?? 0;

    return (
        <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-light bg-surface-2">
                <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-400">Nomina / Herramientas</p>
                    <h3 className="font-mono text-[13px] font-bold uppercase tracking-tighter text-foreground">Ajuste de Salarios por Lote</h3>
                </div>
                <span className="font-mono text-[9px] text-neutral-400 uppercase tracking-widest">{selected.size} de {active.length} seleccionados</span>
            </div>

            <div className="p-4 space-y-4">
                {/* Controls row */}
                <div className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1.5">
                        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-400">Tipo de ajuste</span>
                        <div className="flex gap-1.5">
                            {modeBtn("% Porcentaje", mode === "percent", () => setMode("percent"))}
                            {modeBtn("$ Monto fijo", mode === "fixed",   () => setMode("fixed"))}
                        </div>
                    </div>

                    {mode === "percent" && (
                        <div className="flex flex-col gap-1.5">
                            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-400">Direccion</span>
                            <div className="flex gap-1.5">
                                {modeBtn("+ Aumento",   direction === "increase", () => setDirection("increase"))}
                                {modeBtn("- Reduccion", direction === "decrease", () => setDirection("decrease"))}
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-400">
                            {mode === "percent" ? "Porcentaje (%)" : "Nuevo salario (USD)"}
                        </span>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-neutral-400">{mode === "percent" ? "%" : "$"}</span>
                            <input
                                type="number" min="0" step={mode === "percent" ? "0.1" : "0.01"}
                                value={value} onChange={(e) => { setValue(e.target.value); setError(null); setOk(false); }}
                                onKeyDown={(e) => e.key === "Enter" && handleApply()}
                                placeholder={mode === "percent" ? "ej: 10" : "ej: 150.00"}
                                className={inputCls(!!error, ok) + " w-32"}
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleApply}
                        disabled={loading || noneSelected || !preview || preview.length === 0}
                        className="h-8 px-4 rounded-lg flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] bg-primary-500 text-white border border-primary-600 hover:bg-primary-600 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {loading ? <Spinner /> : ok ? <CheckIcon /> : null}
                        {ok ? "Guardado" : "Aplicar"}
                    </button>

                    {error && <p className="font-mono text-[9px] text-error self-end pb-1">{error}</p>}
                </div>

                {/* Employee list with preview */}
                <div className="rounded-lg border border-border-light overflow-hidden">
                    {/* List header */}
                    <div className="flex items-center gap-3 px-3 py-2 bg-surface-2 border-b border-border-light">
                        <input type="checkbox" checked={allSelected}
                            ref={(el) => { if (el) el.indeterminate = !allSelected && !noneSelected; }}
                            onChange={toggleAll} className="accent-primary-500 w-3.5 h-3.5" />
                        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-400">Empleado</span>
                        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-400 ml-auto">Actual</span>
                        {preview && preview.length > 0 && (
                            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary-500 w-28 text-right">Nuevo</span>
                        )}
                    </div>

                    {active.map((emp, i) => {
                        const isSelected = selected.has(emp.cedula);
                        const previewRow = preview?.find((p) => p.emp.cedula === emp.cedula);
                        const changed    = previewRow && previewRow.next !== emp.salarioMensual;

                        return (
                            <div key={emp.cedula} onClick={() => toggleEmp(emp.cedula)}
                                className={[
                                    "flex items-center gap-3 px-3 py-2 cursor-pointer border-b border-border-light last:border-0",
                                    "hover:bg-primary-50/40 transition-colors duration-100",
                                    i % 2 === 0 ? "bg-white" : "bg-surface-2/40",
                                    !isSelected && "opacity-50",
                                ].join(" ")}
                            >
                                <input type="checkbox" checked={isSelected}
                                    onChange={() => toggleEmp(emp.cedula)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="accent-primary-500 w-3.5 h-3.5 shrink-0" />
                                <div className="flex flex-col min-w-0">
                                    <span className="font-mono text-[11px] font-medium text-foreground truncate">{emp.nombre}</span>
                                    <span className="font-mono text-[9px] text-neutral-400 uppercase tracking-widest">{emp.cedula}</span>
                                </div>
                                <span className="font-mono text-[11px] tabular-nums text-neutral-500 ml-auto shrink-0">${fmt(emp.salarioMensual)}</span>
                                {preview && preview.length > 0 && (
                                    <span className={["font-mono text-[11px] tabular-nums w-28 text-right shrink-0", isSelected && changed ? "text-primary-600 font-bold" : "text-neutral-300"].join(" ")}>
                                        {isSelected && previewRow ? `$${fmt(previewRow.next)}` : "—"}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Summary bar */}
                {preview && preview.length > 0 && (
                    <div className="flex items-center gap-4 px-4 py-2.5 rounded-lg bg-primary-50 border border-primary-200/60">
                        <span className="font-mono text-[9px] uppercase tracking-widest text-primary-500">{preview.length} empleado{preview.length !== 1 ? "s" : ""}</span>
                        <div className="flex items-center gap-2 ml-auto font-mono text-[10px] text-primary-600">
                            <span>Total antes: <strong>${fmt(totalBefore)}</strong></span>
                            <span className="text-primary-400">→</span>
                            <span>Total despues: <strong className="text-primary-700">${fmt(totalAfter)}</strong></span>
                            {mode === "percent" && (
                                <span className={["ml-2 px-2 py-0.5 rounded-md font-bold text-[9px]", direction === "increase" ? "bg-success/10 text-success" : "bg-error/10 text-error"].join(" ")}>
                                    {direction === "increase" ? "+" : "-"}{value}%
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ============================================================================
// EXPANDED PANEL
// ============================================================================

interface ExpandedPanelProps {
    result:         EmployeeResult;
    override:       EmployeeOverride;
    mondaysInMonth: number;
    bcvRate:        number;
    onChange:       (updated: EmployeeOverride) => void;
    onSalarySave:   (emp: Employee, newSalary: number) => Promise<string | null>;
}

const ExpandedPanel = ({ result, override, mondaysInMonth, bcvRate, onChange, onSalarySave }: ExpandedPanelProps) => {
    const [salaryInput,   setSalaryInput]   = useState(result.salarioMensual.toString());
    const [salaryLoading, setSalaryLoading] = useState(false);
    const [salaryError,   setSalaryError]   = useState<string | null>(null);
    const [salaryOk,      setSalaryOk]      = useState(false);

    const handleSalarySave = async () => {
        const val = parseFloat(salaryInput);
        if (isNaN(val) || val <= 0) { setSalaryError("Salario invalido"); return; }
        if (val === result.salarioMensual) return;
        setSalaryLoading(true); setSalaryError(null); setSalaryOk(false);
        const err = await onSalarySave(result, val);
        setSalaryLoading(false);
        if (err) { setSalaryError(err); } else { setSalaryOk(true); setTimeout(() => setSalaryOk(false), 2000); }
    };

    const liveSalary    = parseFloat(salaryInput) || result.salarioMensual;
    const empDailyRate  = liveSalary / 30;
    const empWeeklyRate = (liveSalary * 12) / 52;
    const empWeeklyBase = empWeeklyRate * mondaysInMonth;

    const addXE    = () => onChange({ ...override, extraEarnings:   [...override.extraEarnings,   { id: uid("xe"), label: "", quantity: "0", multiplier: "1.0", useDaily: true }] });
    const updateXE = (id: string, u: EarningRow)   => onChange({ ...override, extraEarnings:   override.extraEarnings.map((r)   => r.id === id ? u : r) });
    const removeXE = (id: string)                   => onChange({ ...override, extraEarnings:   override.extraEarnings.filter((r)   => r.id !== id) });

    const addXB    = () => onChange({ ...override, extraBonuses:    [...override.extraBonuses,    { id: uid("xb"), label: "", amount: "0.00" }] });
    const updateXB = (id: string, u: BonusRow)     => onChange({ ...override, extraBonuses:    override.extraBonuses.map((r)    => r.id === id ? u : r) });
    const removeXB = (id: string)                  => onChange({ ...override, extraBonuses:    override.extraBonuses.filter((r)    => r.id !== id) });

    const addXD    = () => onChange({ ...override, extraDeductions: [...override.extraDeductions, { id: uid("xd"), label: "", rate: "0", base: "monthly" as const }] });
    const updateXD = (id: string, u: DeductionRow) => onChange({ ...override, extraDeductions: override.extraDeductions.map((r) => r.id === id ? u : r) });
    const removeXD = (id: string)                  => onChange({ ...override, extraDeductions: override.extraDeductions.filter((r) => r.id !== id) });

    const firstName = result.nombre.split(" ")[0];

    return (
        <div className="bg-surface-2 border-t border-border-light px-6 py-5">
            {/* Salary editor */}
            <div className="flex items-end gap-4 mb-5 pb-5 border-b border-border-light">
                <div className="flex flex-col gap-1">
                    <label className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-400">Salario Mensual (USD)</label>
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-neutral-400">$</span>
                        <input
                            type="number" min="0" step="0.01" value={salaryInput} disabled={salaryLoading}
                            onChange={(e) => { setSalaryInput(e.target.value); setSalaryError(null); setSalaryOk(false); }}
                            onKeyDown={(e) => e.key === "Enter" && handleSalarySave()}
                            onBlur={handleSalarySave}
                            className={inputCls(!!salaryError, salaryOk) + " w-32"}
                        />
                        {salaryLoading && <Spinner />}
                        {salaryOk      && <CheckIcon />}
                    </div>
                    {salaryError && <p className="font-mono text-[9px] text-error mt-0.5">{salaryError}</p>}
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-400">Diario</span>
                    <span className="font-mono text-[11px] text-neutral-500 tabular-nums">${empDailyRate.toFixed(4)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-400">Semanal base</span>
                    <span className="font-mono text-[11px] text-neutral-500 tabular-nums">${empWeeklyRate.toFixed(4)}</span>
                </div>
                <p className="font-mono text-[9px] text-neutral-300 italic ml-auto self-end">Enter o clic fuera para guardar</p>
            </div>

            {/* Audit columns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <AuditContainer title="Asignaciones" total={result.totalEarnings} type="income">
                    {result.earningLines.map((l, i) => <AuditRow key={i} label={l.label} formula={l.formula} value={l.amount} />)}
                </AuditContainer>
                <AuditContainer title="Bonificaciones" total={result.totalBonuses} type="income">
                    {result.bonusLines.map((l, i) => <AuditRow key={i} label={l.label} formula={l.formula} value={l.amount} />)}
                </AuditContainer>
                <AuditContainer title="Deducciones" total={result.totalDeductions} type="deduction">
                    {result.deductionLines.map((l, i) => <AuditRow key={i} label={l.label} formula={l.formula} value={l.amount} isNegative />)}
                </AuditContainer>
            </div>

            <div className="flex items-center gap-3 mt-6 mb-1">
                <div className="flex-1 border-t border-dashed border-border-light" />
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-300">Extras exclusivos — {firstName}</span>
                <div className="flex-1 border-t border-dashed border-border-light" />
            </div>

            <SectionLabel>Asignaciones adicionales</SectionLabel>
            {override.extraEarnings.length === 0 && <p className="font-mono text-[10px] text-neutral-300 italic mb-1">Sin asignaciones extra.</p>}
            <div className="space-y-2">
                {override.extraEarnings.map((row) => (
                    <EarningRowEditor key={row.id} row={row} dailyRate={empDailyRate} canRemove onChange={(u) => updateXE(row.id, u)} onRemove={() => removeXE(row.id)} />
                ))}
            </div>
            <AddRowButton onClick={addXE} />

            <SectionLabel>Bonos adicionales</SectionLabel>
            {override.extraBonuses.length === 0 && <p className="font-mono text-[10px] text-neutral-300 italic mb-1">Sin bonos extra.</p>}
            <div className="space-y-2">
                {override.extraBonuses.map((row) => (
                    <BonusRowEditor key={row.id} row={row} bcvRate={bcvRate} canRemove onChange={(u) => updateXB(row.id, u)} onRemove={() => removeXB(row.id)} />
                ))}
            </div>
            <AddRowButton onClick={addXB} />

            <SectionLabel>Deducciones adicionales</SectionLabel>
            {override.extraDeductions.length === 0 && <p className="font-mono text-[10px] text-neutral-300 italic mb-1">Sin deducciones extra.</p>}
            <div className="space-y-2">
                {override.extraDeductions.map((row) => (
                    <DeductionRowEditor key={row.id} row={row} weeklyBase={empWeeklyBase} monthlyBase={liveSalary} canRemove onChange={(u) => updateXD(row.id, u)} onRemove={() => removeXD(row.id)} />
                ))}
            </div>
            <AddRowButton onClick={addXD} />
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
        <div className="flex items-center justify-between px-5 py-3 bg-foreground text-background rounded-xl border border-white/10">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-40">{active.length} empleados activos</span>
            <div className="flex gap-8 tabular-nums items-center">
                <div className="flex flex-col items-end">
                    <span className="font-mono text-[9px] uppercase opacity-40 tracking-widest">Bruto</span>
                    <span className="font-mono text-[12px]">{fmt(T.gross)}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="font-mono text-[9px] uppercase opacity-40 tracking-widest">Deducciones</span>
                    <span className="font-mono text-[12px] text-red-400/80">-{fmt(T.ded)}</span>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="flex flex-col items-end">
                    <span className="font-mono text-[9px] uppercase text-primary-400/70 tracking-widest font-bold">Neto VES</span>
                    <span className="font-mono text-[18px] font-black text-primary-400">{fmt(T.net)}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="font-mono text-[9px] uppercase opacity-40 tracking-widest">Neto USD</span>
                    <span className="font-mono text-[12px] opacity-60">{fmt(T.usd)}</span>
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

export interface PayrollEmployeeTableProps {
    employees:      Employee[];
    empLoading:     boolean;
    empError:       string | null;
    onUpsert:       (employees: Omit<Employee, "id" | "companyId">[]) => Promise<string | null>;
    earningRows:    EarningRow[];
    deductionRows:  DeductionRow[];
    bonusRows:      BonusRow[];
    mondaysInMonth: number;
    bcvRate:        number;
    companyName:    string;
    companyId?:     string;
    payrollDate:    string;
}

export const PayrollEmployeeTable = ({
    employees, empLoading, empError, onUpsert,
    earningRows, deductionRows, bonusRows, mondaysInMonth, bcvRate,
    companyName, companyId, payrollDate,
}: PayrollEmployeeTableProps) => {

    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showBatch,  setShowBatch]  = useState(false);
    const [csvLoading, setCsvLoading] = useState(false);
    const [csvError,   setCsvError]   = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSalarySave = useCallback(async (emp: Employee, newSalary: number): Promise<string | null> => {
        return await onUpsert([{ cedula: emp.cedula, nombre: emp.nombre, cargo: emp.cargo, salarioMensual: newSalary, estado: emp.estado }]);
    }, [onUpsert]);

    const handleExport = useCallback(() => {
        if (!employees.length) return;
        downloadCsv(employeesToCsv(employees), `empleados_${new Date().toISOString().split("T")[0]}.csv`);
    }, [employees]);

    const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCsvError(null); setCsvLoading(true);
        const { employees: parsed, errors } = parseCsv(await file.text());
        if (errors.length > 0) { setCsvError(errors[0]); setCsvLoading(false); if (fileInputRef.current) fileInputRef.current.value = ""; return; }
        const err = await onUpsert(parsed);
        if (err) setCsvError(err);
        setCsvLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, [onUpsert]);

    const [overrides, setOverrides] = useState<Map<string, EmployeeOverride>>(new Map());
    const getOverride = useCallback((id: string) => overrides.get(id) ?? EMPTY_OVERRIDE(), [overrides]);
    const setOverride = useCallback((id: string, updated: EmployeeOverride) => {
        setOverrides((prev) => { const next = new Map(prev); next.set(id, updated); return next; });
    }, []);

    const getKey = (emp: Employee) => emp.cedula;

    const results = useMemo<EmployeeResult[]>(() =>
        employees.map((emp) => computeEmployee(emp, earningRows, deductionRows, bonusRows, getOverride(getKey(emp)), mondaysInMonth, bcvRate)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [employees, earningRows, deductionRows, bonusRows, mondaysInMonth, bcvRate, overrides]
    );

    const handleExportPdf = useCallback(() => {
        if (!results.length) return;
        generatePayrollPdf(
            results.map((r) => ({
                cedula: r.cedula, nombre: r.nombre, cargo: r.cargo, salarioMensual: r.salarioMensual, estado: r.estado,
                earningLines: r.earningLines, bonusLines: r.bonusLines, deductionLines: r.deductionLines,
                totalEarnings: r.totalEarnings, totalBonuses: r.totalBonuses, totalDeductions: r.totalDeductions,
                gross: r.gross, net: r.net, netUSD: r.netUSD,
            })),
            { companyName, companyId, payrollDate, bcvRate, mondaysInMonth }
        );
    }, [results, companyName, companyId, payrollDate, bcvRate, mondaysInMonth]);

    const columns: Column<EmployeeResult>[] = [
        {
            key: "nombre", label: "Empleado", sortable: true, searchable: true,
            render: (_, r) => (
                <div className="flex flex-col gap-0.5 py-0.5">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] font-medium leading-tight">{r.nombre}</span>
                        {r.hasOverrides && <OverrideBadge />}
                    </div>
                    <span className="font-mono text-[10px] text-neutral-400 uppercase tracking-widest">{r.cedula}</span>
                </div>
            ),
        },
        { key: "cargo", label: "Cargo", sortable: true, searchable: true, render: (v) => <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-neutral-500">{v}</span> },
        { key: "salarioMensual", label: "Salario $", sortable: true, align: "end", render: (v) => <span className="font-mono text-[12px] tabular-nums">${fmt(v)}</span> },
        { key: "estado", label: "Estado", align: "center", render: (v) => <StatusBadge estado={v} /> },
        { key: "gross", label: "Bruto VES", sortable: true, align: "end", render: (_, r) => <span className="font-mono text-[12px] tabular-nums">{fmt(r.gross)}</span> },
        { key: "totalDeductions", label: "Deducciones", sortable: true, align: "end", render: (_, r) => <span className="font-mono text-[12px] tabular-nums text-error/70">-{fmt(r.totalDeductions)}</span> },
        { key: "net", label: "Neto VES", sortable: true, align: "end", render: (_, r) => <span className="font-mono text-[13px] font-semibold tabular-nums text-primary-500">{fmt(r.net)}</span> },
        { key: "netUSD", label: "Neto $", sortable: true, align: "end", render: (_, r) => <span className="font-mono text-[11px] tabular-nums text-neutral-400">{fmt(r.netUSD)}</span> },
        {
            key: "_expand" as any, label: "", align: "center", width: 48,
            render: (_, r) => <ExpandBtn open={expandedId === r.cedula} onClick={() => setExpandedId((prev) => prev === r.cedula ? null : r.cedula)} />,
        },
    ];

    const showTable = !empLoading && !empError && employees.length > 0;

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-end justify-between gap-4">
                <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400">Nomina / Empleados</p>
                    <h2 className="font-mono text-[15px] font-bold uppercase tracking-tighter text-foreground">Resumen por Empleado</h2>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowBatch((v) => !v)}
                        disabled={employees.filter(e => e.estado === "activo").length === 0}
                        className={[toolbarBtnBase, showBatch ? "border-primary-400 bg-primary-50 text-primary-600" : ""].join(" ")}
                    >
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 6h10M1 3h10M1 9h6" />
                        </svg>
                        Ajuste por lote
                    </button>
                    <button onClick={handleExportPdf} disabled={employees.length === 0} className={toolbarBtnBase}>
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 2h5l3 3v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M7 2v3h3M4 7h4M4 9h2" />
                        </svg>
                        Exportar PDF
                    </button>
                    <button onClick={handleExport} disabled={csvLoading || employees.length === 0} className={toolbarBtnBase}>
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 1v7M3 6l3 3 3-3M2 10h8" />
                        </svg>
                        Exportar CSV
                    </button>
                    <label className={[toolbarBtnBase, "cursor-pointer", csvLoading ? "opacity-40 pointer-events-none" : ""].join(" ")}>
                        {csvLoading ? <Spinner /> : (
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 8V1M3 4l3-3 3 3M2 10h8" />
                            </svg>
                        )}
                        Importar CSV
                        <input ref={fileInputRef} type="file" accept=".csv" className="sr-only" onChange={handleImport} disabled={csvLoading} />
                    </label>
                </div>
            </div>

            {/* Batch panel */}
            {showBatch && <BatchSalaryPanel employees={employees} onSave={onUpsert} />}

            {/* CSV error */}
            {csvError && (
                <div className="px-3 py-2 border border-red-500/20 rounded-lg bg-red-500/[0.04]">
                    <p className="font-mono text-[10px] text-red-500">{csvError}</p>
                </div>
            )}

            {/* Table */}
            {showTable ? (
                <>
                    <BaseTable.Render
                        columns={columns} data={results} keyExtractor={(r) => r.cedula}
                        enableSearch pagination
                        classNames={{ wrapper: "border border-border-light rounded-xl shadow-none" }}
                        renderExpandedRow={(result) => {
                            if (expandedId !== result.cedula) return null;
                            return (
                                <ExpandedPanel
                                    result={result} override={getOverride(getKey(result))}
                                    mondaysInMonth={mondaysInMonth} bcvRate={bcvRate}
                                    onChange={(updated) => setOverride(getKey(result), updated)}
                                    onSalarySave={handleSalarySave}
                                />
                            );
                        }}
                    />
                    <TotalsBar results={results} />
                </>
            ) : (
                <TablePlaceholder loading={empLoading} error={empError} />
            )}
        </div>
    );
};