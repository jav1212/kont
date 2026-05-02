"use client";

// =============================================================================
// Modal: Generación del XML SENIAT — Relación de Retenciones ISLR (mensual).
//
// Flujo:
//   1) Selector año/mes con los meses que tienen nóminas confirmadas.
//   2) Al cambiar el mes (o al abrir) se cargan los recibos en paralelo, se
//      acumula el bruto por cédula y se valida cada cédula → preview en vivo.
//   3) Tab "Datos": cabecera (RIF Agente, Período, Fecha Op., Concepto) +
//      tabla por empleado + total.
//   4) Tab "XML": el mismo XML que se descarga, indentado para revisión.
//   5) "Descargar XML" sólo arma el XML (compacto) y dispara la descarga —
//      sin fetch, ya que la preview tiene los datos listos.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { X, FileCode, Loader2, AlertTriangle } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseBadge } from "@/src/shared/frontend/components/base-badge";
import { notify } from "@/src/shared/frontend/notify";
import type { PayrollRun, PayrollReceipt } from "../hooks/use-payroll-history";
import type { Employee } from "../hooks/use-employee";
import {
    buildIslrXml,
    downloadXmlFile,
    formatRifAgente,
    formatRifRetenido,
    formatFechaOperacion,
    lastDayOfMonth,
    prettifyIslrXml,
    type IslrXmlItem,
} from "../utils/islr-xml";

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

const fmtVES = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function runYearMonth(run: PayrollRun): { year: number; month: number } {
    const [y, m] = run.periodEnd.split("-");
    return { year: Number(y), month: Number(m) };
}

// ── Tipos internos ───────────────────────────────────────────────────────────

type PreviewRow = IslrXmlItem & {
    rifRetenido: string | null;   // null si formatRifRetenido lanzó
    rifError?:   string;
};

type PreviewState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; rows: PreviewRow[]; latestPeriodEnd: string }
    | { status: "error"; message: string };

