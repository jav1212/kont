"use client";

// =============================================================================
// Modal: Generación del XML SENIAT — Relación de Retenciones ISLR (mensual).
//
// Muestra un selector año/mes que se autorrellena con los meses que tienen
// nóminas confirmadas. Al generar, suma los brutos por empleado para todas
// las runs del mes y arma el XML usando islr-xml.ts.
// =============================================================================

import { useCallback, useMemo, useState } from "react";
import { X, FileCode, Loader2 } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { notify } from "@/src/shared/frontend/notify";
import type { PayrollRun, PayrollReceipt } from "../hooks/use-payroll-history";
import type { Employee } from "../hooks/use-employee";
import { buildIslrXml, downloadXmlFile, type IslrXmlItem } from "../utils/islr-xml";

interface IslrXmlModalProps {
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

// Devuelve el año/mes (1-12) del periodEnd de una run.
function runYearMonth(run: PayrollRun): { year: number; month: number } {
    const [y, m] = run.periodEnd.split("-");
    return { year: Number(y), month: Number(m) };
}

export function IslrXmlModal({
    open, onClose, companyName, companyRif,
    runs, employees, getReceipts,
}: IslrXmlModalProps) {
    // ── Meses disponibles ────────────────────────────────────────────────────
    const availableMonths = useMemo(() => {
        const set = new Set<string>();
        runs.forEach((r) => {
            if (r.status !== "confirmed") return;
            const { year, month } = runYearMonth(r);
            set.add(`${year}-${String(month).padStart(2, "0")}`);
        });
        return Array.from(set).sort().reverse();   // más reciente primero
    }, [runs]);

    const [selected, setSelected] = useState<string | null>(null);
    const [loading,  setLoading]  = useState(false);

    // Default: el mes más reciente con nóminas
    const effectiveSelected = selected ?? availableMonths[0] ?? null;

    // ── Preview del mes seleccionado ─────────────────────────────────────────
    const preview = useMemo(() => {
        if (!effectiveSelected) return null;
        const [y, m] = effectiveSelected.split("-").map(Number);
        const monthRuns = runs.filter((r) => {
            if (r.status !== "confirmed") return false;
            const ym = runYearMonth(r);
            return ym.year === y && ym.month === m;
        });
        return {
            year:  y,
            month: m,
            runs:  monthRuns,
        };
    }, [effectiveSelected, runs]);

    // ── Generar y descargar XML ──────────────────────────────────────────────
    const handleGenerate = useCallback(async () => {
        if (!preview || !companyRif) {
            notify.error("Falta el RIF de la empresa o el período seleccionado.");
            return;
        }
        if (preview.runs.length === 0) {
            notify.error("No hay nóminas confirmadas en el mes seleccionado.");
            return;
        }

        setLoading(true);
        try {
            // 1) Trae los recibos de todas las runs del mes en paralelo.
            const allReceipts = await Promise.all(
                preview.runs.map(async (r) => (await getReceipts(r.id)) ?? [])
            );

            // 2) Acumula bruto por cédula.
            const brutoPorCedula = new Map<string, number>();
            allReceipts.flat().forEach((rcp) => {
                const gross = rcp.calculationData?.gross
                    ?? (rcp.totalEarnings + rcp.totalBonuses);
                brutoPorCedula.set(
                    rcp.employeeCedula,
                    (brutoPorCedula.get(rcp.employeeCedula) ?? 0) + gross,
                );
            });

            if (brutoPorCedula.size === 0) {
                notify.error("Ningún recibo encontrado en el mes seleccionado.");
                setLoading(false);
                return;
            }

            // 3) Empareja con cada empleado para obtener porcentajeIslr.
            //    Si el empleado fue eliminado, se asume 0 %.
            const empByCedula = new Map(employees.map((e) => [e.cedula, e]));
            const items: IslrXmlItem[] = Array.from(brutoPorCedula.entries())
                .map(([cedula, monto]) => ({
                    cedula,
                    nombre:         empByCedula.get(cedula)?.nombre,
                    montoOperacion: monto,
                    porcentajeIslr: empByCedula.get(cedula)?.porcentajeIslr ?? 0,
                }))
                // Orden estable por cédula numérica para consistencia entre exports.
                .sort((a, b) => a.cedula.localeCompare(b.cedula));

            // 4) FechaOperacion = el periodEnd más reciente del mes.
            const latestPeriodEnd = preview.runs
                .map((r) => r.periodEnd)
                .sort()
                .reverse()[0];

            // 5) Construye el XML y dispara la descarga.
            const xml = buildIslrXml({
                companyRif,
                year:  preview.year,
                month: preview.month,
                fechaOperacion: latestPeriodEnd,
                items,
            });

            const safeName = (companyName || "EMPRESA")
                .toUpperCase()
                .replace(/[^A-Z0-9]+/g, "")
                .slice(0, 30);
            const periodo = `${preview.year}${String(preview.month).padStart(2, "0")}`;
            downloadXmlFile(xml, `IvaISLR${periodo}SalariosOtros${safeName}.xml`);

            notify.success(`XML generado con ${items.length} empleado${items.length !== 1 ? "s" : ""}.`);
            onClose();
        } catch (err) {
            notify.error(err instanceof Error ? err.message : "Error al generar el XML.");
        } finally {
            setLoading(false);
        }
    }, [preview, companyRif, companyName, employees, getReceipts, onClose]);

    if (!open) return null;

    const noRif    = !companyRif || companyRif.trim() === "";
    const noMonths = availableMonths.length === 0;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md rounded-2xl border border-border-light bg-surface-1 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-500">
                            <FileCode size={16} strokeWidth={2} />
                        </div>
                        <div>
                            <h2 className="font-mono text-[14px] font-semibold text-foreground uppercase tracking-[0.10em]">
                                XML SENIAT
                            </h2>
                            <p className="font-sans text-[12px] text-[var(--text-tertiary)]">
                                Relación de Retenciones ISLR (mensual)
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
                <div className="px-5 py-5 space-y-4">
                    {noRif ? (
                        <div className="rounded-lg border border-warning/30 bg-warning/[0.05] text-text-warning px-4 py-3 text-[12.5px]">
                            La empresa no tiene RIF configurado. Asígnale uno antes de generar el XML.
                        </div>
                    ) : noMonths ? (
                        <div className="rounded-lg border border-border-light bg-surface-2 px-4 py-3 text-[12.5px] text-[var(--text-secondary)]">
                            No hay nóminas confirmadas. Confirma al menos una quincena para generar el reporte.
                        </div>
                    ) : (
                        <>
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

                            {preview && (
                                <div className="grid grid-cols-2 gap-2">
                                    <Stat label="Quincenas" value={preview.runs.length} hint={preview.runs.length === 1 ? "confirmada" : "confirmadas"} />
                                    <Stat label="Concepto" value="001" hint="Sueldos y salarios" />
                                </div>
                            )}

                            <div className="rounded-lg border border-border-light bg-surface-2/50 px-4 py-3 text-[12px] text-[var(--text-secondary)] font-sans">
                                Se sumarán los <strong>brutos</strong> de todas las nóminas confirmadas del mes y se usará el <strong>% ISLR</strong> de cada empleado (default 0).
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-5 py-4 border-t border-border-light">
                    <BaseButton.Root
                        variant="secondary"
                        size="sm"
                        onClick={onClose}
                        isDisabled={loading}
                    >
                        Cancelar
                    </BaseButton.Root>
                    <BaseButton.Root
                        variant="primary"
                        size="sm"
                        onClick={handleGenerate}
                        isDisabled={loading || noRif || noMonths}
                        leftIcon={loading ? <Loader2 className="animate-spin" size={14} /> : <FileCode size={14} />}
                    >
                        {loading ? "Generando…" : "Descargar XML"}
                    </BaseButton.Root>
                </div>
            </div>
        </div>
    );
}

// ── Mini-tile ────────────────────────────────────────────────────────────────

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
    return (
        <div className="rounded-lg border border-border-light bg-surface-2 px-3 py-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{label}</p>
            <p className="font-mono text-[15px] font-semibold tabular-nums text-foreground leading-tight mt-0.5">{value}</p>
            {hint && <p className="font-sans text-[10px] text-[var(--text-tertiary)] truncate">{hint}</p>}
        </div>
    );
}
