"use client";

import { useEffect, useState, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { FacturaCompra, FacturaCompraItem } from "@/src/modules/inventory/backend/domain/factura-compra";

// ── helpers ──────────────────────────────────────────────────────────────────

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const readonlyCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-2 outline-none",
    "font-mono text-[13px] text-foreground/70 tabular-nums",
].join(" ");

const labelCls = "font-mono text-[9px] uppercase tracking-[0.18em] text-foreground/40 mb-1.5 block";

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) => {
    if (!d) return "—";
    return d.split("T")[0];
};

function emptyItem(): FacturaCompraItem {
    return { productoId: "", cantidad: 1, costoUnitario: 0, costoTotal: 0 };
}

// ── component ─────────────────────────────────────────────────────────────────

export default function FacturaDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { companyId } = useCompany();
    const {
        productos, loadProductos,
        proveedores, loadProveedores,
        currentFactura, loadingFactura, loadFactura,
        error, setError,
        saveFactura, confirmarFactura,
    } = useInventory();

    // Editable form state (only used when borrador)
    const [proveedorId, setProveedorId] = useState("");
    const [numeroFactura, setNumeroFactura] = useState("");
    const [fecha, setFecha] = useState("");
    const [ivaPorcentaje, setIvaPorcentaje] = useState(16);
    const [notas, setNotas] = useState("");
    const [items, setItems] = useState<FacturaCompraItem[]>([]);

    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [justConfirmed, setJustConfirmed] = useState(false);

    useEffect(() => {
        if (companyId) {
            loadProductos(companyId);
            loadProveedores(companyId);
        }
    }, [companyId, loadProductos, loadProveedores]);

    useEffect(() => {
        if (id) loadFactura(id);
    }, [id, loadFactura]);

    // Populate form when factura loads
    useEffect(() => {
        if (currentFactura && currentFactura.id === id) {
            setProveedorId(currentFactura.proveedorId);
            setNumeroFactura(currentFactura.numeroFactura);
            setFecha(fmtDate(currentFactura.fecha));
            setIvaPorcentaje(currentFactura.ivaPorcentaje);
            setNotas(currentFactura.notas);
            setItems(
                currentFactura.items && currentFactura.items.length > 0
                    ? currentFactura.items.map((i) => ({ ...i }))
                    : [emptyItem()]
            );
        }
    }, [currentFactura, id]);

    const isBorrador = currentFactura?.estado === "borrador";

    // Derived totals
    const subtotal = items.reduce((acc, i) => acc + (i.costoTotal ?? 0), 0);
    const ivaMonto = Math.round(subtotal * ivaPorcentaje / 100 * 100) / 100;
    const total = subtotal + ivaMonto;

    function updateItem(idx: number, field: keyof FacturaCompraItem, val: unknown) {
        setItems((prev) => {
            const next = [...prev];
            const item = { ...next[idx], [field]: val };
            if (field === "cantidad" || field === "costoUnitario") {
                item.costoTotal = Math.round(
                    Number(item.cantidad) * Number(item.costoUnitario) * 100
                ) / 100;
            }
            next[idx] = item as FacturaCompraItem;
            return next;
        });
    }

    function addItem() { setItems((prev) => [...prev, emptyItem()]); }
    function removeItem(idx: number) { setItems((prev) => prev.filter((_, i) => i !== idx)); }

    const buildFactura = useCallback((): FacturaCompra => ({
        id,
        empresaId:     currentFactura?.empresaId ?? companyId!,
        proveedorId,
        numeroFactura,
        fecha,
        periodo:       fecha.slice(0, 7),
        estado:        "borrador",
        subtotal,
        ivaPorcentaje,
        ivaMonto,
        total,
        notas,
    }), [id, currentFactura, companyId, proveedorId, numeroFactura, fecha, subtotal, ivaPorcentaje, ivaMonto, total, notas]);

    function validate(): boolean {
        if (!proveedorId) { setError("Selecciona un proveedor"); return false; }
        if (items.length === 0) { setError("Agrega al menos un producto"); return false; }
        for (const item of items) {
            if (!item.productoId) { setError("Selecciona un producto en cada fila"); return false; }
            if (item.cantidad <= 0) { setError("La cantidad debe ser mayor a 0"); return false; }
        }
        return true;
    }

    async function handleSaveDraft() {
        if (!validate()) return;
        setSaving(true);
        setError(null);
        await saveFactura(buildFactura(), items);
        setSaving(false);
    }

    async function handleConfirm() {
        if (!validate()) return;
        setConfirming(true);
        setError(null);
        const saved = await saveFactura(buildFactura(), items);
        if (!saved) { setConfirming(false); return; }
        const confirmed = await confirmarFactura(saved.id!);
        setConfirming(false);
        if (confirmed) setJustConfirmed(true);
    }

    if (loadingFactura) {
        return (
            <div className="min-h-full bg-surface-2 font-mono flex items-center justify-center">
                <span className="text-[11px] text-foreground/40">Cargando…</span>
            </div>
        );
    }

    if (!currentFactura && !loadingFactura) {
        return (
            <div className="min-h-full bg-surface-2 font-mono">
                <div className="px-8 py-6">
                    <p className="text-[11px] text-foreground/40">Factura no encontrada.</p>
                </div>
            </div>
        );
    }

    const factura = currentFactura!;
    const displayEstado = justConfirmed ? "confirmada" : factura.estado;
    const isConfirmada = displayEstado === "confirmada";

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div>
                            <h1 className="text-[13px] font-bold uppercase tracking-[0.18em] text-foreground">
                                Factura de Compra
                            </h1>
                            <p className="text-[10px] text-foreground/40 uppercase tracking-[0.16em] mt-0.5">
                                {factura.numeroFactura || `#${id.slice(0, 8)}`}
                            </p>
                        </div>
                        {isConfirmada ? (
                            <span className="inline-flex px-2 py-1 rounded text-[9px] uppercase tracking-[0.12em] font-medium bg-green-500/10 text-green-600">
                                Confirmada
                            </span>
                        ) : (
                            <span className="inline-flex px-2 py-1 rounded text-[9px] uppercase tracking-[0.12em] font-medium bg-amber-500/10 text-amber-600">
                                Borrador
                            </span>
                        )}
                    </div>
                    <button
                        onClick={() => router.back()}
                        className="h-8 px-3 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                    >
                        ← Volver
                    </button>
                </div>
            </div>

            <div className="px-8 py-6">
                {error && (
                    <div className="mb-4 px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[11px]">
                        {error}
                    </div>
                )}

                {justConfirmed && (
                    <div className="mb-4 px-4 py-3 rounded-lg border border-green-500/20 bg-green-500/[0.05] text-green-600 text-[11px]">
                        Factura confirmada — entradas de inventario registradas exitosamente.
                    </div>
                )}

                <div className="flex gap-6 items-start">
                    {/* Left panel */}
                    <div className="flex-1 min-w-0 space-y-4">

                        {/* Datos de la factura */}
                        <div className="rounded-xl border border-border-light bg-surface-1 p-6">
                            <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground mb-5">
                                Datos de la factura
                            </h2>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className={labelCls}>Proveedor</label>
                                    {isBorrador ? (
                                        <select className={fieldCls} value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                                            <option value="">Seleccionar proveedor…</option>
                                            {proveedores.filter((p) => p.activo).map((p) => (
                                                <option key={p.id} value={p.id}>{p.nombre}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div className={readonlyCls + " flex items-center"}>
                                            {factura.proveedorNombre ?? "—"}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className={labelCls}>Nº Factura</label>
                                    {isBorrador ? (
                                        <input className={fieldCls} value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} />
                                    ) : (
                                        <div className={readonlyCls + " flex items-center"}>
                                            {factura.numeroFactura || "—"}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className={labelCls}>Fecha</label>
                                    {isBorrador ? (
                                        <input type="date" className={fieldCls} value={fecha} onChange={(e) => setFecha(e.target.value)} />
                                    ) : (
                                        <div className={readonlyCls + " flex items-center"}>
                                            {fmtDate(factura.fecha)}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className={labelCls}>IVA %</label>
                                    {isBorrador ? (
                                        <input type="number" min="0" max="100" step="0.01" className={fieldCls} value={ivaPorcentaje} onChange={(e) => setIvaPorcentaje(parseFloat(e.target.value) || 0)} />
                                    ) : (
                                        <div className={readonlyCls + " flex items-center"}>
                                            {factura.ivaPorcentaje}%
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Notas</label>
                                {isBorrador ? (
                                    <textarea className={`${fieldCls} h-auto py-2`} rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
                                ) : (
                                    <div className={`${readonlyCls} h-auto py-2 min-h-[60px]`}>
                                        {factura.notas || "—"}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Items */}
                        <div className="rounded-xl border border-border-light bg-surface-1 p-6">
                            <div className="flex items-center justify-between mb-5">
                                <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground">
                                    Productos
                                </h2>
                                {isBorrador && (
                                    <button
                                        onClick={addItem}
                                        className="h-7 px-3 rounded-lg border border-border-medium bg-surface-2 hover:bg-surface-1 text-foreground/60 hover:text-foreground text-[10px] uppercase tracking-[0.12em] transition-colors"
                                    >
                                        + Agregar fila
                                    </button>
                                )}
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-[11px]">
                                    <thead>
                                        <tr className="border-b border-border-light">
                                            {["Producto", "Cantidad", "Costo Unit.", "Costo Total", ...(isBorrador ? [""] : [])].map((h) => (
                                                <th key={h} className="px-3 py-2 text-left text-[9px] uppercase tracking-[0.18em] text-foreground/40 font-normal whitespace-nowrap">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item, idx) => (
                                            <tr key={idx} className="border-b border-border-light/40">
                                                <td className="px-2 py-2 w-1/3">
                                                    {isBorrador ? (
                                                        <select className={fieldCls} value={item.productoId} onChange={(e) => updateItem(idx, "productoId", e.target.value)}>
                                                            <option value="">Seleccionar…</option>
                                                            {productos.filter((p) => p.activo).map((p) => (
                                                                <option key={p.id} value={p.id}>{p.nombre}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <span className="text-foreground">{item.productoNombre ?? item.productoId}</span>
                                                    )}
                                                </td>
                                                <td className="px-2 py-2 w-24">
                                                    {isBorrador ? (
                                                        <input type="number" min="0.0001" step="0.0001" className={fieldCls} value={item.cantidad} onChange={(e) => updateItem(idx, "cantidad", parseFloat(e.target.value) || 0)} />
                                                    ) : (
                                                        <span className="tabular-nums text-foreground/80">{item.cantidad}</span>
                                                    )}
                                                </td>
                                                <td className="px-2 py-2 w-28">
                                                    {isBorrador ? (
                                                        <input type="number" min="0" step="0.0001" className={fieldCls} value={item.costoUnitario} onChange={(e) => updateItem(idx, "costoUnitario", parseFloat(e.target.value) || 0)} />
                                                    ) : (
                                                        <span className="tabular-nums text-foreground/80">{fmtN(item.costoUnitario)}</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-foreground/80 text-right">
                                                    {fmtN(item.costoTotal)}
                                                </td>
                                                {isBorrador && (
                                                    <td className="px-2 py-2 text-center">
                                                        <button
                                                            onClick={() => removeItem(idx)}
                                                            disabled={items.length === 1}
                                                            className="text-foreground/30 hover:text-red-500 disabled:opacity-20 disabled:cursor-not-allowed text-[14px] leading-none transition-colors"
                                                        >
                                                            ×
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Totals */}
                            <div className="mt-4 pt-4 border-t border-border-light flex flex-col items-end gap-1.5 text-[11px]">
                                <div className="flex gap-8 items-center">
                                    <span className="text-foreground/40 uppercase tracking-[0.14em] text-[9px]">Subtotal</span>
                                    <span className="tabular-nums font-medium text-foreground/80 w-32 text-right">
                                        {fmtN(isBorrador ? subtotal : factura.subtotal)}
                                    </span>
                                </div>
                                <div className="flex gap-8 items-center">
                                    <span className="text-foreground/40 uppercase tracking-[0.14em] text-[9px]">IVA ({isBorrador ? ivaPorcentaje : factura.ivaPorcentaje}%)</span>
                                    <span className="tabular-nums text-foreground/60 w-32 text-right">
                                        {fmtN(isBorrador ? ivaMonto : factura.ivaMonto)}
                                    </span>
                                </div>
                                <div className="flex gap-8 items-center border-t border-border-light pt-1.5">
                                    <span className="text-foreground/40 uppercase tracking-[0.14em] text-[9px]">Total</span>
                                    <span className="tabular-nums font-bold text-foreground w-32 text-right">
                                        {fmtN(isBorrador ? total : factura.total)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        {isBorrador && (
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleSaveDraft}
                                    disabled={saving || confirming}
                                    className="h-8 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 disabled:opacity-50 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                                >
                                    {saving ? "Guardando…" : "Guardar borrador"}
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    disabled={saving || confirming}
                                    className="h-8 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                                >
                                    {confirming ? "Confirmando…" : "Confirmar factura"}
                                </button>
                            </div>
                        )}

                        {isConfirmada && (
                            <div className="flex items-center gap-3">
                                <Link
                                    href={`/inventory/movimientos?periodo=${factura.periodo}`}
                                    className="h-8 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors inline-flex items-center"
                                >
                                    Ver movimientos →
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* Right panel — summary */}
                    <div className="w-72 flex-shrink-0 sticky top-6">
                        <div className="rounded-xl border border-border-light bg-surface-1 p-5 space-y-4">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/40">
                                Resumen
                            </h3>
                            <div className="space-y-3 text-[11px]">
                                <div className="flex justify-between">
                                    <span className="text-foreground/40 uppercase tracking-[0.12em] text-[9px]">Proveedor</span>
                                    <span className="text-foreground font-medium truncate ml-4 text-right">
                                        {factura.proveedorNombre ?? "—"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-foreground/40 uppercase tracking-[0.12em] text-[9px]">Fecha</span>
                                    <span className="text-foreground tabular-nums">{fmtDate(factura.fecha)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-foreground/40 uppercase tracking-[0.12em] text-[9px]">Período</span>
                                    <span className="text-foreground tabular-nums">{factura.periodo}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-foreground/40 uppercase tracking-[0.12em] text-[9px]">Ítems</span>
                                    <span className="text-foreground tabular-nums">{(factura.items ?? items).length}</span>
                                </div>
                            </div>
                            <div className="pt-3 border-t border-border-light space-y-2 text-[11px]">
                                <div className="flex justify-between">
                                    <span className="text-foreground/40 uppercase tracking-[0.12em] text-[9px]">Subtotal</span>
                                    <span className="tabular-nums text-foreground/80">{fmtN(factura.subtotal)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-foreground/40 uppercase tracking-[0.12em] text-[9px]">IVA</span>
                                    <span className="tabular-nums text-foreground/60">{fmtN(factura.ivaMonto)}</span>
                                </div>
                                <div className="flex justify-between font-bold">
                                    <span className="text-foreground/60 uppercase tracking-[0.12em] text-[9px]">Total</span>
                                    <span className="tabular-nums text-foreground">{fmtN(factura.total)}</span>
                                </div>
                            </div>
                            {isConfirmada && factura.confirmadaAt && (
                                <div className="pt-3 border-t border-border-light">
                                    <span className="text-[9px] uppercase tracking-[0.12em] text-green-500">
                                        Confirmada
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
