"use client";

import { Fragment, useMemo } from "react";
import { Trash2, RefreshCw, Check, ChevronRight, ArrowLeft, Loader2 } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import type {
    RandomSalesPreview,
    RandomSalesPreviewLine,
} from "@/src/modules/inventory/frontend/hooks/use-inventory";

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtQty = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

const fmtFactor = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export interface GenStepPreviewProps {
    preview: RandomSalesPreview | null;
    lines: RandomSalesPreviewLine[];
    loading: boolean;
    saving: boolean;
    expandedRows: Set<number>;
    onToggleRow: (idx: number) => void;
    onUpdateQty: (idx: number, qty: number) => void;
    onRemoveLine: (idx: number) => void;
    onRegenerate: () => void;
    onBack: () => void;
    onConfirmRequest: () => void;
}

export function GenStepPreview({
    preview,
    lines,
    loading,
    saving,
    expandedRows,
    onToggleRow,
    onUpdateQty,
    onRemoveLine,
    onRegenerate,
    onBack,
    onConfirmRequest,
}: GenStepPreviewProps) {
    const sumSinIVA = useMemo(
        () => lines.reduce((s, l) => s + l.totalSinIVA, 0),
        [lines],
    );
    const sumIVA = useMemo(
        () => lines.reduce((s, l) => s + l.iva, 0),
        [lines],
    );
    const sumConIVA = useMemo(
        () => lines.reduce((s, l) => s + l.totalConIVA, 0),
        [lines],
    );
    const sumAutoconsumo = useMemo(
        () => lines.filter((l) => l.tipo === "autoconsumo").reduce((s, l) => s + l.totalSinIVA, 0),
        [lines],
    );
    const sumSalidas = useMemo(
        () => lines.filter((l) => l.tipo === "salida").reduce((s, l) => s + l.totalSinIVA, 0),
        [lines],
    );

    const targetBs = preview?.targetBs ?? 0;
    const inboundBs = preview?.inboundTotalBs ?? 0;
    const salidasTargetBs = preview?.salidasTotalBs ?? 0;
    const autoTargetBs = preview?.autoconsumoTotalBs ?? 0;
    const drift = sumSinIVA - targetBs;
    const isAutoActive = (preview?.autoconsumoTotalBs ?? 0) > 0;

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-4">
                    <header className="mb-2 text-center">
                        <h2 className="font-mono text-[22px] font-black tracking-tight text-foreground leading-tight">
                            Revisa la propuesta y ajusta lo que necesites
                        </h2>
                        <p className="font-mono text-[14px] text-[var(--text-secondary)] mt-2 leading-relaxed max-w-2xl mx-auto">
                            El sistema distribuyó el target en líneas aleatorias. Puedes editar cantidades, eliminar líneas o regenerar con otra distribución.
                        </p>
                    </header>

                    {loading && !preview && (
                        <div className="rounded-xl border border-border-light bg-surface-1 px-6 py-16 flex flex-col items-center justify-center gap-3">
                            <Loader2 size={28} className="animate-spin text-primary-500" />
                            <p className="font-mono text-[13px] text-[var(--text-secondary)]">
                                Generando distribución…
                            </p>
                        </div>
                    )}

                    {preview && (
                        <div className={`grid grid-cols-1 ${isAutoActive ? "md:grid-cols-5" : "md:grid-cols-4"} gap-3`}>
                            <SummaryCard
                                label="Entradas del periodo"
                                value={`Bs ${fmtN(inboundBs)}`}
                            />
                            <SummaryCard
                                label="Target total (S/IVA)"
                                value={`Bs ${fmtN(targetBs)}`}
                                highlight
                            />
                            {isAutoActive && (
                                <SummaryCard
                                    label="Reservado a salidas"
                                    value={`Bs ${fmtN(salidasTargetBs)}`}
                                    sub={`Preview: ${fmtN(sumSalidas)} Bs`}
                                />
                            )}
                            {isAutoActive && (
                                <SummaryCard
                                    label="Reservado a autoconsumo"
                                    value={`Bs ${fmtN(autoTargetBs)}`}
                                    tone="warn"
                                    sub={`Preview: ${fmtN(sumAutoconsumo)} Bs`}
                                />
                            )}
                            <SummaryCard
                                label="Suma actual del preview"
                                value={`Bs ${fmtN(sumSinIVA)}`}
                                tone={Math.abs(drift) < 0.01 ? "ok" : "warn"}
                                sub={Math.abs(drift) < 0.01
                                    ? "Coincide con el target"
                                    : `Δ ${drift >= 0 ? "+" : ""}${fmtN(drift)} Bs`}
                            />
                            {!isAutoActive && (
                                <SummaryCard
                                    label={`Markup ${preview.markupPct}%`}
                                    value={`× ${fmtFactor(preview.factor)}`}
                                    sub={`precio = costo × ${preview.factor.toFixed(2)} · seed ${preview.seed}`}
                                />
                            )}
                        </div>
                    )}

                    {preview && (
                        <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm overflow-hidden">
                            <div className="px-5 py-3 border-b border-border-light flex items-center justify-between gap-3 flex-wrap">
                                <p className="text-[12px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-mono">
                                    {lines.length} {lines.length === 1 ? "línea propuesta" : "líneas propuestas"}
                                    {isAutoActive && (
                                        <span className="ml-2 text-[var(--text-secondary)]">
                                            · {lines.filter((l) => l.tipo === "salida").length} venta · {lines.filter((l) => l.tipo === "autoconsumo").length} autoconsumo
                                        </span>
                                    )}
                                </p>
                                <BaseButton.Root
                                    onClick={onRegenerate}
                                    variant="ghost"
                                    size="sm"
                                    loading={loading}
                                    leftIcon={<RefreshCw size={13} />}
                                >
                                    Regenerar
                                </BaseButton.Root>
                            </div>

                            {lines.length === 0 ? (
                                <div className="px-5 py-12 text-center text-[13px] text-[var(--text-tertiary)] font-mono">
                                    Sin líneas — regenera o vuelve atrás a cambiar los parámetros.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[13px] font-mono">
                                        <thead>
                                            <tr className="border-b border-border-light">
                                                {[
                                                    "",
                                                    "Tipo",
                                                    "Fecha",
                                                    "Producto",
                                                    "IVA",
                                                    "Cant.",
                                                    "Costo U.",
                                                    "Precio venta U.",
                                                    "Factor",
                                                    "Total S/IVA",
                                                    "IVA Bs.",
                                                    "Total c/IVA",
                                                    "",
                                                ].map((h, i) => (
                                                    <th
                                                        key={i}
                                                        className="px-3 py-2.5 text-left text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal whitespace-nowrap"
                                                    >
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {lines.map((l, idx) => {
                                                const shortfall = Math.max(0, l.quantity - l.currentStock);
                                                const hasShortfall = shortfall > 0;
                                                const isAuto = l.tipo === "autoconsumo";
                                                const isExpanded = expandedRows.has(idx);
                                                const lineFactor = l.unitCost > 0 ? l.precioVentaUnitario / l.unitCost : 0;
                                                const globalFactor = preview?.factor ?? 0;
                                                const isDiffSink = globalFactor > 0 && Math.abs(lineFactor - globalFactor) / globalFactor > 0.01;
                                                const ivaPct = l.vatType === "general" ? 0.16 : 0;
                                                return (
                                                    <Fragment key={`${l.productId}-${l.tipo}-${idx}`}>
                                                        <tr
                                                            className={[
                                                                "border-b border-border-light/50 transition-colors",
                                                                isAuto ? "bg-amber-500/[0.04] hover:bg-amber-500/[0.08]" : "hover:bg-surface-2",
                                                            ].join(" ")}
                                                        >
                                                            <td className="px-2 py-2.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onToggleRow(idx)}
                                                                    className={[
                                                                        "inline-flex items-center justify-center w-6 h-6 rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-all",
                                                                        isExpanded ? "rotate-90 text-foreground" : "",
                                                                    ].join(" ")}
                                                                    aria-label={isExpanded ? "Colapsar fórmula" : "Ver fórmula"}
                                                                    title={isExpanded ? "Colapsar fórmula" : "Ver fórmula"}
                                                                >
                                                                    <ChevronRight size={14} strokeWidth={1.8} />
                                                                </button>
                                                            </td>
                                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                                                <span
                                                                    className={[
                                                                        "inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium border",
                                                                        isAuto
                                                                            ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
                                                                            : "border-border-light text-[var(--text-secondary)]",
                                                                    ].join(" ")}
                                                                >
                                                                    {isAuto ? "Autoconsumo" : "Venta"}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">
                                                                {l.date}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-foreground max-w-[300px]">
                                                                <div className="truncate">
                                                                    {l.productCode ? (
                                                                        <span className="text-[var(--text-tertiary)]">[{l.productCode}] </span>
                                                                    ) : null}
                                                                    {l.productName}
                                                                </div>
                                                                <div className="text-[11px] flex items-center gap-2 mt-0.5">
                                                                    <span className="text-[var(--text-tertiary)]">
                                                                        stock {fmtQty(l.currentStock)}
                                                                    </span>
                                                                    {hasShortfall && (
                                                                        <span
                                                                            className="text-amber-600 font-medium"
                                                                            title={`Para cubrir esta venta sin dejar stock negativo, harían falta ${fmtQty(shortfall)} unidades adicionales en inventario`}
                                                                        >
                                                                            faltan {fmtQty(shortfall)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2.5">
                                                                <span
                                                                    className={[
                                                                        "inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium border",
                                                                        l.vatType === "general"
                                                                            ? "badge-info"
                                                                            : "border-border-light text-[var(--text-tertiary)]",
                                                                    ].join(" ")}
                                                                >
                                                                    {l.vatType === "general" ? "16%" : "Exento"}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2.5">
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    step="0.0001"
                                                                    value={l.quantity}
                                                                    onChange={(e) => onUpdateQty(idx, Number(e.target.value))}
                                                                    className={[
                                                                        "h-8 w-24 px-2 rounded border bg-surface-1 outline-none",
                                                                        "font-mono text-[13px] text-foreground tabular-nums",
                                                                        "focus:border-primary-500/60",
                                                                        hasShortfall ? "border-amber-500/50" : "border-border-light",
                                                                    ].join(" ")}
                                                                    title={hasShortfall
                                                                        ? `Stock actual ${fmtQty(l.currentStock)} · faltan ${fmtQty(shortfall)} unidades`
                                                                        : undefined}
                                                                />
                                                            </td>
                                                            <td className="px-3 py-2.5 tabular-nums text-[var(--text-secondary)]">
                                                                {fmtN(l.unitCost)}
                                                            </td>
                                                            <td className="px-3 py-2.5 tabular-nums text-foreground">
                                                                {fmtN(l.precioVentaUnitario)}
                                                            </td>
                                                            <td
                                                                className={[
                                                                    "px-3 py-2.5 tabular-nums",
                                                                    isDiffSink ? "text-amber-600 font-bold" : "text-[var(--text-secondary)]",
                                                                ].join(" ")}
                                                                title={isDiffSink
                                                                    ? `Difiere del factor global (${fmtFactor(globalFactor)}). Esta línea absorbe el residuo de redondeo.`
                                                                    : undefined}
                                                            >
                                                                {fmtFactor(lineFactor)}
                                                                {isDiffSink && <span className="ml-1 text-[10px]">⚠</span>}
                                                            </td>
                                                            <td className="px-3 py-2.5 tabular-nums text-foreground font-bold">
                                                                {fmtN(l.totalSinIVA)}
                                                            </td>
                                                            <td className="px-3 py-2.5 tabular-nums text-[var(--text-secondary)]">
                                                                {fmtN(l.iva)}
                                                            </td>
                                                            <td className="px-3 py-2.5 tabular-nums text-[var(--text-secondary)]">
                                                                {fmtN(l.totalConIVA)}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onRemoveLine(idx)}
                                                                    className="inline-flex items-center justify-center text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
                                                                    aria-label="Eliminar línea"
                                                                    title="Eliminar línea"
                                                                >
                                                                    <Trash2 size={14} strokeWidth={1.8} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                        {isExpanded && (
                                                            <tr className={isAuto ? "bg-amber-500/[0.06]" : "bg-surface-2/40"}>
                                                                <td />
                                                                <td colSpan={12} className="px-4 py-3">
                                                                    <div className="rounded-md border border-border-light/70 bg-surface-1 p-3 space-y-1.5 text-[12px]">
                                                                        <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-2">
                                                                            Desglose de cálculo
                                                                        </p>
                                                                        <FormulaRow
                                                                            label="Factor de línea"
                                                                            formula={`${fmtN(l.precioVentaUnitario)} ÷ ${fmtN(l.unitCost)}`}
                                                                            result={fmtFactor(lineFactor)}
                                                                            warn={isDiffSink}
                                                                            note={isDiffSink ? `Difiere del factor global ${fmtFactor(globalFactor)} — línea sumidero del residuo` : undefined}
                                                                        />
                                                                        <FormulaRow
                                                                            label="Precio venta U."
                                                                            formula={`${fmtN(l.unitCost)} × ${fmtFactor(lineFactor)}`}
                                                                            result={`${fmtN(l.precioVentaUnitario)} Bs`}
                                                                        />
                                                                        <FormulaRow
                                                                            label="Total S/IVA"
                                                                            formula={`${fmtN(l.precioVentaUnitario)} × ${fmtQty(l.quantity)}`}
                                                                            result={`${fmtN(l.totalSinIVA)} Bs`}
                                                                        />
                                                                        <FormulaRow
                                                                            label="IVA"
                                                                            formula={l.vatType === "general"
                                                                                ? `${fmtN(l.totalSinIVA)} × 16%`
                                                                                : `${fmtN(l.totalSinIVA)} × 0% (exento)`}
                                                                            result={`${fmtN(l.iva)} Bs`}
                                                                        />
                                                                        <FormulaRow
                                                                            label="Total c/IVA"
                                                                            formula={`${fmtN(l.totalSinIVA)} + ${fmtN(l.iva)}`}
                                                                            result={`${fmtN(l.totalConIVA)} Bs`}
                                                                            bold
                                                                        />
                                                                        {hasShortfall && (
                                                                            <FormulaRow
                                                                                label="Stock requerido"
                                                                                formula={`qty ${fmtQty(l.quantity)} − stock ${fmtQty(l.currentStock)}`}
                                                                                result={`faltan ${fmtQty(shortfall)} unidades`}
                                                                                warn
                                                                                note="ajustar entrada inicial de inventario"
                                                                            />
                                                                        )}
                                                                        {ivaPct > 0 && (
                                                                            <p className="pt-1 text-[10px] text-[var(--text-tertiary)] italic">
                                                                                Tasa IVA general 16%
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </Fragment>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t border-border-light bg-surface-2/40">
                                                <td colSpan={9} className="px-3 py-2.5 text-right text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                                                    Totales
                                                </td>
                                                <td className="px-3 py-2.5 tabular-nums text-foreground font-bold">
                                                    {fmtN(sumSinIVA)}
                                                </td>
                                                <td className="px-3 py-2.5 tabular-nums text-[var(--text-secondary)]">
                                                    {fmtN(sumIVA)}
                                                </td>
                                                <td className="px-3 py-2.5 tabular-nums text-foreground font-bold">
                                                    {fmtN(sumConIVA)}
                                                </td>
                                                <td />
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="border-t border-border-light bg-surface-1 px-8 py-4">
                <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-3">
                    <BaseButton.Root
                        variant="secondary"
                        size="md"
                        onClick={onBack}
                        leftIcon={<ArrowLeft size={16} />}
                    >
                        Anterior
                    </BaseButton.Root>
                    <BaseButton.Root
                        onClick={onConfirmRequest}
                        variant="primary"
                        size="md"
                        loading={saving}
                        leftIcon={<Check size={16} />}
                        isDisabled={lines.length === 0 || loading}
                    >
                        Confirmar y guardar
                    </BaseButton.Root>
                </div>
            </div>
        </div>
    );
}

// ── helpers ─────────────────────────────────────────────────────────────────

function FormulaRow({
    label, formula, result, warn, bold, note,
}: {
    label: string;
    formula: string;
    result: string;
    warn?: boolean;
    bold?: boolean;
    note?: string;
}) {
    return (
        <div className="flex items-baseline gap-2 leading-relaxed">
            <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] w-[120px] shrink-0">
                {label}
            </span>
            <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                {formula}
            </span>
            <span className="text-[var(--text-tertiary)]">=</span>
            <span
                className={[
                    "font-mono tabular-nums",
                    warn ? "text-amber-600 font-bold"
                        : bold ? "text-foreground font-bold"
                            : "text-foreground",
                ].join(" ")}
            >
                {result}
            </span>
            {note && (
                <span className="text-[10px] text-amber-600 italic ml-1">
                    {note}
                </span>
            )}
        </div>
    );
}

function SummaryCard({
    label, value, sub, highlight, tone,
}: {
    label: string;
    value: string;
    sub?: string;
    highlight?: boolean;
    tone?: "ok" | "warn";
}) {
    const valueCls =
        tone === "ok" ? "text-emerald-500"
            : tone === "warn" ? "text-amber-500"
                : highlight ? "text-primary-500"
                    : "text-foreground";
    return (
        <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1 font-mono">
                {label}
            </p>
            <p className={`text-[16px] font-bold tabular-nums font-mono ${valueCls}`}>{value}</p>
            {sub && (
                <p className="mt-1 text-[11px] tabular-nums text-[var(--text-secondary)] font-mono">{sub}</p>
            )}
        </div>
    );
}
