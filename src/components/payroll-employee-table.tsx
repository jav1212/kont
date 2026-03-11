"use client";

// ============================================================================
// PAYROLL EMPLOYEE TABLE
//
// Receives the same formula rows the accordion sections use (EarningRow[],
// DeductionRow[], BonusRow[]) and re-applies them independently per employee
// using each employee's own salarioMensual.  Zero extra state, zero sync.
//
// The component also owns its own expand-toggle state so the caller doesn't
// need to know which row is open.
// ============================================================================

import React, { useMemo, useState } from "react";
import { BaseTable } from "@/src/components/base-table";
import type { Column } from "@/src/components/base-table";
import { AuditContainer, AuditRow } from "@/src/components/base-audit";
import { BonusRow, DeductionRow, EarningRow } from "../core/payroll-types";

// ── Employee ──────────────────────────────────────────────────────────────────

export interface Employee {
    id:             string;
    cedula:         string;
    nombre:         string;
    cargo:          string;
    salarioMensual: number; // in USD
    estado:         "activo" | "inactivo" | "vacacion";
}

// ── Per-employee computed result ──────────────────────────────────────────────

interface EmployeeResult extends Employee {
    totalEarnings:   number;
    totalDeductions: number;
    totalBonuses:    number;
    gross:           number;
    net:             number;
    netUSD:          number;
    earningLines:    { label: string; formula: string; amount: number }[];
    deductionLines:  { label: string; formula: string; amount: number }[];
    bonusLines:      { label: string; formula: string; amount: number }[];
}

// ── Engine — applies accordion rows to a single employee ──────────────────────

function computeEmployee(
    emp:          Employee,
    earningRows:  EarningRow[],
    deductRows:   DeductionRow[],
    bonusRows:    BonusRow[],
    mondaysInMonth: number,
    bcvRate:      number,
): EmployeeResult {
    const daily  = emp.salarioMensual / 30;
    const weekly = (emp.salarioMensual * 12) / 52;
    const weeklyBase = weekly * mondaysInMonth;

    const earningLines = earningRows.map((r) => {
        const qty  = parseFloat(r.quantity)   || 0;
        const mult = parseFloat(r.multiplier) || 1;
        const amount = r.useDaily ? qty * daily * mult : qty;
        const formula = r.useDaily
            ? `${qty}d × ${daily.toFixed(2)}${mult !== 1 ? ` × ${mult}` : ""}`
            : `${qty} VES`;
        return { label: r.label || "—", formula, amount };
    });

    const bonusLines = bonusRows.map((r) => {
        const usd = parseFloat(r.amount) || 0;
        return { label: r.label || "—", formula: `${usd}$ × ${bcvRate}`, amount: usd * bcvRate };
    });

    const deductionLines = deductRows.map((r) => {
        const base = r.base === "weekly" ? weeklyBase : emp.salarioMensual;
        const rate = parseFloat(r.rate) || 0;
        const formula = r.base === "weekly"
            ? `${weekly.toFixed(2)} × ${mondaysInMonth}L × ${rate}%`
            : `${emp.salarioMensual} × ${rate}%`;
        return { label: r.label || "—", formula, amount: base * (rate / 100) };
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
    };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Sub-components ────────────────────────────────────────────────────────────

const STATUS_CLS: Record<Employee["estado"], string> = {
    activo:   "bg-success/10 text-success border-success/20",
    inactivo: "bg-error/10 text-error border-error/20",
    vacacion: "bg-warning/10 text-warning border-warning/20",
};

const StatusBadge = ({ estado }: { estado: Employee["estado"] }) => (
    <span className={[
        "inline-flex px-2 py-0.5 rounded-md border",
        "font-mono text-[9px] uppercase tracking-[0.16em]",
        STATUS_CLS[estado],
    ].join(" ")}>
        {estado}
    </span>
);

const ExpandBtn = ({ open, onClick }: { open: boolean; onClick: () => void }) => (
    <button
        onClick={onClick}
        className={[
            "w-6 h-6 flex items-center justify-center rounded-md border",
            "font-mono text-[10px] transition-all duration-150",
            open
                ? "border-primary-400 bg-primary-50 text-primary-500 rotate-180"
                : "border-border-light text-neutral-400 hover:border-border-medium hover:text-neutral-600",
        ].join(" ")}
    >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4l3 3 3-3" />
        </svg>
    </button>
);

const ExpandedAudit = ({ result }: { result: EmployeeResult }) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4 py-4 bg-surface-2 border-t border-border-light">
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
);

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

// ── Default employees (from farmacia spreadsheet) ─────────────────────────────

export const DEFAULT_EMPLOYEES: Employee[] = [
    { id: "1", cedula: "V-19998667", nombre: "PEREZ APONTE KAREN YALINEY",    cargo: "AUXILIAR",   salarioMensual: 130, estado: "activo"   },
    { id: "2", cedula: "V-12983113", nombre: "BLANCO FERRER MARIA ELISA",     cargo: "AUXILIAR",   salarioMensual: 130, estado: "activo"   },
    { id: "3", cedula: "V-10203001", nombre: "DA SILVA CRAVO AFRICA ZUZETTY", cargo: "AUXILIAR",   salarioMensual: 130, estado: "activo"   },
    { id: "4", cedula: "V-20190242", nombre: "NIETO CHIRINOS GERALDINE",      cargo: "AUXILIAR",   salarioMensual: 130, estado: "inactivo" },
    { id: "5", cedula: "V-15834271", nombre: "PORRO ROMERO EDIBERTH ELLENA",  cargo: "AUXILIAR",   salarioMensual: 130, estado: "activo"   },
    { id: "6", cedula: "V-15758731", nombre: "HENRIQUE ANDRADE KELLYS",       cargo: "AUXILIAR",   salarioMensual: 130, estado: "activo"   },
    { id: "7", cedula: "V-20190999", nombre: "MUJICA CANU JENNIFER",          cargo: "FARMACEUTA", salarioMensual: 200, estado: "activo"   },
];

// ── Main export ───────────────────────────────────────────────────────────────

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

    const results = useMemo<EmployeeResult[]>(() =>
        employees.map((emp) =>
            computeEmployee(emp, earningRows, deductionRows, bonusRows, mondaysInMonth, bcvRate)
        ),
        [employees, earningRows, deductionRows, bonusRows, mondaysInMonth, bcvRate]
    );

    const columns: Column<EmployeeResult>[] = [
        {
            key: "nombre", label: "Empleado", sortable: true, searchable: true,
            render: (_, r) => (
                <div className="flex flex-col gap-0.5 py-0.5">
                    <span className="font-mono text-[12px] font-medium leading-tight">{r.nombre}</span>
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
            render: (_, r) => (
                <span className="font-mono text-[12px] tabular-nums">{fmt(r.gross)}</span>
            ),
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
                <span className="font-mono text-[13px] font-semibold tabular-nums text-primary-500">
                    {fmt(r.net)}
                </span>
            ),
        },
        {
            key: "netUSD", label: "Neto $", sortable: true, align: "end",
            render: (_, r) => (
                <span className="font-mono text-[11px] tabular-nums text-neutral-400">{fmt(r.netUSD)}</span>
            ),
        },
        {
            // Expand toggle column — key is arbitrary, no data access
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
                renderExpandedRow={(result) =>
                    expandedId === result.id ? <ExpandedAudit result={result} /> : null
                }
            />

            <TotalsBar results={results} />
        </div>
    );
};