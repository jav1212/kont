"use client";

import { useEffect, useState, useCallback, useRef, startTransition } from "react";
import { useRouter } from "next/navigation";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { Movimiento } from "@/src/modules/inventory/backend/domain/movimiento";
import type { Producto } from "@/src/modules/inventory/backend/domain/producto";

// ── helpers ───────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split("T")[0];
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtN = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fieldCls = [
    "w-full h-10 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[14px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

type IvaMode = "agregado" | "incluido";

// ── SalidaItem ────────────────────────────────────────────────────────────────

interface SalidaItem {
    productoId: string;
    productoNombre: string;
    cantidad: number;
    moneda: "B" | "D";
    precioMoneda: number; // precio ingresado en la moneda elegida (base o c/IVA según ivaMode)
    ivaTasa: number;      // 0 o 0.16, derivado del producto
}

function emptySalidaItem(): SalidaItem {
    return { productoId: "", productoNombre: "", cantidad: 1, moneda: "B", precioMoneda: 0, ivaTasa: 0 };
}

function computePrecios(item: SalidaItem, tasaDolar: number | null, ivaMode: IvaMode) {
    const precioIngresadoBs = item.moneda === "D"
        ? (tasaDolar ? round2(item.precioMoneda * tasaDolar) : 0)
        : item.precioMoneda;

    let precioBaseBs: number;
    let ivaUnitarioBs: number;

    if (item.ivaTasa === 0) {
        precioBaseBs = precioIngresadoBs;
        ivaUnitarioBs = 0;
    } else if (ivaMode === "agregado") {
        precioBaseBs = precioIngresadoBs;
        ivaUnitarioBs = round2(precioIngresadoBs * item.ivaTasa);
    } else {
        // incluido: el precio ya trae IVA → extraer base
        precioBaseBs = round2(precioIngresadoBs / (1 + item.ivaTasa));
        ivaUnitarioBs = round2(precioIngresadoBs - precioBaseBs);
    }

    // Para USD: precioMoneda guardado = precio base en USD (sin IVA)
    const precioBaseMoneda = item.moneda === "D"
        ? (ivaMode === "incluido" && item.ivaTasa > 0
            ? round2(item.precioMoneda / (1 + item.ivaTasa))
            : item.precioMoneda)
        : null;

    return {
        precioUnitario: precioBaseBs,                                             // base sin IVA → se guarda
        precioTotal: round2(precioBaseBs * item.cantidad),                        // base total → se guarda
        ivaMontoTotal: round2(ivaUnitarioBs * item.cantidad),                     // display
        totalConIva: round2((precioBaseBs + ivaUnitarioBs) * item.cantidad),     // display
        precioBaseMoneda,
    };
}

// ── ProductCombo ──────────────────────────────────────────────────────────────

function ProductCombo({
    value,
    productos,
    onChange,
}: {
    value: string;
    productos: Producto[];
    onChange: (id: string, nombre: string, ivaTasa: number) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [hiIdx, setHiIdx] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const selected = productos.find((p) => p.id === value);
    const filtered = productos
        .filter((p) => p.activo !== false && p.nombre.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 12);

    useEffect(() => {
        const el = listRef.current?.children[hiIdx] as HTMLElement | undefined;
        el?.scrollIntoView({ block: "nearest" });
    }, [hiIdx]);

    function select(p: Producto) {
        onChange(p.id!, p.nombre, p.ivaTipo === "general" ? 0.16 : 0);
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

    const displayValue = open ? search : (selected?.nombre ?? "");

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
                        selected.ivaTipo === "general"
                            ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                            : "bg-surface-2 text-[var(--text-tertiary)] border border-border-light"
                    }`}>
                        {selected.ivaTipo === "general" ? "16%" : "EX"}
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
                                    {p.codigo && <span className="font-mono text-[11px] text-[var(--text-tertiary)]">{p.codigo}</span>}
                                    <span className="flex-1">{p.nombre}</span>
                                    <span className="text-[11px] text-[var(--text-tertiary)]">
                                        ({fmtN(p.existenciaActual)} {p.unidadMedida})
                                    </span>
                                    <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                                        p.ivaTipo === "general" ? "text-amber-600" : "text-[var(--text-tertiary)]"
                                    }`}>
                                        {p.ivaTipo === "general" ? "IVA 16%" : "Exento"}
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

export default function NuevaSalidaManualPage() {
    const router = useRouter();
    const { companyId } = useCompany();
    const { productos, loadProductos, saveMovimiento, error, setError } = useInventory();

    const [fecha, setFecha] = useState(todayStr());
    const [notas, setNotas] = useState("");
    const [ivaMode, setIvaMode] = useState<IvaMode>("agregado");
    const [tasaDolar, setTasaDolar] = useState<number | null>(null);
    const [tasaFechaBcv, setTasaFechaBcv] = useState<string | null>(null);
    const [tasaLoading, setTasaLoading] = useState(false);
    const [tasaError, setTasaError] = useState<string | null>(null);
    const [items, setItems] = useState<SalidaItem[]>([emptySalidaItem()]);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (companyId) loadProductos(companyId);
    }, [companyId, loadProductos]);

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

    const updateItem = useCallback((index: number, patch: Partial<SalidaItem>) => {
        setItems((prev) => prev.map((item, i) => i !== index ? item : { ...item, ...patch }));
    }, []);

    function addRow() { setItems((prev) => [...prev, emptySalidaItem()]); }
    function removeRow(index: number) { setItems((prev) => prev.filter((_, i) => i !== index)); }

    function getProducto(id: string) { return productos.find((p) => p.id === id); }

    function validate(): boolean {
        if (!companyId) { setError("Sin empresa seleccionada"); return false; }
        if (items.length === 0) { setError("Agrega al menos un producto"); return false; }
        for (const item of items) {
            if (!item.productoId) { setError("Selecciona un producto en cada fila"); return false; }
            if (item.cantidad <= 0) { setError("La cantidad debe ser mayor a 0"); return false; }
            if (item.precioMoneda < 0) { setError("El precio no puede ser negativo"); return false; }
            if (item.moneda === "D" && !tasaDolar) {
                setError("No hay tasa BCV disponible para esta fecha. Cambia la fecha o usa Bs.");
                return false;
            }
            const prod = getProducto(item.productoId);
            if (prod && item.cantidad > prod.existenciaActual) {
                setError(`Stock insuficiente para "${prod.nombre}": disponible ${fmtN(prod.existenciaActual)}`);
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
            const { precioUnitario, precioTotal, precioBaseMoneda } = computePrecios(item, tasaDolar, ivaMode);
            const mov: Movimiento = {
                empresaId: companyId!,
                productoId: item.productoId,
                tipo: "salida",
                fecha,
                periodo: fecha.slice(0, 7),
                cantidad: item.cantidad,
                costoUnitario: precioUnitario,
                costoTotal: precioTotal,
                saldoCantidad: 0,
                referencia: "Salida manual",
                notas,
                moneda: item.moneda,
                costoMoneda: precioBaseMoneda,
                tasaDolar: item.moneda === "D" ? tasaDolar : null,
            };
            const result = await saveMovimiento(mov);
            if (!result) { allOk = false; break; }
        }
        setSaving(false);
        if (allOk) setSaved(true);
    }

    const totals = items.reduce(
        (acc, item) => {
            const { precioTotal, ivaMontoTotal, totalConIva } = computePrecios(item, tasaDolar, ivaMode);
            return { subtotal: acc.subtotal + precioTotal, iva: acc.iva + ivaMontoTotal, total: acc.total + totalConIva };
        },
        { subtotal: 0, iva: 0, total: 0 },
    );
    const hasIva = items.some((i) => i.ivaTasa > 0);
    const precioLabel = ivaMode === "agregado" ? "Precio base" : "Precio c/IVA";

    if (saved) {
        const periodo = fecha.slice(0, 7);
        return (
            <div className="min-h-full bg-surface-2 font-mono">
                <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                    <h1 className="text-[16px] font-bold uppercase tracking-[0.14em] text-foreground">Salida Manual</h1>
                </div>
                <div className="px-8 py-10 flex flex-col items-center">
                    <div className="rounded-xl border border-green-500/20 bg-green-500/[0.05] px-8 py-8 text-center max-w-md w-full">
                        <div className="text-green-500 text-[13px] font-bold uppercase tracking-[0.12em] mb-2">Salida registrada</div>
                        <p className="text-[var(--text-secondary)] text-[13px] mb-6">
                            Las existencias han sido actualizadas exitosamente.
                        </p>
                        <div className="flex items-center justify-center gap-3">
                            <button
                                onClick={() => router.push("/inventory/salidas")}
                                className="h-9 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                Ver salidas
                            </button>
                            <button
                                onClick={() => router.push(`/inventory/movimientos?periodo=${periodo}`)}
                                className="h-9 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                Ver movimientos
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[16px] font-bold uppercase tracking-[0.14em] text-foreground">
                            Salida Manual de Inventario
                        </h1>
                        <p className="text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em] mt-0.5">
                            Registro directo de disminución de existencias
                        </p>
                    </div>
                    <button
                        onClick={() => router.back()}
                        className="h-9 px-3 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[12px] uppercase tracking-[0.12em] transition-colors"
                    >
                        ← Volver
                    </button>
                </div>
            </div>

            <div className="px-8 py-6 space-y-5 max-w-4xl">
                {error && (
                    <div className="px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[13px]">
                        {error}
                    </div>
                )}

                {/* Datos de la salida */}
                <div className="rounded-xl border border-border-light bg-surface-1 p-6">
                    <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground mb-5">
                        Datos de la salida
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
                                        ? "El precio ingresado es la base — el IVA se calcula y suma encima."
                                        : "El precio ingresado ya incluye IVA — se extrae la base para el inventario."}
                                </span>
                            </div>
                        </div>

                        {/* Notas */}
                        <div className="col-span-2">
                            <label className={labelCls}>Notas</label>
                            <input
                                type="text"
                                className={fieldCls}
                                value={notas}
                                onChange={(e) => setNotas(e.target.value)}
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
                    <div className="grid grid-cols-[1fr_120px_160px_90px_160px_36px] gap-2 px-4 py-2 border-b border-border-light bg-surface-2">
                        {["Producto", "Cantidad", precioLabel, "Moneda", "Existencia", ""].map((h, i) => (
                            <span key={i} className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{h}</span>
                        ))}
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-border-light/50">
                        {items.map((item, idx) => {
                            const prod = getProducto(item.productoId);
                            const stockOk = !prod || item.cantidad <= prod.existenciaActual;
                            const saldoTras = prod ? prod.existenciaActual - item.cantidad : null;

                            return (
                                <div key={idx} className="grid grid-cols-[1fr_120px_160px_90px_160px_36px] gap-2 px-4 py-2 items-center">
                                    {/* Producto + badge IVA */}
                                    <ProductCombo
                                        value={item.productoId}
                                        productos={productos}
                                        onChange={(id, nombre, ivaTasa) => updateItem(idx, { productoId: id, productoNombre: nombre, ivaTasa })}
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

                                    {/* Precio */}
                                    <div className="relative">
                                        <input
                                            type="number"
                                            className={fieldCls + " text-right pr-10"}
                                            value={item.precioMoneda || ""}
                                            onChange={(e) => updateItem(idx, { precioMoneda: Number(e.target.value) || 0 })}
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
                                                        {fmtN(prod.existenciaActual)}
                                                    </span>
                                                </div>
                                                {item.cantidad > 0 && (
                                                    <div className="flex justify-between text-[12px]">
                                                        <span className="text-[var(--text-tertiary)]">Tras salida</span>
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
                    Esta salida se registra directamente en el inventario sin asociarse a una factura de cliente.
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pb-8">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        disabled={saving}
                        className="h-10 px-5 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 disabled:opacity-50 text-foreground text-[13px] uppercase tracking-[0.12em] transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="h-10 px-6 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[13px] uppercase tracking-[0.12em] transition-colors"
                    >
                        {saving ? "Registrando…" : "Registrar salida"}
                    </button>
                </div>
            </div>
        </div>
    );
}
