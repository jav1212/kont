"use client";

// ============================================================================
// PAYROLL EMPLOYEE TABLE  v5
// ============================================================================

import React, { useMemo, useState, useCallback } from "react";
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
        className={["w-6 h-6 flex items-center justify-center rounded-md border", open ? "border-primary-500/40 bg-primary-500/[0.08] text-primary-500" : "border-border-light text-foreground/30 hover:border-border-medium"].join(" ")}
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
            <span className="font-mono text-[11px] text-neutral-300 uppercase tracking-widest">Sin empleados. Agrega empleados en la sección de Empleados.</span>
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
// EXPANDED PANEL
// ============================================================================

interface ExpandedPanelProps {
    result:         EmployeeResult;
    override:       EmployeeOverride;
    mondaysInMonth: number;
    bcvRate:        number;
    onChange:       (updated: EmployeeOverride) => void;
}

const ExpandedPanel = ({ result, override, mondaysInMonth, bcvRate, onChange }: ExpandedPanelProps) => {
    const empDailyRate  = result.salarioMensual / 30;
    const empWeeklyRate = (result.salarioMensual * 12) / 52;
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
                    <DeductionRowEditor key={row.id} row={row} weeklyBase={empWeeklyBase} monthlyBase={result.salarioMensual} canRemove onChange={(u) => updateXD(row.id, u)} onRemove={() => removeXD(row.id)} />
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
        <div className="flex items-center justify-between px-5 py-3 bg-surface-1 rounded-xl border border-border-light">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/30">{active.length} empleados activos</span>
            <div className="flex gap-8 tabular-nums items-center">
                <div className="flex flex-col items-end">
                    <span className="font-mono text-[9px] uppercase text-foreground/30 tracking-widest">Bruto</span>
                    <span className="font-mono text-[12px] text-foreground/50">{fmt(T.gross)}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="font-mono text-[9px] uppercase text-foreground/30 tracking-widest">Deducciones</span>
                    <span className="font-mono text-[12px] text-red-500 dark:text-red-400">-{fmt(T.ded)}</span>
                </div>
                <div className="w-px h-8 bg-border-light" />
                <div className="flex flex-col items-end">
                    <span className="font-mono text-[9px] uppercase text-foreground/30 tracking-widest">Neto VES</span>
                    <span className="font-mono text-[18px] font-black text-primary-500">{fmt(T.net)}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="font-mono text-[9px] uppercase text-foreground/30 tracking-widest">Neto USD</span>
                    <span className="font-mono text-[12px] text-foreground/50">${fmt(T.usd)}</span>
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
    onConfirm?:     (results: EmployeeResult[]) => Promise<string | null>;
    earningRows:    EarningRow[];
    deductionRows:  DeductionRow[];
    bonusRows:      BonusRow[];
    mondaysInMonth: number;
    bcvRate:        number;
    companyName:    string;
    companyId?:     string;
    payrollDate:    string;
    periodStart?:   string;
    periodLabel?:   string;
}

