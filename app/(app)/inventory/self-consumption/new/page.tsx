"use client";

import { useEffect, useState, useCallback, useRef, startTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { Movement } from "@/src/modules/inventory/backend/domain/movement";
import type { Product } from "@/src/modules/inventory/backend/domain/product";

// ── helpers ───────────────────────────────────────────────────────────────────

const todayStr = () => getTodayIsoDate();
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtN = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fieldCls = [
    "w-full h-10 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[14px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

type IvaMode = "agregado" | "incluido";

// ── AutoconsumoItem ───────────────────────────────────────────────────────────

interface AutoconsumoItem {
    productoId: string;
    productoNombre: string;
    cantidad: number;
    moneda: "B" | "D";
    costoMoneda: number;
    ivaTasa: number;
}

function emptyAutoconsumoItem(): AutoconsumoItem {
    return { productoId: "", productoNombre: "", cantidad: 1, moneda: "B", costoMoneda: 0, ivaTasa: 0 };
}

function computeCostos(item: AutoconsumoItem, tasaDolar: number | null, ivaMode: IvaMode) {
    const precioIngresadoBs = item.moneda === "D"
        ? (tasaDolar ? round2(item.costoMoneda * tasaDolar) : 0)
        : item.costoMoneda;

    let costoBaseBs: number;
    let ivaUnitarioBs: number;

    if (item.ivaTasa === 0) {
        costoBaseBs = precioIngresadoBs;
        ivaUnitarioBs = 0;
    } else if (ivaMode === "agregado") {
        costoBaseBs = precioIngresadoBs;
        ivaUnitarioBs = round2(precioIngresadoBs * item.ivaTasa);
    } else {
        costoBaseBs = round2(precioIngresadoBs / (1 + item.ivaTasa));
        ivaUnitarioBs = round2(precioIngresadoBs - costoBaseBs);
    }

    const costoBaseMoneda = item.moneda === "D"
        ? (ivaMode === "incluido" && item.ivaTasa > 0
            ? round2(item.costoMoneda / (1 + item.ivaTasa))
            : item.costoMoneda)
        : null;

    return {
        costoUnitario: costoBaseBs,
        costoTotal: round2(costoBaseBs * item.cantidad),
        ivaMontoTotal: round2(ivaUnitarioBs * item.cantidad),
        totalConIva: round2((costoBaseBs + ivaUnitarioBs) * item.cantidad),
        costoBaseMoneda,
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
                <input
                    className={fieldCls}
                    value={displayValue}
                    placeholder={open ? "Buscar producto…" : "Seleccionar producto…"}
                    onChange={(e) => { setSearch(e.target.value); setHiIdx(0); }}
                    onFocus={() => { setSearch(""); setHiIdx(0); setOpen(true); }}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                    spellCheck={false}
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
                                    <span className="text-[11px] text-[var(--text-tertiary)]">
                                        ({fmtN(p.currentStock)} {p.measureUnit})
                                    </span>
                                    <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                                        p.vatType === "general" ? "text-amber-600" : "text-[var(--text-tertiary)]"
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

export default function NuevoAutoconsumoPage() {
    const router = useRouter();
    const { companyId } = useCompany();
    const { products, loadProducts, saveMovement, error, setError } = useInventory();

    const [fecha, setFecha] = useState(todayStr());
    const [destino, setDestino] = useState("");
    const [notas, setNotas] = useState("");
    const [ivaMode, setIvaMode] = useState<IvaMode>("agregado");
    const [tasaDolar, setTasaDolar] = useState<number | null>(null);
    const [tasaFechaBcv, setTasaFechaBcv] = useState<string | null>(null);
    const [tasaLoading, setTasaLoading] = useState(false);
    const [tasaError, setTasaError] = useState<string | null>(null);
    const [items, setItems] = useState<AutoconsumoItem[]>([emptyAutoconsumoItem()]);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (companyId) loadProducts(companyId);
    }, [companyId, loadProducts]);

    useEffect(() => {
        if (!fecha) return;
        let cancelled = false;
        startTransition(() => {
            setTasaLoading(true);
            setTasaError(null);
            setTasaFechaBcv(null);
        });
        fetch(`/api/bcv/rate?date=${fecha}&code=USD`)
            .then((r) => r.json())
            .then((json) => {
                if (cancelled) return;
                if (json.rate) {
                    setTasaDolar(json.rate);
                    setTasaFechaBcv(json.date);
                    setTasaError(null);
                } else {
                    setTasaError(json.error ?? "Sin datos BCV para esta fecha");
                }
            })
            .catch(() => { if (!cancelled) setTasaError("Error al consultar BCV"); })
            .finally(() => { if (!cancelled) setTasaLoading(false); });
        return () => { cancelled = true; };
    }, [fecha]);

    const updateItem = useCallback((index: number, patch: Partial<AutoconsumoItem>) => {
        setItems((prev) => prev.map((item, i) => i !== index ? item : { ...item, ...patch }));
    }, []);

    function addRow() { setItems((prev) => [...prev, emptyAutoconsumoItem()]); }
    function removeRow(index: number) { setItems((prev) => prev.filter((_, i) => i !== index)); }

    function getProduct(id: string) { return products.find((p) => p.id === id); }

    function validate(): boolean {
        if (!companyId) { setError("Sin empresa seleccionada"); return false; }
        if (!destino.trim()) { setError("El destino del autoconsumo es obligatorio"); return false; }
        if (items.length === 0) { setError("Agrega al menos un producto"); return false; }
        for (const item of items) {
            if (!item.productoId) { setError("Selecciona un producto en cada fila"); return false; }
            if (item.cantidad <= 0) { setError("La cantidad debe ser mayor a 0"); return false; }
            if (item.costoMoneda < 0) { setError("El costo no puede ser negativo"); return false; }
            if (item.moneda === "D" && !tasaDolar) {
                setError("No hay tasa BCV disponible para esta fecha. Cambia la fecha o usa Bs.");
                return false;
            }
            const prod = getProduct(item.productoId);
            if (prod && item.cantidad > prod.currentStock) {
                setError(`Stock insuficiente para "${prod.name}": disponible ${fmtN(prod.currentStock)}`);
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
            const { costoUnitario, costoTotal, costoBaseMoneda } = computeCostos(item, tasaDolar, ivaMode);
            const mov: Movement = {
                companyId: companyId!,
                productId: item.productoId,
                type: "autoconsumo",
                date: fecha,
                period: fecha.slice(0, 7),
                quantity: item.cantidad,
                unitCost: costoUnitario,
                totalCost: costoTotal,
                balanceQuantity: 0,
                reference: "Autoconsumo",
                notes: destino + (notas ? ` — ${notas}` : ""),
                currency: item.moneda,
                currencyCost: costoBaseMoneda,
                dollarRate: item.moneda === "D" ? tasaDolar : null,
            };
            const result = await saveMovement(mov);
            if (!result) { allOk = false; break; }
        }
        setSaving(false);
        if (allOk) setSaved(true);
    }

    const totals = items.reduce(
        (acc, item) => {
            const { costoTotal, ivaMontoTotal, totalConIva } = computeCostos(item, tasaDolar, ivaMode);
            return { subtotal: acc.subtotal + costoTotal, iva: acc.iva + ivaMontoTotal, total: acc.total + totalConIva };
        },
        { subtotal: 0, iva: 0, total: 0 },
    );
    const hasIva = items.some((i) => i.ivaTasa > 0);
    const costoLabel = ivaMode === "agregado" ? "Costo base" : "Costo c/IVA";

    if (saved) {
        const periodo = fecha.slice(0, 7);
        return (
            <div className="min-h-full bg-surface-2 font-mono">
                <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                    <h1 className="text-[16px] font-bold uppercase tracking-[0.14em] text-foreground">Autoconsumo</h1>
                </div>
                <div className="px-8 py-10 flex flex-col items-center">
                    <div className="rounded-xl border border-green-500/20 bg-green-500/[0.05] px-8 py-8 text-center max-w-md w-full">
                        <div className="text-green-500 text-[13px] font-bold uppercase tracking-[0.12em] mb-2">Autoconsumo registrado</div>
                        <p className="text-[var(--text-secondary)] text-[13px] mb-6">
                            Las existencias han sido actualizadas exitosamente.
                        </p>
                        <div className="flex items-center justify-center gap-3">
                            <BaseButton.Root
                                variant="primary"
                                size="md"
                                onClick={() => router.push("/inventory/self-consumption")}
                            >
                                Ver autoconsumos
                            </BaseButton.Root>
                            <BaseButton.Root
                                variant="secondary"
                                size="md"
                                onClick={() => router.push(`/inventory/movements?periodo=${periodo}`)}
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
            <PageHeader title="Nuevo Autoconsumo" subtitle="Retiro de inventario para uso interno de la empresa">
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

                {/* Datos del autoconsumo */}
                <div className="rounded-xl border border-border-light bg-surface-1 p-6">
                    <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground mb-5">
                        Datos del autoconsumo
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                        {/* Fecha */}
                        <div>
                            <label className={labelCls}>Fecha *</label>
                            <input
                                type="date"
                                className={fieldCls}
                                value={fecha}
                                onChange={(e) => setFecha(e.target.value)}
                            />
                        </div>

                        {/* Tasa BCV */}
                        <div>
                            <label className={labelCls}>Tasa BCV (Bs/USD)</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    className={fieldCls}
                                    value={tasaDolar ?? ""}
                                    onChange={(e) => setTasaDolar(e.target.value ? Number(e.target.value) : null)}
                                    placeholder="0.00"
                                    step="0.01"
                                />
                                {tasaLoading && (
                                    <span className="text-[11px] text-[var(--text-tertiary)] whitespace-nowrap">Cargando…</span>
                                )}
                                {!tasaLoading && tasaFechaBcv && (
                                    <span className="text-[11px] text-green-600 whitespace-nowrap">BCV {tasaFechaBcv}</span>
                                )}
                                {!tasaLoading && !tasaFechaBcv && tasaError && (
                                    <span className="text-[11px] text-[var(--text-tertiary)] whitespace-nowrap">{tasaError}</span>
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

                        {/* Destino */}
                        <div className="col-span-2">
                            <label className={labelCls}>Destino / Uso *</label>
                            <input
                                type="text"
                                className={fieldCls}
                                value={destino}
                                onChange={(e) => setDestino(e.target.value)}
                                placeholder="Ej: Administración, Producción, Mantenimiento, Obsequio…"
                            />
                        </div>

                        {/* Notas */}
                        <div className="col-span-2">
                            <label className={labelCls}>Notas adicionales</label>
                            <input
                                type="text"
                                className={fieldCls}
                                value={notas}
                                onChange={(e) => setNotas(e.target.value)}
                                placeholder="Observaciones, referencia interna…"
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
                    <div className="grid grid-cols-[1fr_120px_160px_90px_160px_36px] gap-2 px-4 py-2 border-b border-border-light bg-surface-2">
                        {["Producto", "Cantidad", costoLabel, "Moneda", "Existencia", ""].map((h, i) => (
                            <span key={i} className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{h}</span>
                        ))}
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-border-light/50">
                        {items.map((item, idx) => {
                            const prod = getProduct(item.productoId);
                            const stockOk = !prod || item.cantidad <= prod.currentStock;
                            const saldoTras = prod ? prod.currentStock - item.cantidad : null;

                            return (
                                <div key={idx} className="grid grid-cols-[1fr_120px_160px_90px_160px_36px] gap-2 px-4 py-2 items-center">
                                    {/* Producto */}
                                    <ProductCombo
                                        value={item.productoId}
                                        products={products}
                                        onChange={(id, name, vatRate) => updateItem(idx, { productoId: id, productoNombre: name, ivaTasa: vatRate })}
                                    />

                                    {/* Cantidad */}
                                    <input
                                        type="number"
                                        className={fieldCls + (stockOk ? "" : " border-red-500/40 focus:border-red-500/60") + " text-right"}
                                        value={item.cantidad || ""}
                                        onChange={(e) => updateItem(idx, { cantidad: Number(e.target.value) || 0 })}
                                        placeholder="0"
                                        min="0.0001"
                                        step="0.0001"
                                    />

                                    {/* Costo */}
                                    <div className="relative">
                                        <input
                                            type="number"
                                            className={fieldCls + " text-right pr-10"}
                                            value={item.costoMoneda || ""}
                                            onChange={(e) => updateItem(idx, { costoMoneda: Number(e.target.value) || 0 })}
                                            placeholder="0.00"
                                            min="0"
                                            step="0.01"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-tertiary)] pointer-events-none">
                                            {item.moneda === "D" ? "USD" : "Bs"}
                                        </span>
                                    </div>

                                    {/* Moneda toggle */}
                                    <div className="flex rounded-lg border border-border-light overflow-hidden h-10 text-[12px]">
                                        <button
                                            type="button"
                                            className={[
                                                "flex-1 transition-colors",
                                                item.moneda === "B" ? "bg-primary-500 text-white" : "bg-surface-1 text-[var(--text-secondary)] hover:bg-surface-2",
                                            ].join(" ")}
                                            onClick={() => updateItem(idx, { moneda: "B" })}
                                        >
                                            Bs
                                        </button>
                                        <button
                                            type="button"
                                            className={[
                                                "flex-1 transition-colors",
                                                item.moneda === "D" ? "bg-primary-500 text-white" : "bg-surface-1 text-[var(--text-secondary)] hover:bg-surface-2",
                                            ].join(" ")}
                                            onClick={() => updateItem(idx, { moneda: "D" })}
                                        >
                                            USD
                                        </button>
                                    </div>

                                    {/* Existencia */}
                                    <div className="px-1 space-y-0.5">
                                        {prod ? (
                                            <>
                                                <div className="flex justify-between text-[12px]">
                                                    <span className="text-[var(--text-tertiary)]">Disponible</span>
                                                    <span className={`tabular-nums font-medium ${!stockOk ? "text-red-500" : "text-foreground"}`}>
                                                        {fmtN(prod.currentStock)}
                                                    </span>
                                                </div>
                                                {item.cantidad > 0 && (
                                                    <div className="flex justify-between text-[12px]">
                                                        <span className="text-[var(--text-tertiary)]">Tras retiro</span>
                                                        <span className={`tabular-nums font-medium ${!stockOk ? "text-red-500" : "text-[var(--text-secondary)]"}`}>
                                                            {fmtN(saldoTras!)}
                                                        </span>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <span className="text-[11px] text-[var(--text-tertiary)]">—</span>
                                        )}
                                    </div>

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
                                {items.some((i) => i.moneda === "D") && tasaDolar && (
                                    <span className="text-[12px] text-[var(--text-tertiary)]">
                                        Tasa: {fmtN(tasaDolar)} Bs/USD
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
                    El autoconsumo retira mercancía del inventario para uso interno. Según el Art. 4 de la LIVA, puede constituir un hecho imponible si los bienes generan crédito fiscal.
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
                        {saving ? "Registrando…" : "Registrar autoconsumo"}
                    </BaseButton.Root>
                </div>
            </div>
        </div>
    );
}
