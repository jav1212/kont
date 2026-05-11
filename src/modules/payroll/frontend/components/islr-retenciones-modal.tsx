"use client";

// =============================================================================
// Modal: Reporte PDF "Retenciones por Mes - Año".
//
// Hermano del IslrXmlModal — comparte el patrón de selector mes/año y la
// agregación mensual de brutos × % ISLR, pero produce un PDF visual (no XML).
// Es tolerante a cédulas sin prefijo y no realiza validaciones SENIAT: es un
// reporte interno para conciliación y entrega al cliente.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { X, FileBarChart, Loader2 } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { notify } from "@/src/shared/frontend/notify";
import type { PayrollRun, PayrollReceipt } from "../hooks/use-payroll-history";
import type { Employee } from "../hooks/use-employee";
import {
    buildIslrMonthlyRows,
    type IslrMonthlyRow,
} from "../utils/islr-monthly-aggregator";
import { generateIslrRetencionesPdf } from "../utils/islr-retenciones-pdf";

interface IslrRetencionesModalProps {
    open:        boolean;
    onClose:     () => void;
    companyName: string;
    companyRif:  string | undefined;
    runs:        PayrollRun[];
    employees:   Employee[];
    getReceipts: (runId: string) => Promise<PayrollReceipt[] | null>;
}

const MES_LABELS = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const fmtVES = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function runYearMonth(run: PayrollRun): { year: number; month: number } {
    const [y, m] = run.periodEnd.split("-");
    return { year: Number(y), month: Number(m) };
}

type PreviewState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; rows: IslrMonthlyRow[] }
    | { status: "error"; message: string };

// =============================================================================

