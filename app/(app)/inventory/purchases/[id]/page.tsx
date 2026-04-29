"use client";

// Page: PurchaseInvoiceDetailPage
// Purpose: View and edit a single purchase invoice, confirm it, and register purchase returns.
// Architectural role: Page-level composition using inventory hook and English domain types.
// All identifiers use English; JSX user-facing text remains in Spanish.

import { useEffect, useState, use, useCallback } from "react";
import { ChevronLeft, ArrowRight, RotateCcw, Save, CheckCircle2, X, Lock, Unlock } from "lucide-react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { notify } from "@/src/shared/frontend/notify";
import type { PurchaseInvoice, PurchaseInvoiceItem } from "@/src/modules/inventory/backend/domain/purchase-invoice";
import { FacturaItemsGrid, emptyItem } from "@/src/modules/inventory/frontend/components/factura-items-grid";
import {
    computeInvoiceTotals,
    emptyHeaderAdjustments,
    type HeaderAdjustments,
    type AdjustmentKind,
    type LineInput,
} from "@/src/modules/inventory/shared/totals";
import { HeaderAdjustmentsSection } from "@/src/modules/inventory/frontend/components/header-adjustments-section";
import { PeriodoContableInput } from "@/src/modules/inventory/frontend/components/periodo-contable-input";
import {
    BcvRateInput,
    DEFAULT_RATE_DECIMALS,
    parseRateStr,
    roundRateValue,
    useBcvRate,
} from "@/src/modules/inventory/frontend/components/bcv-rate-input";

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
    "w-full h-10 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const readonlyCls = [
    "w-full h-10 px-3 rounded-lg border border-border-light bg-surface-2 outline-none",
    "font-mono text-[13px] text-[var(--text-secondary)] tabular-nums",
].join(" ");

const labelCls = "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

