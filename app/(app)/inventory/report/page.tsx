"use client";

// Inventory period report page.
// Displays a monthly inventory report grouped by department with cost and VAT breakdown.

import { useEffect, useMemo, useState, Fragment } from "react";
import {
    BookOpen,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Coins,
    Download,
    FileSpreadsheet,
    Layers,
    Printer,
    Receipt,
    Search,
} from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { DashboardKpiCard } from "@/src/shared/frontend/components/dashboard-kpi-card";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { PeriodReportRow } from "@/src/modules/inventory/backend/domain/period-report";

// ── helpers ──────────────────────────────────────────────────────────────────

const MONTHS_LONG = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

function currentPeriodKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function periodLabel(key: string): string {
    const [y, m] = key.split("-");
    const month = MONTHS_LONG[(Number(m) - 1) | 0] ?? "";
    return `${month} ${y}`;
}

function shiftPeriod(key: string, delta: number): string {
    const [y, m] = key.split("-").map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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
            `"${r.name.replace(/"/g, '""')}"`,
            `"${r.departmentName.replace(/"/g, '""')}"`,
            `"${r.supplierName.replace(/"/g, '""')}"`,
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

// ── Period picker ─────────────────────────────────────────────────────────────

function PeriodPicker({
    period,
    onChange,
}: {
    period: string;
    onChange: (next: string) => void;
}) {
    const today = currentPeriodKey();
    const isCurrent = period === today;
    return (
        <div className="inline-flex items-center gap-1 rounded-lg border border-border-light bg-surface-1 px-1 h-9">
            <button
                type="button"
                onClick={() => onChange(shiftPeriod(period, -1))}
                className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                aria-label="Mes anterior"
            >
                <ChevronLeft size={14} strokeWidth={2} />
            </button>
            <div className="px-2 flex items-center gap-1.5 min-w-[140px] justify-center">
                <Calendar size={12} strokeWidth={2} className="text-[var(--text-tertiary)]" />
                <span className="text-[12px] uppercase tracking-[0.12em] text-foreground tabular-nums">
                    {periodLabel(period)}
                </span>
            </div>
            <button
                type="button"
                onClick={() => onChange(shiftPeriod(period, 1))}
                className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                aria-label="Mes siguiente"
            >
                <ChevronRight size={14} strokeWidth={2} />
            </button>
            {!isCurrent && (
                <button
                    type="button"
                    onClick={() => onChange(today)}
                    className="ml-1 px-2 h-7 rounded text-[10px] uppercase tracking-[0.14em] text-primary-500 hover:bg-primary-500/10 transition-colors"
                >
                    Hoy
                </button>
            )}
        </div>
    );
}

// Sub-total row component
function SubtotalRow({ label, rows }: { label: string; rows: PeriodReportRow[] }) {
    return (
        <tr className="bg-surface-2/60 border-b border-border-light">
            <td className="px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-medium" colSpan={5}>
                Subtotal {label}
            </td>
            {NUM_COLS.map((c) => (
                <td key={c.key} className="px-3 py-1.5 text-[11px] tabular-nums text-[var(--text-secondary)] text-right font-medium whitespace-nowrap">
                    {fmtN(sumField(rows, c.key))}
                </td>
            ))}
        </tr>
    );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function PeriodReportPage() {
    const { companyId } = useCompany();
    const { periodReport, loadingPeriodReport, loadPeriodReport } = useInventory();

    const [period, setPeriod] = useState<string>(currentPeriodKey());
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (!companyId) return;
        loadPeriodReport(companyId, period);
    }, [companyId, period, loadPeriodReport]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return periodReport;
        return periodReport.filter((r) =>
            (r.code + " " + r.name + " " + r.departmentName + " " + r.supplierName).toLowerCase().includes(q),
        );
    }, [periodReport, search]);

    const groups = useMemo(() => groupByDepartment(filtered), [filtered]);
    const departmentCount = useMemo(
        () => new Set(periodReport.map((r) => r.departmentName || "Sin departamento")).size,
        [periodReport],
    );

    const totals = useMemo(() =>
        NUM_COLS.map((c) => sumField(filtered, c.key)),
    [filtered]);

    const headlineTotals = useMemo(() => ({
        outboundCostBs: sumField(periodReport, "outboundCostBs"),
        totalVatBs:     sumField(periodReport, "totalVatBs"),
        totalWithVatBs: sumField(periodReport, "totalWithVatBs"),
    }), [periodReport]);

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader
                title="Reporte de Período"
                subtitle={`Inventario mensual con costos e IVA · ${periodLabel(period)}`}
            >
                <BaseButton.Root
                    variant="ghost"
                    size="sm"
                    leftIcon={<Printer size={13} strokeWidth={2} />}
                    onClick={() => window.print()}
                    disabled={periodReport.length === 0 || loadingPeriodReport}
                >
                    Imprimir
                </BaseButton.Root>
                <BaseButton.Root
                    variant="secondary"
                    size="sm"
                    leftIcon={<Download size={13} strokeWidth={2} />}
                    onClick={() => exportCSV(filtered, period)}
                    disabled={filtered.length === 0 || loadingPeriodReport}
                >
                    Exportar CSV
                </BaseButton.Root>
            </PageHeader>

            <div className="px-8 py-6 space-y-6">
                {/* ── KPI strip ─────────────────────────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <DashboardKpiCard
                        label="Productos"
                        value={periodReport.length}
                        color="primary"
                        icon={FileSpreadsheet}
                        loading={loadingPeriodReport}
                        sublabel={`del período ${periodLabel(period)}`}
                    />
                    <DashboardKpiCard
                        label="Departamentos"
                        value={departmentCount}
                        color="default"
                        icon={Layers}
                        loading={loadingPeriodReport}
                        sublabel={departmentCount === 1 ? "departamento con movimientos" : "departamentos con movimientos"}
                    />
                    <DashboardKpiCard
                        label="Costo de salidas"
                        value={`Bs ${fmtN(headlineTotals.outboundCostBs)}`}
                        color="default"
                        icon={Coins}
                        loading={loadingPeriodReport}
                        sublabel="costo despachado"
                    />
                    <DashboardKpiCard
                        label="IVA del período"
                        value={`Bs ${fmtN(headlineTotals.totalVatBs)}`}
                        color="default"
                        icon={Receipt}
                        loading={loadingPeriodReport}
                        sublabel={`Total c/IVA Bs ${fmtN(headlineTotals.totalWithVatBs)}`}
                    />
                </div>

                {/* ── Toolbar: period + search ──────────────────────────────── */}
                <div className="flex flex-wrap items-center gap-3">
                    <PeriodPicker period={period} onChange={setPeriod} />
                    <div className="relative flex-1 min-w-[220px] max-w-md">
                        <Search
                            size={14}
                            strokeWidth={2}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none"
                        />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar producto, departamento o proveedor…"
                            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[13px] text-foreground placeholder:text-[var(--text-tertiary)] focus:border-primary-500/60 hover:border-border-medium transition-colors"
                        />
                    </div>
                </div>


                {/* ── Table ─────────────────────────────────────────────────── */}
                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
                        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                            Detalle por departamento
                        </h2>
                        <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] tabular-nums">
                            {filtered.length} {filtered.length === 1 ? "producto" : "productos"}
                        </span>
                    </div>

                    {loadingPeriodReport ? (
                        <div className="px-5 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">
                            Cargando reporte…
                        </div>
                    ) : periodReport.length === 0 ? (
                        <div className="px-5 py-16 flex flex-col items-center justify-center gap-3 text-center">
                            <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                                <BookOpen size={20} strokeWidth={1.8} />
                            </div>
                            <p className="text-[12px] uppercase tracking-[0.12em] text-foreground">
                                Sin datos en {periodLabel(period)}
                            </p>
                            <p className="font-sans text-[13px] text-[var(--text-tertiary)] max-w-md">
                                No hay productos con movimientos contables registrados para este período.
                            </p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="px-5 py-12 flex flex-col items-center gap-2 text-center">
                            <p className="text-[12px] uppercase tracking-[0.12em] text-foreground">
                                Sin resultados
                            </p>
                            <p className="font-sans text-[13px] text-[var(--text-tertiary)]">
                                Ningún producto coincide con tu búsqueda.
                            </p>
                            <button
                                type="button"
                                onClick={() => setSearch("")}
                                className="mt-2 text-[11px] uppercase tracking-[0.14em] text-primary-500 hover:text-primary-600 transition-colors"
                            >
                                Limpiar búsqueda
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[11px] whitespace-nowrap">
                                <thead className="sticky top-0 z-10">
                                    <tr className="border-b border-border-light bg-surface-2/80 backdrop-blur-sm">
                                        <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal sticky left-0 bg-surface-2/80 z-10 min-w-[80px]">
                                            Código
                                        </th>
                                        <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[180px]">
                                            Nombre
                                        </th>
                                        <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[120px]">
                                            Departamento
                                        </th>
                                        <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[120px]">
                                            Proveedor
                                        </th>
                                        <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal">
                                            IVA
                                        </th>
                                        {NUM_COLS.map((c) => (
                                            <th key={c.key} className="px-3 py-2.5 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[100px]">
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
                                                    className="px-3 py-2 text-[10px] uppercase tracking-[0.16em] font-bold text-primary-500"
                                                >
                                                    {dep}
                                                    <span className="ml-2 text-[10px] tracking-[0.12em] text-[var(--text-tertiary)] font-medium">
                                                        · {rows.length} {rows.length === 1 ? "producto" : "productos"}
                                                    </span>
                                                </td>
                                            </tr>

                                            {rows.map((r, i) => (
                                                <tr key={`${dep}-${r.code}-${i}`} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                                    <td className="px-3 py-2 text-[var(--text-secondary)] sticky left-0 bg-surface-1">
                                                        {r.code || "—"}
                                                    </td>
                                                    <td className="px-3 py-2 text-foreground font-medium max-w-[220px] truncate" title={r.name}>
                                                        {r.name}
                                                    </td>
                                                    <td className="px-3 py-2 text-[var(--text-secondary)]">{r.departmentName || "—"}</td>
                                                    <td className="px-3 py-2 text-[var(--text-secondary)] max-w-[160px] truncate" title={r.supplierName}>
                                                        {r.supplierName || "—"}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span
                                                            className={[
                                                                "inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold uppercase",
                                                                r.vatType === "exento"
                                                                    ? "border border-info/30 text-info bg-info/10"
                                                                    : "border border-amber-500/40 text-amber-600 bg-amber-500/[0.08]",
                                                            ].join(" ")}
                                                            title={r.vatType === "exento" ? "Exento" : "Gravable"}
                                                        >
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
                                        <td className="px-3 py-3 text-[11px] uppercase tracking-[0.12em] font-bold text-foreground" colSpan={5}>
                                            Total general
                                        </td>
                                        {totals.map((val, i) => (
                                            <td key={i} className="px-3 py-3 tabular-nums text-right text-[12px] font-bold text-foreground whitespace-nowrap">
                                                {fmtN(val)}
                                            </td>
                                        ))}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
