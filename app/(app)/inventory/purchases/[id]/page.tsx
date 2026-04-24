"use client";

// Page: PurchaseInvoiceDetailPage
// Purpose: View and edit a single purchase invoice, confirm it, and register purchase returns.
// Architectural role: Page-level composition using inventory hook and English domain types.
// All identifiers use English; JSX user-facing text remains in Spanish.

import { useEffect, useState, use, useCallback } from "react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { PurchaseInvoice, PurchaseInvoiceItem } from "@/src/modules/inventory/backend/domain/purchase-invoice";
import { FacturaItemsGrid, emptyItem } from "@/src/modules/inventory/frontend/components/factura-items-grid";

// ── types ──────────────────────────────────────────────────────────────────────

interface ReturnItem {
    productId: string;
    name: string;
    origQty: number;
    unitCost: number;
    returnQty: number;
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

export default function PurchaseInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { companyId } = useCompany();
    const {
        products, loadProducts,
        suppliers, loadSuppliers,
        currentPurchaseInvoice, loadingPurchaseInvoice, loadPurchaseInvoice,
        error, setError,
        savePurchaseInvoice, confirmPurchaseInvoice, saveMovement,
    } = useInventory();

    // Editable form state (only used when draft)
    const [supplierId, setSupplierId] = useState("");
    const [invoiceNumber, setInvoiceNumber] = useState("");
    const [controlNumber, setControlNumber] = useState("");
    const [date, setDate] = useState("");
    const [notes, setNotes] = useState("");
    const [items, setItems] = useState<PurchaseInvoiceItem[]>([]);

    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [justConfirmed, setJustConfirmed] = useState(false);

    // ── Purchase return modal ──────────────────────────────────────────────────
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
    const [returnDate, setReturnDate] = useState("");
    const [returnNotes, setReturnNotes] = useState("");
    const [savingReturn, setSavingReturn] = useState(false);
    const [returnSuccess, setReturnSuccess] = useState(false);

    useEffect(() => {
        if (companyId) {
            loadProducts(companyId);
            loadSuppliers(companyId);
        }
    }, [companyId, loadProducts, loadSuppliers]);

    useEffect(() => {
        if (id) loadPurchaseInvoice(id);
    }, [id, loadPurchaseInvoice]);

    // Populate form when invoice loads — render-phase state update to avoid
    // setState-in-effect cascading renders. React batches all these setters
    // into a single re-render.
    const [formSourceId, setFormSourceId] = useState<string | null>(null);
    if (currentPurchaseInvoice?.id === id && formSourceId !== id) {
        setFormSourceId(id ?? null);
        setSupplierId(currentPurchaseInvoice.supplierId);
        setInvoiceNumber(currentPurchaseInvoice.invoiceNumber);
        setControlNumber(currentPurchaseInvoice.controlNumber ?? '');
        setDate(fmtDate(currentPurchaseInvoice.date));
        setNotes(currentPurchaseInvoice.notes);
        setItems(
            currentPurchaseInvoice.items && currentPurchaseInvoice.items.length > 0
                ? currentPurchaseInvoice.items.map((i) => ({ ...i }))
                : [emptyItem()]
        );
    }

    const isDraft = currentPurchaseInvoice?.status === "borrador";

    // Derived totals — computed per-item from vatRate
    const subtotal      = items.reduce((acc, i) => acc + (i.totalCost ?? 0), 0);
    const baseTaxed8    = items.filter(i => (i.vatRate ?? "general_16") === "reducida_8").reduce((acc, i) => acc + i.totalCost, 0);
    const baseTaxed16   = items.filter(i => (i.vatRate ?? "general_16") === "general_16").reduce((acc, i) => acc + i.totalCost, 0);
    const vat8          = Math.round(baseTaxed8  * 8  / 100 * 100) / 100;
    const vat16         = Math.round(baseTaxed16 * 16 / 100 * 100) / 100;
    const vatAmount     = vat8 + vat16;
    const total         = subtotal + vatAmount;

    const buildInvoice = useCallback((): PurchaseInvoice => ({
        id,
        companyId:      currentPurchaseInvoice?.companyId ?? companyId!,
        supplierId,
        invoiceNumber,
        controlNumber,
        date,
        period:         date.slice(0, 7),
        status:         "borrador",
        subtotal,
        vatPercentage:  0,
        vatAmount,
        total,
        notes,
    }), [id, currentPurchaseInvoice, companyId, supplierId, invoiceNumber, controlNumber, date, subtotal, vatAmount, total, notes]);