export function IslrRetencionesModal({
    open, onClose, companyName, companyRif,
    runs, employees, getReceipts,
}: IslrRetencionesModalProps) {
    // ── Meses disponibles ────────────────────────────────────────────────────
    const availableMonths = useMemo(() => {
        const set = new Set<string>();
        runs.forEach((r) => {
            if (r.status !== "confirmed") return;
            const { year, month } = runYearMonth(r);
            set.add(`${year}-${String(month).padStart(2, "0")}`);
        });
        return Array.from(set).sort().reverse();
    }, [runs]);

    const [selected, setSelected]         = useState<string | null>(null);
    const [previewState, setPreviewState] = useState<PreviewState>({ status: "idle" });
    const [downloading, setDownloading]   = useState(false);

    const effectiveSelected = selected ?? availableMonths[0] ?? null;
    const noMonths = availableMonths.length === 0;

    const periodMeta = useMemo(() => {
        if (!effectiveSelected) return null;
        const [y, m] = effectiveSelected.split("-").map(Number);
        return { year: y, month: m };
    }, [effectiveSelected]);

    // ── Carga + agregación al cambiar de mes ─────────────────────────────────
    useEffect(() => {
        if (!open || noMonths || !periodMeta) return;

        let cancelled = false;

        (async () => {
            if (cancelled) return;
            setPreviewState({ status: "loading" });
            try {
                const rows = await buildIslrMonthlyRows(
                    runs, employees, getReceipts,
                    periodMeta.year, periodMeta.month,
                );
                if (!cancelled) setPreviewState({ status: "ready", rows });
            } catch (e) {
                if (!cancelled) {
                    setPreviewState({
                        status:  "error",
                        message: e instanceof Error ? e.message : "Error al cargar la preview.",
                    });
                }
            }
        })();

        return () => { cancelled = true; };
    }, [open, periodMeta, runs, employees, getReceipts, noMonths]);

    // ── Datos derivados ──────────────────────────────────────────────────────
    const totals = useMemo(() => {
        if (previewState.status !== "ready") return { base: 0, retencion: 0 };
        return previewState.rows.reduce(
            (acc, r) => ({
                base:      acc.base + r.baseImponible,
                retencion: acc.retencion + r.retencion,
            }),
            { base: 0, retencion: 0 },
        );
    }, [previewState]);

    // ── Descarga PDF ─────────────────────────────────────────────────────────
    const handleDownload = useCallback(async () => {
        if (previewState.status !== "ready") {
            notify.error("La vista previa aún no está lista.");
            return;
        }
        if (!periodMeta) return;
        if (previewState.rows.length === 0) {
            notify.error("No hay empleados con pagos en el período seleccionado.");
            return;
        }

        setDownloading(true);
        try {
            await generateIslrRetencionesPdf(previewState.rows, {
                companyName,
                companyRif,
                year:  periodMeta.year,
                month: periodMeta.month,
            });
            const n = previewState.rows.length;
            notify.success(`Reporte generado con ${n} empleado${n !== 1 ? "s" : ""}.`);
            onClose();
        } catch (err) {
            notify.error(err instanceof Error ? err.message : "Error al generar el PDF.");
        } finally {
            setDownloading(false);
        }
    }, [previewState, periodMeta, companyName, companyRif, onClose]);

    if (!open) return null;

    const downloadDisabled =
        noMonths ||
        downloading ||
        previewState.status !== "ready" ||
        (previewState.status === "ready" && previewState.rows.length === 0);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-border-light bg-surface-1 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-500">
                            <FileBarChart size={16} strokeWidth={2} />
                        </div>
                        <div>
                            <h2 className="font-mono text-[14px] font-semibold text-foreground uppercase tracking-[0.10em]">
                                Reporte ISLR
                            </h2>
                            <p className="font-sans text-[12px] text-[var(--text-tertiary)]">
                                Retenciones por Mes - Año (PDF)
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                        aria-label="Cerrar"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
                    {noMonths ? (
                        <div className="rounded-lg border border-border-light bg-surface-2 px-4 py-3 text-[12.5px] text-[var(--text-secondary)]">
                            No hay nóminas confirmadas. Confirma al menos una quincena para generar el reporte.
                        </div>
                    ) : (
                        <>
                            {/* Selector */}
                            <label className="block">
                                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                                    Período
                                </span>
                                <div className="relative mt-1.5">
                                    <select
                                        value={effectiveSelected ?? ""}
                                        onChange={(e) => setSelected(e.target.value)}
                                        className="w-full h-10 px-3 pr-9 rounded-lg border border-border-default bg-surface-1 outline-none font-mono text-[13px] text-foreground hover:border-border-medium focus:border-primary-500 transition-colors appearance-none cursor-pointer"
                                    >
                                        {availableMonths.map((ym) => {
                                            const [y, m] = ym.split("-").map(Number);
                                            return (
                                                <option key={ym} value={ym}>
                                                    {MES_LABELS[m - 1]} {y}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            </label>

                            {/* Resumen */}
                            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border-light bg-border-light">
                                <SummaryCell
                                    label="Empleados"
                                    value={previewState.status === "ready" ? String(previewState.rows.length) : "—"}
                                />
                                <SummaryCell
                                    label="Total Base"
                                    value={previewState.status === "ready" ? `Bs. ${fmtVES(totals.base)}` : "—"}
                                    mono
                                />
                                <SummaryCell
                                    label="Total Retenido"
                                    value={previewState.status === "ready" ? `Bs. ${fmtVES(totals.retencion)}` : "—"}
                                    mono
                                    accent
                                />
                            </div>

                            {/* Preview / Estado */}
                            <PreviewPanel state={previewState} />

                            {/* Nota explicativa */}
                            <p className="text-[11.5px] text-[var(--text-tertiary)]">
                                Se sumarán los <strong>brutos</strong> de todas las nóminas confirmadas del mes y se aplicará el <strong>% ISLR</strong> de cada empleado (default 0). El PDF replica el formato estándar para conciliar contra el XML SENIAT.
                            </p>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-5 py-4 border-t border-border-light">
                    <BaseButton.Root
                        variant="secondary"
                        size="sm"
                        onClick={onClose}
                    >
                        Cancelar
                    </BaseButton.Root>
                    <BaseButton.Root
                        variant="primary"
                        size="sm"
                        onClick={handleDownload}
                        isDisabled={downloadDisabled}
                        leftIcon={
                            previewState.status === "loading" || downloading
                                ? <Loader2 className="animate-spin" size={14} />
                                : <FileBarChart size={14} />
                        }
                    >
                        {downloading
                            ? "Generando…"
                            : previewState.status === "loading"
                                ? "Cargando…"
                                : "Descargar PDF"}
                    </BaseButton.Root>
                </div>
            </div>
        </div>
    );
}

// ── Sub-componentes ─────────────────────────────────────────────────────────

function SummaryCell({ label, value, mono, accent }: {
    label: string;
    value: string;
    mono?: boolean;
    accent?: boolean;
}) {
    return (
        <div className="bg-surface-2/50 px-3 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                {label}
            </p>
            <p className={[
                "text-[13px] font-semibold tabular-nums leading-tight mt-0.5 truncate",
                mono ? "font-mono" : "font-sans",
                accent ? "text-primary-500" : "text-foreground",
            ].join(" ")}>
                {value}
            </p>
        </div>
    );
}

function PreviewPanel({ state }: { state: PreviewState }) {
    if (state.status === "loading") return <PreviewSkeleton />;

    if (state.status === "error") {
        return (
            <div className="rounded-lg border border-error/30 bg-error/[0.05] text-text-error px-4 py-3 text-[12.5px]">
                {state.message}
            </div>
        );
    }

    if (state.status !== "ready") return null;

    if (state.rows.length === 0) {
        return (
            <div className="rounded-lg border border-border-light bg-surface-2 px-4 py-6 text-center text-[12.5px] text-[var(--text-secondary)]">
                No hay recibos confirmados en el mes seleccionado.
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-border-light overflow-hidden">
            <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                <table className="w-full text-[12px]">
                    <thead className="sticky top-0 bg-surface-2 z-10">
                        <tr className="border-b border-border-light">
                            <Th>Cédula</Th>
                            <Th>Empleado</Th>
                            <Th align="right">Base VES</Th>
                            <Th align="right">% ISLR</Th>
                            <Th align="right">Retenido VES</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {state.rows.map((row, idx) => (
                            <tr
                                key={row.cedula}
                                className={[
                                    "border-b border-border-light last:border-b-0",
                                    idx % 2 === 1 ? "bg-surface-2/30" : "",
                                ].join(" ")}
                            >
                                <Td mono>{row.cedula}</Td>
                                <Td>{row.nombre}</Td>
                                <Td mono align="right">{fmtVES(row.baseImponible)}</Td>
                                <Td mono align="right">{row.porcentajeIslr.toFixed(2)}</Td>
                                <Td mono align="right" bold>{fmtVES(row.retencion)}</Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function PreviewSkeleton() {
    return (
        <div className="rounded-lg border border-border-light overflow-hidden">
            <div className="h-9 bg-surface-2 border-b border-border-light" />
            <div className="space-y-px bg-border-light">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-9 bg-surface-1 px-3 flex items-center gap-3">
                        <div className="h-3 w-24 rounded bg-surface-2 animate-pulse" />
                        <div className="h-3 flex-1 rounded bg-surface-2 animate-pulse" />
                        <div className="h-3 w-20 rounded bg-surface-2 animate-pulse" />
                        <div className="h-3 w-12 rounded bg-surface-2 animate-pulse" />
                        <div className="h-3 w-20 rounded bg-surface-2 animate-pulse" />
                    </div>
                ))}
            </div>
        </div>
    );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" | "center" }) {
    return (
        <th
            className={[
                "px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-semibold whitespace-nowrap",
                align === "right"  ? "text-right"  : "",
                align === "center" ? "text-center" : "",
            ].join(" ")}
        >
            {children}
        </th>
    );
}

function Td({
    children, align = "left", mono, bold,
}: {
    children?: React.ReactNode;
    align?:    "left" | "right" | "center";
    mono?:     boolean;
    bold?:     boolean;
}) {
    return (
        <td
            className={[
                "px-3 py-2 align-middle text-foreground",
                mono ? "font-mono tabular-nums" : "",
                bold ? "font-semibold" : "",
                align === "right"  ? "text-right"  : "",
                align === "center" ? "text-center" : "",
            ].join(" ")}
        >
            {children}
        </td>
    );
}
