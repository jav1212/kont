"use client";

// Page: Nuevo Ajuste
// Role: Form to register ajuste_positivo or ajuste_negativo movement records.
// Constraint: All TypeScript identifiers in English. JSX user-facing text stays in Spanish.

import { useEffect, useState, useCallback, useRef, startTransition } from "react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import type { Movement } from "@/src/modules/inventory/backend/domain/movement";
import type { Product } from "@/src/modules/inventory/backend/domain/product";

// ── helpers ───────────────────────────────────────────────────────────────────

const todayStr = () => getTodayIsoDate();
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtN = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const labelCls = "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

type AdjustmentType = "ajuste_positivo" | "ajuste_negativo";
type IvaMode = "agregado" | "incluido";

// ── AdjustmentItem ────────────────────────────────────────────────────────────

interface AdjustmentItem {
    productId: string;
    productName: string;
    quantity: number;
    currency: "B" | "D";
    currencyCost: number;
    vatRate: number;
}

function emptyAdjustmentItem(): AdjustmentItem {
    return { productId: "", productName: "", quantity: 1, currency: "B", currencyCost: 0, vatRate: 0 };
}

function computeCosts(item: AdjustmentItem, dollarRate: number | null, ivaMode: IvaMode) {
    const enteredPriceBs = item.currency === "D"
        ? (dollarRate ? round2(item.currencyCost * dollarRate) : 0)
        : item.currencyCost;

    let baseCostBs: number;
    let vatUnitBs: number;

    if (item.vatRate === 0) {
        baseCostBs = enteredPriceBs;
        vatUnitBs = 0;
    } else if (ivaMode === "agregado") {
        baseCostBs = enteredPriceBs;
        vatUnitBs = round2(enteredPriceBs * item.vatRate);
    } else {
        baseCostBs = round2(enteredPriceBs / (1 + item.vatRate));
        vatUnitBs = round2(enteredPriceBs - baseCostBs);
    }

    const baseCurrencyCost = item.currency === "D"
        ? (ivaMode === "incluido" && item.vatRate > 0
            ? round2(item.currencyCost / (1 + item.vatRate))
            : item.currencyCost)
        : null;

    return {
        unitCost: baseCostBs,
        totalCost: round2(baseCostBs * item.quantity),
        vatAmountTotal: round2(vatUnitBs * item.quantity),
        totalWithVat: round2((baseCostBs + vatUnitBs) * item.quantity),
        baseCurrencyCost,
    };
}

// ── ProductCombo ──────────────────────────────────────────────────────────────

