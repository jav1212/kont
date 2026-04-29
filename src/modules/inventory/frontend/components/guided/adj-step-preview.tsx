"use client";

import { useMemo } from "react";
import { Trash2, RefreshCw, Check, ArrowLeft, Loader2, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import type {
    StockAdjustmentPreview,
    StockAdjustmentLine,
    AdjustmentBaseSource,
} from "@/src/modules/inventory/frontend/hooks/use-inventory";

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtQty = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

const fmtSigned = (n: number) =>
    `${n > 0 ? "+" : ""}${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function baseLabel(b: AdjustmentBaseSource): string {
    return b === "entradas" ? "Entradas (Bs)" : "Ventas S/IVA (Bs)";
}

export interface AdjStepPreviewProps {
    preview: StockAdjustmentPreview | null;
    lines: StockAdjustmentLine[];
    loading: boolean;
    saving: boolean;
    onUpdateDelta: (idx: number, deltaQty: number) => void;
    onRemoveLine: (idx: number) => void;
    onRegenerate: () => void;
    onBack: () => void;
    onConfirmRequest: () => void;
}

export function AdjStepPreview({
    preview,
    lines,
    loading,
    saving,
    onUpdateDelta,
    onRemoveLine,
    onRegenerate,
    onBack,
    onConfirmRequest,
}: AdjStepPreviewProps) {
    const sumCurrent = useMemo(
        () => lines.reduce((s, l) => s + l.currentValueBs, 0),
        [lines],
    );
    const sumNew = useMemo(
        () => lines.reduce((s, l) => s + l.newValueBs, 0),
        [lines],
    );
    const sumDeltaBs = useMemo(
        () => lines.reduce((s, l) => s + l.deltaQty * l.averageCost, 0),
        [lines],
    );
    const sumDeltaQty = useMemo(
        () => lines.reduce((s, l) => s + l.deltaQty, 0),
        [lines],
    );
    const cappedCount = useMemo(
        () => lines.filter((l) => l.capped).length,
        [lines],
    );

    const targetBs = preview?.targetBs ?? 0;
    const baseBs = preview?.baseBs ?? 0;
    const direction: "up" | "down" | "none" =
        sumNew > sumCurrent + 0.01 ? "up"
            : sumNew < sumCurrent - 0.01 ? "down"
                : "none";
    const drift = sumNew - targetBs;
    const driftOk = Math.abs(drift) < 0.01;

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-4">
                    <header className="mb-2 text-center">
                        <h2 className="font-mono text-[22px] font-black tracking-tight text-foreground leading-tight">
                            Revisa el ajuste y confirma cuando estés listo
                        </h2>
                        <p className="font-mono text-[14px] text-[var(--text-secondary)] mt-2 leading-relaxed max-w-2xl mx-auto">
                            Cada línea modificará el saldo del producto. Puedes editar el delta manualmente o regenerar la distribución equitativa. No se crearán movimientos en el kardex.
                        </p>
                    </header>

                    {loading && !preview && (
                        <div className="rounded-xl border border-border-light bg-surface-1 px-6 py-16 flex flex-col items-center justify-center gap-3">
                            <Loader2 size={28} className="animate-spin text-primary-500" />
                            <p className="font-mono text-[13px] text-[var(--text-secondary)]">
                                Calculando distribución…
                            </p>
                        </div>
                    )}

                    {preview && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                            <SummaryCard
                                label={baseLabel(preview.baseSource)}
                                value={`Bs ${fmtN(baseBs)}`}
                                sub={`del periodo ${preview.period}`}
                            />
                            <SummaryCard
                                label="Target"
                                value={`Bs ${fmtN(targetBs)}`}
                                highlight
                            />
                            <SummaryCard
                                label="Existencia actual"
                                value={`Bs ${fmtN(sumCurrent)}`}
                                sub={`${lines.length} ${lines.length === 1 ? "producto" : "productos"}`}
                            />
                            <SummaryCard
                                label="Δ total"
                                value={`Bs ${fmtSigned(sumDeltaBs)}`}
                                tone={direction === "up" ? "ok" : direction === "down" ? "warn" : undefined}
                                icon={direction === "up" ? <ArrowUp size={14} /> : direction === "down" ? <ArrowDown size={14} /> : undefined}
                                sub={`${fmtSigned(sumDeltaQty)} unid.`}
                            />
                            <SummaryCard
                                label="Existencia nueva"
                                value={`Bs ${fmtN(sumNew)}`}
                                tone={driftOk ? "ok" : "warn"}
                                sub={driftOk ? "Coincide con target" : `Δ ${fmtSigned(drift)} Bs`}
                            />
                        </div>
                    )}

                    {preview && cappedCount > 0 && (
                        <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.06] px-4 py-3 flex items-start gap-3">
                            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                            <p className="font-mono text-[12px] text-amber-700 leading-relaxed">
                                {cappedCount === 1
                                    ? "1 producto se topó en stock 0 (no permite stock negativo). El residuo no aplicado se reporta en la columna Δ Bs."
                                    : `${cappedCount} productos se toparon en stock 0. El residuo no aplicado se reporta como diferencia con el target.`}
                            </p>
                        </div>
                    )}

                    {preview && (
                        <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm overflow-hidden">
                            <div className="px-5 py-3 border-b border-border-light flex items-center justify-between gap-3 flex-wrap">
                                <p className="text-[12px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-mono">
                                    {lines.length} {lines.length === 1 ? "producto a ajustar" : "productos a ajustar"}
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
                                    Sin productos — vuelve atrás a cambiar los filtros.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[13px] font-mono">
                                        <thead>
                                            <tr className="border-b border-border-light">
                                                {[
                                                    "Producto",
                                                    "Stock actual",
                                                    "Costo prom.",
                                                    "Valor actual",
                                                    "Δ qty",
                                                    "Stock nuevo",
                                                    "Valor nuevo",
                                                    "Δ Bs",
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
                                                const deltaBs = l.deltaQty * l.averageCost;
                                                const isUp = l.deltaQty > 0;
                                                const isDown = l.deltaQty < 0;
                                                return (
                                                    <tr
                                                        key={`${l.productId}-${idx}`}
                                                        className={[
                                                            "border-b border-border-light/50 transition-colors hover:bg-surface-2",
                                                            l.capped ? "bg-amber-500/[0.04]" : "",
                                                        ].join(" ")}
                                                    >
                                                        <td className="px-3 py-2.5 text-foreground max-w-[300px]">
                                                            <div className="truncate">
                                                                {l.productCode ? (
                                                                    <span className="text-[var(--text-tertiary)]">[{l.productCode}] </span>
                                                                ) : null}
                                                                {l.productName}
                                                            </div>
                                                            {l.departmentName && (
                                                                <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                                                                    {l.departmentName}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2.5 tabular-nums text-[var(--text-secondary)]">
                                                            {fmtQty(l.currentStock)}
                                                        </td>
                                                        <td className="px-3 py-2.5 tabular-nums text-[var(--text-secondary)]">
                                                            {fmtN(l.averageCost)}
                                                        </td>
                                                        <td className="px-3 py-2.5 tabular-nums text-[var(--text-secondary)]">
                                                            {fmtN(l.currentValueBs)}
                                                        </td>
                                                        <td className="px-3 py-2.5">
                                                            <input
                                                                type="number"
                                                                step="1"
                                                                value={l.deltaQty}
                                                                onChange={(e) => onUpdateDelta(idx, Number(e.target.value))}
                                                                className={[
                                                                    "h-8 w-24 px-2 rounded border bg-surface-1 outline-none",
                                                                    "font-mono text-[13px] tabular-nums",
                                                                    "focus:border-primary-500/60",
                                                                    isUp ? "text-emerald-600 border-emerald-500/40"
                                                                        : isDown ? "text-amber-700 border-amber-500/40"
                                                                            : "text-foreground border-border-light",
                                                                ].join(" ")}
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2.5 tabular-nums text-foreground font-bold">
                                                            {fmtQty(l.newStock)}
                                                        </td>
                                                        <td className="px-3 py-2.5 tabular-nums text-foreground font-bold">
                                                            {fmtN(l.newValueBs)}
                                                        </td>
                                                        <td
                                                            className={[
                                                                "px-3 py-2.5 tabular-nums font-bold",
                                                                isUp ? "text-emerald-600"
                                                                    : isDown ? "text-amber-600"
                                                                        : "text-[var(--text-tertiary)]",
                                                            ].join(" ")}
                                                        >
                                                            {fmtSigned(deltaBs)}
                                                            {l.capped && (
                                                                <span
                                                                    className="ml-1 text-[10px] text-amber-600"
                                                                    title="Stock topado en 0"
                                                                >
                                                                    ⚠
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right">
                                                            <button
                                                                type="button"
                                                                onClick={() => onRemoveLine(idx)}
                                                                className="inline-flex items-center justify-center text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
                                                                aria-label="Excluir producto"
                                                                title="Excluir del ajuste"
                                                            >
                                                                <Trash2 size={14} strokeWidth={1.8} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t border-border-light bg-surface-2/40">
                                                <td colSpan={3} className="px-3 py-2.5 text-right text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                                                    Totales
                                                </td>
                                                <td className="px-3 py-2.5 tabular-nums text-foreground font-bold">
                                                    {fmtN(sumCurrent)}
                                                </td>
                                                <td className="px-3 py-2.5 tabular-nums text-[var(--text-secondary)]">
                                                    {fmtSigned(sumDeltaQty)}
                                                </td>
                                                <td colSpan={1} />
                                                <td className="px-3 py-2.5 tabular-nums text-foreground font-bold">
                                                    {fmtN(sumNew)}
                                                </td>
                                                <td className={[
                                                    "px-3 py-2.5 tabular-nums font-bold",
                                                    driftOk ? "text-emerald-600" : "text-amber-600",
                                                ].join(" ")}>
                                                    {fmtSigned(sumDeltaBs)}
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

function SummaryCard({
    label, value, sub, highlight, tone, icon,
}: {
    label: string;
    value: string;
    sub?: string;
    highlight?: boolean;
    tone?: "ok" | "warn";
    icon?: React.ReactNode;
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
            <p className={`text-[16px] font-bold tabular-nums font-mono flex items-center gap-1.5 ${valueCls}`}>
                {icon}
                {value}
            </p>
            {sub && (
                <p className="mt-1 text-[11px] tabular-nums text-[var(--text-secondary)] font-mono">{sub}</p>
            )}
        </div>
    );
}
