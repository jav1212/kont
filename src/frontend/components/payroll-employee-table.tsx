"use client";

// ============================================================================
// PAYROLL EMPLOYEE TABLE  v2
//
// Each employee gets its own override: extra earnings, deductions, bonuses
// that stack on top of the global accordion rows.
//
// Data flow:
//   Employee.overrides (local state) ──┐
//   Global accordion rows ─────────────┤→ computeEmployee() → EmployeeResult
//   mondaysInMonth / bcvRate ──────────┘
//
// The expanded row renders three mini-editors (same row-editor components
// used in the accordion) bound to that employee's override arrays.
// ============================================================================

import React, { useMemo, useState, useCallback } from "react";
import { BaseTable }     from "@/src/frontend/components/base-table";
import type { Column }   from "@/src/frontend/components/base-table";
import { AuditContainer, AuditRow } from "@/src/frontend/components/base-audit";
import {
    EarningRowEditor,
    DeductionRowEditor,
    BonusRowEditor,
    AddRowButton,
} from "@/src/frontend/components/payroll-row-editors";
import type { EarningRow, DeductionRow, BonusRow } from "@/src/frontend/core/payroll-types";

// ============================================================================
// TYPES
// ============================================================================

export interface Employee {
    id:             string;
    cedula:         string;
    nombre:         string;
    cargo:          string;
    salarioMensual: number;  // USD
    estado:         "activo" | "inactivo" | "vacacion";
}

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
// ENGINE — global rows + per-employee extras → EmployeeResult
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

    const allEarnings   = [...earningRows,  ...overrides.extraEarnings];
    const allDeductions = [...deductRows,   ...overrides.extraDeductions];
    const allBonuses    = [...bonusRows,    ...overrides.extraBonuses];

    const earningLines: ComputedLine[] = allEarnings.map((r) => {
        const qty    = parseFloat(r.quantity)   || 0;
        const mult   = parseFloat(r.multiplier) || 1;
        const amount = r.useDaily ? qty * daily * mult : qty;
        return {
            label:   r.label || "—",
            formula: r.useDaily
                ? `${qty}d × ${daily.toFixed(2)}${mult !== 1 ? ` × ${mult}` : ""}`
                : `${qty} VES`,
            amount,
        };
    });

    const bonusLines: ComputedLine[] = allBonuses.map((r) => {
        const usd = parseFloat(r.amount) || 0;
        return { label: r.label || "—", formula: `${usd}$ × ${bcvRate}`, amount: usd * bcvRate };
    });

    const deductionLines: ComputedLine[] = allDeductions.map((r) => {
        const base = r.base === "weekly" ? weeklyBase : emp.salarioMensual;
        const rate = parseFloat(r.rate) || 0;
        return {
            label:   r.label || "—",
            formula: r.base === "weekly"
                ? `${weekly.toFixed(2)} × ${mondaysInMonth}L × ${rate}%`
                : `${emp.salarioMensual} × ${rate}%`,
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

const EMPTY_OVERRIDE = (): EmployeeOverride => ({
    extraEarnings:   [],
    extraDeductions: [],
    extraBonuses:    [],
});

const fmt = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CLS: Record<Employee["estado"], string> = {
    activo:   "bg-success/10 text-success border-success/20",
    inactivo: "bg-error/10 text-error border-error/20",
    vacacion: "bg-warning/10 text-warning border-warning/20",
};

const StatusBadge = ({ estado }: { estado: Employee["estado"] }) => (
    <span className={[
        "inline-flex px-2 py-0.5 rounded-md border font-mono text-[9px] uppercase tracking-[0.16em]",
        STATUS_CLS[estado],
    ].join(" ")}>
        {estado}
    </span>
);

// ── Expand button ─────────────────────────────────────────────────────────────

const ExpandBtn = ({ open, onClick }: { open: boolean; onClick: () => void }) => (
    <button
        onClick={onClick}
        style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        className={[
            "w-6 h-6 flex items-center justify-center rounded-md border font-mono text-[10px]",
            open
                ? "border-primary-400 bg-primary-50 text-primary-500"
                : "border-border-light text-neutral-400 hover:border-border-medium hover:text-neutral-600",
        ].join(" ")}
    >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4l3 3 3-3" />
        </svg>
    </button>
);

// ── Override badge ────────────────────────────────────────────────────────────

const OverrideBadge = () => (
    <span className="inline-flex px-1.5 py-0.5 rounded border border-primary-400/30 bg-primary-50 dark:bg-primary-900/20 font-mono text-[8px] uppercase tracking-widest text-primary-500">
        +extras
    </span>
);

// ── Section label inside expanded panel ──────────────────────────────────────

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-400 mb-2 mt-4">
        {children}
    </p>
);

// ============================================================================
// EXPANDED PANEL
// Top half:  audit trail (read-only, global + extras combined)
// Bottom half: mini row-editors for extras only
// ============================================================================

interface ExpandedPanelProps {
    result:         EmployeeResult;
    override:       EmployeeOverride;
    mondaysInMonth: number;
    bcvRate:        number;
    onChange:       (updated: EmployeeOverride) => void;
}

const ExpandedPanel = ({
    result, override, mondaysInMonth, bcvRate, onChange,
}: ExpandedPanelProps) => {

    const empDailyRate  = result.salarioMensual / 30;
    const empWeeklyRate = (result.salarioMensual * 12) / 52;
    const empWeeklyBase = empWeeklyRate * mondaysInMonth;

    // Mutators for extraEarnings
    const addXE    = () => onChange({ ...override, extraEarnings: [...override.extraEarnings, { id: uid("xe"), label: "", quantity: "0", multiplier: "1.0", useDaily: true }] });
    const updateXE = (id: string, u: EarningRow)   => onChange({ ...override, extraEarnings:   override.extraEarnings.map((r)   => r.id === id ? u : r) });
    const removeXE = (id: string)                   => onChange({ ...override, extraEarnings:   override.extraEarnings.filter((r)   => r.id !== id) });

    // Mutators for extraBonuses
    const addXB    = () => onChange({ ...override, extraBonuses: [...override.extraBonuses, { id: uid("xb"), label: "", amount: "0.00" }] });
    const updateXB = (id: string, u: BonusRow)     => onChange({ ...override, extraBonuses:    override.extraBonuses.map((r)    => r.id === id ? u : r) });
    const removeXB = (id: string)                  => onChange({ ...override, extraBonuses:    override.extraBonuses.filter((r)    => r.id !== id) });

    // Mutators for extraDeductions
    const addXD    = () => onChange({ ...override, extraDeductions: [...override.extraDeductions, { id: uid("xd"), label: "", rate: "0", base: "monthly" as const }] });
    const updateXD = (id: string, u: DeductionRow) => onChange({ ...override, extraDeductions: override.extraDeductions.map((r) => r.id === id ? u : r) });
    const removeXD = (id: string)                  => onChange({ ...override, extraDeductions: override.extraDeductions.filter((r) => r.id !== id) });

    const firstName = result.nombre.split(" ")[0];

    return (
        <div className="bg-surface-2 border-t border-border-light px-6 py-5">

            {/* ── Audit trail (combined, read-only) ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <AuditContainer title="Asignaciones" total={result.totalEarnings} type="income">
                    {result.earningLines.map((l, i) => (
                        <AuditRow key={i} label={l.label} formula={l.formula} value={l.amount} />
                    ))}
                </AuditContainer>
                <AuditContainer title="Bonificaciones" total={result.totalBonuses} type="income">
                    {result.bonusLines.map((l, i) => (
                        <AuditRow key={i} label={l.label} formula={l.formula} value={l.amount} />
                    ))}
                </AuditContainer>
                <AuditContainer title="Deducciones" total={result.totalDeductions} type="deduction">
                    {result.deductionLines.map((l, i) => (
                        <AuditRow key={i} label={l.label} formula={l.formula} value={l.amount} isNegative />
                    ))}
                </AuditContainer>
            </div>

            {/* ── Divider with label ── */}
            <div className="flex items-center gap-3 mt-6 mb-1">
                <div className="flex-1 border-t border-dashed border-border-light" />
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-300">
                    Extras exclusivos — {firstName}
                </span>
                <div className="flex-1 border-t border-dashed border-border-light" />
            </div>

            {/* ── Extra earnings ── */}
            <SectionLabel>Asignaciones adicionales</SectionLabel>
            {override.extraEarnings.length === 0 && (
                <p className="font-mono text-[10px] text-neutral-300 italic mb-1">Sin asignaciones extra.</p>
            )}
            <div className="space-y-2">
                {override.extraEarnings.map((row) => (
                    <EarningRowEditor
                        key={row.id} row={row} dailyRate={empDailyRate} canRemove
                        onChange={(u) => updateXE(row.id, u)}
                        onRemove={() => removeXE(row.id)}
                    />
                ))}
            </div>
            <AddRowButton onClick={addXE} />

            {/* ── Extra bonuses ── */}
            <SectionLabel>Bonos adicionales</SectionLabel>
            {override.extraBonuses.length === 0 && (
                <p className="font-mono text-[10px] text-neutral-300 italic mb-1">Sin bonos extra.</p>
            )}
            <div className="space-y-2">
                {override.extraBonuses.map((row) => (
                    <BonusRowEditor
                        key={row.id} row={row} bcvRate={bcvRate} canRemove
                        onChange={(u) => updateXB(row.id, u)}
                        onRemove={() => removeXB(row.id)}
                    />
                ))}
            </div>
            <AddRowButton onClick={addXB} />

            {/* ── Extra deductions ── */}
            <SectionLabel>Deducciones adicionales</SectionLabel>
            {override.extraDeductions.length === 0 && (
                <p className="font-mono text-[10px] text-neutral-300 italic mb-1">Sin deducciones extra.</p>
            )}
            <div className="space-y-2">
                {override.extraDeductions.map((row) => (
                    <DeductionRowEditor
                        key={row.id} row={row}
                        weeklyBase={empWeeklyBase}
                        monthlyBase={result.salarioMensual}
                        canRemove
                        onChange={(u) => updateXD(row.id, u)}
                        onRemove={() => removeXD(row.id)}
                    />
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
    const T = active.reduce(
        (s, r) => ({ gross: s.gross + r.gross, ded: s.ded + r.totalDeductions, net: s.net + r.net, usd: s.usd + r.netUSD }),
        { gross: 0, ded: 0, net: 0, usd: 0 }
    );
    return (
        <div className="flex items-center justify-between px-5 py-3 bg-foreground text-background rounded-xl border border-white/10">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-40">
                {active.length} empleados activos
            </span>
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
// DEFAULT EMPLOYEES (farmacia Alianza)
// ============================================================================

export const DEFAULT_EMPLOYEES: Employee[] = [
    { id: "1", cedula: "V-19998667", nombre: "PEREZ APONTE KAREN YALINEY",    cargo: "AUXILIAR",   salarioMensual: 130, estado: "activo"   },
    { id: "2", cedula: "V-12983113", nombre: "BLANCO FERRER MARIA ELISA",     cargo: "AUXILIAR",   salarioMensual: 130, estado: "activo"   },
    { id: "3", cedula: "V-10203001", nombre: "DA SILVA CRAVO AFRICA ZUZETTY", cargo: "AUXILIAR",   salarioMensual: 130, estado: "activo"   },
    { id: "4", cedula: "V-20190242", nombre: "NIETO CHIRINOS GERALDINE",      cargo: "AUXILIAR",   salarioMensual: 130, estado: "inactivo" },
    { id: "5", cedula: "V-15834271", nombre: "PORRO ROMERO EDIBERTH ELLENA",  cargo: "AUXILIAR",   salarioMensual: 130, estado: "activo"   },
    { id: "6", cedula: "V-15758731", nombre: "HENRIQUE ANDRADE KELLYS",       cargo: "AUXILIAR",   salarioMensual: 130, estado: "activo"   },
    { id: "7", cedula: "V-20190999", nombre: "MUJICA CANU JENNIFER",          cargo: "FARMACEUTA", salarioMensual: 200, estado: "activo"   },
];

// ============================================================================
// MAIN EXPORT
// ============================================================================

export interface PayrollEmployeeTableProps {
    employees?:     Employee[];
    earningRows:    EarningRow[];
    deductionRows:  DeductionRow[];
    bonusRows:      BonusRow[];
    mondaysInMonth: number;
    bcvRate:        number;
}

export const PayrollEmployeeTable = ({
    employees     = DEFAULT_EMPLOYEES,
    earningRows,
    deductionRows,
    bonusRows,
    mondaysInMonth,
    bcvRate,
}: PayrollEmployeeTableProps) => {

    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Map<employeeId, EmployeeOverride> — only populated when user adds extras
    const [overrides, setOverrides] = useState<Map<string, EmployeeOverride>>(new Map());

    const getOverride = useCallback(
        (id: string) => overrides.get(id) ?? EMPTY_OVERRIDE(),
        [overrides]
    );

    const setOverride = useCallback((id: string, updated: EmployeeOverride) => {
        setOverrides((prev) => {
            const next = new Map(prev);
            next.set(id, updated);
            return next;
        });
    }, []);

    const results = useMemo<EmployeeResult[]>(() =>
        employees.map((emp) =>
            computeEmployee(
                emp, earningRows, deductionRows, bonusRows,
                getOverride(emp.id), mondaysInMonth, bcvRate,
            )
        ),
        // overrides Map reference changes on each setOverride call → correct invalidation
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [employees, earningRows, deductionRows, bonusRows, mondaysInMonth, bcvRate, overrides]
    );

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
        {
            key: "cargo", label: "Cargo", sortable: true, searchable: true,
            render: (v) => (
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-neutral-500">{v}</span>
            ),
        },
        {
            key: "salarioMensual", label: "Salario $", sortable: true, align: "end",
            render: (v) => <span className="font-mono text-[12px] tabular-nums">${fmt(v)}</span>,
        },
        {
            key: "estado", label: "Estado", align: "center",
            render: (v) => <StatusBadge estado={v} />,
        },
        {
            key: "gross", label: "Bruto VES", sortable: true, align: "end",
            render: (_, r) => <span className="font-mono text-[12px] tabular-nums">{fmt(r.gross)}</span>,
        },
        {
            key: "totalDeductions", label: "Deducciones", sortable: true, align: "end",
            render: (_, r) => (
                <span className="font-mono text-[12px] tabular-nums text-error/70">-{fmt(r.totalDeductions)}</span>
            ),
        },
        {
            key: "net", label: "Neto VES", sortable: true, align: "end",
            render: (_, r) => (
                <span className="font-mono text-[13px] font-semibold tabular-nums text-primary-500">{fmt(r.net)}</span>
            ),
        },
        {
            key: "netUSD", label: "Neto $", sortable: true, align: "end",
            render: (_, r) => (
                <span className="font-mono text-[11px] tabular-nums text-neutral-400">{fmt(r.netUSD)}</span>
            ),
        },
        {
            key: "_expand" as any, label: "", align: "center", width: 48,
            render: (_, r) => (
                <ExpandBtn
                    open={expandedId === r.id}
                    onClick={() => setExpandedId((prev) => prev === r.id ? null : r.id)}
                />
            ),
        },
    ];

    return (
        <div className="space-y-4">
            <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                    Nómina / Empleados
                </p>
                <h2 className="font-mono text-[15px] font-bold uppercase tracking-tighter text-foreground">
                    Resumen por Empleado
                </h2>
            </div>

            <BaseTable.Render
                columns={columns}
                data={results}
                keyExtractor={(r) => r.id}
                enableSearch
                pagination
                classNames={{ wrapper: "border border-border-light rounded-xl shadow-none" }}
                renderExpandedRow={(result) => {
                    if (expandedId !== result.id) return null;
                    return (
                        <ExpandedPanel
                            result={result}
                            override={getOverride(result.id)}
                            mondaysInMonth={mondaysInMonth}
                            bcvRate={bcvRate}
                            onChange={(updated) => setOverride(result.id, updated)}
                        />
                    );
                }}
            />

            <TotalsBar results={results} />
        </div>
    );
};