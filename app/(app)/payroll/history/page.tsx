"use client";

import { useState, useCallback } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { FileText, Download, FileBarChart } from "lucide-react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { usePayrollHistory } from "@/src/modules/payroll/frontend/hooks/use-payroll-history";
import type { PayrollRun, PayrollReceipt } from "@/src/modules/payroll/frontend/hooks/use-payroll-history";
import { generatePayrollPdf } from "@/src/modules/payroll/frontend/utils/payroll-pdf";
import type { PdfEmployeeResult } from "@/src/modules/payroll/frontend/utils/payroll-pdf";
import { generatePayrollSummaryPdf } from "@/src/modules/payroll/frontend/utils/payroll-summary-pdf";
import type { PayrollSummaryEmployeeRow } from "@/src/modules/payroll/frontend/utils/payroll-summary-pdf";
import { CestaTicketHistoryView } from "@/src/modules/payroll/frontend/components/cesta-ticket-history-view";

type HistoryTab = "payroll" | "cesta";

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
        ["cedula", "nombre", "cargo", "salario_mensual", "asignaciones", "bonos", "deducciones", "bruto_ves", "neto_ves", "neto_usd"].join(","),
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nomina_${companyName.replace(/\s+/g, "_")}_${run.periodStart}_${run.periodEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function buildPdfEmployees(receipts: PayrollReceipt[]): PdfEmployeeResult[] {
    return receipts.map((r) => {
        const cd = r.calculationData ?? {};
        const net = r.netPay;
        const gross = cd.gross ?? (r.totalEarnings + r.totalBonuses);

        // Recibos confirmados a partir de Sprint 3 traen el desglose por línea
        // (con fórmulas) en `calculationData`. Para los runs anteriores que sólo
        // guardaron los agregados, caemos a una línea-resumen sin fórmula.
        const earningLines   = cd.earningLines   && cd.earningLines.length   > 0
            ? cd.earningLines
            : (r.totalEarnings   > 0 ? [{ label: "Asignaciones",  formula: "—", amount: r.totalEarnings   }] : []);
        const bonusLines     = cd.bonusLines     && cd.bonusLines.length     > 0
            ? cd.bonusLines
            : (r.totalBonuses    > 0 ? [{ label: "Bonificaciones", formula: "—", amount: r.totalBonuses    }] : []);
        const deductionLines = cd.deductionLines && cd.deductionLines.length > 0
            ? cd.deductionLines
            : (r.totalDeductions > 0 ? [{ label: "Deducciones",   formula: "—", amount: r.totalDeductions }] : []);

        return {
            cedula: r.employeeCedula,
            nombre: r.employeeNombre,
            cargo: r.employeeCargo,
            salarioMensual: r.monthlySalary,
            estado: "activo",
            earningLines,
            bonusLines,
            deductionLines,
            totalEarnings: r.totalEarnings,
            totalBonuses: r.totalBonuses,
            totalDeductions: r.totalDeductions,
            gross,
            net,
            netUSD: cd.netUsd ?? 0,
            alicuotaUtil: cd.alicuotaUtil ?? 0,
            alicuotaBono: cd.alicuotaBono ?? 0,
            salarioIntegral: cd.salarioIntegral ?? r.monthlySalary,
        };
    });
}

// ============================================================================
// COMPONENTS
// ============================================================================

const Spinner = () => (
    <svg className="animate-spin text-[var(--text-tertiary)]" width="13" height="13" viewBox="0 0 12 12" fill="none">
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
                <span className="font-mono text-[12px] text-[var(--text-tertiary)] uppercase tracking-widest">
                    {run.status === "draft" ? "Guardado" : "Confirmada"}: {formatDateTime(run.confirmedAt)}
                </span>
            </div>
            <div className="flex items-center gap-6 tabular-nums">
                <div className="flex flex-col items-end gap-0.5">
                    <span className="font-mono text-[11px] uppercase text-[var(--text-tertiary)] tracking-widest">Tasa BCV</span>
                    <span className="font-mono text-[13px] text-[var(--text-secondary)]">{fmt(run.exchangeRate)}</span>
                </div>
                <span
                    className={[
                        "font-mono text-[11px] uppercase tracking-widest px-2 py-0.5 rounded border",
                        run.status === "draft"
                            ? "border-border-medium bg-foreground/[0.05] text-[var(--text-secondary)]"
                            : "badge-success",
                    ].join(" ")}
                >
                    {run.status === "draft" ? "Borrador" : "Confirmada"}
                </span>
                <svg
                    width="12" height="12" viewBox="0 0 12 12" fill="none"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                    className={["transition-transform duration-150 text-[var(--text-tertiary)]", isSelected ? "rotate-90" : ""].join(" ")}
                >
                    <path d="M4 2l4 4-4 4" />
                </svg>
            </div>
        </button>
    );
}

