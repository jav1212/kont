"use client";

// SalesInvoiceForm — formulario único para crear/editar/ver una factura de venta.
// Para drafts es totalmente editable; para confirmadas pasa a read-only y
// expone botones Confirmar / Desconfirmar / Descargar PDF.

import { useEffect, useMemo, useState } from "react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { Plus, Trash2, FileText, CheckCircle2, Lock, Unlock, Save, Package, UserRound, CalendarDays, ChevronDown, Calculator } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { BaseSelect } from "@/src/shared/frontend/components/base-select";
import { BaseTextarea } from "@/src/shared/frontend/components/base-textarea";
import { notify } from "@/src/shared/frontend/notify";
import { useSales, type SalesInvoice, type SalesInvoiceItem } from "@/src/modules/sales/frontend/hooks/use-sales";
import {
    IgtfPerceptionSection,
    emptyIgtfPerceptionValue,
    type IgtfPerceptionFormValue,
} from "./igtf-perception-section";
import type { VatRate, PaymentTerms, IgtfConcept } from "../../backend/domain/sales-invoice";
import { computeInvoiceTotals, emptyHeaderAdjustments, type LineInput } from "@/src/modules/inventory/shared/totals";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { SalesLineCombobox } from "./sales-line-combobox";
import { generateSalesInvoicePdf } from "../utils/sales-invoice-pdf";

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const VAT_OPTIONS: { value: VatRate; label: string; pct: number }[] = [
    { value: "exenta",     label: "Exenta", pct: 0  },
    { value: "reducida_8", label: "8%",     pct: 8  },
    { value: "general_16", label: "16%",    pct: 16 },
];

const PAYMENT_TERMS: { value: PaymentTerms; label: string }[] = [
    { value: "contado",      label: "Contado" },
    { value: "credito_15",   label: "Crédito 15 días" },
    { value: "credito_30",   label: "Crédito 30 días" },
    { value: "credito_60",   label: "Crédito 60 días" },
    { value: "credito_90",   label: "Crédito 90 días" },
    { value: "otro",         label: "Otro" },
];

function emptyItem(): SalesInvoiceItem {
    return {
        productId:    null,
        description:  "",
        quantity:     1,
        unitPrice:    0,
        totalLine:    0,
        vatRate:      "general_16",
        currency:     "B",
        ivaIncluido:  false,
    };
}

