"use client";

// Page: NuevaEntradaManualPage
// Purpose: Create a manual inventory entry (without a purchase invoice).
// Architectural role: Page-level composition using inventory hook and English domain types.
// All identifiers use English; JSX user-facing text remains in Spanish.

import { useEffect, useState, useCallback, useMemo, useRef, startTransition } from "react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { BcvRateInput, parseRateStr, roundRateValue, useBcvRate } from "@/src/modules/inventory/frontend/components/bcv-rate-input";
import type { Movement } from "@/src/modules/inventory/backend/domain/movement";
import type { Product } from "@/src/modules/inventory/backend/domain/product";

// ── helpers ───────────────────────────────────────────────────────────────────

const todayStr = () => getTodayIsoDate();
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtN = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const labelCls = "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

type IvaMode = "agregado" | "incluido";

// ── ManualItem ────────────────────────────────────────────────────────────────

interface ManualItem {
    productId: string;
    productName: string;
    quantity: number;
    currency: "B" | "D";
    currencyCost: number; // price entered in the chosen currency (base or incl. VAT depending on ivaMode)
    vatRate: number;      // 0 or 0.16, derived from product
}

function emptyManualItem(): ManualItem {
    return { productId: "", productName: "", quantity: 1, currency: "B", currencyCost: 0, vatRate: 0 };
}