    function openReturnModal() {
        const today = new Date().toISOString().split("T")[0];
        setReturnDate(today);
        setReturnNotes("");
        setReturnSuccess(false);
        setReturnItems(
            (invoice.items ?? []).map((item) => ({
                productId:  item.productId,
                name:       item.productName ?? item.productId,
                origQty:    item.quantity,
                unitCost:   item.unitCost,
                returnQty:  0,
            }))
        );
        setShowReturnModal(true);
    }

    async function handleReturn() {
        const toReturn = returnItems.filter((i) => i.returnQty > 0);
        if (toReturn.length === 0) { setError("Ingresa al menos una cantidad a devolver"); return; }
        setSavingReturn(true);
        setError(null);
        let allOk = true;
        for (const item of toReturn) {
            const product = products.find((p) => p.id === item.productId);
            const ok = await saveMovement({
                companyId:        invoice.companyId,
                productId:        item.productId,
                type:             "devolucion_entrada",
                date:             returnDate,
                period:           returnDate.slice(0, 7),
                quantity:         item.returnQty,
                unitCost:         item.unitCost,
                totalCost:        item.returnQty * item.unitCost,
                balanceQuantity:  0,
                reference:        `DEV-${invoice.invoiceNumber}`,
                notes:            returnNotes,
                currentStock:     product?.currentStock,
            });
            if (!ok) { allOk = false; break; }
        }
        setSavingReturn(false);
        if (allOk) { setReturnSuccess(true); setShowReturnModal(false); }
    }

    function validate(): boolean {
        if (!supplierId) { setError("Selecciona un proveedor"); return false; }
        if (items.length === 0) { setError("Agrega al menos un producto"); return false; }
        for (const item of items) {
            if (!item.productId) { setError("Selecciona un producto en cada fila"); return false; }
            if (item.quantity <= 0) { setError("La cantidad debe ser mayor a 0"); return false; }
        }
        return true;
    }

    async function handleSaveDraft() {
        if (!validate()) return;
        setSaving(true);
        setError(null);
        await savePurchaseInvoice(buildInvoice(), items);
        setSaving(false);
    }

    async function handleConfirm() {
        if (!validate()) return;
        setConfirming(true);
        setError(null);
        const saved = await savePurchaseInvoice(buildInvoice(), items);
        if (!saved) { setConfirming(false); return; }
        const confirmed = await confirmPurchaseInvoice(saved.id!);
        setConfirming(false);
        if (confirmed) setJustConfirmed(true);
    }

    if (loadingPurchaseInvoice) {
        return (
            <div className="min-h-full bg-surface-2 font-mono flex items-center justify-center">
                <span className="text-[11px] text-[var(--text-tertiary)]">Cargando…</span>
            </div>
        );
    }

    if (!currentPurchaseInvoice && !loadingPurchaseInvoice) {
        return (
            <div className="min-h-full bg-surface-2 font-mono">
                <div className="px-8 py-6">
                    <p className="text-[11px] text-[var(--text-tertiary)]">Factura no encontrada.</p>
                </div>
            </div>
        );
    }

    const invoice = currentPurchaseInvoice!;
    const displayStatus = justConfirmed ? "confirmada" : invoice.status;
    const isConfirmed = displayStatus === "confirmada";

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader
                title="Factura de Compra"
                subtitle={invoice.invoiceNumber || `#${id.slice(0, 8)}`}
            >
                {isConfirmed ? (
                    <span className="inline-flex px-2 py-1 rounded border text-[9px] uppercase tracking-[0.12em] font-medium badge-success">
                        Confirmada
                    </span>
                ) : (
                    <span className="inline-flex px-2 py-1 rounded border text-[9px] uppercase tracking-[0.12em] font-medium badge-warning">
                        Borrador
                    </span>
                )}
                <BaseButton.Root variant="secondary" size="sm" onClick={() => router.back()}>
                    ← Volver
                </BaseButton.Root>
            </PageHeader>

