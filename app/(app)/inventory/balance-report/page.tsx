"use client";

// Balance report page (Reporte Saldo).
// Shows a monthly inventory summary grouped by department.

import { useEffect, useRef, useState, useMemo } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { BalanceReportRow } from "@/src/modules/inventory/backend/domain/balance-report";

// ── helpers ──────────────────────────────────────────────────────────────────

function currentPeriod() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
                `"${r.departmentName}"`,
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

// ── component ─────────────────────────────────────────────────────────────────

export default function BalanceReportPage() {
    const { companyId } = useCompany();
    const { balanceReport, loadingBalanceReport, error, setError, loadBalanceReport } = useInventory();

    const [period, setPeriod] = useState(currentPeriod());
    // Ref instead of state — prevents setState-in-effect lint error
    const fetchedRef = useRef(false);

    useEffect(() => {
        if (companyId && !fetchedRef.current) {
            fetchedRef.current = true;
            loadBalanceReport(companyId, period);
        }
    }, [companyId, period, loadBalanceReport]);

    function handleSearch() {
        if (!companyId) return;
        setError(null);
        loadBalanceReport(companyId, period);
    }

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

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Reporte SALDO" subtitle="Resumen mensual agrupado por departamento">
                <div className="flex items-center gap-2">
                    <label className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                        Período
                    </label>
                    <BaseInput.Field
                        type="month"
                        value={period}
                        onValueChange={(v) => { fetchedRef.current = false; setPeriod(v); }}
                        className="w-40"
                    />
                </div>
                <BaseButton.Root
                    variant="primary"
                    size="sm"
                    onClick={handleSearch}
                    disabled={loadingBalanceReport}
                >
                    {loadingBalanceReport ? "Cargando…" : "Generar"}
                </BaseButton.Root>
                {balanceReport.length > 0 && (
                    <>
                        <BaseButton.Root
                            variant="secondary"
                            size="sm"
                            onClick={() => exportCSV(balanceReport, period)}
                        >
                            Exportar CSV
                        </BaseButton.Root>
                        <BaseButton.Root
                            variant="secondary"
                            size="sm"
                            onClick={() => window.print()}
                        >
                            Imprimir
                        </BaseButton.Root>
                    </>
                )}
            </PageHeader>

            <div className="px-8 py-6">
                {error && (
                    <div className="mb-4 px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[11px]">
                        {error}
                    </div>
                )}

                {loadingBalanceReport ? (
                    <div className="py-16 text-center text-[11px] text-[var(--text-tertiary)]">Cargando reporte…</div>
                ) : balanceReport.length === 0 ? (
                    <div className="py-16 text-center text-[11px] text-[var(--text-tertiary)]">
                        No hay datos para el período seleccionado.
                    </div>
                ) : (
                    <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-[11px] whitespace-nowrap">
                                <thead>
                                    <tr className="border-b border-border-light bg-surface-2">
                                        <th className="px-4 py-3 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[180px]">
                                            Departamento
                                        </th>
                                        <th className="px-4 py-3 text-right text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[110px]" colSpan={2}>
                                            Inv. Inicial
                                        </th>
                                        <th className="px-4 py-3 text-right text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[110px]" colSpan={2}>
                                            Entradas
                                        </th>
                                        <th className="px-4 py-3 text-right text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[110px]" colSpan={2}>
                                            Salidas
                                        </th>
                                        <th className="px-4 py-3 text-right text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[110px]" colSpan={2}>
                                            Existencia
                                        </th>
                                    </tr>
                                    <tr className="border-b-2 border-border-light bg-surface-2">
                                        <th className="px-4 pb-2.5 text-left text-[8px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal" />
                                        {(["Unid.", "Bs", "Unid.", "Bs", "Unid.", "Bs", "Unid.", "Bs"] as const).map((lbl, i) => (
                                            <th key={i} className="px-4 pb-2.5 text-right text-[8px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal min-w-[100px]">
                                                {lbl}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {balanceReport.map((row) => (
                                        <tr key={row.departmentName} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                            <td className="px-4 py-3 font-medium text-foreground uppercase tracking-[0.12em]">
                                                {row.departmentName}
                                            </td>
                                            <td className="px-4 py-3 tabular-nums text-right text-[var(--text-secondary)]">
                                                {fmtN(row.openingUnits)}
                                            </td>
                                            <td className="px-4 py-3 tabular-nums text-right text-[var(--text-primary)]">
                                                {fmtMoney(row.openingCost)}
                                            </td>
                                            <td className="px-4 py-3 tabular-nums text-right text-[var(--text-secondary)]">
                                                {fmtN(row.inboundUnits)}
                                            </td>
                                            <td className="px-4 py-3 tabular-nums text-right text-[var(--text-primary)]">
                                                {fmtMoney(row.inboundCost)}
                                            </td>
                                            <td className="px-4 py-3 tabular-nums text-right text-[var(--text-secondary)]">
                                                {fmtN(row.outboundUnits)}
                                            </td>
                                            <td className="px-4 py-3 tabular-nums text-right text-[var(--text-primary)]">
                                                {fmtMoney(row.outboundCost)}
                                            </td>
                                            <td className="px-4 py-3 tabular-nums text-right text-[var(--text-secondary)]">
                                                {fmtN(row.closingUnits)}
                                            </td>
                                            <td className="px-4 py-3 tabular-nums text-right text-[var(--text-primary)]">
                                                {fmtMoney(row.closingCost)}
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Grand total */}
                                    <tr className="border-t-2 border-primary-500/30 bg-primary-500/[0.04]">
                                        <td className="px-4 py-3 text-[11px] uppercase tracking-[0.14em] font-bold text-foreground">
                                            Total
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtN(totals.openingUnits)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtMoney(totals.openingCost)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtN(totals.inboundUnits)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtMoney(totals.inboundCost)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtN(totals.outboundUnits)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtMoney(totals.outboundCost)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtN(totals.closingUnits)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtMoney(totals.closingCost)}
                                        </td>
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
