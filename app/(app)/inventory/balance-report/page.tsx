"use client";

// Balance report page (Reporte Saldo).
// Shows a monthly inventory summary grouped by department.

import { useEffect, useMemo, useState } from "react";
import {
    Boxes,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Download,
    Layers,
    PackageMinus,
    PackagePlus,
    Printer,
    Search,
    Scale,
} from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { DashboardKpiCard } from "@/src/shared/frontend/components/dashboard-kpi-card";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { BalanceReportRow } from "@/src/modules/inventory/backend/domain/balance-report";

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

function fmtN(n: number, dec = 0) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtMoney(n: number) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sum(rows: BalanceReportRow[], key: keyof BalanceReportRow): number {
    return rows.reduce((acc, r) => acc + Number(r[key]), 0);
}

function exportCSV(rows: BalanceReportRow[], period: string) {
    const headers = [
        "Departamento",
        "Inv. Inicial (unid.)",
        "Inv. Inicial Bs",
        "Entradas (unid.)",
        "Entradas Bs",
        "Salidas (unid.)",
        "Salidas Bs",
        "Existencia (unid.)",
        "Existencia Bs",
    ];
    const lines = [
        headers.join(","),
        ...rows.map((r) =>
            [
                `"${r.departmentName.replace(/"/g, '""')}"`,
                r.openingUnits,
                r.openingCost.toFixed(2),
                r.inboundUnits,
                r.inboundCost.toFixed(2),
                r.outboundUnits,
                r.outboundCost.toFixed(2),
                r.closingUnits,
                r.closingCost.toFixed(2),
            ].join(",")
        ),
        // Total row
        [
            "TOTAL",
            sum(rows, "openingUnits"),
            sum(rows, "openingCost").toFixed(2),
            sum(rows, "inboundUnits"),
            sum(rows, "inboundCost").toFixed(2),
            sum(rows, "outboundUnits"),
            sum(rows, "outboundCost").toFixed(2),
            sum(rows, "closingUnits"),
            sum(rows, "closingCost").toFixed(2),
        ].join(","),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-saldo-${period}.csv`;
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

// ── component ─────────────────────────────────────────────────────────────────

export default function BalanceReportPage() {
    const { companyId } = useCompany();
    const { balanceReport, loadingBalanceReport, error, setError, loadBalanceReport } = useInventory();

    const [period, setPeriod] = useState<string>(currentPeriodKey());
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (!companyId) return;
        setError(null);
        loadBalanceReport(companyId, period);
    }, [companyId, period, loadBalanceReport, setError]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return balanceReport;
        return balanceReport.filter((r) => r.departmentName.toLowerCase().includes(q));
    }, [balanceReport, search]);

    const totals = useMemo(() => ({
        openingUnits:  sum(balanceReport, "openingUnits"),
        openingCost:   sum(balanceReport, "openingCost"),
        inboundUnits:  sum(balanceReport, "inboundUnits"),
        inboundCost:   sum(balanceReport, "inboundCost"),
        outboundUnits: sum(balanceReport, "outboundUnits"),
        outboundCost:  sum(balanceReport, "outboundCost"),
        closingUnits:  sum(balanceReport, "closingUnits"),
        closingCost:   sum(balanceReport, "closingCost"),
    }), [balanceReport]);

    const filteredTotals = useMemo(() => ({
        openingUnits:  sum(filtered, "openingUnits"),
        openingCost:   sum(filtered, "openingCost"),
        inboundUnits:  sum(filtered, "inboundUnits"),
        inboundCost:   sum(filtered, "inboundCost"),
        outboundUnits: sum(filtered, "outboundUnits"),
        outboundCost:  sum(filtered, "outboundCost"),
        closingUnits:  sum(filtered, "closingUnits"),
        closingCost:   sum(filtered, "closingCost"),
    }), [filtered]);

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader
                title="Reporte SALDO"
                subtitle={`Resumen mensual por departamento · ${periodLabel(period)}`}
            >
                <BaseButton.Root
                    variant="ghost"
                    size="sm"
                    leftIcon={<Printer size={13} strokeWidth={2} />}
                    onClick={() => window.print()}
                    disabled={balanceReport.length === 0 || loadingBalanceReport}
                >
                    Imprimir
                </BaseButton.Root>
                <BaseButton.Root
                    variant="secondary"
                    size="sm"
                    leftIcon={<Download size={13} strokeWidth={2} />}
                    onClick={() => exportCSV(filtered, period)}
                    disabled={filtered.length === 0 || loadingBalanceReport}
                >
                    Exportar CSV
                </BaseButton.Root>
            </PageHeader>

            <div className="px-8 py-6 space-y-6">
                {/* ── KPI strip ─────────────────────────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <DashboardKpiCard
                        label="Departamentos"
                        value={balanceReport.length}
                        color="primary"
                        icon={Layers}
                        loading={loadingBalanceReport}
                        sublabel={`con movimientos en ${periodLabel(period)}`}
                    />
                    <DashboardKpiCard
                        label="Entradas"
                        value={`Bs ${fmtMoney(totals.inboundCost)}`}
                        color="default"
                        icon={PackagePlus}
                        loading={loadingBalanceReport}
                        sublabel={`${fmtN(totals.inboundUnits)} unidades ingresadas`}
                    />
                    <DashboardKpiCard
                        label="Salidas"
                        value={`Bs ${fmtMoney(totals.outboundCost)}`}
                        color="default"
                        icon={PackageMinus}
                        loading={loadingBalanceReport}
                        sublabel={`${fmtN(totals.outboundUnits)} unidades despachadas`}
                    />
                    <DashboardKpiCard
                        label="Existencia"
                        value={`Bs ${fmtMoney(totals.closingCost)}`}
                        color="default"
                        icon={Scale}
                        loading={loadingBalanceReport}
                        sublabel={`${fmtN(totals.closingUnits)} unidades en stock`}
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
                            placeholder="Buscar departamento…"
                            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[13px] text-foreground placeholder:text-[var(--text-tertiary)] focus:border-primary-500/60 hover:border-border-medium transition-colors"
                        />
                    </div>
                </div>

                {error && (
                    <div className="px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[13px] font-sans">
                        {error}
                    </div>
                )}

                {/* ── Table ─────────────────────────────────────────────────── */}
                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
                        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                            Saldo por departamento
                        </h2>
                        <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] tabular-nums">
                            {filtered.length} {filtered.length === 1 ? "departamento" : "departamentos"}
                        </span>
                    </div>

                    {loadingBalanceReport ? (
                        <div className="px-5 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">
                            Cargando reporte…
                        </div>
                    ) : balanceReport.length === 0 ? (
                        <div className="px-5 py-16 flex flex-col items-center justify-center gap-3 text-center">
                            <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                                <Scale size={20} strokeWidth={1.8} />
                            </div>
                            <p className="text-[12px] uppercase tracking-[0.12em] text-foreground">
                                Sin datos en {periodLabel(period)}
                            </p>
                            <p className="font-sans text-[13px] text-[var(--text-tertiary)] max-w-md">
                                Ningún departamento registró movimientos para este período.
                            </p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="px-5 py-12 flex flex-col items-center gap-2 text-center">
                            <p className="text-[12px] uppercase tracking-[0.12em] text-foreground">
                                Sin resultados
                            </p>
                            <p className="font-sans text-[13px] text-[var(--text-tertiary)]">
                                Ningún departamento coincide con tu búsqueda.
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
                            <table className="w-full text-[12px] whitespace-nowrap">
                                <thead className="sticky top-0 z-10">
                                    <tr className="border-b border-border-light bg-surface-2/80 backdrop-blur-sm">
                                        <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[200px]" rowSpan={2}>
                                            Departamento
                                        </th>
                                        <th className="px-4 pt-2.5 pb-1 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-medium" colSpan={2}>
                                            <span className="inline-flex items-center gap-1">
                                                <Boxes size={11} strokeWidth={2} className="text-[var(--text-tertiary)]" />
                                                Inv. inicial
                                            </span>
                                        </th>
                                        <th className="px-4 pt-2.5 pb-1 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-medium" colSpan={2}>
                                            <span className="inline-flex items-center gap-1">
                                                <PackagePlus size={11} strokeWidth={2} className="text-[var(--text-tertiary)]" />
                                                Entradas
                                            </span>
                                        </th>
                                        <th className="px-4 pt-2.5 pb-1 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-medium" colSpan={2}>
                                            <span className="inline-flex items-center gap-1">
                                                <PackageMinus size={11} strokeWidth={2} className="text-[var(--text-tertiary)]" />
                                                Salidas
                                            </span>
                                        </th>
                                        <th className="px-4 pt-2.5 pb-1 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-medium" colSpan={2}>
                                            <span className="inline-flex items-center gap-1">
                                                <Scale size={11} strokeWidth={2} className="text-[var(--text-tertiary)]" />
                                                Existencia
                                            </span>
                                        </th>
                                    </tr>
                                    <tr className="border-b border-border-light bg-surface-2/80 backdrop-blur-sm">
                                        {(["Unid.", "Bs", "Unid.", "Bs", "Unid.", "Bs", "Unid.", "Bs"] as const).map((lbl, i) => (
                                            <th key={i} className="px-4 pb-2 text-right text-[9px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal min-w-[100px]">
                                                {lbl}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((row) => (
                                        <tr key={row.departmentName} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                            <td className="px-4 py-2.5 font-medium text-foreground uppercase tracking-[0.12em]">
                                                {row.departmentName}
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums text-right text-[var(--text-secondary)]">
                                                {fmtN(row.openingUnits)}
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums text-right text-foreground">
                                                {fmtMoney(row.openingCost)}
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums text-right text-[var(--text-secondary)]">
                                                {fmtN(row.inboundUnits)}
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums text-right text-foreground">
                                                {fmtMoney(row.inboundCost)}
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums text-right text-[var(--text-secondary)]">
                                                {fmtN(row.outboundUnits)}
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums text-right text-foreground">
                                                {fmtMoney(row.outboundCost)}
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums text-right text-[var(--text-secondary)]">
                                                {fmtN(row.closingUnits)}
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums text-right font-medium text-foreground">
                                                {fmtMoney(row.closingCost)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-primary-500/30 bg-primary-500/[0.04]">
                                        <td className="px-4 py-3 text-[11px] uppercase tracking-[0.14em] font-bold text-foreground">
                                            {search.trim() ? "Subtotal filtrado" : "Total general"}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtN(filteredTotals.openingUnits)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtMoney(filteredTotals.openingCost)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtN(filteredTotals.inboundUnits)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtMoney(filteredTotals.inboundCost)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtN(filteredTotals.outboundUnits)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtMoney(filteredTotals.outboundCost)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtN(filteredTotals.closingUnits)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-right text-[13px] font-bold text-primary-500">
                                            {fmtMoney(filteredTotals.closingCost)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