// =============================================================================

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
        return Array.from(set).sort().reverse();
    }, [runs]);

    const [selected, setSelected]       = useState<string | null>(null);
    const [activeTab, setActiveTab]     = useState<"datos" | "xml">("datos");
    const [previewState, setPreviewState] = useState<PreviewState>({ status: "idle" });

    const effectiveSelected = selected ?? availableMonths[0] ?? null;

    const noRif    = !companyRif || companyRif.trim() === "";
    const noMonths = availableMonths.length === 0;

    // ── Período derivado del seleccionado ────────────────────────────────────
    const periodMeta = useMemo(() => {
        if (!effectiveSelected) return null;
        const [y, m] = effectiveSelected.split("-").map(Number);
        const monthRuns = runs.filter((r) => {
            if (r.status !== "confirmed") return false;
            const ym = runYearMonth(r);
            return ym.year === y && ym.month === m;
        });
        return { year: y, month: m, runs: monthRuns };
    }, [effectiveSelected, runs]);

    // ── Carga de recibos + construcción de filas (auto al cambiar mes) ───────
    useEffect(() => {
        if (!open || noRif || noMonths || !periodMeta) return;

        let cancelled = false;

        // Tanto el reset a "loading" como el resultado final viven dentro del
        // IIFE async para evitar setState síncrono en el body del effect.
        (async () => {
            if (cancelled) return;
            setPreviewState({ status: "loading" });

            try {
                const allReceipts = await Promise.all(
                    periodMeta.runs.map(async (r) => (await getReceipts(r.id)) ?? []),
                );
                if (cancelled) return;

                // Bruto acumulado por cédula
                const brutoPorCedula = new Map<string, number>();
                allReceipts.flat().forEach((rcp) => {
                    const gross = rcp.calculationData?.gross
                        ?? (rcp.totalEarnings + rcp.totalBonuses);
                    brutoPorCedula.set(
                        rcp.employeeCedula,
                        (brutoPorCedula.get(rcp.employeeCedula) ?? 0) + gross,
                    );
                });

                // Empareja con empleados y valida cédula
                const empByCedula = new Map(employees.map((e) => [e.cedula, e]));
                const rows: PreviewRow[] = Array.from(brutoPorCedula.entries())
                    .map(([cedula, monto]): PreviewRow => {
                        const emp = empByCedula.get(cedula);
                        const base: IslrXmlItem = {
                            cedula,
                            nombre:         emp?.nombre,
                            montoOperacion: monto,
                            porcentajeIslr: emp?.porcentajeIslr ?? 0,
                        };
                        try {
                            return { ...base, rifRetenido: formatRifRetenido(cedula, emp?.nombre) };
                        } catch (e) {
                            return {
                                ...base,
                                rifRetenido: null,
                                rifError: e instanceof Error ? e.message : "Cédula inválida",
                            };
                        }
                    })
                    .sort((a, b) => a.cedula.localeCompare(b.cedula));

                const latestPeriodEnd = periodMeta.runs
                    .map((r) => r.periodEnd)
                    .sort()
                    .reverse()[0]
                    ?? lastDayOfMonth(periodMeta.year, periodMeta.month);

                if (!cancelled) {
                    setPreviewState({ status: "ready", rows, latestPeriodEnd });
                }
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
    }, [open, periodMeta, employees, getReceipts, noRif, noMonths]);

    // ── Datos derivados de la preview ────────────────────────────────────────
    const totalBruto = useMemo(() => {
        if (previewState.status !== "ready") return 0;
        return previewState.rows.reduce((acc, r) => acc + r.montoOperacion, 0);
    }, [previewState]);

    const invalidRows = useMemo(() => {
        if (previewState.status !== "ready") return [];
        return previewState.rows.filter((r) => r.rifError);
    }, [previewState]);

    // RifAgente formateado para el header (no lanza si companyRif es válido)
    const rifAgenteDisplay = useMemo(() => {
        if (!companyRif) return "—";
        try { return formatRifAgente(companyRif); } catch { return "—"; }
    }, [companyRif]);

    // XML pretty para el tab "XML"
    const previewXml = useMemo(() => {
        if (previewState.status !== "ready" || !companyRif || !periodMeta) return null;
        if (invalidRows.length > 0 || previewState.rows.length === 0) return null;

        try {
            const compact = buildIslrXml({
                companyRif,
                year:           periodMeta.year,
                month:          periodMeta.month,
                fechaOperacion: previewState.latestPeriodEnd,
                items:          previewState.rows.map(stripPreviewMeta),
            });
            return prettifyIslrXml(compact);
        } catch {
            return null;
        }
    }, [previewState, companyRif, periodMeta, invalidRows]);

    // ── Descarga ─────────────────────────────────────────────────────────────
    const handleGenerate = useCallback(() => {
        if (previewState.status !== "ready") {
            notify.error("La vista previa aún no está lista.");
            return;
        }
        if (!companyRif || !periodMeta) {
            notify.error("Falta el RIF de la empresa o el período seleccionado.");
            return;
        }
        if (previewState.rows.length === 0) {
            notify.error("No hay empleados con pagos en el período seleccionado.");
            return;
        }
        if (invalidRows.length > 0) {
            const labels = invalidRows.map((r) => r.nombre ?? r.cedula).join(", ");
            notify.error(`Corrige las cédulas inválidas antes de descargar: ${labels}.`);
            return;
        }

        try {
            const xml = buildIslrXml({
                companyRif,
                year:           periodMeta.year,
                month:          periodMeta.month,
                fechaOperacion: previewState.latestPeriodEnd,
                items:          previewState.rows.map(stripPreviewMeta),
            });

            const safeName = (companyName || "EMPRESA")
                .toUpperCase()
                .replace(/[^A-Z0-9]+/g, "")
                .slice(0, 30);
            const periodo = `${periodMeta.year}${String(periodMeta.month).padStart(2, "0")}`;
            downloadXmlFile(xml, `IvaISLR${periodo}SalariosOtros${safeName}.xml`);

            const n = previewState.rows.length;
            notify.success(`XML generado con ${n} empleado${n !== 1 ? "s" : ""}.`);
            onClose();
        } catch (err) {
            notify.error(err instanceof Error ? err.message : "Error al generar el XML.");
        }
    }, [previewState, companyRif, periodMeta, invalidRows, companyName, onClose]);

    if (!open) return null;

    const fechaOpDisplay = previewState.status === "ready"
        ? formatFechaOperacion(previewState.latestPeriodEnd)
        : "—";
    const periodoNumeric = periodMeta
        ? `${periodMeta.year}${String(periodMeta.month).padStart(2, "0")}`
        : "—";

    const downloadDisabled =
        noRif ||
        noMonths ||
        previewState.status !== "ready" ||
        invalidRows.length > 0 ||
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
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
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

                            {/* Header info bar — datos globales del XML */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden rounded-lg border border-border-light bg-border-light">
                                <InfoCell label="RIF Agente" value={rifAgenteDisplay} mono />
                                <InfoCell label="Período"    value={periodoNumeric} mono />
                                <InfoCell label="Fecha Op."  value={fechaOpDisplay} mono />
                                <InfoCell label="Concepto"   value="001" hint="Sueldos y salarios" mono />
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b border-border-light">
                                <TabButton active={activeTab === "datos"} onClick={() => setActiveTab("datos")}>
                                    Datos
                                </TabButton>
                                <TabButton
                                    active={activeTab === "xml"}
                                    onClick={() => setActiveTab("xml")}
                                    disabled={previewState.status !== "ready" || invalidRows.length > 0 || (previewState.status === "ready" && previewState.rows.length === 0)}
                                >
                                    XML
                                </TabButton>
                            </div>

                            {/* Tab content */}
                            {activeTab === "datos" ? (
                                <DatosPanel state={previewState} totalBruto={totalBruto} />
                            ) : (
                                <XmlPanel xml={previewXml} hasInvalid={invalidRows.length > 0} />
                            )}

                            {/* Aviso de cédulas inválidas */}
                            {previewState.status === "ready" && invalidRows.length > 0 && (
                                <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/[0.05] text-text-error px-4 py-3 text-[12.5px]">
                                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="font-medium">
                                            Hay {invalidRows.length} empleado{invalidRows.length !== 1 ? "s" : ""} con cédula incompleta.
                                        </p>
                                        <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                                            Edita su cédula en /payroll/employees para incluir los 9 dígitos (cédula + dígito verificador).
                                            Mientras tanto la descarga del XML está deshabilitada.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Nota explicativa */}
                            <p className="text-[11.5px] text-[var(--text-tertiary)]">
                                Se sumarán los <strong>brutos</strong> de todas las nóminas confirmadas del mes y se usará el <strong>% ISLR</strong> de cada empleado (default 0).
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
                        onClick={handleGenerate}
                        isDisabled={downloadDisabled}
                        leftIcon={
                            previewState.status === "loading"
                                ? <Loader2 className="animate-spin" size={14} />
                                : <FileCode size={14} />
                        }
                    >
                        {previewState.status === "loading" ? "Cargando…" : "Descargar XML"}
                    </BaseButton.Root>
                </div>
            </div>
        </div>
    );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function stripPreviewMeta(r: PreviewRow): IslrXmlItem {
    const { cedula, nombre, montoOperacion, porcentajeIslr } = r;
    return { cedula, nombre, montoOperacion, porcentajeIslr };
}

function InfoCell({ label, value, hint, mono }: {
    label: string;
    value: string;
    hint?: string;
    mono?: boolean;
}) {
    return (
        <div className="bg-surface-2/50 px-3 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                {label}
            </p>
            <p className={[
                "text-[13px] font-semibold tabular-nums text-foreground leading-tight mt-0.5 truncate",
                mono ? "font-mono" : "font-sans",
            ].join(" ")}>
                {value}
            </p>
            {hint && <p className="font-sans text-[10px] text-[var(--text-tertiary)] truncate">{hint}</p>}
        </div>
    );
}

function TabButton({
    active, onClick, disabled, children,
}: {
    active:    boolean;
    onClick:   () => void;
    disabled?: boolean;
    children:  React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={[
                "px-4 h-9 -mb-px font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
                "border-b-2",
                active
                    ? "border-primary-500 text-foreground"
                    : "border-transparent text-[var(--text-tertiary)] hover:text-foreground",
                disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
            ].join(" ")}
        >
            {children}
        </button>
    );
}

function DatosPanel({ state, totalBruto }: {
    state:      PreviewState;
    totalBruto: number;
}) {
    if (state.status === "loading") {
        return <DatosSkeleton />;
    }
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
                            <Th>RIF retenido</Th>
                            <Th>Empleado</Th>
                            <Th align="right">Monto VES</Th>
                            <Th align="right">% ISLR</Th>
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
                                <Td mono>
                                    {row.rifRetenido ?? (
                                        <BaseBadge variant="error" size="sm" icon={AlertTriangle} title={row.rifError}>
                                            Inválida
                                        </BaseBadge>
                                    )}
                                </Td>
                                <Td>
                                    {row.nombre ?? (
                                        <span className="text-[var(--text-tertiary)] italic">— sin empleado —</span>
                                    )}
                                </Td>
                                <Td mono align="right">{fmtVES(row.montoOperacion)}</Td>
                                <Td mono align="right">{row.porcentajeIslr.toFixed(2)}</Td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-surface-2 sticky bottom-0">
                        <tr>
                            <Td colSpan={3} align="right" mono>
                                <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[10px]">
                                    Total ({state.rows.length} empleado{state.rows.length !== 1 ? "s" : ""})
                                </span>
                            </Td>
                            <Td mono align="right" bold>{fmtVES(totalBruto)}</Td>
                            <Td />
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}

function XmlPanel({ xml, hasInvalid }: { xml: string | null; hasInvalid: boolean }) {
    if (hasInvalid) {
        return (
            <div className="rounded-lg border border-border-light bg-surface-2/50 px-4 py-6 text-center text-[12.5px] text-[var(--text-secondary)]">
                El XML no se puede generar todavía: hay cédulas inválidas en la pestaña <strong>Datos</strong>.
            </div>
        );
    }
    if (!xml) {
        return <DatosSkeleton />;
    }
    return (
        <pre className="rounded-lg border border-border-light bg-surface-2/50 px-4 py-3 max-h-[340px] overflow-auto font-mono text-[11.5px] leading-[1.55] text-foreground whitespace-pre">
            {xml}
        </pre>
    );
}

function DatosSkeleton() {
    return (
        <div className="rounded-lg border border-border-light overflow-hidden">
            <div className="h-9 bg-surface-2 border-b border-border-light" />
            <div className="space-y-px bg-border-light">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-9 bg-surface-1 px-3 flex items-center gap-3">
                        <div className="h-3 w-24 rounded bg-surface-2 animate-pulse" />
                        <div className="h-3 w-24 rounded bg-surface-2 animate-pulse" />
                        <div className="h-3 flex-1 rounded bg-surface-2 animate-pulse" />
                        <div className="h-3 w-16 rounded bg-surface-2 animate-pulse" />
                        <div className="h-3 w-10 rounded bg-surface-2 animate-pulse" />
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
    children, align = "left", mono, bold, colSpan,
}: {
    children?: React.ReactNode;
    align?:    "left" | "right" | "center";
    mono?:     boolean;
    bold?:     boolean;
    colSpan?:  number;
}) {
    return (
        <td
            colSpan={colSpan}
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
