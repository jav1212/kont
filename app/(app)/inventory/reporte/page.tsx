"use client";

// Inventory period report page.
// Displays a monthly inventory report grouped by department with cost and VAT breakdown.

import { useEffect, useRef, useState, useMemo, Fragment } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { PeriodReportRow } from "@/src/modules/inventory/backend/domain/period-report";

// ── helpers ──────────────────────────────────────────────────────────────────

function currentPeriod() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtN(n: number, dec = 2) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function sumField(rows: PeriodReportRow[], key: keyof PeriodReportRow): number {
    return rows.reduce((acc, r) => acc + Number(r[key]), 0);
}

// Group rows by department
function groupByDepartment(rows: PeriodReportRow[]) {
    const map = new Map<string, PeriodReportRow[]>();
    for (const row of rows) {
        const dep = row.departmentName || "Sin departamento";
        if (!map.has(dep)) map.set(dep, []);
        map.get(dep)!.push(row);
    }
    return Array.from(map.entries());
}

// Numeric columns for the report table
const NUM_COLS: { key: keyof PeriodReportRow; label: string }[] = [
    { key: "openingInventory",      label: "Inv. Inicial"       },
    { key: "averageCost",           label: "Costo Prom."        },
    { key: "inbound",               label: "Entradas"           },
    { key: "outbound",              label: "Salidas"            },
    { key: "currentStock",          label: "Exist. Actual"      },
    { key: "inboundCostBs",         label: "Entradas Bs"        },
    { key: "totalOutboundNoVatBs",  label: "Salidas S/IVA Bs"   },
    { key: "outboundCostBs",        label: "Costo Salidas Bs"   },
    { key: "selfConsumptionCost",   label: "Autoconsumo Bs"     },
    { key: "currentCostBs",         label: "Costo Actual Bs"    },
    { key: "vatPercentage",         label: "IVA %"              },
    { key: "totalVatBs",            label: "IVA Bs"             },
    { key: "totalWithVatBs",        label: "Total c/IVA Bs"     },
];