function computeCosts(item: ManualItem, dollarRate: number | null, ivaMode: IvaMode) {
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
        // incluido: price already includes VAT — extract base
        baseCostBs = round2(enteredPriceBs / (1 + item.vatRate));
        vatUnitBs = round2(enteredPriceBs - baseCostBs);
    }

    // For USD: currencyCost stored = base price in USD (without VAT)
    const baseCurrencyCost = item.currency === "D"
        ? (ivaMode === "incluido" && item.vatRate > 0
            ? round2(item.currencyCost / (1 + item.vatRate))
            : item.currencyCost)
        : null;

    return {
        unitCost: baseCostBs,                                        // base without VAT — stored
        totalCost: round2(baseCostBs * item.quantity),               // base total — stored
        vatTotalAmount: round2(vatUnitBs * item.quantity),           // display
        totalWithVat: round2((baseCostBs + vatUnitBs) * item.quantity), // display
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
    const filtered = products.filter(
        (p) => p.active !== false && p.name.toLowerCase().includes(search.toLowerCase()),
    );

    useEffect(() => {
        const el = listRef.current?.children[hiIdx] as HTMLElement | undefined;
        el?.scrollIntoView({ block: "nearest" });
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
        if (!wrapRef.current?.contains(e.relatedTarget as Node)) { setOpen(false); setSearch(""); }
    }

    const displayValue = open ? search : (selected?.name ?? "");

    return (
        <div ref={wrapRef} className="relative w-full" onBlur={handleBlur}>
            <div className="flex items-center gap-1.5">
                <BaseInput.Field
                    className="flex-1"
                    value={displayValue}
                    placeholder={open ? "Buscar producto…" : "Seleccionar producto…"}
                    onValueChange={(v) => { setSearch(v); setHiIdx(0); }}
                    onFocus={() => { setSearch(""); setHiIdx(0); setOpen(true); }}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                    spellCheck="false"
                />
                {selected && (
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        selected.vatType === "general"
                            ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                            : "bg-surface-2 text-[var(--text-tertiary)] border border-border-light"
                    }`}>
                        {selected.vatType === "general" ? "16%" : "EX"}
                    </span>
                )}
            </div>
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
                                    <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                                        p.vatType === "general"
                                            ? "text-amber-600"
                                            : "text-[var(--text-tertiary)]"
                                    }`}>
                                        {p.vatType === "general" ? "IVA 16%" : "Exento"}
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

export default function NuevaEntradaManualPage() {
    const router = useRouter();
    const { companyId } = useCompany();
    const { products, loadProducts, saveMovement, error, setError } = useInventory();

    const [date, setDate] = useState(todayStr());
    const [notes, setNotes] = useState("");
    const [ivaMode, setIvaMode] = useState<IvaMode>("agregado");
    const {
        rate: dollarRateStr,
        decimals: rateDecimals,
        setRateFromApi,
        setRateTyped,
        applyDecimals,
    } = useBcvRate();
    const [rateDateBcv, setRateDateBcv] = useState<string | null>(null);
    const [rateLoading, setRateLoading] = useState(false);
    const [rateError, setRateError] = useState<string | null>(null);

    const dollarRate = useMemo<number | null>(() => {
        const r = parseRateStr(dollarRateStr);
        return isFinite(r) ? roundRateValue(r, rateDecimals) : null;
    }, [dollarRateStr, rateDecimals]);
    const [items, setItems] = useState<ManualItem[]>([emptyManualItem()]);
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
            setRateDateBcv(null);
        });
        fetch(`/api/bcv/rate?date=${date}&code=USD`)
            .then((r) => r.json())
            .then((json) => {
                if (cancelled) return;
                if (json.rate) {
                    setRateFromApi(json.rate, rateDecimals);
                    setRateDateBcv(json.date);
                    setRateError(null);
                } else {
                    setRateError(json.error ?? "Sin datos BCV para esta fecha");
                }
            })
            .catch(() => { if (!cancelled) setRateError("Error al consultar BCV"); })
            .finally(() => { if (!cancelled) setRateLoading(false); });
        return () => { cancelled = true; };
    }, [date]);

    const updateItem = useCallback((index: number, patch: Partial<ManualItem>) => {
        setItems((prev) => prev.map((item, i) => i !== index ? item : { ...item, ...patch }));
    }, []);

    function addRow() { setItems((prev) => [...prev, emptyManualItem()]); }
    function removeRow(index: number) { setItems((prev) => prev.filter((_, i) => i !== index)); }

    function validate(): boolean {
        if (!companyId) { setError("Sin empresa seleccionada"); return false; }
        if (items.length === 0) { setError("Agrega al menos un producto"); return false; }
        for (const item of items) {
            if (!item.productId) { setError("Selecciona un producto en cada fila"); return false; }
            if (item.quantity <= 0) { setError("La cantidad debe ser mayor a 0"); return false; }
            if (item.currencyCost < 0) { setError("El costo no puede ser negativo"); return false; }
            if (item.currency === "D" && !dollarRate) {
                setError("No hay tasa BCV disponible para esta fecha. Cambia la fecha o usa Bs.");
                return false;
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
            const movement: Movement = {
                companyId: companyId!,
                productId: item.productId,
                type: "entrada",
                date,
                period: date.slice(0, 7),
                quantity: item.quantity,
                unitCost,
                totalCost,
                balanceQuantity: 0,
                reference: "Entrada manual",
                notes,
                currency: item.currency,
                currencyCost: baseCurrencyCost,
                dollarRate: item.currency === "D" ? dollarRate : null,
            };
            const result = await saveMovement(movement);
            if (!result) { allOk = false; break; }
        }
        setSaving(false);
        if (allOk) setSaved(true);
    }

    const totals = items.reduce(
        (acc, item) => {
            const { totalCost, vatTotalAmount, totalWithVat } = computeCosts(item, dollarRate, ivaMode);
            return { subtotal: acc.subtotal + totalCost, vat: acc.vat + vatTotalAmount, total: acc.total + totalWithVat };
        },
        { subtotal: 0, vat: 0, total: 0 },
    );
    const hasVat = items.some((i) => i.vatRate > 0);
    const priceLabel = ivaMode === "agregado" ? "Precio base" : "Precio c/IVA";

    if (saved) {
        const period = date.slice(0, 7);
        return (
            <div className="min-h-full bg-surface-2 font-mono">
                <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                    <h1 className="text-[16px] font-bold uppercase tracking-[0.14em] text-foreground">Entrada Manual</h1>
                </div>
                <div className="px-8 py-10 flex flex-col items-center">
                    <div className="rounded-xl border border-green-500/20 bg-green-500/[0.05] px-8 py-8 text-center max-w-md w-full">
                        <div className="text-green-500 text-[13px] font-bold uppercase tracking-[0.12em] mb-2">Entrada registrada</div>
                        <p className="text-[var(--text-secondary)] text-[13px] mb-6">
                            Las existencias han sido actualizadas exitosamente.
                        </p>
                        <div className="flex items-center justify-center gap-3">
                            <BaseButton.Root
                                variant="primary"
                                size="md"
                                onClick={() => router.push("/inventory/purchases")}
                            >
                                Ver entradas
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
            <PageHeader title="Entrada Manual de Inventario" subtitle="Registro directo de aumento de existencias">
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

                {/* Datos de la entrada */}
                <div className="rounded-xl border border-border-light bg-surface-1 p-6">
                    <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground mb-5">
                        Datos de la entrada
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                        {/* Fecha */}
                        <BaseInput.Field
                            label="Fecha *"
                            type="date"
                            value={date}
                            onValueChange={setDate}
                        />

                        {/* Tasa BCV */}
                        <BcvRateInput
                            rate={dollarRateStr}
                            onRateChange={(v) => { setRateTyped(v); setRateDateBcv(null); }}
                            decimals={rateDecimals}
                            onDecimalsChange={applyDecimals}
                            loading={rateLoading}
                            bcvDate={rateDateBcv}
                            error={rateError}
                        />

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
                                        ? "El precio ingresado es la base — el IVA se calcula y suma encima."
                                        : "El precio ingresado ya incluye IVA — se extrae la base para el inventario."}
                                </span>
                            </div>
                        </div>

                        {/* Notas */}
                        <div className="col-span-2">
                            <BaseInput.Field
                                label="Notas"
                                type="text"
                                value={notes}
                                onValueChange={setNotes}
                                placeholder="Motivo, referencia interna, etc."
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
                    <div className="grid grid-cols-[1fr_120px_160px_90px_36px] gap-2 px-4 py-2 border-b border-border-light bg-surface-2">
                        {["Producto", "Cantidad", priceLabel, "Moneda", ""].map((h, i) => (
                            <span key={i} className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{h}</span>
                        ))}
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-border-light/50">
                        {items.map((item, idx) => (
                            <div key={idx} className="grid grid-cols-[1fr_120px_160px_90px_36px] gap-2 px-4 py-2 items-center">
                                {/* Product + VAT badge */}
                                <ProductCombo
                                    value={item.productId}
                                    products={products}
                                    onChange={(id, name, vatRate) => updateItem(idx, { productId: id, productName: name, vatRate })}
                                />

                                {/* Quantity */}
                                <BaseInput.Field
                                    type="number"
                                    className="w-full"
                                    inputClassName="text-right"
                                    value={item.quantity ? String(item.quantity) : ""}
                                    onValueChange={(v) => updateItem(idx, { quantity: Number(v) || 0 })}
                                    placeholder="0"
                                    min={0}
                                    step={1}
                                />

                                {/* Price */}
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

                                {/* Currency toggle */}
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

                                {/* Delete */}
                                <button
                                    type="button"
                                    onClick={() => removeRow(idx)}
                                    disabled={items.length === 1}
                                    className="w-9 h-10 flex items-center justify-center text-[var(--text-tertiary)] hover:text-red-500 disabled:opacity-30 disabled:hover:text-[var(--text-tertiary)] transition-colors text-[16px]"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
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
                                {hasVat ? (
                                    <div className="flex items-center gap-4 text-[12px] tabular-nums">
                                        <span className="text-[var(--text-tertiary)]">
                                            Base <span className="text-foreground font-medium">Bs {fmtN(totals.subtotal)}</span>
                                        </span>
                                        <span className="text-[var(--text-tertiary)]">
                                            IVA <span className="text-amber-600 font-medium">Bs {fmtN(totals.vat)}</span>
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

                {/* Info note */}
                <div className="px-4 py-3 rounded-lg border border-border-light bg-surface-1 text-[12px] text-[var(--text-tertiary)]">
                    Esta entrada se registra directamente en el inventario sin asociarse a una factura de proveedor.
                    Si tienes una factura, usa <strong className="text-foreground">Nueva factura</strong> para incluir datos de IVA y proveedor.
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
                        {saving ? "Registrando…" : "Registrar entrada"}
                    </BaseButton.Root>
                </div>
            </div>
        </div>
    );
}