function ReceiptsPanel({ receipts, loading }: {
    receipts: PayrollReceipt[]; loading: boolean;
}) {
    if (loading) return (
        <div className="flex items-center justify-center h-24 gap-2 border border-border-light rounded-xl">
            <Spinner />
            <span className="font-mono text-[13px] uppercase tracking-widest text-[var(--text-tertiary)]">Cargando recibos…</span>
        </div>
    );
    if (!receipts.length) return (
        <div className="flex items-center justify-center h-20 border border-border-light rounded-xl">
            <span className="font-mono text-[13px] uppercase tracking-widest text-[var(--text-tertiary)]">Sin recibos</span>
        </div>
    );

    const totNet = receipts.reduce((s, r) => s + r.netPay, 0);
    const totNetUsd = receipts.reduce((s, r) => s + (r.calculationData?.netUsd ?? 0), 0);
    const totGross = receipts.reduce((s, r) => s + (r.calculationData?.gross ?? 0), 0);

    return (
        <div className="space-y-3">
            <div className="overflow-x-auto border border-border-light rounded-xl bg-surface-1">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border-light bg-surface-2">
                            {["Empleado", "Cargo", "Salario Bs.", "Asignaciones", "Bonos", "Deducciones", "Bruto VES", "Neto VES", "Neto $"].map((h) => (
                                <th key={h} className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] whitespace-nowrap">
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
                                        <span className="font-mono text-[13px] font-medium text-foreground">{r.employeeNombre}</span>
                                        <span className="font-mono text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest">{r.employeeCedula}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 font-mono text-[12px] text-[var(--text-secondary)] uppercase tracking-[0.08em]">{r.employeeCargo}</td>
                                <td className="px-4 py-3 font-mono text-[13px] tabular-nums text-[var(--text-secondary)]">Bs. {fmt(r.monthlySalary)}</td>
                                <td className="px-4 py-3 font-mono text-[13px] tabular-nums text-[var(--text-secondary)]">{fmt(r.totalEarnings)}</td>
                                <td className="px-4 py-3 font-mono text-[13px] tabular-nums text-[var(--text-secondary)]">{fmt(r.totalBonuses)}</td>
                                <td className="px-4 py-3 font-mono text-[13px] tabular-nums text-red-500 dark:text-red-400">-{fmt(r.totalDeductions)}</td>
                                <td className="px-4 py-3 font-mono text-[13px] tabular-nums text-[var(--text-secondary)]">{fmt(r.calculationData?.gross ?? 0)}</td>
                                <td className="px-4 py-3 font-mono text-[14px] font-semibold tabular-nums text-primary-500">{fmt(r.netPay)}</td>
                                <td className="px-4 py-3 font-mono text-[12px] tabular-nums text-[var(--text-tertiary)]">${fmt(r.calculationData?.netUsd ?? 0)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Totals bar */}
            <div className="flex justify-end gap-8 px-5 py-3 border border-border-light rounded-xl bg-surface-1">
                <div className="flex flex-col items-end gap-0.5">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-tertiary)]">Total Bruto</span>
                    <span className="font-mono text-[14px] text-[var(--text-secondary)] tabular-nums">{fmt(totGross)}</span>
                </div>
                <div className="w-px bg-border-light" />
                <div className="flex flex-col items-end gap-0.5">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-tertiary)]">Total Neto VES</span>
                    <span className="font-mono text-[18px] font-black text-primary-500 tabular-nums">{fmt(totNet)}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-tertiary)]">Total Neto $</span>
                    <span className="font-mono text-[14px] text-[var(--text-secondary)] tabular-nums">${fmt(totNetUsd)}</span>
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
    const { runs, loading, getReceipts } = usePayrollHistory(companyId);

    const [activeTab, setActiveTab] = useState<HistoryTab>("payroll");

    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
    const [receipts, setReceipts] = useState<PayrollReceipt[]>([]);
    const [receiptsLoading, setReceiptsLoading] = useState(false);

    const handleSelectRun = useCallback(async (runId: string) => {
        if (selectedRunId === runId) { setSelectedRunId(null); setReceipts([]); return; }
        setSelectedRunId(runId);
        setReceiptsLoading(true);
        const data = await getReceipts(runId);
        setReceiptsLoading(false);
        setReceipts(data ?? []);
    }, [selectedRunId, getReceipts]);

    const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;

    const handleDownloadPdf = useCallback(async () => {
        if (!selectedRun || !receipts.length) return;
        const employees = buildPdfEmployees(receipts);
        const periodLabel = `${formatDateShort(selectedRun.periodStart)} — ${formatDateShort(selectedRun.periodEnd)}`;
        await generatePayrollPdf(employees, {
            companyName: company?.name ?? "Empresa",
            companyId: company?.id,
            payrollDate: selectedRun.periodEnd,
            periodStart: selectedRun.periodStart,
            periodLabel,
            bcvRate: selectedRun.exchangeRate,
            mondaysInMonth: receipts[0]?.calculationData?.mondaysInMonth ?? 4,
            logoUrl: company?.logoUrl,
            showLogoInPdf: company?.showLogoInPdf,
        });
    }, [selectedRun, receipts, company]);

    const handleDownloadSummaryPdf = useCallback(async () => {
        if (!selectedRun || !receipts.length) return;
        const periodLabel = `${formatDateShort(selectedRun.periodStart)} — ${formatDateShort(selectedRun.periodEnd)}`;
        const rows: PayrollSummaryEmployeeRow[] = receipts.map((r) => ({
            cedula:          r.employeeCedula,
            nombre:          r.employeeNombre,
            cargo:           r.employeeCargo,
            salarioMensual:  r.monthlySalary,
            totalEarnings:   r.totalEarnings,
            totalBonuses:    r.totalBonuses,
            totalDeductions: r.totalDeductions,
            net:             r.netPay,
            netUSD:          r.calculationData?.netUsd ?? 0,
        }));
        await generatePayrollSummaryPdf(rows, {
            companyName: company?.name ?? "Empresa",
            companyId:   company?.id,
            periodLabel,
            periodStart: selectedRun.periodStart,
            periodEnd:   selectedRun.periodEnd,
            bcvRate:     selectedRun.exchangeRate,
        });
    }, [selectedRun, receipts, company]);

    const subtitle = activeTab === "payroll"
        ? (company ? `${runs.length} período${runs.length !== 1 ? "s" : ""} · ${company.name}` : "Carga de períodos confirmados")
        : (company ? `Cesta ticket · ${company.name}` : "Cesta ticket");

    return (
        <div className="min-h-full bg-surface-2 flex flex-col">
            <PageHeader title="Historial de Nómina" subtitle={subtitle}>
                {activeTab === "payroll" && selectedRun && receipts.length > 0 && (
                    <div className="flex items-center gap-2">
                        <BaseButton.Root
                            variant="primary"
                            size="sm"
                            onClick={handleDownloadPdf}
                            leftIcon={<FileText size={14} />}
                        >
                            Descargar PDF
                        </BaseButton.Root>
                        <BaseButton.Root
                            variant="secondary"
                            size="sm"
                            onClick={handleDownloadSummaryPdf}
                            leftIcon={<FileBarChart size={14} />}
                        >
                            Reporte general
                        </BaseButton.Root>
                        <BaseButton.Root
                            variant="secondary"
                            size="sm"
                            onClick={() => exportReceiptsCsv(receipts, selectedRun, company?.name ?? "empresa")}
                            leftIcon={<Download size={14} />}
                        >
                            Exportar CSV
                        </BaseButton.Root>
                    </div>
                )}
            </PageHeader>

            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-[1100px] mx-auto space-y-5">
                    <HistoryTabs active={activeTab} onChange={setActiveTab} />

                    {activeTab === "payroll" ? (
                        loading ? (
                            <div className="flex items-center justify-center h-32 gap-2 border border-border-light rounded-xl bg-surface-1">
                                <Spinner />
                                <span className="font-mono text-[13px] uppercase tracking-widest text-[var(--text-tertiary)]">Cargando historial…</span>
                            </div>
                        ) : runs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 border border-border-light rounded-xl text-[var(--text-tertiary)] gap-3 bg-surface-1">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                                </svg>
                                <span className="font-mono text-[13px] uppercase tracking-widest">Sin nóminas confirmadas</span>
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
                                    />
                                )}
                            </div>
                        )
                    ) : (
                        <CestaTicketHistoryView
                            companyId={companyId}
                            company={company ?? null}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

function HistoryTabs({ active, onChange }: {
    active: HistoryTab;
    onChange: (t: HistoryTab) => void;
}) {
    const tabs: { id: HistoryTab; label: string }[] = [
        { id: "payroll", label: "Nóminas" },
        { id: "cesta",   label: "Cesta Ticket" },
    ];
    return (
        <div className="flex items-end border-b border-border-light gap-6">
            {tabs.map((t) => {
                const isActive = active === t.id;
                return (
                    <button
                        key={t.id}
                        onClick={() => onChange(t.id)}
                        className={[
                            "relative pb-2.5 -mb-px font-mono text-[12px] uppercase tracking-[0.18em] transition-colors duration-150",
                            isActive
                                ? "text-foreground border-b-2 border-primary-500"
                                : "text-[var(--text-tertiary)] border-b-2 border-transparent hover:text-foreground",
                        ].join(" ")}
                    >
                        {t.label}
                    </button>
                );
            })}
        </div>
    );
}
