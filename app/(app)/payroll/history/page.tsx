"use client";

import { useState, useCallback } from "react";
import { useCompany }        from "@/src/modules/companies/frontend/hooks/use-companies";
import { usePayrollHistory } from "@/src/modules/payroll/frontend/hooks/use-payroll-history";
import type { PayrollRun, PayrollReceipt } from "@/src/modules/payroll/frontend/hooks/use-payroll-history";
import { generatePayrollPdf } from "@/src/modules/payroll/frontend/utils/payroll-pdf";
import type { PdfEmployeeResult } from "@/src/modules/payroll/frontend/utils/payroll-pdf";

// ============================================================================
// HELPERS
// ============================================================================

const fmt = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatDateShort(iso: string) {
    return new Date(iso + "T00:00:00").toLocaleDateString("es-VE", {
        day: "2-digit", month: "short", year: "numeric",
    });
}

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleDateString("es-VE", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

function exportReceiptsCsv(receipts: PayrollReceipt[], run: PayrollRun, companyName: string) {
    const rows = [
        ["cedula","nombre","cargo","salario_mensual","asignaciones","bonos","deducciones","bruto_ves","neto_ves","neto_usd"].join(","),
        ...receipts.map((r) => [
            r.employeeCedula,
            `"${r.employeeNombre}"`,
            `"${r.employeeCargo}"`,
            r.monthlySalary,
            r.totalEarnings.toFixed(2),
            r.totalBonuses.toFixed(2),
            r.totalDeductions.toFixed(2),
            (r.calculationData?.gross ?? 0).toFixed(2),
            r.netPay.toFixed(2),
            (r.calculationData?.netUsd ?? 0).toFixed(2),
        ].join(",")),
    ].join("\n");

    const blob = new Blob([rows], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `nomina_${companyName.replace(/\s+/g, "_")}_${run.periodStart}_${run.periodEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function buildPdfEmployees(receipts: PayrollReceipt[]): PdfEmployeeResult[] {
    return receipts.map((r) => {
        const cd  = r.calculationData ?? {};
        const net = r.netPay;
        const gross = cd.gross ?? (r.totalEarnings + r.totalBonuses);

        // Reconstruir líneas resumidas (sin detalle, sólo totales)
        const earningLines  = r.totalEarnings  > 0 ? [{ label: "Asignaciones",   formula: "—", amount: r.totalEarnings  }] : [];
        const bonusLines    = r.totalBonuses   > 0 ? [{ label: "Bonificaciones", formula: "—", amount: r.totalBonuses   }] : [];
        const deductionLines = r.totalDeductions > 0 ? [{ label: "Deducciones",   formula: "—", amount: r.totalDeductions }] : [];

        return {
            cedula:          r.employeeCedula,
            nombre:          r.employeeNombre,
            cargo:           r.employeeCargo,
            salarioMensual:  r.monthlySalary,
            estado:          "activo",
            earningLines,
            bonusLines,
            deductionLines,
            totalEarnings:   r.totalEarnings,
            totalBonuses:    r.totalBonuses,
            totalDeductions: r.totalDeductions,
            gross,
            net,
            netUSD:          cd.netUsd ?? 0,
            alicuotaUtil:    cd.alicuotaUtil    ?? 0,
            alicuotaBono:    cd.alicuotaBono    ?? 0,
            salarioIntegral: cd.salarioIntegral ?? r.monthlySalary,
        };
    });
}

// ============================================================================
// COMPONENTS
// ============================================================================

const Spinner = () => (
    <svg className="animate-spin text-foreground/30" width="13" height="13" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

function RunRow({ run, isSelected, onSelect }: {
    run: PayrollRun; isSelected: boolean; onSelect: (id: string) => void;
}) {
    return (
        <button
            onClick={() => onSelect(run.id)}
            className={[
                "w-full flex items-center justify-between px-5 py-4",
                "border-b border-border-light last:border-0 text-left",
                "transition-colors duration-150",
                isSelected ? "bg-primary-500/[0.04]" : "hover:bg-foreground/[0.02]",
            ].join(" ")}
        >
            <div className="flex flex-col gap-1">
                <span className="font-mono text-[12px] font-semibold text-foreground">
                    {formatDateShort(run.periodStart)} — {formatDateShort(run.periodEnd)}
                </span>
                <span className="font-mono text-[10px] text-foreground/30 uppercase tracking-widest">
                    Confirmada: {formatDateTime(run.confirmedAt)}
                </span>
            </div>
            <div className="flex items-center gap-6 tabular-nums">
                <div className="flex flex-col items-end gap-0.5">
                    <span className="font-mono text-[9px] uppercase text-foreground/30 tracking-widest">Tasa BCV</span>
                    <span className="font-mono text-[11px] text-foreground/50">{fmt(run.exchangeRate)}</span>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded border border-green-500/20 bg-green-500/[0.08] text-green-600 dark:text-green-400">
                    {run.status}
                </span>
                <svg
                    width="12" height="12" viewBox="0 0 12 12" fill="none"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                    className={["transition-transform duration-150 text-foreground/30", isSelected ? "rotate-90" : ""].join(" ")}
                >
                    <path d="M4 2l4 4-4 4" />
                </svg>
            </div>
        </button>
    );
}

function ReceiptsPanel({ receipts, loading, error }: {
    receipts: PayrollReceipt[]; loading: boolean; error: string | null;
}) {
    if (loading) return (
        <div className="flex items-center justify-center h-24 gap-2 border border-border-light rounded-xl">
            <Spinner />
            <span className="font-mono text-[11px] uppercase tracking-widest text-foreground/30">Cargando recibos…</span>
        </div>
    );
    if (error) return (
        <div className="px-4 py-3 border border-red-500/20 rounded-xl bg-red-500/[0.05]">
            <p className="font-mono text-[11px] text-red-500">{error}</p>
        </div>
    );
    if (!receipts.length) return (
        <div className="flex items-center justify-center h-20 border border-border-light rounded-xl">
            <span className="font-mono text-[10px] uppercase tracking-widest text-foreground/30">Sin recibos</span>
        </div>
    );

    const totNet    = receipts.reduce((s, r) => s + r.netPay, 0);
    const totNetUsd = receipts.reduce((s, r) => s + (r.calculationData?.netUsd ?? 0), 0);
    const totGross  = receipts.reduce((s, r) => s + (r.calculationData?.gross ?? 0), 0);

    return (
        <div className="space-y-3">
            <div className="overflow-x-auto border border-border-light rounded-xl bg-surface-1">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border-light bg-surface-2">
                            {["Empleado", "Cargo", "Salario Bs.", "Asignaciones", "Bonos", "Deducciones", "Bruto VES", "Neto VES", "Neto $"].map((h) => (
                                <th key={h} className="px-4 py-2.5 text-left font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/35 whitespace-nowrap">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {receipts.map((r) => (
                            <tr key={r.id} className="border-b border-border-light/60 last:border-0 hover:bg-foreground/[0.02] transition-colors">
                                <td className="px-4 py-3">
                                    <div className="flex flex-col gap-0.5">
                                        <span className="font-mono text-[11px] font-medium text-foreground">{r.employeeNombre}</span>
                                        <span className="font-mono text-[9px] text-foreground/30 uppercase tracking-widest">{r.employeeCedula}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 font-mono text-[10px] text-foreground/50 uppercase tracking-[0.08em]">{r.employeeCargo}</td>
                                <td className="px-4 py-3 font-mono text-[11px] tabular-nums text-foreground/60">Bs. {fmt(r.monthlySalary)}</td>
                                <td className="px-4 py-3 font-mono text-[11px] tabular-nums text-foreground/60">{fmt(r.totalEarnings)}</td>
                                <td className="px-4 py-3 font-mono text-[11px] tabular-nums text-foreground/60">{fmt(r.totalBonuses)}</td>
                                <td className="px-4 py-3 font-mono text-[11px] tabular-nums text-red-500 dark:text-red-400">-{fmt(r.totalDeductions)}</td>
                                <td className="px-4 py-3 font-mono text-[11px] tabular-nums text-foreground/60">{fmt(r.calculationData?.gross ?? 0)}</td>
                                <td className="px-4 py-3 font-mono text-[12px] font-semibold tabular-nums text-primary-500">{fmt(r.netPay)}</td>
                                <td className="px-4 py-3 font-mono text-[10px] tabular-nums text-foreground/40">${fmt(r.calculationData?.netUsd ?? 0)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Totals bar */}
            <div className="flex justify-end gap-8 px-5 py-3 border border-border-light rounded-xl bg-surface-1">
                <div className="flex flex-col items-end gap-0.5">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-foreground/30">Total Bruto</span>
                    <span className="font-mono text-[13px] text-foreground/50 tabular-nums">{fmt(totGross)}</span>
                </div>
                <div className="w-px bg-border-light" />
                <div className="flex flex-col items-end gap-0.5">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-foreground/30">Total Neto VES</span>
                    <span className="font-mono text-[18px] font-black text-primary-500 tabular-nums">{fmt(totNet)}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-foreground/30">Total Neto $</span>
                    <span className="font-mono text-[13px] text-foreground/50 tabular-nums">${fmt(totNetUsd)}</span>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// PAGE
// ============================================================================

export default function PayrollHistoryPage() {
    const { companyId, company } = useCompany();
    const { runs, loading, error, getReceipts } = usePayrollHistory(companyId);

    const [selectedRunId,   setSelectedRunId]   = useState<string | null>(null);
    const [receipts,        setReceipts]        = useState<PayrollReceipt[]>([]);
    const [receiptsLoading, setReceiptsLoading] = useState(false);
    const [receiptsError,   setReceiptsError]   = useState<string | null>(null);

    const handleSelectRun = useCallback(async (runId: string) => {
        if (selectedRunId === runId) { setSelectedRunId(null); setReceipts([]); return; }
        setSelectedRunId(runId);
        setReceiptsLoading(true);
        setReceiptsError(null);
        const { receipts: data, error: err } = await getReceipts(runId);
        setReceiptsLoading(false);
        setReceiptsError(err);
        setReceipts(data);
    }, [selectedRunId, getReceipts]);

    const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;

    const handleDownloadPdf = useCallback(() => {
        if (!selectedRun || !receipts.length) return;
        const employees = buildPdfEmployees(receipts);
        const periodLabel = `${formatDateShort(selectedRun.periodStart)} — ${formatDateShort(selectedRun.periodEnd)}`;
        generatePayrollPdf(employees, {
            companyName:    company?.name ?? "Empresa",
            payrollDate:    selectedRun.periodEnd,
            periodStart:    selectedRun.periodStart,
            periodLabel,
            bcvRate:        selectedRun.exchangeRate,
            mondaysInMonth: receipts[0]?.calculationData?.mondaysInMonth ?? 4,
        });
    }, [selectedRun, receipts, company]);

    return (
        <div className="min-h-full bg-surface-2 p-8 font-mono">
            <div className="max-w-[1100px] mx-auto space-y-5">

                {/* Header */}
                <header className="pb-4 border-b border-border-light">
                    <nav className="font-mono text-[9px] uppercase tracking-[0.22em] text-foreground/30 mb-2">
                        Nómina / Historial
                    </nav>
                    <div className="flex items-end justify-between gap-4 flex-wrap">
                        <div>
                            <h1 className="font-mono text-[22px] font-black uppercase tracking-tighter text-foreground leading-none">
                                Historial
                            </h1>
                            {company && (
                                <p className="font-mono text-[10px] text-foreground/35 mt-1.5 uppercase tracking-[0.18em]">
                                    {company.name} · {runs.length} período{runs.length !== 1 ? "s" : ""}
                                </p>
                            )}
                        </div>

                        {selectedRun && receipts.length > 0 && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleDownloadPdf}
                                    className={[
                                        "h-8 px-3 rounded-lg flex items-center gap-1.5",
                                        "bg-primary-500 hover:bg-primary-600",
                                        "font-mono text-[10px] uppercase tracking-[0.18em] text-white",
                                        "transition-colors duration-150",
                                    ].join(" ")}
                                >
                                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M2 2h5l3 3v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M7 2v3h3M4 7h4M4 9h2" />
                                    </svg>
                                    Descargar PDF
                                </button>
                                <button
                                    onClick={() => exportReceiptsCsv(receipts, selectedRun, company?.name ?? "empresa")}
                                    className={[
                                        "h-8 px-3 rounded-lg flex items-center gap-1.5 border border-border-light bg-surface-1",
                                        "hover:border-border-medium hover:bg-surface-2",
                                        "font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/60",
                                        "transition-colors duration-150",
                                    ].join(" ")}
                                >
                                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M6 2v7M2 9l4 2 4-2M2 5H1v6h10V5h-1" />
                                    </svg>
                                    Exportar CSV
                                </button>
                            </div>
                        )}
                    </div>
                </header>

                {/* Content */}
                {loading ? (
                    <div className="flex items-center justify-center h-32 gap-2 border border-border-light rounded-xl">
                        <Spinner />
                        <span className="font-mono text-[11px] uppercase tracking-widest text-foreground/30">Cargando historial…</span>
                    </div>
                ) : error ? (
                    <div className="px-4 py-3 border border-red-500/20 rounded-xl bg-red-500/[0.05]">
                        <p className="font-mono text-[11px] text-red-500">{error}</p>
                    </div>
                ) : runs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 border border-border-light rounded-xl text-foreground/30 gap-3">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                        </svg>
                        <span className="font-mono text-[11px] uppercase tracking-widest">Sin nóminas confirmadas</span>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="border border-border-light rounded-xl overflow-hidden bg-surface-1">
                            {runs.map((run) => (
                                <RunRow
                                    key={run.id}
                                    run={run}
                                    isSelected={selectedRunId === run.id}
                                    onSelect={handleSelectRun}
                                />
                            ))}
                        </div>

                        {selectedRunId && (
                            <ReceiptsPanel
                                receipts={receipts}
                                loading={receiptsLoading}
                                error={receiptsError}
                            />
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}