function todayStr(): string {
    return new Date().toISOString().split("T")[0];
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

export interface SalesInvoiceFormProps {
    /** Id de factura existente o null para crear una nueva. */
    invoiceId: string | null;
}

export function SalesInvoiceForm({ invoiceId }: SalesInvoiceFormProps) {
    const router = useRouter();
    const { companyId, company } = useCompany();
    const { products, loadProducts } = useInventory();
    const {
        customers, loadCustomers,
        currentSalesInvoice, loadingSalesInvoice, loadSalesInvoice,
        saveSalesInvoice, confirmSalesInvoice, unconfirmSalesInvoice,
    } = useSales();

    // Form state
    const [customerId, setCustomerId]       = useState("");
    const [invoiceNumber, setInvoiceNumber] = useState("");
    const [controlNumber, setControlNumber] = useState("");
    const [date, setDate]                   = useState(todayStr());
    const [dueDate, setDueDate]             = useState<string>("");
    const [paymentTerms, setPaymentTerms]   = useState<PaymentTerms>("contado");
    const [notes, setNotes]                 = useState("");
    const [items, setItems]                 = useState<SalesInvoiceItem[]>(() => [emptyItem()]);
    const [igtf, setIgtf]                   = useState<IgtfPerceptionFormValue>(() => emptyIgtfPerceptionValue());
    const [showIgtf, setShowIgtf]           = useState(false);

    const [saving, setSaving]               = useState(false);
    const [confirming, setConfirming]       = useState(false);
    const [unconfirming, setUnconfirming]   = useState(false);
    const [generatingPdf, setGeneratingPdf] = useState(false);

    useEffect(() => {
        if (companyId) loadCustomers(companyId);
    }, [companyId, loadCustomers]);

    useEffect(() => {
        if (companyId) loadProducts(companyId);
    }, [companyId, loadProducts]);

    useEffect(() => {
        if (invoiceId) loadSalesInvoice(invoiceId);
    }, [invoiceId, loadSalesInvoice]);

    // Populate form when invoice loads (render-phase to avoid setState-in-effect).
    const [formSource, setFormSource] = useState<string | null>(null);
    if (invoiceId && currentSalesInvoice?.id === invoiceId && formSource !== invoiceId) {
        setFormSource(invoiceId);
        setCustomerId(currentSalesInvoice.customerId);
        setInvoiceNumber(currentSalesInvoice.invoiceNumber ?? "");
        setControlNumber(currentSalesInvoice.controlNumber ?? "");
        setDate(currentSalesInvoice.date.split("T")[0]);
        setDueDate(currentSalesInvoice.dueDate ?? "");
        setPaymentTerms((currentSalesInvoice.paymentTerms as PaymentTerms) ?? "contado");
        setNotes(currentSalesInvoice.notes ?? "");
        setItems(
            currentSalesInvoice.items && currentSalesInvoice.items.length > 0
                ? currentSalesInvoice.items.map((i) => ({ ...i }))
                : [emptyItem()]
        );
        setIgtf({
            applies:     currentSalesInvoice.igtfPerceptionApplies ?? false,
            concept:    currentSalesInvoice.igtfPerceptionConcept ?? null,
            percentage: currentSalesInvoice.igtfPerceptionPercentage ?? 3,
            foreignBase: currentSalesInvoice.igtfPerceptionForeignBase ?? 0,
            localBase:  currentSalesInvoice.igtfPerceptionLocalBase ?? 0,
            amount:     currentSalesInvoice.igtfPerceptionAmount ?? 0,
        });
        setShowIgtf(currentSalesInvoice.igtfPerceptionApplies ?? false);
    }

    const isExistingInvoice = invoiceId != null && invoiceId !== "";
    const isConfirmed       = isExistingInvoice && currentSalesInvoice?.status === "confirmada";
    const isReadOnly        = isConfirmed;

    // Recompute item totals when qty/price/vat changes
    function updateItem(idx: number, patch: Partial<SalesInvoiceItem>) {
        setItems((prev) => prev.map((it, i) => {
            if (i !== idx) return it;
            const next = { ...it, ...patch };
            const qty   = next.quantity ?? 0;
            const price = next.unitPrice ?? 0;
            next.totalLine = round2(qty * price);
            next.baseIVA   = next.totalLine;
            return next;
        }));
    }

    function addItem() { setItems((prev) => [...prev, emptyItem()]); }
    function removeItem(idx: number) { setItems((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)); }

    function selectProduct(idx: number, productId: string) {
        const product = products.find((candidate) => candidate.id === productId);
        updateItem(idx, product ? {
            productId: product.id,
            description: product.name,
            vatRate: product.vatType === "exento" ? "exenta" : "general_16",
        } : { productId: null });
    }

    // Totals are calculated by the shared invoice engine.
    const salesCurrency = items.length > 0 && items.every((item) => item.currency === "D") ? "D" : "B";
    const salesLineInputs: LineInput[] = items.map((item) => ({
        quantity: item.quantity ?? 0,
        unitCost: item.unitPrice ?? 0,
        currency: item.currency ?? "B",
        currencyCost: item.currencyPrice ?? null,
        vatRate: item.vatRate,
        adjustments: {
            descuentoTipo: item.descuentoTipo ?? null,
            descuentoValor: item.descuentoValor ?? 0,
            descuentoMoneda: "B",
            recargoTipo: item.recargoTipo ?? null,
            recargoValor: item.recargoValor ?? 0,
            recargoMoneda: "B",
        },
    }));

    const totals = useMemo(() => {
        const calculated = computeInvoiceTotals(
            salesLineInputs,
            emptyHeaderAdjustments(),
            2,
            0,
            [],
            items.find((item) => item.dollarRate && item.dollarRate > 0)?.dollarRate ?? 0,
            salesCurrency,
        );
        const baseByRate = { exenta: 0, reducida_8: 0, general_16: 0 };
        calculated.items.forEach((line, index) => {
            baseByRate[salesLineInputs[index].vatRate] += line.baseIVAFinal;
        });
        const igtfMonto = igtf.applies ? round2(igtf.amount) : 0;
        return {
            baseExempt: baseByRate.exenta,
            baseTaxed8: baseByRate.reducida_8,
            baseTaxed16: baseByRate.general_16,
            iva8: calculated.ivaPorAlicuota.reducida_8,
            iva16: calculated.ivaPorAlicuota.general_16,
            ivaTotal: calculated.ivaMonto,
            subtotal: calculated.baseIVA,
            igtfMonto,
            total: round2(calculated.total + igtfMonto),
        };
    }, [salesLineInputs, salesCurrency, items, igtf]);

    const customerObj = customers.find((c) => c.id === customerId);

    // Build invoice payload
    function buildInvoice(): SalesInvoice {
        return {
            id:              invoiceId ?? undefined,
            companyId:       companyId!,
            customerId,
            invoiceNumber,
            controlNumber,
            date,
            period:          date.slice(0, 7),
            periodoManual:   false,
            dueDate:         dueDate || null,
            paymentTerms,
            status:          "borrador",
            subtotal:        totals.subtotal,
            vatAmount:       totals.ivaTotal,
            total:           totals.total,
            notes,
            descuentoTipo:   null, descuentoValor: 0,
            recargoTipo:     null, recargoValor: 0,
            igtfPerceptionApplies:     igtf.applies,
            igtfPerceptionConcept:   (igtf.concept ?? null) as IgtfConcept | null,
            igtfPerceptionPercentage: igtf.percentage,
            igtfPerceptionForeignBase: igtf.foreignBase,
            igtfPerceptionLocalBase:     igtf.localBase,
            igtfPerceptionAmount:      igtf.amount,
        };
    }

    function validate(): boolean {
        if (!customerId) { notify.error("Selecciona un cliente"); return false; }
        if (!date)       { notify.error("La fecha es obligatoria"); return false; }
        for (const it of items) {
            if (!it.description.trim()) { notify.error("Cada línea necesita una descripción"); return false; }
            if ((it.quantity ?? 0) <= 0) { notify.error("La cantidad debe ser mayor a 0"); return false; }
        }
        const requestedByProduct = new Map<string, number>();
        for (const item of items) {
            if (!item.productId) continue;
            requestedByProduct.set(item.productId, (requestedByProduct.get(item.productId) ?? 0) + item.quantity);
        }
        for (const [productId, requested] of requestedByProduct) {
            const product = products.find((candidate) => candidate.id === productId);
            if (!product) { notify.error("Uno de los productos seleccionados ya no está disponible"); return false; }
            if (requested > product.currentStock) {
                notify.error(`Stock insuficiente para ${product.name}: disponible ${fmtN(product.currentStock)}`);
                return false;
            }
        }
        return true;
    }

    async function handleSaveDraft() {
        if (!validate()) return;
        setSaving(true);
        const saved = await saveSalesInvoice(buildInvoice(), items);
        setSaving(false);
        if (saved && !isExistingInvoice) {
            router.replace(`/sales/${saved.id}`);
        }
    }

    async function handleConfirm() {
        if (!validate()) return;
        setConfirming(true);
        const saved = await saveSalesInvoice(buildInvoice(), items);
        if (!saved) { setConfirming(false); return; }
        const confirmed = await confirmSalesInvoice(saved.id!);
        if (confirmed && companyId) await loadProducts(companyId, true);
        setConfirming(false);
        if (confirmed && !isExistingInvoice) {
            router.replace(`/sales/${confirmed.id}`);
        }
    }

    async function handleUnconfirm() {
        if (!currentSalesInvoice?.id) return;
        const ok = window.confirm("Al desconfirmar la factura quedará en borrador y podrás editarla. ¿Continuar?");
        if (!ok) return;
        setUnconfirming(true);
        const result = await unconfirmSalesInvoice(currentSalesInvoice.id);
        if (result && companyId) await loadProducts(companyId, true);
        setUnconfirming(false);
    }

    async function handleDownloadPdf() {
        if (!currentSalesInvoice || !company || !customerObj) return;
        if (!company.rif) { notify.error("La empresa no tiene RIF configurado."); return; }
        if (!customerObj.rif) { notify.error("El cliente no tiene RIF — requerido por SENIAT."); return; }
        setGeneratingPdf(true);
        try {
            await generateSalesInvoicePdf({
                issuer: { name: company.name, rif: company.rif, address: company.address, phone: company.phone },
                customer: { name: customerObj.name, rif: customerObj.rif, address: customerObj.address },
                invoice: {
                    number:        currentSalesInvoice.invoiceNumber,
                    controlNumber: currentSalesInvoice.controlNumber ?? "",
                    date:          currentSalesInvoice.date.split("T")[0],
                    dueDate:       currentSalesInvoice.dueDate,
                    paymentTerms:  currentSalesInvoice.paymentTerms,
                    notes:         currentSalesInvoice.notes,
                },
                items: (currentSalesInvoice.items ?? []).map((i) => ({
                    description: i.description,
                    quantity:    i.quantity,
                    unitPrice:   i.unitPrice,
                    totalLine:   i.totalLine,
                    vatRate:     i.vatRate,
                })),
                totals: {
                    subtotal:    currentSalesInvoice.subtotal,
                    baseExempt:  totals.baseExempt,
                    baseTaxed8:  totals.baseTaxed8,
                    baseTaxed16: totals.baseTaxed16,
                    iva8:        totals.iva8,
                    iva16:       totals.iva16,
                    ivaTotal:    currentSalesInvoice.vatAmount,
                    total:       currentSalesInvoice.total,
                },
                igtf: currentSalesInvoice.igtfPerceptionApplies && currentSalesInvoice.igtfPerceptionConcept ? {
                    concept:    currentSalesInvoice.igtfPerceptionConcept,
                    percentage: currentSalesInvoice.igtfPerceptionPercentage ?? 3,
                    foreignBase: currentSalesInvoice.igtfPerceptionForeignBase ?? 0,
                    localBase:  currentSalesInvoice.igtfPerceptionLocalBase ?? 0,
                    amount:     currentSalesInvoice.igtfPerceptionAmount ?? 0,
                } : null,
            });
            notify.success("Factura PDF generada.");
        } catch (e) {
            notify.error(e instanceof Error ? e.message : "Error al generar PDF");
        } finally {
            setGeneratingPdf(false);
        }
    }

    if (loadingSalesInvoice && isExistingInvoice) {
        return (
            <div className="px-8 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">
                Cargando factura…
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 xl:px-8">
            {isConfirmed && (
                <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3 font-sans text-[13px]">
                    <div className="flex items-center gap-2 text-amber-700">
                        <Lock size={14} strokeWidth={2} />
                        <span>Factura confirmada — solo lectura. Para editar, desconfirma primero.</span>
                    </div>
                </div>
            )}

            <div className="flex flex-col items-stretch gap-6 xl:flex-row xl:items-start">
                <div className="min-w-0 flex-1 space-y-4">
            {/* Datos de la factura */}
            <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm overflow-hidden space-y-0">
                <header className="flex items-start gap-3 border-b border-border-light px-6 py-5">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary-500/20 bg-primary-500/10 text-primary-500">
                        <FileText size={15} strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">Datos de la factura</h2>
                        <p className="mt-1.5 font-sans text-[12px] leading-snug text-[var(--text-tertiary)]">Identifica al cliente y define las condiciones de cobro.</p>
                    </div>
                </header>
                <div className="space-y-5 p-6">
                    <div className="grid gap-4 md:grid-cols-3">
                        {isReadOnly ? (
                            <BaseInput.Field label="Cliente" value={customerObj?.name ?? "—"} readOnly />
                        ) : (
                            <div className="space-y-2">
                                <label className="block text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-secondary)]">Cliente</label>
                                <BaseSelect
                                items={customers.filter((customer) => customer.active).map((customer) => ({ id: customer.id!, name: customer.name, subtitle: customer.rif }))}
                                value={customerId}
                                onValueChange={setCustomerId}
                                placeholder="Seleccionar cliente…"
                                selectionMode="single"
                                />
                            </div>
                        )}
                        <BaseInput.Field label="Nº Factura" value={invoiceNumber} onValueChange={setInvoiceNumber} placeholder="Auto-asignado al guardar" readOnly={isReadOnly} />
                        <BaseInput.Field label="Nº Control" value={controlNumber} onValueChange={setControlNumber} placeholder="00-12345678" readOnly={isReadOnly} />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <BaseInput.Field label="Fecha" type="date" value={date} onValueChange={setDate} readOnly={isReadOnly} />
                        {isReadOnly ? (
                            <BaseInput.Field label="Condiciones de pago" value={PAYMENT_TERMS.find((term) => term.value === paymentTerms)?.label ?? paymentTerms} readOnly />
                        ) : (
                            <div className="space-y-2">
                                <label className="block text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-secondary)]">Condiciones de pago</label>
                                <BaseSelect
                                items={PAYMENT_TERMS.map((term) => ({ id: term.value, name: term.label }))}
                                value={paymentTerms}
                                onValueChange={(value) => setPaymentTerms(value as PaymentTerms)}
                                selectionMode="single"
                                />
                            </div>
                        )}
                        <BaseInput.Field label="Fecha de vencimiento" type="date" value={dueDate} onValueChange={setDueDate} readOnly={isReadOnly} isDisabled={!isReadOnly && paymentTerms === "contado"} />
                    </div>

                    <BaseTextarea
                        label="Notas"
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="Observaciones, condiciones especiales o referencia interna…"
                        readOnly={isReadOnly}
                        rows={3}
                    />
                </div>
            </div>

            {/* Items */}
            <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between border-b border-border-light px-6 py-5">
                    <div className="flex items-center gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary-500/20 bg-primary-500/10 text-primary-500">
                            <Package size={15} strokeWidth={2} />
                        </div>
                        <div>
                            <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">Detalle de la factura</h2>
                            <p className="mt-1 font-sans text-[12px] text-[var(--text-tertiary)]">Productos de inventario y servicios vendidos.</p>
                        </div>
                    </div>
                    {!isReadOnly && (
                        <BaseButton.Root variant="ghost" size="sm" leftIcon={<Plus size={14} strokeWidth={2} />} onClick={addItem}>
                            Agregar línea
                        </BaseButton.Root>
                    )}
                </div>

                <div className="overflow-x-auto px-6 py-3">
                    <div className="min-w-[760px]">
                        <div style={{ gridTemplateColumns: "minmax(260px, 1fr) 80px 120px 100px 110px 32px" }} className="grid gap-3 border-b border-border-light px-2 py-2 text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                            <span>Producto / descripción</span><span className="text-right">Cantidad</span><span className="text-right">Precio unit.</span><span className="text-center">IVA</span><span className="text-right">Total</span><span />
                        </div>
                        {items.map((it, idx) => (
                            <div key={idx} style={{ gridTemplateColumns: "minmax(260px, 1fr) 80px 120px 100px 110px 32px" }} className="group grid items-start gap-3 border-b border-border-light/60 px-2 py-3 last:border-b-0">
                                <SalesLineCombobox
                                    productId={it.productId}
                                    description={it.description}
                                    products={products.filter((product) => product.active)}
                                    readOnly={isReadOnly}
                                    onFreeTextChange={(value) => updateItem(idx, { productId: null, description: value })}
                                    onProductSelect={(product) => selectProduct(idx, product.id!)}
                                    onClear={() => updateItem(idx, { productId: null, description: "" })}
                                />
                                <BaseInput.Field aria-label="Cantidad" type="number" min="0" step="0.01" size="sm" inputClassName="text-right tabular-nums" value={it.quantity ? String(it.quantity) : ""} onValueChange={(value) => updateItem(idx, { quantity: parseFloat(value) || 0 })} isReadOnly={isReadOnly} />
                                <BaseInput.Field aria-label="Precio unitario" type="number" min="0" step="0.01" size="sm" inputClassName="text-right tabular-nums" value={it.unitPrice ? String(it.unitPrice) : ""} onValueChange={(value) => updateItem(idx, { unitPrice: parseFloat(value) || 0 })} isReadOnly={isReadOnly} />
                                <BaseSelect aria-label="Alícuota IVA" size="sm" items={VAT_OPTIONS.map((option) => ({ id: option.value, name: option.label }))} value={it.vatRate} onValueChange={(value) => updateItem(idx, { vatRate: value as VatRate })} selectionMode="single" isDisabled={isReadOnly} />
                                <div className="pt-2 text-right text-[13px] font-semibold tabular-nums text-foreground">Bs. {fmtN(it.totalLine)}</div>
                                {!isReadOnly && items.length > 1 ? (
                                    <button type="button" aria-label="Eliminar línea" onClick={() => removeItem(idx)} className="mt-1 flex size-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100 focus:opacity-100">
                                        <Trash2 size={14} strokeWidth={2} />
                                    </button>
                                ) : <span />}
                            </div>
                        ))}
                        <div className="flex items-center justify-between px-2 pt-3 text-[10px] text-[var(--text-tertiary)]">
                            <span>{items.length} {items.length === 1 ? "línea" : "líneas"}</span>
                            <span>El inventario se descuenta al confirmar.</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* IGTF percepción */}
            <div className="overflow-hidden rounded-xl border border-border-light bg-surface-1 shadow-sm">
                <button type="button" className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left" onClick={() => !isReadOnly && setShowIgtf((open) => !open)}>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">IGTF · Percepción</h2>
                            {igtf.applies && <span className="rounded-full bg-info/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-info">Aplica</span>}
                        </div>
                        <p className="mt-1 font-sans text-[11px] text-[var(--text-tertiary)]">Configura únicamente cuando el cobro incluya divisas.</p>
                    </div>
                    <ChevronDown size={16} className={`shrink-0 text-[var(--text-tertiary)] transition-transform ${showIgtf || (isReadOnly && igtf.applies) ? "rotate-180" : ""}`} />
                </button>
                {(showIgtf || (isReadOnly && igtf.applies)) && (
                    <div className="border-t border-border-light p-6">
                        <IgtfPerceptionSection value={igtf} onChange={setIgtf} dollarRate={null} readOnly={isReadOnly} />
                    </div>
                )}
            </div>
                </div>

                <aside className="w-full shrink-0 space-y-4 xl:sticky xl:top-20 xl:w-80">
                    <div className="rounded-xl border border-border-light bg-surface-1 p-5 shadow-sm">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                            <div className="flex size-8 items-center justify-center rounded-lg border border-primary-500/20 bg-primary-500/10 text-primary-500">
                                <Calculator size={15} strokeWidth={2} />
                            </div>
                            <h3 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">Resumen</h3>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] ${isConfirmed ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>{isConfirmed ? "Confirmada" : "Borrador"}</span>
                        </div>
                        <div className="space-y-3 text-[13px]">
                            <div className="flex items-start justify-between gap-3">
                                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]"><UserRound size={12} /> Cliente</span>
                                <span className="max-w-[130px] truncate text-right font-medium text-foreground">{customerObj?.name ?? "—"}</span>
                            </div>
                            <div className="flex justify-between gap-3">
                                <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Factura</span>
                                <span className="text-right tabular-nums text-foreground">{invoiceNumber || "Auto"}</span>
                            </div>
                            <div className="flex justify-between gap-3">
                                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]"><CalendarDays size={12} /> Fecha</span>
                                <span className="text-right tabular-nums text-foreground">{date || "—"}</span>
                            </div>
                            <div className="flex justify-between gap-3">
                                <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Ítems</span>
                                <span className="tabular-nums text-foreground">{items.length}</span>
                            </div>
                        </div>
                        <div className="mt-5 space-y-2 border-t border-border-light pt-4 text-[13px]">
                            {totals.baseExempt > 0 && <div className="flex justify-between"><span className="text-[var(--text-tertiary)]">Base exenta</span><span className="tabular-nums">Bs. {fmtN(totals.baseExempt)}</span></div>}
                            {totals.baseTaxed8 > 0 && <div className="flex justify-between"><span className="text-[var(--text-tertiary)]">Base 8%</span><span className="tabular-nums">Bs. {fmtN(totals.baseTaxed8)}</span></div>}
                            {totals.baseTaxed16 > 0 && <div className="flex justify-between"><span className="text-[var(--text-tertiary)]">Base 16%</span><span className="tabular-nums">Bs. {fmtN(totals.baseTaxed16)}</span></div>}
                            <div className="flex justify-between"><span className="text-[var(--text-tertiary)]">Subtotal</span><span className="tabular-nums">Bs. {fmtN(totals.subtotal)}</span></div>
                            <div className="flex justify-between"><span className="text-[var(--text-tertiary)]">IVA</span><span className="tabular-nums">Bs. {fmtN(totals.ivaTotal)}</span></div>
                            {totals.igtfMonto > 0 && <div className="flex justify-between"><span className="text-info">IGTF</span><span className="tabular-nums text-info">+ Bs. {fmtN(totals.igtfMonto)}</span></div>}
                            <div className="mt-3 flex items-end justify-between gap-3 border-t border-border-light pt-3">
                                <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Total</span>
                                <span className="text-[17px] font-bold tabular-nums text-primary-500">Bs. {fmtN(totals.total)}</span>
                            </div>
                        </div>
                        <div className="mt-5 grid gap-2 border-t border-border-light pt-4">
                            {!isReadOnly && <>
                                <BaseButton.Root className="w-full" variant="primary" size="md" leftIcon={<CheckCircle2 size={14} strokeWidth={2} />} onClick={handleConfirm} disabled={saving || confirming}>{confirming ? "Confirmando…" : "Confirmar factura"}</BaseButton.Root>
                                <BaseButton.Root className="w-full" variant="secondary" size="md" leftIcon={<Save size={14} strokeWidth={2} />} onClick={handleSaveDraft} disabled={saving || confirming}>{saving ? "Guardando…" : "Guardar borrador"}</BaseButton.Root>
                            </>}
                            {isConfirmed && <>
                                <BaseButton.Root className="w-full" variant="primary" size="md" leftIcon={<FileText size={14} strokeWidth={2} />} onClick={handleDownloadPdf} disabled={generatingPdf}>{generatingPdf ? "Generando…" : "Descargar PDF legal"}</BaseButton.Root>
                                <BaseButton.Root className="w-full" variant="secondary" size="md" leftIcon={<Unlock size={14} strokeWidth={2} />} onClick={handleUnconfirm} disabled={unconfirming}>{unconfirming ? "Desconfirmando…" : "Desconfirmar"}</BaseButton.Root>
                            </>}
                        </div>
                    </div>
                    <div className="rounded-xl border border-border-light bg-surface-1 p-4 text-[11px] leading-snug text-[var(--text-tertiary)] shadow-sm">
                        <div className="mb-1 font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Inventario</div>
                        Las líneas vinculadas a productos descuentan existencias al confirmar la factura.
                    </div>
                </aside>
            </div>
        </div>
    );
}