            {/* Purchase Return Modal */}
            {showReturnModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-surface-1 border border-border-light rounded-xl shadow-xl w-full max-w-lg mx-4">
                        <div className="px-6 py-4 border-b border-border-light flex items-center justify-between">
                            <h2 className="text-[12px] font-bold uppercase tracking-[0.16em] text-foreground">
                                Registrar Devolución de Compra
                            </h2>
                            <button
                                onClick={() => setShowReturnModal(false)}
                                className="text-[var(--text-tertiary)] hover:text-foreground text-[11px] uppercase tracking-[0.12em]"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                            <p className="text-[10px] text-[var(--text-tertiary)]">
                                Referencia: DEV-{invoice.invoiceNumber} — solo facturas confirmadas
                            </p>

                            {/* Items */}
                            <div className="space-y-2">
                                {returnItems.map((item, idx) => (
                                    <div key={item.productId} className="flex items-center gap-3 py-2 border-b border-border-light/50">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] text-foreground truncate">{item.name}</p>
                                            <p className="text-[9px] text-[var(--text-tertiary)]">
                                                Comprado: {item.origQty} × {fmtN(item.unitCost)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <label className={labelCls + " mb-0"}>Cant.</label>
                                            <BaseInput.Field
                                                type="number"
                                                min={0}
                                                max={item.origQty}
                                                step={0.001}
                                                className="w-20"
                                                inputClassName="text-right"
                                                value={item.returnQty === 0 ? "" : String(item.returnQty)}
                                                placeholder="0"
                                                onValueChange={(v) => {
                                                    const n = parseFloat(v) || 0;
                                                    setReturnItems((prev) =>
                                                        prev.map((it, i) => i === idx ? { ...it, returnQty: Math.min(n, it.origQty) } : it)
                                                    );
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Totals preview */}
                            {returnItems.some((i) => i.returnQty > 0) && (
                                <div className="pt-2 text-[10px] text-[var(--text-tertiary)]">
                                    Total a devolver:{" "}
                                    <span className="tabular-nums font-bold text-red-500">
                                        {fmtN(returnItems.reduce((acc, i) => acc + i.returnQty * i.unitCost, 0))} Bs.
                                    </span>
                                </div>
                            )}

                            {/* Date */}
                            <BaseInput.Field
                                label="Fecha de devolución"
                                type="date"
                                value={returnDate}
                                onValueChange={setReturnDate}
                            />

                            {/* Notes */}
                            <div>
                                <label className={labelCls}>Notas</label>
                                <textarea
                                    className={`${fieldCls} h-auto py-2`}
                                    rows={2}
                                    value={returnNotes}
                                    onChange={(e) => setReturnNotes(e.target.value)}
                                    placeholder="Motivo de la devolución…"
                                />
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-border-light flex items-center justify-end gap-3">
                            <BaseButton.Root
                                variant="secondary"
                                size="sm"
                                onClick={() => setShowReturnModal(false)}
                                disabled={savingReturn}
                            >
                                Cancelar
                            </BaseButton.Root>
                            <BaseButton.Root
                                variant="danger"
                                size="sm"
                                onClick={handleReturn}
                                disabled={savingReturn || !returnDate || returnItems.every((i) => i.returnQty === 0)}
                            >
                                {savingReturn ? "Registrando…" : "Confirmar devolución"}
                            </BaseButton.Root>
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

                        {/* Invoice data */}
                        <div className="rounded-xl border border-border-light bg-surface-1 p-6">
                            <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground mb-5">
                                Datos de la factura
                            </h2>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className={labelCls}>Proveedor</label>
                                    {isDraft ? (
                                        <select className={fieldCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                                            <option value="">Seleccionar proveedor…</option>
                                            {suppliers.filter((s) => s.active).map((s) => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div className={readonlyCls + " flex items-center"}>
                                            {invoice.supplierName ?? "—"}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    {isDraft ? (
                                        <BaseInput.Field label="Nº Factura" value={invoiceNumber} onValueChange={setInvoiceNumber} />
                                    ) : (
                                        <>
                                            <label className={labelCls}>Nº Factura</label>
                                            <div className={readonlyCls + " flex items-center"}>
                                                {invoice.invoiceNumber || "—"}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    {isDraft ? (
                                        <BaseInput.Field label="Nº Control" value={controlNumber} onValueChange={setControlNumber} placeholder="Ej. 00-00123456" />
                                    ) : (
                                        <>
                                            <label className={labelCls}>Nº Control</label>
                                            <div className={readonlyCls + " flex items-center"}>
                                                {invoice.controlNumber || "—"}
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div>
                                    {isDraft ? (
                                        <BaseInput.Field label="Fecha" type="date" value={date} onValueChange={setDate} />
                                    ) : (
                                        <>
                                            <label className={labelCls}>Fecha</label>
                                            <div className={readonlyCls + " flex items-center"}>
                                                {fmtDate(invoice.date)}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Notas</label>
                                {isDraft ? (
                                    <textarea className={`${fieldCls} h-auto py-2`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                                ) : (
                                    <div className={`${readonlyCls} h-auto py-2 min-h-[60px]`}>
                                        {invoice.notes || "—"}
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
                                products={products}
                                onChange={setItems}
                                readOnly={!isDraft}
                            />

                            {/* Totals */}
                            {(() => {
                                // For confirmed invoices, compute breakdown from stored items
                                const displayItems = isDraft ? items : (invoice.items ?? []);
                                const dSubtotal     = displayItems.reduce((acc, i) => acc + (i.totalCost ?? 0), 0);
                                const dBaseExempt   = displayItems.filter(i => (i.vatRate ?? "general_16") === "exenta").reduce((acc, i) => acc + i.totalCost, 0);
                                const dBaseTaxed8   = displayItems.filter(i => (i.vatRate ?? "general_16") === "reducida_8").reduce((acc, i) => acc + i.totalCost, 0);
                                const dBaseTaxed16  = displayItems.filter(i => (i.vatRate ?? "general_16") === "general_16").reduce((acc, i) => acc + i.totalCost, 0);
                                const dVat8         = Math.round(dBaseTaxed8  * 8  / 100 * 100) / 100;
                                const dVat16        = Math.round(dBaseTaxed16 * 16 / 100 * 100) / 100;
                                const dVatAmount    = dVat8 + dVat16;
                                const dTotal        = isDraft ? total : invoice.total;
                                return (
                                    <div className="mt-4 pt-4 border-t border-border-light flex flex-col items-end gap-1.5 text-[11px]">
                                        <div className="flex gap-8 items-center">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">Subtotal</span>
                                            <span className="tabular-nums font-medium text-[var(--text-primary)] w-32 text-right">{fmtN(dSubtotal)}</span>
                                        </div>
                                        {dBaseExempt > 0 && (
                                            <div className="flex gap-8 items-center">
                                                <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">Base exenta</span>
                                                <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(dBaseExempt)}</span>
                                            </div>
                                        )}
                                        {dBaseTaxed8 > 0 && (
                                            <>
                                                <div className="flex gap-8 items-center">
                                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">Base gravada 8%</span>
                                                    <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(dBaseTaxed8)}</span>
                                                </div>
                                                <div className="flex gap-8 items-center">
                                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">IVA 8%</span>
                                                    <span className="tabular-nums text-amber-600 w-32 text-right">{fmtN(dVat8)}</span>
                                                </div>
                                            </>
                                        )}
                                        {dBaseTaxed16 > 0 && (
                                            <>
                                                <div className="flex gap-8 items-center">
                                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">Base gravada 16%</span>
                                                    <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(dBaseTaxed16)}</span>
                                                </div>
                                                <div className="flex gap-8 items-center">
                                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">IVA 16%</span>
                                                    <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(dVat16)}</span>
                                                </div>
                                            </>
                                        )}
                                        {dVatAmount > 0 && (
                                            <div className="flex gap-8 items-center">
                                                <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[9px]">Total IVA</span>
                                                <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(dVatAmount)}</span>
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
                        {isDraft && (
                            <div className="flex items-center gap-3">
                                <BaseButton.Root
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleSaveDraft}
                                    disabled={saving || confirming}
                                >
                                    {saving ? "Guardando…" : "Guardar borrador"}
                                </BaseButton.Root>
                                <BaseButton.Root
                                    variant="primary"
                                    size="sm"
                                    onClick={handleConfirm}
                                    disabled={saving || confirming}
                                >
                                    {confirming ? "Confirmando…" : "Confirmar factura"}
                                </BaseButton.Root>
                            </div>
                        )}

                        {isConfirmed && (
                            <div className="flex items-center gap-3">
                                <Link
                                    href={`/inventory/movements?periodo=${invoice.period}`}
                                    className="h-8 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors inline-flex items-center"
                                >
                                    Ver movimientos →
                                </Link>
                                <BaseButton.Root
                                    variant="dangerOutline"
                                    size="sm"
                                    onClick={openReturnModal}
                                >
                                    Registrar devolución
                                </BaseButton.Root>
                            </div>
                        )}

                        {returnSuccess && (
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
                                        {invoice.supplierName ?? "—"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">Nº Control</span>
                                    <span className="text-foreground tabular-nums">{invoice.controlNumber || "—"}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">Fecha</span>
                                    <span className="text-foreground tabular-nums">{fmtDate(invoice.date)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">Período</span>
                                    <span className="text-foreground tabular-nums">{invoice.period}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">Ítems</span>
                                    <span className="text-foreground tabular-nums">{(invoice.items ?? items).length}</span>
                                </div>
                            </div>
                            <div className="pt-3 border-t border-border-light space-y-2 text-[11px]">
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">Subtotal</span>
                                    <span className="tabular-nums text-[var(--text-primary)]">{fmtN(invoice.subtotal)}</span>
                                </div>
                                {invoice.vatAmount > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[9px]">IVA</span>
                                        <span className="tabular-nums text-[var(--text-secondary)]">{fmtN(invoice.vatAmount)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-bold">
                                    <span className="text-[var(--text-secondary)] uppercase tracking-[0.12em] text-[9px]">Total</span>
                                    <span className="tabular-nums text-foreground">{fmtN(invoice.total)}</span>
                                </div>
                            </div>
                            {isConfirmed && invoice.confirmedAt && (
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
