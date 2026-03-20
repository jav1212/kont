"use client";

import { useEffect, useState, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { FacturaCompra, FacturaCompraItem } from "@/src/modules/inventory/backend/domain/factura-compra";
import { FacturaItemsGrid, emptyItem } from "@/src/modules/inventory/frontend/components/factura-items-grid";

// ── types ──────────────────────────────────────────────────────────────────────
interface DevItem {
    productoId: string;
    nombre: string;
    cantOrig: number;
    costoUnit: number;
    cantDev: number;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const readonlyCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-2 outline-none",
    "font-mono text-[13px] text-[var(--text-secondary)] tabular-nums",
].join(" ");

const labelCls = "font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) => {
    if (!d) return "—";
    return d.split("T")[0];
};

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
        saveFactura, confirmarFactura, saveMovimiento,
    } = useInventory();

    // Editable form state (only used when borrador)
    const [proveedorId, setProveedorId] = useState("");
    const [numeroFactura, setNumeroFactura] = useState("");
    const [numeroControl, setNumeroControl] = useState("");
    const [fecha, setFecha] = useState("");
    const [notas, setNotas] = useState("");
    const [items, setItems] = useState<FacturaCompraItem[]>([]);

    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [justConfirmed, setJustConfirmed] = useState(false);

    // ── Devolución de compra ───────────────────────────────────────────────────
    const [showDevModal, setShowDevModal] = useState(false);
    const [devItems, setDevItems] = useState<DevItem[]>([]);
    const [devFecha, setDevFecha] = useState("");
    const [devNotas, setDevNotas] = useState("");
    const [savingDev, setSavingDev] = useState(false);
    const [devSuccess, setDevSuccess] = useState(false);

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
            setNumeroControl(currentFactura.numeroControl ?? '');
            setFecha(fmtDate(currentFactura.fecha));
            setNotas(currentFactura.notas);
            setItems(
                currentFactura.items && currentFactura.items.length > 0
                    ? currentFactura.items.map((i) => ({ ...i }))
                    : [emptyItem()]
            );
        }
    }, [currentFactura, id]);

    const isBorrador = currentFactura?.estado === "borrador";

    // Derived totals — computed per-item from ivaAlicuota
    const subtotal      = items.reduce((acc, i) => acc + (i.costoTotal ?? 0), 0);
    const baseExenta    = items.filter(i => (i.ivaAlicuota ?? "general_16") === "exenta").reduce((acc, i) => acc + i.costoTotal, 0);
    const baseGravada8  = items.filter(i => (i.ivaAlicuota ?? "general_16") === "reducida_8").reduce((acc, i) => acc + i.costoTotal, 0);
    const baseGravada16 = items.filter(i => (i.ivaAlicuota ?? "general_16") === "general_16").reduce((acc, i) => acc + i.costoTotal, 0);
    const iva8          = Math.round(baseGravada8  * 8  / 100 * 100) / 100;
    const iva16         = Math.round(baseGravada16 * 16 / 100 * 100) / 100;
    const ivaMonto      = iva8 + iva16;
    const total         = subtotal + ivaMonto;

    const buildFactura = useCallback((): FacturaCompra => ({
        id,
        empresaId:     currentFactura?.empresaId ?? companyId!,
        proveedorId,
        numeroFactura,
        numeroControl,
        fecha,
        periodo:       fecha.slice(0, 7),
        estado:        "borrador",
        subtotal,
        ivaPorcentaje: 0,
        ivaMonto,
        total,
        notas,
    }), [id, currentFactura, companyId, proveedorId, numeroFactura, numeroControl, fecha, subtotal, ivaMonto, total, notas]);

    function openDevModal() {
        const today = new Date().toISOString().split("T")[0];
        setDevFecha(today);
        setDevNotas("");
        setDevSuccess(false);
        setDevItems(
            (factura.items ?? []).map((item) => ({
                productoId:  item.productoId,
                nombre:      item.productoNombre ?? item.productoId,
                cantOrig:    item.cantidad,
                costoUnit:   item.costoUnitario,
                cantDev:     0,
            }))
        );
        setShowDevModal(true);
    }

    async function handleDevolucion() {
        const toReturn = devItems.filter((i) => i.cantDev > 0);
        if (toReturn.length === 0) { setError("Ingresa al menos una cantidad a devolver"); return; }
        setSavingDev(true);
        setError(null);
        let allOk = true;
        for (const item of toReturn) {
            const producto = productos.find((p) => p.id === item.productoId);
            const ok = await saveMovimiento({
                empresaId:        factura.empresaId,
                productoId:       item.productoId,
                tipo:             "devolucion_compra",
                fecha:            devFecha,
                periodo:          devFecha.slice(0, 7),
                cantidad:         item.cantDev,
                costoUnitario:    item.costoUnit,
                costoTotal:       item.cantDev * item.costoUnit,
                saldoCantidad:    0,
                referencia:       `DEV-${factura.numeroFactura}`,
                notas:            devNotas,
                existenciaActual: producto?.existenciaActual,
            });
            if (!ok) { allOk = false; break; }
        }
        setSavingDev(false);
        if (allOk) { setDevSuccess(true); setShowDevModal(false); }
    }

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
                <span className="text-[11px] text-[var(--text-tertiary)]">Cargando…</span>
            </div>
        );
    }

    if (!currentFactura && !loadingFactura) {
        return (
            <div className="min-h-full bg-surface-2 font-mono">
                <div className="px-8 py-6">
                    <p className="text-[11px] text-[var(--text-tertiary)]">Factura no encontrada.</p>
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
                            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.16em] mt-0.5">
                                {factura.numeroFactura || `#${id.slice(0, 8)}`}
                            </p>
                        </div>
                        {isConfirmada ? (
                            <span className="inline-flex px-2 py-1 rounded border text-[9px] uppercase tracking-[0.12em] font-medium badge-success">
                                Confirmada
                            </span>
                        ) : (
                            <span className="inline-flex px-2 py-1 rounded border text-[9px] uppercase tracking-[0.12em] font-medium badge-warning">
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

            {/* Devolución de Compra Modal */}
            {showDevModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-surface-1 border border-border-light rounded-xl shadow-xl w-full max-w-lg mx-4">
                        <div className="px-6 py-4 border-b border-border-light flex items-center justify-between">
                            <h2 className="text-[12px] font-bold uppercase tracking-[0.16em] text-foreground">
                                Registrar Devolución de Compra
                            </h2>
                            <button
                                onClick={() => setShowDevModal(false)}
                                className="text-[var(--text-tertiary)] hover:text-foreground text-[11px] uppercase tracking-[0.12em]"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                            <p className="text-[10px] text-[var(--text-tertiary)]">
                                Referencia: DEV-{factura.numeroFactura} — solo facturas confirmadas
                            </p>

                            {/* Items */}
                            <div className="space-y-2">
                                {devItems.map((item, idx) => (
                                    <div key={item.productoId} className="flex items-center gap-3 py-2 border-b border-border-light/50">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] text-foreground truncate">{item.nombre}</p>
                                            <p className="text-[9px] text-[var(--text-tertiary)]">
                                                Comprado: {item.cantOrig} × {fmtN(item.costoUnit)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <label className={labelCls + " mb-0"}>Cant.</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max={item.cantOrig}
                                                step="0.001"
                                                className="w-20 h-8 px-2 rounded-lg border border-border-light bg-surface-2 text-[12px] text-foreground outline-none focus:border-primary-500/60 text-right tabular-nums"
                                                value={item.cantDev === 0 ? "" : item.cantDev}
                                                placeholder="0"
                                                onChange={(e) => {
                                                    const v = parseFloat(e.target.value) || 0;
                                                    setDevItems((prev) =>
                                                        prev.map((it, i) => i === idx ? { ...it, cantDev: Math.min(v, it.cantOrig) } : it)
                                                    );
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Totals preview */}
                            {devItems.some((i) => i.cantDev > 0) && (
                                <div className="pt-2 text-[10px] text-[var(--text-tertiary)]">
                                    Total a devolver:{" "}
                                    <span className="tabular-nums font-bold text-red-500">
                                        {fmtN(devItems.reduce((acc, i) => acc + i.cantDev * i.costoUnit, 0))} Bs.
                                    </span>
                                </div>
                            )}

                            {/* Fecha */}
                            <div>
                                <label className={labelCls}>Fecha de devolución</label>
                                <input
                                    type="date"
                                    className={fieldCls}
                                    value={devFecha}
                                    onChange={(e) => setDevFecha(e.target.value)}
                                />
                            </div>

                            {/* Notas */}
                            <div>
                                <label className={labelCls}>Notas</label>
                                <textarea
                                    className={`${fieldCls} h-auto py-2`}
                                    rows={2}
                                    value={devNotas}
                                    onChange={(e) => setDevNotas(e.target.value)}
                                    placeholder="Motivo de la devolución…"
                                />
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-border-light flex items-center justify-end gap-3">
                            <button
                                onClick={() => setShowDevModal(false)}
                                disabled={savingDev}
                                className="h-8 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 disabled:opacity-50 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDevolucion}
                                disabled={savingDev || !devFecha || devItems.every((i) => i.cantDev === 0)}
                                className="h-8 px-4 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                {savingDev ? "Registrando…" : "Confirmar devolución"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                                    <label className={labelCls}>Nº Control</label>
                                    {isBorrador ? (
                                        <input className={fieldCls} value={numeroControl} onChange={(e) => setNumeroControl(e.target.value)} placeholder="Ej. 00-00123456" />
                                    ) : (
                                        <div className={readonlyCls + " flex items-center"}>
                                            {factura.numeroControl || "—"}
                                        </div>
                                    )}
                                </div>
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
                            <div className="mb-5">
                                <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground">
                                    Productos
                                </h2>
                            </div>

                            <FacturaItemsGrid
                                items={items}
                                productos={productos}
                                onChange={setItems}
                                readOnly={!isBorrador}
                            />

                            {/* Totals */}
                            {(() => {
                                // For confirmed facturas, compute breakdown from stored items
                                const displayItems = isBorrador ? items : (factura.items ?? []);
                                const dSubtotal      = displayItems.reduce((acc, i) => acc + (i.costoTotal ?? 0), 0);
                                const dBaseExenta    = displayItems.filter(i => (i.ivaAlicuota ?? "general_16") === "exenta").reduce((acc, i) => acc + i.costoTotal, 0);
                                const dBaseGravada8  = displayItems.filter(i => (i.ivaAlicuota ?? "general_16") === "reducida_8").reduce((acc, i) => acc + i.costoTotal, 0);
                                const dBaseGravada16 = displayItems.filter(i => (i.ivaAlicuota ?? "general_16") === "general_16").reduce((acc, i) => acc + i.costoTotal, 0);
                                const dIva8          = Math.round(dBaseGravada8  * 8  / 100 * 100) / 100;
                                const dIva16         = Math.round(dBaseGravada16 * 16 / 100 * 100) / 100;
                                const dIvaMonto      = dIva8 + dIva16;
                                const dTotal         = isBorrador ? total : factura.total;
                                return (
                                    <div className="mt-4 pt-4 border-t border-border-light flex flex-col items-end gap-1.5 text-[11px]">
                                        <div className="flex gap-8 items-center">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">Subtotal</span>
                                            <span className="tabular-nums font-medium text-[var(--text-primary)] w-32 text-right">{fmtN(dSubtotal)}</span>
                                        </div>
                                        {dBaseExenta > 0 && (
                                            <div className="flex gap-8 items-center">
                                                <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">Base exenta</span>
                                                <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(dBaseExenta)}</span>
                                            </div>
                                        )}
                                        {dBaseGravada8 > 0 && (
                                            <>
                                                <div className="flex gap-8 items-center">
                                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">Base gravada 8%</span>
                                                    <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(dBaseGravada8)}</span>
                                                </div>
                                                <div className="flex gap-8 items-center">
                                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">IVA 8%</span>
                                                    <span className="tabular-nums text-amber-600 w-32 text-right">{fmtN(dIva8)}</span>
                                                </div>
                                            </>
                                        )}
                                        {dBaseGravada16 > 0 && (
                                            <>
                                                <div className="flex gap-8 items-center">
                                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">Base gravada 16%</span>
                                                    <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(dBaseGravada16)}</span>
                                                </div>
                                                <div className="flex gap-8 items-center">
                                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">IVA 16%</span>
                                                    <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(dIva16)}</span>
                                                </div>
                                            </>
                                        )}
                                        {dIvaMonto > 0 && (
                                            <div className="flex gap-8 items-center">
                                                <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">Total IVA</span>
                                                <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(dIvaMonto)}</span>
                                            </div>
                                        )}
                                        <div className="flex gap-8 items-center border-t border-border-light pt-1.5">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">Total</span>
                                            <span className="tabular-nums font-bold text-foreground w-32 text-right">{fmtN(dTotal)}</span>
                                        </div>
                                    </div>
                                );
                            })()}
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
                                <button
                                    onClick={openDevModal}
                                    className="h-8 px-4 rounded-lg border border-red-500/30 bg-red-500/[0.06] hover:bg-red-500/[0.12] text-red-500 text-[11px] uppercase tracking-[0.14em] transition-colors"
                                >
                                    Registrar devolución
                                </button>
                            </div>
                        )}

                        {devSuccess && (
                            <div className="px-4 py-3 rounded-lg border border-green-500/20 bg-green-500/[0.05] text-green-600 text-[11px]">
                                Devolución registrada — movimientos de devolución_compra creados.
                            </div>
                        )}
                    </div>

                    {/* Right panel — summary */}
                    <div className="w-72 flex-shrink-0 sticky top-6">
                        <div className="rounded-xl border border-border-light bg-surface-1 p-5 space-y-4">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                                Resumen
                            </h3>
                            <div className="space-y-3 text-[11px]">
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">Proveedor</span>
                                    <span className="text-foreground font-medium truncate ml-4 text-right">
                                        {factura.proveedorNombre ?? "—"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">Nº Control</span>
                                    <span className="text-foreground tabular-nums">{factura.numeroControl || "—"}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">Fecha</span>
                                    <span className="text-foreground tabular-nums">{fmtDate(factura.fecha)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">Período</span>
                                    <span className="text-foreground tabular-nums">{factura.periodo}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">Ítems</span>
                                    <span className="text-foreground tabular-nums">{(factura.items ?? items).length}</span>
                                </div>
                            </div>
                            <div className="pt-3 border-t border-border-light space-y-2 text-[11px]">
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">Subtotal</span>
                                    <span className="tabular-nums text-[var(--text-primary)]">{fmtN(factura.subtotal)}</span>
                                </div>
                                {factura.ivaMonto > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">IVA</span>
                                        <span className="tabular-nums text-[var(--text-secondary)]">{fmtN(factura.ivaMonto)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-bold">
                                    <span className="text-[var(--text-secondary)] uppercase tracking-[0.12em] text-[9px]">Total</span>
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
