"use client";

// Page: Generador de salidas aleatorias.
// Distribuye un monto objetivo (o margen %) en salidas aleatorias del periodo.
// Soporta carve-out de autoconsumo: parte del target T se reserva a movimientos
// de tipo 'autoconsumo' (productos disjuntos respecto a salidas) — la suma S/IVA
// total sigue siendo T.
// Flujo: configurar → generar preview → ajustar/regenerar → confirmar.

import { useCallback, useMemo, useState } from "react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { Trash2, RefreshCw, Sparkles, Check } from "lucide-react";

import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import {
    useInventory,
    type RandomSalesPreview,
    type RandomSalesPreviewLine,
} from "@/src/modules/inventory/frontend/hooks/use-inventory";

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtQty = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

function currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const labelCls =
    "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

const fieldCls = [
    "h-10 px-3 rounded-lg border border-border-light bg-surface-1 outline-none w-full",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

type Mode     = "monto" | "margen";
type AutoMode = "none" | "porcentaje" | "monto";

// ── component ────────────────────────────────────────────────────────────────

export default function SalesGeneratorPage() {
    const router = useRouter();
    const { companyId } = useCompany();
    const { saveOutbound, generateRandomSales, error, setError } = useInventory();

    const [period, setPeriod]   = useState<string>(currentPeriod());
    const [mode, setMode]       = useState<Mode>("monto");
    const [targetStr, setTargetStr] = useState<string>("");
    const [countStr, setCountStr]   = useState<string>("");
    const [reference, setReference] = useState<string>("Generado automáticamente");

    const [autoMode, setAutoMode]           = useState<AutoMode>("none");
    const [autoTargetStr, setAutoTargetStr] = useState<string>("");

    const [preview, setPreview] = useState<RandomSalesPreview | null>(null);
    const [lines, setLines]     = useState<RandomSalesPreviewLine[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving]   = useState(false);

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

    const targetBs       = preview?.targetBs ?? 0;
    const inboundBs      = preview?.inboundTotalBs ?? 0;
    const salidasTargetBs    = preview?.salidasTotalBs ?? 0;
    const autoTargetBs       = preview?.autoconsumoTotalBs ?? 0;
    const drift = useMemo(() => sumSinIVA - targetBs, [sumSinIVA, targetBs]);
    const isAutoActive = (preview?.autoconsumoTotalBs ?? 0) > 0;

    const generate = useCallback(async (opts?: { newSeed?: boolean }) => {
        if (!companyId) return;
        const target = Number(targetStr.replace(",", "."));
        if (!Number.isFinite(target)) {
            setError("Ingresa un target numérico válido");
            return;
        }
        const count = countStr.trim() ? Number(countStr) : undefined;

        let autoTarget: number | undefined;
        if (autoMode !== "none") {
            const parsed = Number(autoTargetStr.replace(",", "."));
            if (!Number.isFinite(parsed) || parsed < 0) {
                setError(autoMode === "porcentaje"
                    ? "Ingresa un porcentaje de autoconsumo válido"
                    : "Ingresa un monto Bs de autoconsumo válido");
                return;
            }
            autoTarget = parsed;
        }

        setLoading(true);
        setError(null);
        const result = await generateRandomSales({
            companyId,
            period,
            mode,
            target,
            count: count != null && Number.isFinite(count) ? count : undefined,
            seed: opts?.newSeed ? Math.floor(Math.random() * 0xffffffff) : undefined,
            autoconsumoMode:   autoMode,
            autoconsumoTarget: autoTarget,
        });
        setLoading(false);
        if (result) {
            setPreview(result);
            // Combinar y ordenar: primero salidas por fecha, luego autoconsumo por fecha
            const combined: RandomSalesPreviewLine[] = [
                ...result.lines,
                ...result.autoconsumoLines,
            ].sort((a, b) => {
                if (a.tipo !== b.tipo) return a.tipo === "salida" ? -1 : 1;
                return a.date.localeCompare(b.date);
            });
            setLines(combined);
        }
    }, [companyId, period, mode, targetStr, countStr, autoMode, autoTargetStr, generateRandomSales, setError]);

    const removeLine = (idx: number) => {
        setLines((prev) => prev.filter((_, i) => i !== idx));
    };

    const updateQty = (idx: number, qty: number) => {
        setLines((prev) =>
            prev.map((l, i) => {
                if (i !== idx) return l;
                const safeQty = Math.max(0, qty);
                const totalSinIVA = Math.round(l.precioVentaUnitario * safeQty * 100) / 100;
                const ivaPct = l.vatType === "general" ? 0.16 : 0;
                const iva = Math.round(totalSinIVA * ivaPct * 100) / 100;
                return {
                    ...l,
                    quantity: safeQty,
                    totalSinIVA,
                    iva,
                    totalConIVA: Math.round((totalSinIVA + iva) * 100) / 100,
                };
            }),
        );
    };

    const confirm = useCallback(async () => {
        if (!companyId) return;
        if (lines.length === 0) {
            setError("No hay líneas que confirmar");
            return;
        }
        const invalid = lines.find((l) => l.quantity <= 0);
        if (invalid) {
            setError(`La línea de ${invalid.productName} tiene cantidad ≤ 0`);
            return;
        }

        // Validación de stock combinado por producto (salida + autoconsumo)
        const totalsByProduct = new Map<string, { qty: number; stock: number; name: string }>();
        for (const l of lines) {
            const prev = totalsByProduct.get(l.productId);
            if (prev) {
                prev.qty += l.quantity;
            } else {
                totalsByProduct.set(l.productId, {
                    qty: l.quantity,
                    stock: l.currentStock,
                    name: l.productName,
                });
            }
        }
        for (const { qty, stock, name } of totalsByProduct.values()) {
            if (qty > stock) {
                setError(`${name}: la suma de cantidades (${fmtQty(qty)}) excede el stock disponible (${fmtQty(stock)})`);
                return;
            }
        }

        setSaving(true);
        setError(null);
        const ok = await saveOutbound({
            companyId,
            date: lines[0].date,
            reference,
            items: lines.map((l) => ({
                productId:           l.productId,
                quantity:            l.quantity,
                currentStock:        l.currentStock,
                precioVentaUnitario: l.precioVentaUnitario,
                date:                l.date,
                type:                l.tipo,
            })),
        });
        setSaving(false);
        if (ok) {
            router.push(`/inventory/movements?period=${encodeURIComponent(period)}`);
        }
    }, [companyId, lines, reference, period, saveOutbound, setError, router]);

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader
                title="Generador de salidas"
                subtitle="Distribuye un monto o margen objetivo en salidas aleatorias del periodo, con opción de carve-out a autoconsumo"
            />

            <div className="px-8 py-6 space-y-4 max-w-[1400px] mx-auto w-full">
                {error && (
                    <div className="px-3 py-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[13px]">
                        {error}
                    </div>
                )}

                {/* Configuración */}
                <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm px-5 py-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div>
                            <label className={labelCls}>Período</label>
                            <BaseInput.Field
                                type="month"
                                className="w-full"
                                value={period}
                                onValueChange={setPeriod}
                            />
                        </div>

                        <div>
                            <label className={labelCls}>Objetivo</label>
                            <div className="flex rounded-lg border border-border-light overflow-hidden bg-surface-1">
                                {([
                                    { v: "monto",  l: "Monto Bs." },
                                    { v: "margen", l: "Margen %"  },
                                ] as const).map((m) => (
                                    <button
                                        key={m.v}
                                        type="button"
                                        onClick={() => setMode(m.v)}
                                        className={[
                                            "flex-1 h-10 text-[12px] uppercase tracking-[0.1em] transition-colors",
                                            mode === m.v
                                                ? "bg-primary-500/10 text-primary-500 font-bold"
                                                : "text-text-tertiary hover:bg-surface-2",
                                        ].join(" ")}
                                    >
                                        {m.l}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className={labelCls}>
                                {mode === "monto" ? "Total en Bs (sin IVA)" : "% sobre entradas"}
                            </label>
                            <input
                                inputMode="decimal"
                                className={fieldCls}
                                value={targetStr}
                                placeholder={mode === "monto" ? "120,00" : "20"}
                                onChange={(e) => setTargetStr(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className={labelCls}>Líneas (opcional)</label>
                            <input
                                inputMode="numeric"
                                className={fieldCls}
                                value={countStr}
                                placeholder="auto"
                                onChange={(e) => setCountStr(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Autoconsumo */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end pt-2 border-t border-border-light/60">
                        <div className="md:col-span-2">
                            <label className={labelCls}>Reservar a autoconsumo</label>
                            <div className="flex rounded-lg border border-border-light overflow-hidden bg-surface-1">
                                {([
                                    { v: "none",       l: "Sin autoconsumo" },
                                    { v: "porcentaje", l: "% del target"     },
                                    { v: "monto",      l: "Monto Bs."        },
                                ] as const).map((m) => (
                                    <button
                                        key={m.v}
                                        type="button"
                                        onClick={() => setAutoMode(m.v)}
                                        className={[
                                            "flex-1 h-10 text-[12px] uppercase tracking-[0.1em] transition-colors",
                                            autoMode === m.v
                                                ? "bg-amber-500/15 text-amber-600 font-bold"
                                                : "text-text-tertiary hover:bg-surface-2",
                                        ].join(" ")}
                                    >
                                        {m.l}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <label className={labelCls}>
                                {autoMode === "porcentaje"
                                    ? "% del target a autoconsumo"
                                    : autoMode === "monto"
                                        ? "Bs sin IVA a autoconsumo"
                                        : "—"}
                            </label>
                            <input
                                inputMode="decimal"
                                className={fieldCls}
                                disabled={autoMode === "none"}
                                value={autoTargetStr}
                                placeholder={
                                    autoMode === "porcentaje" ? "10"
                                  : autoMode === "monto"      ? "1500,00"
                                  : "Activa una opción para reservar autoconsumo"
                                }
                                onChange={(e) => setAutoTargetStr(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <div className="flex-1 min-w-[260px]">
                            <label className={labelCls}>Referencia</label>
                            <input
                                className={fieldCls}
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                            />
                        </div>
                        <div className="flex items-end gap-2">
                            <BaseButton.Root
                                onClick={() => generate({ newSeed: false })}
                                variant="primary"
                                size="md"
                                loading={loading}
                                leftIcon={<Sparkles size={14} />}
                            >
                                Generar preview
                            </BaseButton.Root>
                        </div>
                    </div>
                </div>

                {/* Resumen */}
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
                                label="Factor de venta"
                                value={preview.factor.toLocaleString("es-VE", {
                                    minimumFractionDigits: 4, maximumFractionDigits: 4,
                                })}
                                sub={`× costo promedio · seed ${preview.seed}`}
                            />
                        )}
                    </div>
                )}

                {/* Tabla preview */}
                {preview && (
                    <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 border-b border-border-light flex items-center justify-between gap-3">
                            <p className="text-[12px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                                {lines.length} {lines.length === 1 ? "línea propuesta" : "líneas propuestas"}
                                {isAutoActive && (
                                    <span className="ml-2 text-[var(--text-secondary)]">
                                        · {lines.filter((l) => l.tipo === "salida").length} venta · {lines.filter((l) => l.tipo === "autoconsumo").length} autoconsumo
                                    </span>
                                )}
                            </p>
                            <div className="flex gap-2">
                                <BaseButton.Root
                                    onClick={() => generate({ newSeed: true })}
                                    variant="ghost"
                                    size="sm"
                                    loading={loading}
                                    leftIcon={<RefreshCw size={13} />}
                                >
                                    Regenerar
                                </BaseButton.Root>
                                <BaseButton.Root
                                    onClick={confirm}
                                    variant="primary"
                                    size="sm"
                                    loading={saving}
                                    leftIcon={<Check size={14} />}
                                    isDisabled={lines.length === 0}
                                >
                                    Confirmar y guardar
                                </BaseButton.Root>
                            </div>
                        </div>

                        {lines.length === 0 ? (
                            <div className="px-5 py-12 text-center text-[13px] text-[var(--text-tertiary)]">
                                Sin líneas — regenera o cambia los parámetros.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[13px]">
                                    <thead>
                                        <tr className="border-b border-border-light">
                                            {[
                                                "Tipo",
                                                "Fecha",
                                                "Producto",
                                                "IVA",
                                                "Cant.",
                                                "Costo U.",
                                                "Precio venta U.",
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
                                            const overStock = l.quantity > l.currentStock;
                                            const isAuto = l.tipo === "autoconsumo";
                                            return (
                                                <tr
                                                    key={`${l.productId}-${l.tipo}-${idx}`}
                                                    className={[
                                                        "border-b border-border-light/50 transition-colors",
                                                        isAuto ? "bg-amber-500/[0.04] hover:bg-amber-500/[0.08]" : "hover:bg-surface-2",
                                                    ].join(" ")}
                                                >
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
                                                    <td className="px-3 py-2.5 text-foreground max-w-[260px] truncate">
                                                        {l.productCode ? (
                                                            <span className="text-[var(--text-tertiary)]">[{l.productCode}] </span>
                                                        ) : null}
                                                        {l.productName}
                                                        <span className="ml-2 text-[11px] text-[var(--text-tertiary)]">
                                                            stock {fmtQty(l.currentStock)}
                                                        </span>
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
                                                            onChange={(e) => updateQty(idx, Number(e.target.value))}
                                                            className={[
                                                                "h-8 w-24 px-2 rounded border bg-surface-1 outline-none",
                                                                "font-mono text-[13px] text-foreground tabular-nums",
                                                                "focus:border-primary-500/60",
                                                                overStock ? "border-red-500/50" : "border-border-light",
                                                            ].join(" ")}
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-secondary)]">
                                                        {fmtN(l.unitCost)}
                                                    </td>
                                                    <td className="px-3 py-2.5 tabular-nums text-foreground">
                                                        {fmtN(l.precioVentaUnitario)}
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
                                                            onClick={() => removeLine(idx)}
                                                            className="inline-flex items-center justify-center text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
                                                            aria-label="Eliminar línea"
                                                            title="Eliminar línea"
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
                                            <td colSpan={7} className="px-3 py-2.5 text-right text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
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
    );
}

// ── helpers ──────────────────────────────────────────────────────────────────

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
        tone === "ok"   ? "text-emerald-500"
      : tone === "warn" ? "text-amber-500"
      : highlight       ? "text-primary-500"
      :                   "text-foreground";
    return (
        <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1">
                {label}
            </p>
            <p className={`text-[16px] font-bold tabular-nums ${valueCls}`}>{value}</p>
            {sub && (
                <p className="mt-1 text-[11px] tabular-nums text-[var(--text-secondary)]">{sub}</p>
            )}
        </div>
    );
}
