"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { FacturaCompra, FacturaCompraItem } from "@/src/modules/inventory/backend/domain/factura-compra";
import { FacturaItemsGrid, emptyItem } from "@/src/modules/inventory/frontend/components/factura-items-grid";

// ── helpers ──────────────────────────────────────────────────────────────────

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const todayStr = () => new Date().toISOString().split("T")[0];

// ── component ─────────────────────────────────────────────────────────────────

export default function NuevaFacturaPage() {
    const router = useRouter();
    const { companyId } = useCompany();
    const {
        productos, loadProductos,
        proveedores, loadProveedores,
        error, setError,
        saveFactura, confirmarFactura,
    } = useInventory();

    // Form state
    const [proveedorId, setProveedorId] = useState("");
    const [numeroFactura, setNumeroFactura] = useState("");
    const [numeroControl, setNumeroControl] = useState("");
    const [fecha, setFecha] = useState(todayStr());
    const [notas, setNotas] = useState("");
    const [items, setItems] = useState<FacturaCompraItem[]>([emptyItem()]);

    // ivaPorcentaje removed — IVA is now computed per-item from ivaAlicuota

    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [savedId, setSavedId] = useState<string | null>(null);
    const [confirmed, setConfirmed] = useState(false);

    useEffect(() => {
        if (companyId) {
            loadProductos(companyId);
            loadProveedores(companyId);
        }
    }, [companyId, loadProductos, loadProveedores]);

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
        empresaId:     companyId!,
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
    }), [companyId, proveedorId, numeroFactura, numeroControl, fecha, subtotal, ivaMonto, total, notas]);

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
        const factura = buildFactura();
        if (savedId) factura.id = savedId;
        const saved = await saveFactura(factura, items);
        setSaving(false);
        if (saved?.id) setSavedId(saved.id);
    }

    async function handleConfirm() {
        if (!validate()) return;
        setConfirming(true);
        setError(null);
        // First save draft (or update existing)
        const factura = buildFactura();
        if (savedId) factura.id = savedId;
        const saved = await saveFactura(factura, items);
        if (!saved) { setConfirming(false); return; }
        // Then confirm
        const confirmed = await confirmarFactura(saved.id!);
        setConfirming(false);
        if (confirmed) {
            setConfirmed(true);
            setSavedId(confirmed.id!);
        }
    }

    if (confirmed && savedId) {
        const periodo = fecha.slice(0, 7);
        return (
            <div className="min-h-full bg-surface-2 font-mono">
                <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                    <h1 className="text-[13px] font-bold uppercase tracking-[0.18em] text-foreground">
                        Nueva Factura de Compra
                    </h1>
                </div>
                <div className="px-8 py-10 flex flex-col items-center gap-6">
                    <div className="rounded-xl border border-green-500/20 bg-green-500/[0.05] px-8 py-8 text-center max-w-md w-full">
                        <div className="text-green-500 text-[11px] font-bold uppercase tracking-[0.16em] mb-2">
                            Factura confirmada
                        </div>
                        <p className="text-[var(--text-secondary)] text-[11px] mb-6">
                            Las entradas de inventario han sido registradas exitosamente.
                        </p>
                        <div className="flex items-center justify-center gap-3">
                            <button
                                onClick={() => router.push("/inventory/compras")}
                                className="h-8 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                Ver facturas
                            </button>
                            <button
                                onClick={() => router.push(`/inventory/movimientos?periodo=${periodo}`)}
                                className="h-8 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
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
                        <h1 className="text-[13px] font-bold uppercase tracking-[0.18em] text-foreground">
                            Nueva Factura de Compra
                        </h1>
                        <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.16em] mt-0.5">
                            Registrar compra a proveedor
                        </p>
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

                <div className="flex gap-6 items-start">
                    {/* Left panel — form (2/3) */}
                    <div className="flex-1 min-w-0 space-y-4">

                        {/* Datos de la factura */}
                        <div className="rounded-xl border border-border-light bg-surface-1 p-6">
                            <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground mb-5">
                                Datos de la factura
                            </h2>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className={labelCls}>Proveedor *</label>
                                    <select
                                        className={fieldCls}
                                        value={proveedorId}
                                        onChange={(e) => setProveedorId(e.target.value)}
                                    >
                                        <option value="">Seleccionar proveedor…</option>
                                        {proveedores.filter((p) => p.activo).map((p) => (
                                            <option key={p.id} value={p.id}>{p.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Nº Factura</label>
                                    <input
                                        className={fieldCls}
                                        value={numeroFactura}
                                        onChange={(e) => setNumeroFactura(e.target.value)}
                                        placeholder="Ej. 0001-00123456"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className={labelCls}>Nº Control</label>
                                    <input
                                        className={fieldCls}
                                        value={numeroControl}
                                        onChange={(e) => setNumeroControl(e.target.value)}
                                        placeholder="Ej. 00-00123456"
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>Fecha</label>
                                    <input
                                        type="date"
                                        className={fieldCls}
                                        value={fecha}
                                        onChange={(e) => setFecha(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Notas</label>
                                <textarea
                                    className={`${fieldCls} h-auto py-2`}
                                    rows={2}
                                    value={notas}
                                    onChange={(e) => setNotas(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Productos */}
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
                            />

                            {/* Totals row */}
                            <div className="mt-4 pt-4 border-t border-border-light flex flex-col items-end gap-1.5 text-[11px]">
                                <div className="flex gap-8 items-center">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">Subtotal</span>
                                    <span className="tabular-nums font-medium text-[var(--text-primary)] w-32 text-right">{fmtN(subtotal)}</span>
                                </div>
                                {baseExenta > 0 && (
                                    <div className="flex gap-8 items-center">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">Base exenta</span>
                                        <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(baseExenta)}</span>
                                    </div>
                                )}
                                {baseGravada8 > 0 && (
                                    <>
                                        <div className="flex gap-8 items-center">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">Base gravada 8%</span>
                                            <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(baseGravada8)}</span>
                                        </div>
                                        <div className="flex gap-8 items-center">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">IVA 8%</span>
                                            <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(iva8)}</span>
                                        </div>
                                    </>
                                )}
                                {baseGravada16 > 0 && (
                                    <>
                                        <div className="flex gap-8 items-center">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">Base gravada 16%</span>
                                            <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(baseGravada16)}</span>
                                        </div>
                                        <div className="flex gap-8 items-center">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">IVA 16%</span>
                                            <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(iva16)}</span>
                                        </div>
                                    </>
                                )}
                                {ivaMonto > 0 && (
                                    <div className="flex gap-8 items-center">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">Total IVA</span>
                                        <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(ivaMonto)}</span>
                                    </div>
                                )}
                                <div className="flex gap-8 items-center border-t border-border-light pt-1.5">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">Total</span>
                                    <span className="tabular-nums font-bold text-foreground w-32 text-right">{fmtN(total)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
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
                            {savedId && !confirmed && (
                                <span className="text-[10px] text-green-500 uppercase tracking-[0.12em]">
                                    Borrador guardado
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Right panel — summary (1/3) */}
                    <div className="w-72 flex-shrink-0 sticky top-6">
                        <div className="rounded-xl border border-border-light bg-surface-1 p-5 space-y-4">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                                Resumen
                            </h3>
                            <div className="space-y-3 text-[11px]">
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">Proveedor</span>
                                    <span className="text-foreground font-medium truncate ml-4 text-right">
                                        {proveedorId
                                            ? proveedores.find((p) => p.id === proveedorId)?.nombre ?? "—"
                                            : "—"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">Fecha</span>
                                    <span className="text-foreground tabular-nums">{fecha || "—"}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">Ítems</span>
                                    <span className="text-foreground tabular-nums">{items.filter((i) => i.productoId).length}</span>
                                </div>
                            </div>
                            <div className="pt-3 border-t border-border-light space-y-2 text-[11px]">
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">Subtotal</span>
                                    <span className="tabular-nums text-[var(--text-primary)]">{fmtN(subtotal)}</span>
                                </div>
                                {iva8 > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">IVA 8%</span>
                                        <span className="tabular-nums text-amber-600">{fmtN(iva8)}</span>
                                    </div>
                                )}
                                {iva16 > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">IVA 16%</span>
                                        <span className="tabular-nums text-[var(--text-secondary)]">{fmtN(iva16)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-bold">
                                    <span className="text-[var(--text-secondary)] uppercase tracking-[0.12em] text-[9px]">Total</span>
                                    <span className="tabular-nums text-foreground">{fmtN(total)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