function ProductCombo({
    value,
    products,
    onChange,
}: {
    value: string;
    products: Product[];
    onChange: (id: string, name: string, vatRate: number) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [hiIdx, setHiIdx] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const selected = products.find((p) => p.id === value);
    const filtered = products
        .filter((p) => p.active !== false && p.name.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 12);

    useEffect(() => {
        const el = listRef.current?.children[hiIdx];
        if (el instanceof HTMLElement) el.scrollIntoView({ block: "nearest" });
    }, [hiIdx]);

    function select(p: Product) {
        onChange(p.id!, p.name, p.vatType === "general" ? 0.16 : 0);
        setOpen(false);
        setSearch("");
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (!open) return;
        if (e.key === "ArrowDown") { e.preventDefault(); setHiIdx((i) => Math.min(i + 1, filtered.length - 1)); }
        if (e.key === "ArrowUp")   { e.preventDefault(); setHiIdx((i) => Math.max(i - 1, 0)); }
        if (e.key === "Enter")     { e.preventDefault(); if (filtered[hiIdx]) select(filtered[hiIdx]); }
        if (e.key === "Escape")    { e.preventDefault(); setOpen(false); setSearch(""); }
    }

    function handleBlur(e: React.FocusEvent) {
        const related = e.relatedTarget;
        if (related instanceof Node && wrapRef.current?.contains(related)) return;
        setOpen(false);
        setSearch("");
    }

    const displayValue = open ? search : (selected?.name ?? "");

    return (
        <div ref={wrapRef} className="relative w-full" onBlur={handleBlur}>
            <BaseInput.Field
                className="w-full"
                value={displayValue}
                placeholder={open ? "Buscar producto…" : "Seleccionar producto…"}
                onValueChange={(v) => { setSearch(v); setHiIdx(0); }}
                onFocus={() => { setSearch(""); setHiIdx(0); setOpen(true); }}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                spellCheck="false"
            />
            {open && (
                <div className="absolute left-0 top-full z-50 min-w-full mt-0.5 rounded-lg border border-border-medium bg-surface-1 shadow-xl overflow-hidden">
                    {filtered.length === 0 ? (
                        <div className="px-3 py-2.5 text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em]">Sin resultados</div>
                    ) : (
                        <ul ref={listRef} className="max-h-52 overflow-y-auto">
                            {filtered.map((p, i) => (
                                <li
                                    key={p.id}
                                    className={[
                                        "px-3 py-2 cursor-pointer text-[13px] flex items-center gap-2",
                                        i === hiIdx ? "bg-primary-500/10 text-foreground" : "text-[var(--text-secondary)] hover:bg-surface-2",
                                    ].join(" ")}
                                    onMouseDown={(e) => { e.preventDefault(); select(p); }}
                                    onMouseEnter={() => setHiIdx(i)}
                                >
                                    {p.code && <span className="font-mono text-[11px] text-[var(--text-tertiary)]">{p.code}</span>}
                                    <span className="flex-1">{p.name}</span>
                                    <span className="text-[11px] text-[var(--text-tertiary)]">
                                        ({fmtN(p.currentStock)} {p.measureUnit})
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function NuevoAjustePage() {
    const router = useRouter();
    const { companyId } = useCompany();
    const { products, loadProducts, saveMovement, error, setError } = useInventory();

    const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>("ajuste_positivo");
    const [date, setDate] = useState(todayStr());
    const [ivaMode, setIvaMode] = useState<IvaMode>("agregado");
    const [reason, setReason] = useState("");
    const [dollarRate, setDollarRate] = useState<number | null>(null);
    const [bcvRateDate, setBcvRateDate] = useState<string | null>(null);
    const [rateLoading, setRateLoading] = useState(false);
    const [rateError, setRateError] = useState<string | null>(null);
    const [items, setItems] = useState<AdjustmentItem[]>([emptyAdjustmentItem()]);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (companyId) loadProducts(companyId);
    }, [companyId, loadProducts]);

    useEffect(() => {
        if (!date) return;
        let cancelled = false;
        startTransition(() => {
            setRateLoading(true);
            setRateError(null);
            setBcvRateDate(null);
        });
        fetch(`/api/bcv/rate?date=${date}&code=USD`)
            .then((r) => r.json())
            .then((json) => {
                if (cancelled) return;
                if (json.rate) {
                    setDollarRate(json.rate);
                    setBcvRateDate(json.date);
                    setRateError(null);
                } else {
                    setRateError(json.error ?? "Sin datos BCV para esta fecha");
                }
            })
            .catch(() => { if (!cancelled) setRateError("Error al consultar BCV"); })
            .finally(() => { if (!cancelled) setRateLoading(false); });
        return () => { cancelled = true; };
    }, [date]);

    const updateItem = useCallback((index: number, patch: Partial<AdjustmentItem>) => {
        setItems((prev) => prev.map((item, i) => i !== index ? item : { ...item, ...patch }));
    }, []);

    function addRow() { setItems((prev) => [...prev, emptyAdjustmentItem()]); }
    function removeRow(index: number) { setItems((prev) => prev.filter((_, i) => i !== index)); }

    function getProduct(id: string) { return products.find((p) => p.id === id); }

    function validate(): boolean {
        if (!companyId) { setError("Sin empresa seleccionada"); return false; }
        if (!reason.trim()) { setError("El motivo del ajuste es obligatorio"); return false; }
        if (items.length === 0) { setError("Agrega al menos un producto"); return false; }
        for (const item of items) {
            if (!item.productId) { setError("Selecciona un producto en cada fila"); return false; }
            if (item.quantity <= 0) { setError("La cantidad debe ser mayor a 0"); return false; }
            if (item.currencyCost < 0) { setError("El costo no puede ser negativo"); return false; }
            if (item.currency === "D" && !dollarRate) {
                setError("No hay tasa BCV disponible para esta fecha. Cambia la fecha o usa Bs.");
                return false;
            }
            if (adjustmentType === "ajuste_negativo") {
                const prod = getProduct(item.productId);
                if (prod && item.quantity > prod.currentStock) {
                    setError(`Stock insuficiente para "${prod.name}": disponible ${fmtN(prod.currentStock)}`);
                    return false;
                }
            }
        }
        return true;
    }

    async function handleSave() {
        if (!validate()) return;
        setSaving(true);
        setError(null);
        let allOk = true;
        for (const item of items) {
            const { unitCost, totalCost, baseCurrencyCost } = computeCosts(item, dollarRate, ivaMode);
            const mov: Movement = {
                companyId: companyId!,
                productId: item.productId,
                type: adjustmentType,
                date,
                period: date.slice(0, 7),
                quantity: item.quantity,
                unitCost,
                totalCost,
                balanceQuantity: 0,
                reference: adjustmentType === "ajuste_positivo" ? "Ajuste positivo" : "Ajuste negativo",
                notes: reason,
                currency: item.currency,
                currencyCost: baseCurrencyCost,
                dollarRate: item.currency === "D" ? dollarRate : null,
            };
            const result = await saveMovement(mov);
            if (!result) { allOk = false; break; }
        }
        setSaving(false);
        if (allOk) setSaved(true);
    }

    const totals = items.reduce(
        (acc, item) => {
            const { totalCost, vatAmountTotal, totalWithVat } = computeCosts(item, dollarRate, ivaMode);
            return { subtotal: acc.subtotal + totalCost, iva: acc.iva + vatAmountTotal, total: acc.total + totalWithVat };
        },
        { subtotal: 0, iva: 0, total: 0 },
    );
    const hasIva = items.some((i) => i.vatRate > 0);
    const costLabel = ivaMode === "agregado" ? "Costo base" : "Costo c/IVA";
    const isNegative = adjustmentType === "ajuste_negativo";

    if (saved) {
        const period = date.slice(0, 7);
        return (
            <div className="min-h-full bg-surface-2 font-mono">
                <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                    <h1 className="text-[16px] font-bold uppercase tracking-[0.14em] text-foreground">Nuevo Ajuste</h1>
                </div>
                <div className="px-8 py-10 flex flex-col items-center">
                    <div className="rounded-xl border border-green-500/20 bg-green-500/[0.05] px-8 py-8 text-center max-w-md w-full">
                        <div className="text-green-500 text-[13px] font-bold uppercase tracking-[0.12em] mb-2">Ajuste registrado</div>
                        <p className="text-[var(--text-secondary)] text-[13px] mb-6">
                            Las existencias han sido actualizadas exitosamente.
                        </p>
                        <div className="flex items-center justify-center gap-3">
                            <BaseButton.Root
                                variant="primary"
                                size="md"
                                onClick={() => router.push("/inventory/adjustments")}
                            >
                                Ver ajustes
                            </BaseButton.Root>
                            <BaseButton.Root
                                variant="secondary"
                                size="md"
                                onClick={() => router.push(`/inventory/movements?periodo=${period}`)}
                            >
                                Ver movimientos
                            </BaseButton.Root>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Nuevo Ajuste de Inventario" subtitle="Corrección de existencias por diferencia de inventario">
                <BaseButton.Root variant="secondary" size="md" onClick={() => router.back()}>
                    ← Volver
                </BaseButton.Root>
            </PageHeader>

            <div className="px-8 py-6 space-y-5 max-w-4xl">
                {error && (
                    <div className="px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[13px]">
                        {error}
                    </div>
                )}

                {/* Datos del ajuste */}
                <div className="rounded-xl border border-border-light bg-surface-1 p-6">
                    <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground mb-5">
                        Datos del ajuste
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                        {/* Tipo de ajuste */}
                        <div className="col-span-2">
                            <label className={labelCls}>Tipo de ajuste *</label>
                            <div className="flex rounded-lg border border-border-light overflow-hidden h-10 text-[12px] w-72">
                                <button
                                    type="button"
                                    className={[
                                        "flex-1 px-4 transition-colors",
                                        adjustmentType === "ajuste_positivo"
                                            ? "bg-primary-500 text-white"
                                            : "bg-surface-1 text-[var(--text-secondary)] hover:bg-surface-2",
                                    ].join(" ")}
                                    onClick={() => setAdjustmentType("ajuste_positivo")}
                                >
                                    Ajuste positivo (+)
                                </button>
                                <button
                                    type="button"
                                    className={[
                                        "flex-1 px-4 transition-colors",
                                        adjustmentType === "ajuste_negativo"
                                            ? "bg-primary-500 text-white"
                                            : "bg-surface-1 text-[var(--text-secondary)] hover:bg-surface-2",
                                    ].join(" ")}
                                    onClick={() => setAdjustmentType("ajuste_negativo")}
                                >
                                    Ajuste negativo (−)
                                </button>
                            </div>
                            <p className="text-[11px] text-[var(--text-tertiary)] mt-1.5">
                                {adjustmentType === "ajuste_positivo"
                                    ? "Aumenta las existencias — inventario físico mayor al sistema."
                                    : "Reduce las existencias — inventario físico menor al sistema."}
                            </p>
                        </div>

                        {/* Fecha */}
                        <div>
                            <BaseInput.Field
                                label="Fecha *"
                                type="date"
                                value={date}
                                onValueChange={setDate}
                            />
                        </div>

                        {/* Tasa BCV */}
                        <div>
                            <label className={labelCls}>Tasa BCV (Bs/USD)</label>
                            <div className="flex items-center gap-2">
                                <BaseInput.Field
                                    type="number"
                                    className="w-full"
                                    value={dollarRate !== null ? String(dollarRate) : ""}
                                    onValueChange={(v) => setDollarRate(v ? Number(v) : null)}
                                    placeholder="0.00"
                                    step={0.01}
                                />
                                {rateLoading && (
                                    <span className="text-[11px] text-[var(--text-tertiary)] whitespace-nowrap">Cargando…</span>
                                )}
                                {!rateLoading && bcvRateDate && (
                                    <span className="text-[11px] text-green-600 whitespace-nowrap">BCV {bcvRateDate}</span>
                                )}
                                {!rateLoading && !bcvRateDate && rateError && (
                                    <span className="text-[11px] text-[var(--text-tertiary)] whitespace-nowrap">{rateError}</span>
                                )}
                            </div>
                        </div>

                        {/* Tratamiento IVA */}
                        <div className="col-span-2">
                            <label className={labelCls}>Tratamiento de IVA</label>
                            <div className="flex gap-3 items-center">
                                <div className="flex rounded-lg border border-border-light overflow-hidden h-10 text-[12px] w-64">
                                    <button
                                        type="button"
                                        className={[
                                            "flex-1 px-4 transition-colors",
                                            ivaMode === "agregado"
                                                ? "bg-primary-500 text-white"
                                                : "bg-surface-1 text-[var(--text-secondary)] hover:bg-surface-2",
                                        ].join(" ")}
                                        onClick={() => setIvaMode("agregado")}
                                    >
                                        IVA Agregado
                                    </button>
                                    <button
                                        type="button"
                                        className={[
                                            "flex-1 px-4 transition-colors",
                                            ivaMode === "incluido"
                                                ? "bg-primary-500 text-white"
                                                : "bg-surface-1 text-[var(--text-secondary)] hover:bg-surface-2",
                                        ].join(" ")}
                                        onClick={() => setIvaMode("incluido")}
                                    >
                                        IVA Incluido
                                    </button>
                                </div>
                                <span className="text-[11px] text-[var(--text-tertiary)]">
                                    {ivaMode === "agregado"
                                        ? "El costo ingresado es la base — el IVA se calcula y suma encima."
                                        : "El costo ingresado ya incluye IVA — se extrae la base para el inventario."}
                                </span>
                            </div>
                        </div>

                        {/* Motivo */}
                        <div className="col-span-2">
                            <BaseInput.Field
                                label="Motivo del ajuste *"
                                type="text"
                                value={reason}
                                onValueChange={setReason}
                                placeholder="Ej: Conteo físico, merma, daño, corrección de error…"
                            />
                        </div>
                    </div>
                </div>

                {/* Items */}
                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
                        <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-foreground">
                            Productos
                        </h2>
                        <button
                            onClick={addRow}
                            className="text-[12px] text-primary-500 hover:text-primary-600 uppercase tracking-[0.12em] transition-colors"
                            type="button"
                        >
                            + Agregar fila
                        </button>
                    </div>

                    {/* Column headers */}
                    <div className={`grid gap-2 px-4 py-2 border-b border-border-light bg-surface-2 ${isNegative ? "grid-cols-[1fr_120px_160px_90px_160px_36px]" : "grid-cols-[1fr_120px_160px_90px_36px]"}`}>
                        {(isNegative
                            ? ["Producto", "Cantidad", costLabel, "Moneda", "Existencia", ""]
                            : ["Producto", "Cantidad", costLabel, "Moneda", ""]
                        ).map((h, i) => (
                            <span key={i} className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{h}</span>
                        ))}
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-border-light/50">
                        {items.map((item, idx) => {
                            const prod = getProduct(item.productId);
                            const stockOk = !prod || !isNegative || item.quantity <= prod.currentStock;
                            const balanceAfter = prod && isNegative ? prod.currentStock - item.quantity : null;

                            return (
                                <div
                                    key={idx}
                                    className={`grid gap-2 px-4 py-2 items-center ${isNegative ? "grid-cols-[1fr_120px_160px_90px_160px_36px]" : "grid-cols-[1fr_120px_160px_90px_36px]"}`}
                                >
                                    {/* Producto */}
                                    <ProductCombo
                                        value={item.productId}
                                        products={products}
                                        onChange={(id, name, vatRate) => updateItem(idx, { productId: id, productName: name, vatRate })}
                                    />

                                    {/* Cantidad */}
                                    <BaseInput.Field
                                        type="number"
                                        className="w-full"
                                        inputClassName={stockOk ? "text-right" : "text-right !text-red-500"}
                                        value={item.quantity ? String(item.quantity) : ""}
                                        onValueChange={(v) => updateItem(idx, { quantity: Number(v) || 0 })}
                                        placeholder="0"
                                        min={0.0001}
                                        step={0.0001}
                                    />

                                    {/* Costo */}
                                    <BaseInput.Field
                                        type="number"
                                        className="w-full"
                                        inputClassName="text-right"
                                        value={item.currencyCost ? String(item.currencyCost) : ""}
                                        onValueChange={(v) => updateItem(idx, { currencyCost: Number(v) || 0 })}
                                        placeholder="0.00"
                                        min={0}
                                        step={0.01}
                                        suffix={item.currency === "D" ? "USD" : "Bs"}
                                    />

                                    {/* Moneda toggle */}
                                    <div className="flex rounded-lg border border-border-light overflow-hidden h-10 text-[12px]">
                                        <button
                                            type="button"
                                            className={[
                                                "flex-1 transition-colors",
                                                item.currency === "B" ? "bg-primary-500 text-white" : "bg-surface-1 text-[var(--text-secondary)] hover:bg-surface-2",
                                            ].join(" ")}
                                            onClick={() => updateItem(idx, { currency: "B" })}
                                        >
                                            Bs
                                        </button>
                                        <button
                                            type="button"
                                            className={[
                                                "flex-1 transition-colors",
                                                item.currency === "D" ? "bg-primary-500 text-white" : "bg-surface-1 text-[var(--text-secondary)] hover:bg-surface-2",
                                            ].join(" ")}
                                            onClick={() => updateItem(idx, { currency: "D" })}
                                        >
                                            USD
                                        </button>
                                    </div>

                                    {/* Existencia (solo ajuste negativo) */}
                                    {isNegative && (
                                        <div className="px-1 space-y-0.5">
                                            {prod ? (
                                                <>
                                                    <div className="flex justify-between text-[12px]">
                                                        <span className="text-[var(--text-tertiary)]">Disponible</span>
                                                        <span className={`tabular-nums font-medium ${!stockOk ? "text-red-500" : "text-foreground"}`}>
                                                            {fmtN(prod.currentStock)}
                                                        </span>
                                                    </div>
                                                    {item.quantity > 0 && (
                                                        <div className="flex justify-between text-[12px]">
                                                            <span className="text-[var(--text-tertiary)]">Tras ajuste</span>
                                                            <span className={`tabular-nums font-medium ${!stockOk ? "text-red-500" : "text-[var(--text-secondary)]"}`}>
                                                                {fmtN(balanceAfter!)}
                                                            </span>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="text-[11px] text-[var(--text-tertiary)]">—</span>
                                            )}
                                        </div>
                                    )}

                                    {/* Eliminar */}
                                    <button
                                        type="button"
                                        onClick={() => removeRow(idx)}
                                        disabled={items.length === 1}
                                        className="w-9 h-10 flex items-center justify-center text-[var(--text-tertiary)] hover:text-red-500 disabled:opacity-30 disabled:hover:text-[var(--text-tertiary)] transition-colors text-[16px]"
                                    >
                                        ×
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer totals */}
                    <div className="px-4 py-3 border-t border-border-light bg-surface-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em]">
                                {items.length} {items.length === 1 ? "producto" : "productos"}
                            </span>
                            <div className="flex items-center gap-6">
                                {items.some((i) => i.currency === "D") && dollarRate && (
                                    <span className="text-[12px] text-[var(--text-tertiary)]">
                                        Tasa: {fmtN(dollarRate)} Bs/USD
                                    </span>
                                )}
                                {hasIva ? (
                                    <div className="flex items-center gap-4 text-[12px] tabular-nums">
                                        <span className="text-[var(--text-tertiary)]">
                                            Base <span className="text-foreground font-medium">Bs {fmtN(totals.subtotal)}</span>
                                        </span>
                                        <span className="text-[var(--text-tertiary)]">
                                            IVA <span className="text-amber-600 font-medium">Bs {fmtN(totals.iva)}</span>
                                        </span>
                                        <span className="text-[13px] font-bold text-foreground">
                                            Total Bs {fmtN(totals.total)}
                                        </span>
                                    </div>
                                ) : (
                                    <span className="text-[13px] font-bold text-foreground tabular-nums">
                                        Total Bs {fmtN(totals.subtotal)}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Nota informativa */}
                <div className="px-4 py-3 rounded-lg border border-border-light bg-surface-1 text-[12px] text-[var(--text-tertiary)]">
                    Los ajustes corrigen diferencias entre el inventario físico y el sistema. Deben estar respaldados por un acta o conteo físico.
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pb-8">
                    <BaseButton.Root
                        variant="secondary"
                        size="md"
                        onClick={() => router.back()}
                        disabled={saving}
                    >
                        Cancelar
                    </BaseButton.Root>
                    <BaseButton.Root
                        variant="primary"
                        size="md"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? "Registrando…" : "Registrar ajuste"}
                    </BaseButton.Root>
                </div>
            </div>
        </div>
    );
}