export const PayrollEmployeeTable = ({
    employees, empLoading, empError, onConfirm,
    earningRows, deductionRows, bonusRows, mondaysInMonth, bcvRate,
    companyName, companyId, payrollDate, periodStart, periodLabel,
}: PayrollEmployeeTableProps) => {

    const [expandedId,     setExpandedId]     = useState<string | null>(null);
    const [search,         setSearch]         = useState("");
    const [confirmLoading, setConfirmLoading] = useState(false);
    const [confirmError,   setConfirmError]   = useState<string | null>(null);
    const [confirmOk,      setConfirmOk]      = useState(false);
    const [showModal,      setShowModal]      = useState(false);

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
            { companyName, companyId, payrollDate, periodStart, periodLabel, bcvRate, mondaysInMonth }
        );
    }, [results, companyName, companyId, payrollDate, periodStart, periodLabel, bcvRate, mondaysInMonth]);

    const handleConfirmExecute = useCallback(async () => {
        if (!onConfirm || !results.length) return;
        setConfirmLoading(true);
        setConfirmError(null);
        setConfirmOk(false);
        const err = await onConfirm(results);
        setConfirmLoading(false);
        if (err) {
            setConfirmError(err);
        } else {
            setShowModal(false);
            setConfirmOk(true);
        }
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
                    <span className="font-mono text-[10px] text-neutral-400 uppercase tracking-widest">{r.cedula}</span>
                </div>
            ),
        },
        { key: "cargo", label: "Cargo", sortable: true, searchable: true, render: (v) => <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-neutral-500">{v}</span> },
        { key: "salarioMensual", label: "Salario Bs.", sortable: true, align: "end", render: (v) => <span className="font-mono text-[12px] tabular-nums">Bs. {fmt(v)}</span> },
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

    const filteredResults = useMemo(() => {
        if (!search) return results;
        const q = search.toLowerCase();
        return results.filter((r) =>
            r.nombre.toLowerCase().includes(q) ||
            r.cedula.toLowerCase().includes(q) ||
            r.cargo.toLowerCase().includes(q)
        );
    }, [results, search]);

    const showTable = !empLoading && !empError && employees.length > 0;

    // ── Confirm modal totals ───────────────────────────────────────────────
    const activeResults = results.filter((r) => r.estado === "activo");
    const modalTotals   = activeResults.reduce(
        (s, r) => ({ gross: s.gross + r.gross, ded: s.ded + r.totalDeductions, net: s.net + r.net, usd: s.usd + r.netUSD }),
        { gross: 0, ded: 0, net: 0, usd: 0 }
    );

    return (
        <div className="space-y-4">

        {/* ── Confirmation Modal ─────────────────────────────────────────── */}
        {showModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                    onClick={() => { if (!confirmLoading) setShowModal(false); }}
                />
                {/* Panel */}
                <div className="relative z-10 w-full max-w-md bg-surface-1 border border-border-default rounded-2xl shadow-lg overflow-hidden">
                    {/* Header */}
                    <div className="px-6 py-5 border-b border-border-light">
                        <div className="flex items-center gap-3 mb-1">
                            <div className="h-px w-5 bg-primary-500/60" />
                            <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-primary-400/70">
                                Confirmar nómina
                            </span>
                        </div>
                        <h2 className="font-mono text-[20px] font-black uppercase tracking-tighter text-foreground leading-none">
                            {periodLabel ?? "Período seleccionado"}
                        </h2>
                    </div>

                    {/* Summary */}
                    <div className="px-6 py-5 space-y-3">
                        {/* Meta row */}
                        <div className="flex items-center justify-between py-2 border-b border-border-light">
                            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                                Empleados activos
                            </span>
                            <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
                                {activeResults.length}
                            </span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-border-light">
                            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                                Tasa BCV
                            </span>
                            <span className="font-mono text-[13px] tabular-nums text-foreground">
                                Bs. {fmt(bcvRate)} / USD
                            </span>
                        </div>
                        {/* Totals */}
                        <div className="flex items-center justify-between py-2 border-b border-border-light">
                            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                                Total bruto
                            </span>
                            <span className="font-mono text-[13px] tabular-nums text-foreground/70">
                                Bs. {fmt(modalTotals.gross)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-border-light">
                            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                                Total deducciones
                            </span>
                            <span className="font-mono text-[13px] tabular-nums text-error/80">
                                -Bs. {fmt(modalTotals.ded)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between py-3 rounded-xl bg-primary-500/[0.06] border border-primary-500/20 px-4">
                            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary-400/80">
                                Neto a pagar VES
                            </span>
                            <span className="font-mono text-[18px] font-black tabular-nums text-primary-500">
                                Bs. {fmt(modalTotals.net)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between py-2">
                            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/30">
                                Equivalente USD
                            </span>
                            <span className="font-mono text-[12px] tabular-nums text-foreground/50">
                                ${fmt(modalTotals.usd)}
                            </span>
                        </div>

                        {confirmError && (
                            <div className="px-3 py-2 border border-red-500/20 rounded-lg bg-red-500/[0.06]">
                                <p className="font-mono text-[10px] text-red-400">{confirmError}</p>
                            </div>
                        )}

                        <p className="font-mono text-[9px] text-foreground/25 leading-relaxed">
                            Esta acción guarda la nómina permanentemente. No se puede deshacer desde la aplicación.
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="px-6 py-4 border-t border-border-light flex items-center gap-3">
                        <button
                            onClick={handleConfirmExecute}
                            disabled={confirmLoading}
                            className={[
                                "flex-1 h-10 rounded-lg flex items-center justify-center gap-2",
                                "bg-primary-500 hover:bg-primary-400 disabled:opacity-50 disabled:cursor-not-allowed",
                                "font-mono text-[11px] uppercase tracking-[0.18em] text-white",
                                "transition-colors duration-150",
                            ].join(" ")}
                        >
                            {confirmLoading ? (
                                <><Spinner /> Guardando…</>
                            ) : (
                                <>
                                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M2 6l3 3 5-5" />
                                    </svg>
                                    Confirmar y guardar
                                </>
                            )}
                        </button>
                        <button
                            onClick={() => setShowModal(false)}
                            disabled={confirmLoading}
                            className={[
                                "h-10 px-4 rounded-lg border border-border-light",
                                "font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/50",
                                "hover:border-border-medium hover:text-foreground/70",
                                "disabled:opacity-40 disabled:cursor-not-allowed",
                                "transition-colors duration-150",
                            ].join(" ")}
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        )}
            {/* Toolbar */}
            <div className="flex items-end justify-between gap-4">
                <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400">Nomina / Empleados</p>
                    <h2 className="font-mono text-[15px] font-bold uppercase tracking-tighter text-foreground">Resumen por Empleado</h2>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleExportPdf} disabled={employees.length === 0} className={toolbarBtnBase}>
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 2h5l3 3v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M7 2v3h3M4 7h4M4 9h2" />
                        </svg>
                        Exportar PDF
                    </button>
                    {onConfirm && (
                        <button
                            onClick={() => { setConfirmError(null); setShowModal(true); }}
                            disabled={employees.length === 0 || confirmOk}
                            className={[
                                "h-8 px-3 rounded-lg flex items-center gap-1.5 border",
                                "font-mono text-[10px] uppercase tracking-[0.18em] transition-colors duration-150",
                                "disabled:opacity-40 disabled:cursor-not-allowed",
                                confirmOk
                                    ? "border-success/30 bg-success/10 text-success"
                                    : "border-primary-500/40 bg-primary-500/10 text-primary-500 hover:bg-primary-500/[0.15]",
                            ].join(" ")}
                        >
                            {confirmOk ? <CheckIcon /> : (
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M2 6l3 3 5-5" />
                                </svg>
                            )}
                            {confirmOk ? "Confirmada" : "Confirmar nómina"}
                        </button>
                    )}
                </div>
            </div>

            {/* Confirm error */}
            {confirmError && (
                <div className="px-3 py-2 border border-red-500/20 rounded-lg bg-red-500/[0.04]">
                    <p className="font-mono text-[10px] text-red-500">{confirmError}</p>
                </div>
            )}

            {/* Search */}
            {showTable && (
                <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/30" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="5.5" cy="5.5" r="4" /><path d="M10.5 10.5l-2.5-2.5" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Buscar por nombre, cédula o cargo…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={[
                            "w-full h-9 pl-9 pr-3 rounded-lg border border-border-light bg-surface-1 outline-none",
                            "font-mono text-[12px] text-foreground placeholder:text-foreground/25",
                            "focus:border-primary-500/50 hover:border-border-medium transition-colors duration-150",
                        ].join(" ")}
                    />
                </div>
            )}

            {/* Table */}
            {showTable ? (
                <>
                    <BaseTable.Render
                        columns={columns} data={filteredResults} keyExtractor={(r) => r.cedula}
                        pagination
                        classNames={{ wrapper: "border border-border-light rounded-xl shadow-none" }}
                        renderExpandedRow={(result) => {
                            if (expandedId !== result.cedula) return null;
                            return (
                                <ExpandedPanel
                                    result={result} override={getOverride(getKey(result))}
                                    mondaysInMonth={mondaysInMonth} bcvRate={bcvRate}
                                    onChange={(updated) => setOverride(getKey(result), updated)}
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