const makeFmt = (decimals: number) => (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

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
        savePurchaseInvoice, confirmPurchaseInvoice, unconfirmPurchaseInvoice, saveMovement,
    } = useInventory();

    // Editable form state (only used when draft)
    const [supplierId, setSupplierId] = useState("");
    const [invoiceNumber, setInvoiceNumber] = useState("");
    const [controlNumber, setControlNumber] = useState("");
    const [date, setDate] = useState("");
    const [notes, setNotes] = useState("");
    const [items, setItems] = useState<PurchaseInvoiceItem[]>([]);
    const [periodo, setPeriodo] = useState<string>("");
    const [periodoManual, setPeriodoManual] = useState<boolean>(false);
    const [headerAdj, setHeaderAdj] = useState<HeaderAdjustments>(() => emptyHeaderAdjustments());
    const [showHeaderAdj, setShowHeaderAdj] = useState<boolean>(false);
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

    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [unconfirming, setUnconfirming] = useState(false);
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

    const isDraft = currentPurchaseInvoice?.status === "borrador";

    // Auto-fetch BCV rate when fecha changes — only while in draft. Confirmadas
    // freeze the rate until the user desconfirma; refetching there would be a
    // surprise side-effect.
    useEffect(() => {
        if (!isDraft || !date) return;
        let cancelled = false;
        setRateLoading(true);
        setRateError(null);
        fetch(`/api/bcv/rate?date=${date}&code=USD`)
            .then((r) => r.json())
            .then((json) => {
                if (cancelled) return;
                if (json.rate) {
                    setRateFromApi(json.rate, rateDecimals);
                    setRateDateBcv(json.date);
                } else {
                    setRateError(json.error ?? "Sin datos BCV para esta fecha");
                    setRateDateBcv(null);
                }
            })
            .catch(() => { if (!cancelled) setRateError("Error al consultar BCV"); })
            .finally(() => { if (!cancelled) setRateLoading(false); });
        return () => { cancelled = true; };
    // Auto-fetch on date change only; rateDecimals shouldn't retrigger the call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date, isDraft]);

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
        setPeriodo(currentPurchaseInvoice.period ?? "");
        setPeriodoManual(currentPurchaseInvoice.periodoManual ?? false);
        setHeaderAdj({
            descuentoTipo:  (currentPurchaseInvoice.descuentoTipo ?? null) as AdjustmentKind | null,
            descuentoValor: currentPurchaseInvoice.descuentoValor ?? 0,
            recargoTipo:    (currentPurchaseInvoice.recargoTipo ?? null) as AdjustmentKind | null,
            recargoValor:   currentPurchaseInvoice.recargoValor ?? 0,
        });
        const hasAdj =
            (currentPurchaseInvoice.descuentoTipo != null && (currentPurchaseInvoice.descuentoValor ?? 0) > 0) ||
            (currentPurchaseInvoice.recargoTipo   != null && (currentPurchaseInvoice.recargoValor   ?? 0) > 0);
        if (hasAdj) setShowHeaderAdj(true);
        const storedDecimals = currentPurchaseInvoice.rateDecimals ?? DEFAULT_RATE_DECIMALS;
        if (currentPurchaseInvoice.dollarRate != null) {
            setRateFromApi(currentPurchaseInvoice.dollarRate, storedDecimals);
        }
        if (currentPurchaseInvoice.rateDecimals != null && currentPurchaseInvoice.rateDecimals !== DEFAULT_RATE_DECIMALS) {
            applyDecimals(storedDecimals);
        }
    }

    // Derived totals — uses shared math
    const lineInputs: LineInput[] = items.map((i) => ({
        quantity: i.quantity ?? 0,
        unitCost: i.unitCost ?? 0,
        vatRate:  i.vatRate ?? "general_16",
        adjustments: {
            descuentoTipo:  (i.descuentoTipo ?? null) as AdjustmentKind | null,
            descuentoValor: i.descuentoValor ?? 0,
            recargoTipo:    (i.recargoTipo ?? null) as AdjustmentKind | null,
            recargoValor:   i.recargoValor ?? 0,
        },
    }));
    // Decimals binding: while editing, the form's rateDecimals drives precision.
    // For confirmed invoices, the persisted `rateDecimals` is the source of truth.
    const effectiveDecimals = currentPurchaseInvoice?.status === "confirmada"
        ? (currentPurchaseInvoice.rateDecimals ?? rateDecimals)
        : rateDecimals;
    const fmtN = makeFmt(effectiveDecimals);
    const totals = computeInvoiceTotals(lineInputs, headerAdj, effectiveDecimals);
    const subtotal  = totals.baseIVA;
    const vatAmount = totals.ivaMonto;
    const total     = totals.total;
    const headerAdjActive =
        (headerAdj.descuentoTipo != null && headerAdj.descuentoValor > 0) ||
        (headerAdj.recargoTipo   != null && headerAdj.recargoValor   > 0);

    const effectiveDollarRate = (() => {
        const r = parseRateStr(dollarRateStr);
        return isFinite(r) ? roundRateValue(r, rateDecimals) : null;
    })();

    const buildInvoice = useCallback((): PurchaseInvoice => ({
        id,
        companyId:      currentPurchaseInvoice?.companyId ?? companyId!,
        supplierId,
        invoiceNumber,
        controlNumber,
        date,
        period:         periodoManual && periodo ? periodo : date.slice(0, 7),
        periodoManual,
        status:         "borrador",
        subtotal,
        vatPercentage:  0,
        vatAmount,
        total,
        notes,
        dollarRate:     effectiveDollarRate,
        rateDecimals,
        descuentoTipo:  headerAdj.descuentoTipo,
        descuentoValor: headerAdj.descuentoValor,
        descuentoMonto: totals.descuentoHeader,
        recargoTipo:    headerAdj.recargoTipo,
        recargoValor:   headerAdj.recargoValor,
        recargoMonto:   totals.recargoHeader,
    }), [id, currentPurchaseInvoice, companyId, supplierId, invoiceNumber, controlNumber, date, periodo, periodoManual, subtotal, vatAmount, total, notes, effectiveDollarRate, rateDecimals, headerAdj, totals.descuentoHeader, totals.recargoHeader]);

    // Items con montos resueltos para persistir
    const itemsForSave = (): PurchaseInvoiceItem[] => items.map((it, idx) => {
        const t = totals.items[idx];
        return {
            ...it,
            descuentoMonto: t.descuentoMonto,
            recargoMonto:   t.recargoMonto,
            baseIVA:        t.baseIVAFinal,
        };
    });

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
        if (toReturn.length === 0) { notify.error("Ingresa al menos una cantidad a devolver"); return; }
        setSavingReturn(true);
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
        if (!supplierId) { notify.error("Selecciona un proveedor"); return false; }
        if (items.length === 0) { notify.error("Agrega al menos un producto"); return false; }
        for (const item of items) {
            if (!item.productId) { notify.error("Selecciona un producto en cada fila"); return false; }
            if (item.quantity <= 0) { notify.error("La cantidad debe ser mayor a 0"); return false; }
        }
        return true;
    }

    async function handleSaveDraft() {
        if (!validate()) return;
        setSaving(true);
        await savePurchaseInvoice(buildInvoice(), itemsForSave());
        setSaving(false);
    }

    async function handleConfirm() {
        if (!validate()) return;
        setConfirming(true);
        const saved = await savePurchaseInvoice(buildInvoice(), itemsForSave());
        if (!saved) { setConfirming(false); return; }
        const confirmed = await confirmPurchaseInvoice(saved.id!);
        setConfirming(false);
        if (confirmed) setJustConfirmed(true);
    }

    async function handleUnconfirm() {
        if (!currentPurchaseInvoice?.id) return;
        const ok = window.confirm(
            "Al desconfirmar se revierten los movimientos de inventario y los asientos contables generados. Podrás editar la factura y volver a confirmarla. ¿Continuar?"
        );
        if (!ok) return;
        setUnconfirming(true);
        setJustConfirmed(false);
        await unconfirmPurchaseInvoice(currentPurchaseInvoice.id);
        setUnconfirming(false);
    }

    if (loadingPurchaseInvoice) {
        return (
            <div className="min-h-full bg-surface-2 font-mono flex items-center justify-center">
                <span className="text-[13px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Cargando…</span>
            </div>
        );
    }

    if (!currentPurchaseInvoice && !loadingPurchaseInvoice) {
        return (
            <div className="min-h-full bg-surface-2 font-mono">
                <div className="px-8 py-6">
                    <p className="text-[13px] font-sans text-[var(--text-tertiary)]">Factura no encontrada.</p>
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
                    <span className="inline-flex px-2 py-1 rounded border text-[11px] uppercase tracking-[0.08em] font-medium badge-success">
                        Confirmada
                    </span>
                ) : (
                    <span className="inline-flex px-2 py-1 rounded border text-[11px] uppercase tracking-[0.08em] font-medium badge-warning">
                        Borrador
                    </span>
                )}
                <BaseButton.Root variant="secondary" size="sm" leftIcon={<ChevronLeft size={14} strokeWidth={2} />} onClick={() => router.back()}>
                    Volver
                </BaseButton.Root>
            </PageHeader>

            {/* Purchase Return Modal */}
            {showReturnModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-surface-1 border border-border-medium rounded-xl shadow-2xl w-full max-w-lg mx-4">
                        <div className="px-6 py-4 border-b border-border-light flex items-center justify-between">
                            <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">
                                Registrar Devolución de Compra
                            </h2>
                            <button
                                onClick={() => setShowReturnModal(false)}
                                className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                                aria-label="Cerrar"
                            >
                                <X size={14} strokeWidth={2} />
                            </button>
                        </div>

                        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                            <p className="font-sans text-[12px] text-[var(--text-tertiary)] leading-snug">
                                Referencia: <span className="font-mono uppercase tracking-[0.06em] text-[var(--text-secondary)]">DEV-{invoice.invoiceNumber}</span> — solo facturas confirmadas
                            </p>

                            {/* Items */}
                            <div className="space-y-2">
                                {returnItems.map((item, idx) => (
                                    <div key={item.productId} className="flex items-center gap-3 py-2 border-b border-border-light/50">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] text-foreground truncate">{item.name}</p>
                                            <p className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
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
                                <div className="pt-2 text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em]">
                                    Total a devolver:{" "}
                                    <span className="tabular-nums font-bold text-red-500">
                                        Bs. {fmtN(returnItems.reduce((acc, i) => acc + i.returnQty * i.unitCost, 0))}
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

                {justConfirmed && (
                    <div className="mb-4 px-4 py-3 rounded-lg border border-green-500/20 bg-green-500/[0.05] text-green-600 text-[13px] font-sans flex items-center gap-2">
                        <CheckCircle2 size={14} strokeWidth={2} />
                        Factura confirmada — entradas de inventario registradas exitosamente.
                    </div>
                )}

                {isConfirmed && !justConfirmed && (
                    <div className="mb-4 px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] text-[13px] font-sans flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-500">
                            <Lock size={14} strokeWidth={2} />
                            <span>
                                Esta factura está confirmada{invoice.confirmedAt ? ` desde el ${fmtDate(invoice.confirmedAt)}` : ""}.
                                Para corregirla, desconfirma primero — los movimientos y asientos generados se revertirán.
                            </span>
                        </div>
                        <BaseButton.Root
                            variant="secondary"
                            size="sm"
                            leftIcon={<Unlock size={14} strokeWidth={2} />}
                            onClick={handleUnconfirm}
                            disabled={unconfirming}
                        >
                            {unconfirming ? "Desconfirmando…" : "Desconfirmar"}
                        </BaseButton.Root>
                    </div>
                )}

                <div className="flex gap-6 items-start">
                    {/* Left panel */}
                    <div className="flex-1 min-w-0 space-y-4">

                        {/* Invoice data */}
                        <div className="rounded-xl border border-border-light bg-surface-1 p-6">
                            <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground mb-5">
                                Datos de la factura
                            </h2>

                            <div className="grid grid-cols-3 gap-4 mb-4">
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
                            </div>

                            <div className="grid grid-cols-3 gap-4 mb-4">
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
                                <PeriodoContableInput
                                    fecha={date}
                                    periodo={periodo}
                                    periodoManual={periodoManual}
                                    onChange={(p, manual) => { setPeriodo(p); setPeriodoManual(manual); }}
                                    readOnly={!isDraft}
                                />
                                <div>
                                    {isDraft ? (
                                        <BcvRateInput
                                            rate={dollarRateStr}
                                            onRateChange={(v) => { setRateTyped(v); setRateDateBcv(null); }}
                                            decimals={rateDecimals}
                                            onDecimalsChange={applyDecimals}
                                            loading={rateLoading}
                                            bcvDate={rateDateBcv}
                                            error={rateError}
                                        />
                                    ) : (
                                        <>
                                            <label className={labelCls}>Tasa BCV (Bs/USD)</label>
                                            <div className={readonlyCls + " flex items-center"}>
                                                {invoice.dollarRate != null
                                                    ? invoice.dollarRate.toLocaleString("es-VE", {
                                                          minimumFractionDigits: invoice.rateDecimals ?? DEFAULT_RATE_DECIMALS,
                                                          maximumFractionDigits: invoice.rateDecimals ?? DEFAULT_RATE_DECIMALS,
                                                      })
                                                    : "—"}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className={labelCls}>Notas</label>
                                {isDraft ? (
                                    <textarea className={`${fieldCls} h-auto py-2`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                                ) : (
                                    <div className={`${readonlyCls} h-auto py-2 min-h-[60px]`}>
                                        {invoice.notes || "—"}
                                    </div>
                                )}
                            </div>

                            {/* Header adjustments — visible always when there's any active value, editable only in draft */}
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setShowHeaderAdj((v) => !v)}
                                    className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] hover:text-foreground transition-colors"
                                >
                                    <span className={[
                                        "inline-flex w-4 h-4 items-center justify-center rounded font-mono text-[10px] leading-none",
                                        headerAdjActive ? "bg-primary-500/15 text-primary-500" : "bg-surface-2 text-[var(--text-tertiary)]",
                                    ].join(" ")}>
                                        {showHeaderAdj ? "−" : headerAdjActive ? "●" : "+"}
                                    </span>
                                    Ajustes de factura
                                    {headerAdjActive && !showHeaderAdj && (
                                        <span className="text-[10px] text-[var(--text-tertiary)] normal-case tracking-normal">
                                            (descuento/recargo activos)
                                        </span>
                                    )}
                                </button>
                                {showHeaderAdj && (
                                    <div className="mt-3 px-4 py-3 rounded-lg border border-border-light bg-surface-2/40">
                                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] mb-3">
                                            Se prorratean por línea según base IVA
                                        </p>
                                        <HeaderAdjustmentsSection value={headerAdj} onChange={setHeaderAdj} readOnly={!isDraft} />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Items */}
                        <div className="rounded-xl border border-border-light bg-surface-1 p-6">
                            <div className="mb-5">
                                <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground">
                                    Productos
                                </h2>
                            </div>

                            <FacturaItemsGrid
                                items={items}
                                products={products}
                                onChange={setItems}
                                readOnly={!isDraft}
                                dollarRate={effectiveDollarRate}
                                decimals={effectiveDecimals}
                            />

                            {/* Totals */}
                            {(() => {
                                // Use the same shared math for draft and confirmed.
                                const displayItems = isDraft ? items : (invoice.items ?? []);
                                const displayHeader: HeaderAdjustments = isDraft ? headerAdj : {
                                    descuentoTipo:  (invoice.descuentoTipo ?? null) as AdjustmentKind | null,
                                    descuentoValor: invoice.descuentoValor ?? 0,
                                    recargoTipo:    (invoice.recargoTipo ?? null) as AdjustmentKind | null,
                                    recargoValor:   invoice.recargoValor ?? 0,
                                };
                                const dInputs: LineInput[] = displayItems.map((i) => ({
                                    quantity: i.quantity ?? 0,
                                    unitCost: i.unitCost ?? 0,
                                    vatRate:  i.vatRate ?? "general_16",
                                    adjustments: {
                                        descuentoTipo:  (i.descuentoTipo ?? null) as AdjustmentKind | null,
                                        descuentoValor: i.descuentoValor ?? 0,
                                        recargoTipo:    (i.recargoTipo ?? null) as AdjustmentKind | null,
                                        recargoValor:   i.recargoValor ?? 0,
                                    },
                                }));
                                const t = computeInvoiceTotals(dInputs, displayHeader, effectiveDecimals);
                                const dBaseExempt   = dInputs.reduce((acc, l, idx) => l.vatRate === "exenta"     ? acc + t.items[idx].baseIVAFinal : acc, 0);
                                const dBaseTaxed8   = dInputs.reduce((acc, l, idx) => l.vatRate === "reducida_8" ? acc + t.items[idx].baseIVAFinal : acc, 0);
                                const dBaseTaxed16  = dInputs.reduce((acc, l, idx) => l.vatRate === "general_16" ? acc + t.items[idx].baseIVAFinal : acc, 0);
                                const dVat8         = t.ivaPorAlicuota.reducida_8;
                                const dVat16        = t.ivaPorAlicuota.general_16;
                                const dVatAmount    = t.ivaMonto;
                                const dTotal        = isDraft ? t.total : invoice.total;
                                const hasLineOrHeaderAdj = (t.descuentoLinea + t.descuentoHeader + t.recargoLinea + t.recargoHeader) > 0;

                                const rateForUsd = isDraft
                                    ? effectiveDollarRate
                                    : (invoice.dollarRate ?? effectiveDollarRate);
                                const formatUsd = (n: number) =>
                                    rateForUsd && rateForUsd > 0 ? `$ ${fmtN(n / rateForUsd)}` : "—";

                                type RowKind = "muted" | "neutral" | "neg" | "pos" | "primary" | "total";
                                const valueColor: Record<RowKind, string> = {
                                    muted:   "text-[var(--text-secondary)]",
                                    neutral: "text-[var(--text-secondary)]",
                                    neg:     "text-error/80 font-medium",
                                    pos:     "text-amber-600 font-medium",
                                    primary: "text-[var(--text-primary)] font-medium",
                                    total:   "text-foreground font-bold text-[14px]",
                                };
                                const renderRow = (
                                    label: string,
                                    value: number,
                                    opts: { kind?: RowKind; note?: string; indent?: boolean; sign?: "+" | "−" } = {},
                                ) => {
                                    const { kind = "muted", note, indent, sign } = opts;
                                    const labelCol = kind === "total" ? "text-foreground font-semibold" : "text-[var(--text-tertiary)]";
                                    const usdCol   = kind === "total" ? "text-foreground font-bold" : "text-[var(--text-tertiary)]";
                                    return (
                                        <>
                                            <span className={`${labelCol} uppercase tracking-[0.12em] text-[11px] ${indent ? "pl-3" : ""}`}>
                                                {label}
                                                {note && (
                                                    <span className="ml-2 normal-case tracking-normal text-[10px] text-[var(--text-tertiary)] opacity-80">
                                                        {note}
                                                    </span>
                                                )}
                                            </span>
                                            <span className={`tabular-nums ${valueColor[kind]} w-40 text-right`}>
                                                {sign && <span className="opacity-60 mr-0.5">{sign}</span>}
                                                Bs. {fmtN(value)}
                                            </span>
                                            <span className={`tabular-nums ${usdCol} w-32 text-right text-[12px]`}>
                                                {sign && <span className="opacity-60 mr-0.5">{sign}</span>}
                                                {formatUsd(value)}
                                            </span>
                                        </>
                                    );
                                };

                                // ── View shape decisions ─────────────────────────────────────
                                // Goal: never show two rows that hold the same numeric value. The
                                // intermediate "Base IVA" row only earns its keep when there are
                                // adjustments (it bridges bruto → final base) or when bases are
                                // split across multiple alícuotas. In any single-alícuota / no-adj
                                // case it equals the next row, so we collapse it.
                                const aliquotCount =
                                    (dBaseExempt > 0 ? 1 : 0) +
                                    (dBaseTaxed8 > 0 ? 1 : 0) +
                                    (dBaseTaxed16 > 0 ? 1 : 0);
                                const isOnlyExempt   = aliquotCount === 1 && dBaseExempt > 0;
                                const isMixed        = aliquotCount > 1;
                                const hasIva         = dVatAmount > 0;
                                const hasMultipleTaxedAlicuotas = (dVat8 > 0 && dVat16 > 0);

                                const showAdjustmentSection  = hasLineOrHeaderAdj;
                                // intermediate Base IVA row: only when adjustments OR mixed alícuotas
                                const showBaseIntermediate   = showAdjustmentSection || isMixed;
                                // per-alícuota breakdown: only when mixed (otherwise it'd duplicate)
                                const showAlicuotaBreakdown  = isMixed;

                                // Single-alícuota label when collapsed
                                const singleAliquotaLabel: string =
                                    isOnlyExempt ? "exenta"
                                    : dBaseTaxed8 > 0 ? "gravada 8%"
                                    : "gravada 16%";

                                return (
                                    <div className="mt-4 pt-4 border-t border-border-light">
                                        <div className="flex justify-end">
                                            <div className="grid grid-cols-[minmax(200px,1fr)_auto_auto] gap-x-6 gap-y-1.5 items-baseline text-[13px]">
                                                {/* Column headers */}
                                                <span aria-hidden="true" />
                                                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] w-40 text-right">Bolívares</span>
                                                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] w-32 text-right">USD</span>

                                                {/* Block 1 — Adjustments */}
                                                {showAdjustmentSection && (
                                                    <>
                                                        {renderRow("Subtotal bruto", t.subtotalBruto, { kind: "muted", note: "Σ qty × costo" })}
                                                        {t.descuentoLinea  > 0 && renderRow("Descuento líneas",  t.descuentoLinea,  { kind: "neg", sign: "−", indent: true })}
                                                        {t.descuentoHeader > 0 && renderRow("Descuento factura", t.descuentoHeader, { kind: "neg", sign: "−", indent: true, note: "prorrateado" })}
                                                        {t.recargoLinea    > 0 && renderRow("Recargo líneas",    t.recargoLinea,    { kind: "pos", sign: "+", indent: true })}
                                                        {t.recargoHeader   > 0 && renderRow("Recargo factura",   t.recargoHeader,   { kind: "pos", sign: "+", indent: true, note: "prorrateado" })}
                                                        <div className="col-span-3 h-px bg-border-light my-0.5" aria-hidden="true" />
                                                    </>
                                                )}

                                                {/* Block 2 — Base */}
                                                {showBaseIntermediate ? (
                                                    isOnlyExempt
                                                        ? renderRow("Base imponible", t.baseIVA, {
                                                              kind: "primary",
                                                              note: showAdjustmentSection ? "exenta · = bruto − desc + rec" : "exenta",
                                                          })
                                                        : renderRow("Base IVA", t.baseIVA, {
                                                              kind: "primary",
                                                              note: showAdjustmentSection ? "= bruto − desc + rec" : undefined,
                                                          })
                                                ) : (
                                                    // Single alícuota, no adjustments: collapse to one labeled row
                                                    renderRow("Base imponible", t.baseIVA, {
                                                        kind: "primary",
                                                        note: singleAliquotaLabel,
                                                    })
                                                )}

                                                {/* Block 3 — Per-alícuota breakdown (only when mixed) */}
                                                {showAlicuotaBreakdown && (
                                                    <>
                                                        <div className="col-span-3 h-1" aria-hidden="true" />
                                                        {dBaseExempt   > 0 && renderRow("Base exenta",       dBaseExempt,  { kind: "muted",   indent: true })}
                                                        {dBaseTaxed8   > 0 && renderRow("Base gravada 8%",   dBaseTaxed8,  { kind: "muted",   indent: true })}
                                                        {dVat8         > 0 && renderRow("IVA 8%",            dVat8,        { kind: "neutral", indent: true, note: "8% × base" })}
                                                        {dBaseTaxed16  > 0 && renderRow("Base gravada 16%",  dBaseTaxed16, { kind: "muted",   indent: true })}
                                                        {dVat16        > 0 && renderRow("IVA 16%",           dVat16,       { kind: "neutral", indent: true, note: "16% × base" })}
                                                        {hasMultipleTaxedAlicuotas && renderRow("Total IVA", dVatAmount,   { kind: "neutral", indent: true, note: "= IVA 8% + IVA 16%" })}
                                                    </>
                                                )}

                                                {/* Block 4 — Single-alícuota IVA row (when not mixed and not exempt) */}
                                                {!showAlicuotaBreakdown && hasIva && (
                                                    dVat8 > 0
                                                        ? renderRow("IVA 8%",  dVat8,  { kind: "neutral", note: "8% × base" })
                                                        : renderRow("IVA 16%", dVat16, { kind: "neutral", note: "16% × base" })
                                                )}

                                                <div className="col-span-3 h-px bg-border-light my-1" aria-hidden="true" />
                                                {renderRow("Total", dTotal, {
                                                    kind: "total",
                                                    // Only annotate when the equation actually adds two terms.
                                                    note: hasIva ? "= base + IVA" : undefined,
                                                })}

                                                {!rateForUsd && (
                                                    <p className="col-span-3 mt-1 text-[10px] font-sans text-[var(--text-tertiary)] leading-snug text-right">
                                                        Define la tasa BCV para ver el equivalente en USD.
                                                    </p>
                                                )}
                                            </div>
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
                                    size="md"
                                    leftIcon={<Save size={14} strokeWidth={2} />}
                                    onClick={handleSaveDraft}
                                    disabled={saving || confirming}
                                >
                                    {saving ? "Guardando…" : "Guardar borrador"}
                                </BaseButton.Root>
                                <BaseButton.Root
                                    variant="primary"
                                    size="md"
                                    leftIcon={<CheckCircle2 size={14} strokeWidth={2} />}
                                    onClick={handleConfirm}
                                    disabled={saving || confirming}
                                >
                                    {confirming ? "Confirmando…" : "Confirmar factura"}
                                </BaseButton.Root>
                            </div>
                        )}

                        {isConfirmed && (
                            <div className="flex items-center gap-3">
                                <BaseButton.Root
                                    as={Link}
                                    href={`/inventory/movements?periodo=${invoice.period}`}
                                    variant="secondary"
                                    size="md"
                                    rightIcon={<ArrowRight size={14} strokeWidth={2} />}
                                >
                                    Ver movimientos
                                </BaseButton.Root>
                                <BaseButton.Root
                                    variant="dangerOutline"
                                    size="md"
                                    leftIcon={<RotateCcw size={14} strokeWidth={2} />}
                                    onClick={openReturnModal}
                                >
                                    Registrar devolución
                                </BaseButton.Root>
                            </div>
                        )}

                        {returnSuccess && (
                            <div className="px-4 py-3 rounded-lg border border-green-500/20 bg-green-500/[0.05] text-green-600 text-[13px] font-sans flex items-center gap-2">
                                <CheckCircle2 size={14} strokeWidth={2} />
                                Devolución registrada — movimientos de devolución de compra creados.
                            </div>
                        )}
                    </div>

                    {/* Right panel — summary */}
                    <div className="w-64 flex-shrink-0 sticky top-6">
                        <div className="rounded-xl border border-border-light bg-surface-1 p-5 space-y-4">
                            <h3 className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                                Resumen
                            </h3>
                            <div className="space-y-3 text-[13px]">
                                <div className="flex justify-between gap-3">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px] flex-shrink-0">Proveedor</span>
                                    <span className="text-foreground font-medium truncate text-right">
                                        {invoice.supplierName ?? "—"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Nº Control</span>
                                    <span className="text-foreground tabular-nums">{invoice.controlNumber || "—"}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Fecha</span>
                                    <span className="text-foreground tabular-nums">{fmtDate(invoice.date)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Período</span>
                                    <span className="flex items-center gap-1.5">
                                        <span className="text-foreground tabular-nums">{invoice.period}</span>
                                        {invoice.periodoManual && (
                                            <span className="px-1 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-600 font-mono text-[8px] uppercase tracking-[0.12em] font-bold">
                                                Manual
                                            </span>
                                        )}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Ítems</span>
                                    <span className="text-foreground tabular-nums">{(invoice.items ?? items).length}</span>
                                </div>
                            </div>
                            <div className="pt-3 border-t border-border-light space-y-2 text-[13px]">
                                {(() => {
                                    const summaryRate = invoice.dollarRate ?? effectiveDollarRate;
                                    const usd = (n: number) =>
                                        summaryRate && summaryRate > 0 ? `$ ${fmtN(n / summaryRate)}` : null;
                                    // Skip "Base IVA" + "IVA" rows when there's no IVA — they
                                    // would just echo the Total. Show only the Total in that case.
                                    const summaryHasIva = invoice.vatAmount > 0;
                                    return (
                                        <>
                                            {summaryHasIva && (
                                                <>
                                                    <div className="flex justify-between items-baseline">
                                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Base IVA</span>
                                                        <div className="text-right">
                                                            <div className="tabular-nums text-[var(--text-primary)]">Bs. {fmtN(invoice.subtotal)}</div>
                                                            {usd(invoice.subtotal) && (
                                                                <div className="tabular-nums text-[10px] text-[var(--text-tertiary)]">≈ {usd(invoice.subtotal)}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-between items-baseline">
                                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">IVA</span>
                                                        <div className="text-right">
                                                            <div className="tabular-nums text-[var(--text-secondary)]">Bs. {fmtN(invoice.vatAmount)}</div>
                                                            {usd(invoice.vatAmount) && (
                                                                <div className="tabular-nums text-[10px] text-[var(--text-tertiary)]">≈ {usd(invoice.vatAmount)}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                            <div className="flex justify-between items-baseline font-bold pt-1">
                                                <span className="text-foreground uppercase tracking-[0.12em] text-[11px]">Total</span>
                                                <div className="text-right">
                                                    <div className="tabular-nums text-foreground text-[14px]">Bs. {fmtN(invoice.total)}</div>
                                                    {usd(invoice.total) && (
                                                        <div className="tabular-nums text-[11px] font-semibold text-[var(--text-secondary)]">≈ {usd(invoice.total)}</div>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                            {isConfirmed && invoice.confirmedAt && (
                                <div className="pt-3 border-t border-border-light flex items-center gap-1.5">
                                    <CheckCircle2 size={12} strokeWidth={2} className="text-green-500" />
                                    <span className="text-[11px] uppercase tracking-[0.12em] text-green-500">
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
