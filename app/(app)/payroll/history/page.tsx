"use client";

import { useState } from "react";
import { useCompany }        from "@/src/modules/companies/frontend/hooks/use-companies";
import { usePayrollHistory } from "@/src/modules/payroll/frontend/hooks/use-payroll-history";
import type { PayrollRun, PayrollReceipt } from "@/src/modules/payroll/frontend/hooks/use-payroll-history";

// ============================================================================
// HELPERS
// ============================================================================

const fmt = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatDateShort(iso: string) {
    return new Date(iso).toLocaleDateString("es-VE", {
        day: "2-digit", month: "short", year: "numeric",
    });
}

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleDateString("es-VE", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

const Spinner = () => (
    <svg className="animate-spin text-foreground/30" width="13" height="13" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

// ============================================================================
// RUN ROW
// ============================================================================

function RunRow({
    run, isSelected, onSelect,
}: {
    run: PayrollRun;
    isSelected: boolean;
    onSelect: (id: string) => void;
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
                <span className={[
                    "font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded border",
                    "border-green-500/20 bg-green-500/[0.08] text-green-600 dark:text-green-400",
                ].join(" ")}>
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

// ============================================================================
// RECEIPTS PANEL
// ============================================================================

function ReceiptsPanel({
    receipts, loading, error,
}: {
    receipts: PayrollReceipt[];
    loading: boolean;
    error: string | null;
}) {
    if (loading) {
        return (
            <div className="flex items-center justify-center h-24 gap-2 border border-border-light rounded-xl">
                <Spinner />
                <span className="font-mono text-[11px] uppercase tracking-widest text-foreground/30">Cargando recibos…</span>
            </div>
        );
    }
    if (error) {
        return (
            <div className="px-4 py-3 border border-red-500/20 rounded-xl bg-red-500/[0.05]">
                <p className="font-mono text-[11px] text-red-500">{error}</p>
            </div>
        );
    }
    if (!receipts.length) {
        return (
            <div className="flex items-center justify-center h-20 border border-border-light rounded-xl">
                <span className="font-mono text-[10px] uppercase tracking-widest text-foreground/30">Sin recibos</span>
            </div>
        );
    }

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

    async function handleSelectRun(runId: string) {
        if (selectedRunId === runId) { setSelectedRunId(null); return; }
        setSelectedRunId(runId);
        setReceiptsLoading(true);
        setReceiptsError(null);
        const { receipts: data, error: err } = await getReceipts(runId);
        setReceiptsLoading(false);
        setReceiptsError(err);
        setReceipts(data);
    }

    return (
        <div className="min-h-full bg-surface-2 p-8 font-mono">
            <div className="max-w-[1100px] mx-auto space-y-5">

                {/* Header */}
                <header className="pb-4 border-b border-border-light">
                    <nav className="text-[10px] uppercase text-foreground/30 mb-1 tracking-widest">
                        Nomina / Historial
                    </nav>
                    <div className="flex items-end justify-between gap-4">
                        <div>
                            <h1 className="text-xl font-bold uppercase tracking-tighter text-foreground">
                                Historial de Nóminas
                            </h1>
                            {company && (
                                <p className="text-[10px] text-foreground/40 mt-0.5 uppercase tracking-widest">
                                    {company.name} · {runs.length} período{runs.length !== 1 ? "s" : ""}
                                </p>
                            )}
                        </div>
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
