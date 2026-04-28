"use client";

import { useCallback, useState } from "react";
import { FileText } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import {
    useCestaTicketHistory,
    type CestaTicketRun,
    type CestaTicketReceipt,
} from "../hooks/use-cesta-ticket-history";
import { generateCestaTicketPdf } from "../utils/cesta-ticket-pdf";

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

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

const Spinner = () => (
    <svg className="animate-spin text-[var(--text-tertiary)]" width="13" height="13" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

function CtRunRow({
    run, employeeCount, totalUsd, totalVes, isSelected, onSelect,
}: {
    run: CestaTicketRun;
    employeeCount: number | null;
    totalUsd: number | null;
    totalVes: number | null;
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
                <span className="font-mono text-[12px] text-[var(--text-tertiary)] uppercase tracking-widest">
                    {run.status === "draft" ? "Guardado" : "Confirmada"}: {formatDateTime(run.confirmedAt)}
                </span>
            </div>
            <div className="flex items-center gap-6 tabular-nums">
                <div className="flex flex-col items-end gap-0.5">
                    <span className="font-mono text-[11px] uppercase text-[var(--text-tertiary)] tracking-widest">Tasa BCV</span>
                    <span className="font-mono text-[13px] text-[var(--text-secondary)]">{fmt(run.exchangeRate)}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                    <span className="font-mono text-[11px] uppercase text-[var(--text-tertiary)] tracking-widest">$/empleado</span>
                    <span className="font-mono text-[13px] text-[var(--text-secondary)]">${fmt(run.montoUsd)}</span>
                </div>
                {employeeCount !== null && (
                    <div className="flex flex-col items-end gap-0.5">
                        <span className="font-mono text-[11px] uppercase text-[var(--text-tertiary)] tracking-widest">Empleados</span>
                        <span className="font-mono text-[13px] text-[var(--text-secondary)]">{employeeCount}</span>
                    </div>
                )}
                {totalUsd !== null && totalVes !== null && (
                    <div className="flex flex-col items-end gap-0.5">
                        <span className="font-mono text-[11px] uppercase text-[var(--text-tertiary)] tracking-widest">Total</span>
                        <span className="font-mono text-[13px] tabular-nums text-primary-500 font-semibold">${fmt(totalUsd)}</span>
                        <span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">Bs. {fmt(totalVes)}</span>
                    </div>
                )}
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

function CtReceiptsPanel({ receipts, loading }: {
    receipts: CestaTicketReceipt[]; loading: boolean;
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

    const totUsd = receipts.reduce((s, r) => s + r.montoUsd, 0);
    const totVes = receipts.reduce((s, r) => s + r.montoVes, 0);

    return (
        <div className="space-y-3">
            <div className="overflow-x-auto border border-border-light rounded-xl bg-surface-1">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border-light bg-surface-2">
                            {["Empleado", "Cargo", "Monto USD", "Monto VES"].map((h) => (
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
                                <td className="px-4 py-3 font-mono text-[13px] tabular-nums text-[var(--text-secondary)]">${fmt(r.montoUsd)}</td>
                                <td className="px-4 py-3 font-mono text-[14px] font-semibold tabular-nums text-primary-500">Bs. {fmt(r.montoVes)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex justify-end gap-8 px-5 py-3 border border-border-light rounded-xl bg-surface-1">
                <div className="flex flex-col items-end gap-0.5">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-tertiary)]">Total USD</span>
                    <span className="font-mono text-[14px] text-[var(--text-secondary)] tabular-nums">${fmt(totUsd)}</span>
                </div>
                <div className="w-px bg-border-light" />
                <div className="flex flex-col items-end gap-0.5">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-tertiary)]">Total VES</span>
                    <span className="font-mono text-[18px] font-black text-primary-500 tabular-nums">Bs. {fmt(totVes)}</span>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// VIEW
// ============================================================================

export interface CestaTicketHistoryCompany {
    name?:           string | null;
    id?:             string | null;
    logoUrl?:        string | null;
    showLogoInPdf?:  boolean | null;
}

export function CestaTicketHistoryView({
    companyId,
    company,
}: {
    companyId: string | null;
    company:   CestaTicketHistoryCompany | null;
}) {
    const { runs, loading, getReceipts } = useCestaTicketHistory(companyId);

    const [selectedRunId,      setSelectedRunId]      = useState<string | null>(null);
    const [receipts,           setReceipts]           = useState<CestaTicketReceipt[]>([]);
    const [receiptsLoading,    setReceiptsLoading]    = useState(false);

    const handleSelectRun = useCallback(async (runId: string) => {
        if (selectedRunId === runId) { setSelectedRunId(null); setReceipts([]); return; }
        setSelectedRunId(runId);
        setReceiptsLoading(true);
        const data = await getReceipts(runId);
        setReceiptsLoading(false);
        setReceipts(data ?? []);
    }, [selectedRunId, getReceipts]);

    const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;

    const handleDownloadPdf = useCallback(() => {
        if (!selectedRun || !receipts.length) return;
        const periodLabel = `${formatDateShort(selectedRun.periodStart)} — ${formatDateShort(selectedRun.periodEnd)}`;
        generateCestaTicketPdf(
            receipts.map((r) => ({
                cedula: r.employeeCedula,
                nombre: r.employeeNombre,
                cargo:  r.employeeCargo,
                estado: "activo",
            })),
            {
                companyName:    company?.name ?? "",
                companyId:      company?.id ?? undefined,
                periodLabel,
                payrollDate:    selectedRun.periodEnd,
                montoUSD:       selectedRun.montoUsd,
                bcvRate:        selectedRun.exchangeRate,
                logoUrl:        company?.logoUrl ?? undefined,
                showLogoInPdf:  company?.showLogoInPdf ?? undefined,
            },
        );
    }, [selectedRun, receipts, company]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-32 gap-2 border border-border-light rounded-xl bg-surface-1">
                <Spinner />
                <span className="font-mono text-[13px] uppercase tracking-widest text-[var(--text-tertiary)]">Cargando historial…</span>
            </div>
        );
    }

    if (runs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-40 border border-border-light rounded-xl text-[var(--text-tertiary)] gap-3 bg-surface-1">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                <span className="font-mono text-[13px] uppercase tracking-widest">Sin cesta tickets guardadas</span>
            </div>
        );
    }

    // Para mostrar empleados/totales del selected run en su row, derivamos desde receipts cargados.
    const selectedReceiptsCount = selectedRun ? receipts.length : 0;
    const selectedTotalUsd      = selectedRun ? selectedReceiptsCount * selectedRun.montoUsd : 0;
    const selectedTotalVes      = selectedRun ? selectedTotalUsd * selectedRun.exchangeRate : 0;

    return (
        <div className="space-y-4">
            {selectedRun && receipts.length > 0 && (
                <div className="flex justify-end">
                    <BaseButton.Root
                        variant="primary"
                        size="sm"
                        onClick={handleDownloadPdf}
                        leftIcon={<FileText size={14} />}
                    >
                        Re-exportar PDF
                    </BaseButton.Root>
                </div>
            )}

            <div className="border border-border-light rounded-xl overflow-hidden bg-surface-1">
                {runs.map((run) => {
                    const isSelected = selectedRunId === run.id;
                    return (
                        <CtRunRow
                            key={run.id}
                            run={run}
                            employeeCount={isSelected && !receiptsLoading ? selectedReceiptsCount : null}
                            totalUsd={isSelected && !receiptsLoading ? selectedTotalUsd : null}
                            totalVes={isSelected && !receiptsLoading ? selectedTotalVes : null}
                            isSelected={isSelected}
                            onSelect={handleSelectRun}
                        />
                    );
                })}
            </div>

            {selectedRunId && (
                <CtReceiptsPanel
                    receipts={receipts}
                    loading={receiptsLoading}
                />
            )}
        </div>
    );
}