// CSV export
function exportCSV(rows: PeriodReportRow[], period: string) {
    const headers = [
        "Código", "Nombre", "Departamento", "Proveedor", "IVA Tipo",
        ...NUM_COLS.map((c) => c.label),
    ];
    const lines = [
        headers.join(","),
        ...rows.map((r) => [
            r.code,
            `"${r.name}"`,
            `"${r.departmentName}"`,
            `"${r.supplierName}"`,
            r.vatType,
            ...NUM_COLS.map((c) => String(r[c.key])),
        ].join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-inventario-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// Sub-total row component
function SubtotalRow({ label, rows }: { label: string; rows: PeriodReportRow[] }) {
    return (
        <tr className="bg-surface-2/60 border-b border-border-light">
            <td className="px-3 py-1.5 text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-medium" colSpan={5}>
                Subtotal {label}
            </td>
            {NUM_COLS.map((c) => (
                <td key={c.key} className="px-3 py-1.5 text-[10px] tabular-nums text-[var(--text-secondary)] text-right font-medium whitespace-nowrap">
                    {fmtN(sumField(rows, c.key))}
                </td>
            ))}
        </tr>
    );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function PeriodReportPage() {
    const { companyId } = useCompany();
    const { periodReport, loadingPeriodReport, error, setError, loadPeriodReport } = useInventory();

    const [period, setPeriod] = useState(currentPeriod());
    const searchedRef = useRef(false);

    useEffect(() => {
        if (companyId && !searchedRef.current) {
            searchedRef.current = true;
            loadPeriodReport(companyId, period);
        }
    }, [companyId, period, loadPeriodReport]);

    function handleSearch() {
        if (!companyId) return;
        setError(null);
        loadPeriodReport(companyId, period);
    }

    const groups = useMemo(() => groupByDepartment(periodReport), [periodReport]);

    const totals = useMemo(() =>
        NUM_COLS.map((c) => sumField(periodReport, c.key)),
    [periodReport]);

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[13px] font-bold uppercase tracking-[0.18em] text-foreground">
                            Reporte de Período
                        </h1>
                        <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.16em] mt-0.5">
                            Inventario mensual con costos, IVA y movimientos
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <label className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                                Período
                            </label>
                            <input
                                type="month"
                                value={period}
                                onChange={(e) => { searchedRef.current = false; setPeriod(e.target.value); }}
                                className="h-8 px-2 rounded-lg border border-border-light bg-surface-1 text-[12px] text-foreground outline-none focus:border-primary-500/60"
                            />
                        </div>
                        <button
                            onClick={handleSearch}
                            disabled={loadingPeriodReport}
                            className="h-8 px-3 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                        >
                            {loadingPeriodReport ? "Cargando…" : "Generar"}
                        </button>
                        {periodReport.length > 0 && (
                            <button
                                onClick={() => exportCSV(periodReport, period)}
                                className="h-8 px-3 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                Exportar CSV
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="px-8 py-6">
                {/* Error */}
                {error && (
                    <div className="mb-4 px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[11px]">
                        {error}
                    </div>
                )}

                {loadingPeriodReport ? (
                    <div className="py-16 text-center text-[11px] text-[var(--text-tertiary)]">Cargando reporte…</div>
                ) : periodReport.length === 0 ? (
                    <div className="py-16 text-center text-[11px] text-[var(--text-tertiary)]">
                        No hay datos para el período seleccionado.
                    </div>
                ) : (
                    <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-[10px] whitespace-nowrap">
                                <thead>
                                    <tr className="border-b border-border-light bg-surface-2">
                                        <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal sticky left-0 bg-surface-2 z-10 min-w-[80px]">
                                            Código
                                        </th>
                                        <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[160px]">
                                            Nombre
                                        </th>
                                        <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[120px]">
                                            Departamento
                                        </th>
                                        <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[120px]">
                                            Proveedor
                                        </th>
                                        <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal">
                                            IVA
                                        </th>
                                        {NUM_COLS.map((c) => (
                                            <th key={c.key} className="px-3 py-2.5 text-right text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[100px]">
                                                {c.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {groups.map(([dep, rows]) => (
                                        <Fragment key={dep}>
                                            {/* Group header */}
                                            <tr className="bg-primary-500/[0.04] border-b border-border-light/50">
                                                <td
                                                    colSpan={5 + NUM_COLS.length}
                                                    className="px-3 py-1.5 text-[9px] uppercase tracking-[0.18em] font-bold text-primary-500"
                                                >
                                                    {dep}
                                                </td>
                                            </tr>

                                            {rows.map((r) => (
                                                <tr key={r.code} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                                    <td className="px-3 py-2 text-[var(--text-secondary)] sticky left-0 bg-surface-1 group-hover:bg-surface-2">
                                                        {r.code || "—"}
                                                    </td>
                                                    <td className="px-3 py-2 text-foreground max-w-[180px] truncate" title={r.name}>
                                                        {r.name}
                                                    </td>
                                                    <td className="px-3 py-2 text-[var(--text-secondary)]">{r.departmentName || "—"}</td>
                                                    <td className="px-3 py-2 text-[var(--text-secondary)] max-w-[140px] truncate" title={r.supplierName}>
                                                        {r.supplierName || "—"}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] uppercase tracking-[0.10em] font-medium ${r.vatType === "exento" ? "border badge-info" : "border badge-warning"}`}>
                                                            {r.vatType === "exento" ? "E" : "G"}
                                                        </span>
                                                    </td>
                                                    {NUM_COLS.map((c) => (
                                                        <td key={c.key} className="px-3 py-2 tabular-nums text-right text-[var(--text-primary)]">
                                                            {fmtN(Number(r[c.key]))}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}

                                            <SubtotalRow key={`sub-${dep}`} label={dep} rows={rows} />
                                        </Fragment>
                                    ))}

                                    {/* Grand total */}
                                    <tr className="border-t-2 border-primary-500/30 bg-primary-500/[0.04]">
                                        <td className="px-3 py-2.5 text-[10px] uppercase tracking-[0.14em] font-bold text-foreground" colSpan={5}>
                                            Total general
                                        </td>
                                        {totals.map((val, i) => (
                                            <td key={i} className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-foreground whitespace-nowrap">
                                                {fmtN(val)}
                                            </td>
                                        ))}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
