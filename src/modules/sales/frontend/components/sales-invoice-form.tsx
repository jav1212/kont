"use client";

// SalesInvoiceForm — formulario único para crear/editar/ver una factura de venta.
// Para drafts es totalmente editable; para confirmadas pasa a read-only y
// expone botones Confirmar / Desconfirmar / Descargar PDF.

import { useEffect, useMemo, useState } from "react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { Plus, Trash2, FileText, CheckCircle2, Lock, Unlock, Save } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { notify } from "@/src/shared/frontend/notify";
import { useSales, type SalesInvoice, type SalesInvoiceItem } from "@/src/modules/sales/frontend/hooks/use-sales";
import {
    IgtfPerceptionSection,
    emptyIgtfPerceptionValue,
    type IgtfPerceptionFormValue,
} from "./igtf-perception-section";
import type { VatRate, PaymentTerms, IgtfConcept } from "../../backend/domain/sales-invoice";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { generateSalesInvoicePdf } from "../utils/sales-invoice-pdf";

const labelCls  = "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";
const fieldCls  = "w-full h-10 px-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[13px] text-foreground tabular-nums focus:border-primary-500/60 hover:border-border-medium transition-colors";
const readOnlyCls = "w-full h-10 px-3 rounded-lg border border-border-light bg-surface-2 outline-none font-mono text-[13px] text-[var(--text-secondary)] tabular-nums flex items-center";

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

function vatRatePct(r: VatRate): number {
    return r === "reducida_8" ? 8 : r === "general_16" ? 16 : 0;
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

    const [saving, setSaving]               = useState(false);
    const [confirming, setConfirming]       = useState(false);
    const [unconfirming, setUnconfirming]   = useState(false);
    const [generatingPdf, setGeneratingPdf] = useState(false);

    useEffect(() => {
        if (companyId) loadCustomers(companyId);
    }, [companyId, loadCustomers]);

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

    // Totals
    const totals = useMemo(() => {
        let baseExempt = 0, baseTaxed8 = 0, baseTaxed16 = 0;
        let iva8 = 0, iva16 = 0;
        for (const it of items) {
            const base = it.totalLine ?? 0;
            const pct  = vatRatePct(it.vatRate);
            if (it.vatRate === "exenta")     baseExempt  += base;
            if (it.vatRate === "reducida_8") { baseTaxed8  += base; iva8  += base * 0.08; }
            if (it.vatRate === "general_16") { baseTaxed16 += base; iva16 += base * 0.16; }
        }
        const subtotal = round2(baseExempt + baseTaxed8 + baseTaxed16);
        const ivaTotal = round2(iva8 + iva16);
        const igtfMonto = igtf.applies ? round2(igtf.amount) : 0;
        const total    = round2(subtotal + ivaTotal + igtfMonto);
        return {
            baseExempt:  round2(baseExempt),
            baseTaxed8:  round2(baseTaxed8),
            baseTaxed16: round2(baseTaxed16),
            iva8:        round2(iva8),
            iva16:       round2(iva16),
            ivaTotal,
            subtotal,
            igtfMonto,
            total,
        };
    }, [items, igtf]);

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
        await unconfirmSalesInvoice(currentSalesInvoice.id);
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
        <div className="px-8 py-6 space-y-4">
            {isConfirmed && (
                <div className="px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] text-[13px] font-sans flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-amber-700">
                        <Lock size={14} strokeWidth={2} />
                        <span>Factura confirmada — solo lectura. Para editar, desconfirma primero.</span>
                    </div>
                    <BaseButton.Root variant="secondary" size="sm" leftIcon={<Unlock size={14} strokeWidth={2} />} onClick={handleUnconfirm} disabled={unconfirming}>
                        {unconfirming ? "Desconfirmando…" : "Desconfirmar"}
                    </BaseButton.Root>
                </div>
            )}

            {/* Datos de la factura */}
            <div className="rounded-xl border border-border-light bg-surface-1 p-6 space-y-4">
                <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground">Datos de la factura</h2>

                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className={labelCls}>Cliente</label>
                        {isReadOnly ? (
                            <div className={readOnlyCls}>{customerObj?.name ?? "—"}</div>
                        ) : (
                            <select className={fieldCls} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                                <option value="">Seleccionar cliente…</option>
                                {customers.filter((c) => c.active).map((c) => (
                                    <option key={c.id} value={c.id}>{c.name} — {c.rif}</option>
                                ))}
                            </select>
                        )}
                    </div>
                    <div>
                        <label className={labelCls}>Nº Factura</label>
                        {isReadOnly ? (
                            <div className={readOnlyCls}>{invoiceNumber || "—"}</div>
                        ) : (
                            <input className={fieldCls} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Auto-asignado al guardar" />
                        )}
                    </div>
                    <div>
                        <label className={labelCls}>Nº Control</label>
                        {isReadOnly ? (
                            <div className={readOnlyCls}>{controlNumber || "—"}</div>
                        ) : (
                            <input className={fieldCls} value={controlNumber} onChange={(e) => setControlNumber(e.target.value)} placeholder="00-12345678" />
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className={labelCls}>Fecha</label>
                        {isReadOnly ? (
                            <div className={readOnlyCls}>{date}</div>
                        ) : (
                            <input className={fieldCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                        )}
                    </div>
                    <div>
                        <label className={labelCls}>Condiciones de pago</label>
                        {isReadOnly ? (
                            <div className={readOnlyCls}>{PAYMENT_TERMS.find((p) => p.value === paymentTerms)?.label ?? paymentTerms}</div>
                        ) : (
                            <select className={fieldCls} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value as PaymentTerms)}>
                                {PAYMENT_TERMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                            </select>
                        )}
                    </div>
                    <div>
                        <label className={labelCls}>Fecha vencimiento</label>
                        {isReadOnly ? (
                            <div className={readOnlyCls}>{dueDate || "—"}</div>
                        ) : (
                            <input className={fieldCls} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={paymentTerms === "contado"} />
                        )}
                    </div>
                </div>

                <div>
                    <label className={labelCls}>Notas</label>
                    {isReadOnly ? (
                        <div className={`${readOnlyCls} h-auto py-2 min-h-[60px]`}>{notes || "—"}</div>
                    ) : (
                        <textarea className={`${fieldCls} h-auto py-2`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                    )}
                </div>
            </div>

            {/* Items */}
            <div className="rounded-xl border border-border-light bg-surface-1 p-6 space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground">Detalle de la factura</h2>
                    {!isReadOnly && (
                        <BaseButton.Root variant="ghost" size="sm" leftIcon={<Plus size={14} strokeWidth={2} />} onClick={addItem}>
                            Agregar línea
                        </BaseButton.Root>
                    )}
                </div>

                <table className="w-full text-[13px]">
                    <thead>
                        <tr className="border-b border-border-light">
                            <th className="px-2 py-2 text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal text-left">Descripción</th>
                            <th className="px-2 py-2 text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal w-24 text-right">Cantidad</th>
                            <th className="px-2 py-2 text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal w-32 text-right">Precio Unit.</th>
                            <th className="px-2 py-2 text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal w-24 text-center">IVA</th>
                            <th className="px-2 py-2 text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal w-32 text-right">Total</th>
                            {!isReadOnly && <th className="px-2 py-2 w-10"></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((it, idx) => (
                            <tr key={idx} className="border-b border-border-light/50">
                                <td className="px-2 py-1.5">
                                    {isReadOnly ? (
                                        <div className="text-foreground">{it.description}</div>
                                    ) : (
                                        <input className="w-full h-9 px-2 rounded border border-border-light bg-surface-1 outline-none font-sans text-[13px] text-foreground focus:border-primary-500/60" value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} placeholder="Servicio o producto" />
                                    )}
                                </td>
                                <td className="px-2 py-1.5">
                                    {isReadOnly ? (
                                        <div className="text-right tabular-nums">{fmtN(it.quantity)}</div>
                                    ) : (
                                        <input type="number" min="0" step="0.01" className="w-full h-9 px-2 rounded border border-border-light bg-surface-1 outline-none font-mono text-[13px] tabular-nums text-right focus:border-primary-500/60" value={it.quantity || ""} onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })} />
                                    )}
                                </td>
                                <td className="px-2 py-1.5">
                                    {isReadOnly ? (
                                        <div className="text-right tabular-nums">{fmtN(it.unitPrice)}</div>
                                    ) : (
                                        <input type="number" min="0" step="0.01" className="w-full h-9 px-2 rounded border border-border-light bg-surface-1 outline-none font-mono text-[13px] tabular-nums text-right focus:border-primary-500/60" value={it.unitPrice || ""} onChange={(e) => updateItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })} />
                                    )}
                                </td>
                                <td className="px-2 py-1.5">
                                    {isReadOnly ? (
                                        <div className="text-center text-[12px] text-[var(--text-secondary)]">{VAT_OPTIONS.find((v) => v.value === it.vatRate)?.label ?? "—"}</div>
                                    ) : (
                                        <select className="w-full h-9 px-2 rounded border border-border-light bg-surface-1 outline-none font-mono text-[12px] text-center focus:border-primary-500/60" value={it.vatRate} onChange={(e) => updateItem(idx, { vatRate: e.target.value as VatRate })}>
                                            {VAT_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                                        </select>
                                    )}
                                </td>
                                <td className="px-2 py-1.5 tabular-nums text-right font-medium">{fmtN(it.totalLine)}</td>
                                {!isReadOnly && (
                                    <td className="px-2 py-1.5">
                                        {items.length > 1 && (
                                            <button type="button" onClick={() => removeItem(idx)} className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-500/10 transition-colors">
                                                <Trash2 size={14} strokeWidth={2} />
                                            </button>
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Totals */}
                <div className="flex justify-end pt-3 border-t border-border-light">
                    <div className="space-y-1.5 text-[13px] min-w-[280px]">
                        {totals.baseExempt > 0  && <div className="flex justify-between"><span className="text-[var(--text-tertiary)] uppercase tracking-[0.10em] text-[11px]">Base exenta</span><span className="tabular-nums">Bs. {fmtN(totals.baseExempt)}</span></div>}
                        {totals.baseTaxed8 > 0  && <div className="flex justify-between"><span className="text-[var(--text-tertiary)] uppercase tracking-[0.10em] text-[11px]">Base 8%</span><span className="tabular-nums">Bs. {fmtN(totals.baseTaxed8)}</span></div>}
                        {totals.iva8 > 0        && <div className="flex justify-between"><span className="text-[var(--text-tertiary)] uppercase tracking-[0.10em] text-[11px]">IVA 8%</span><span className="tabular-nums">Bs. {fmtN(totals.iva8)}</span></div>}
                        {totals.baseTaxed16 > 0 && <div className="flex justify-between"><span className="text-[var(--text-tertiary)] uppercase tracking-[0.10em] text-[11px]">Base 16%</span><span className="tabular-nums">Bs. {fmtN(totals.baseTaxed16)}</span></div>}
                        {totals.iva16 > 0       && <div className="flex justify-between"><span className="text-[var(--text-tertiary)] uppercase tracking-[0.10em] text-[11px]">IVA 16%</span><span className="tabular-nums">Bs. {fmtN(totals.iva16)}</span></div>}
                        {totals.igtfMonto > 0   && <div className="flex justify-between"><span className="text-info uppercase tracking-[0.10em] text-[11px]">IGTF</span><span className="tabular-nums text-info">+ Bs. {fmtN(totals.igtfMonto)}</span></div>}
                        <div className="flex justify-between pt-2 border-t border-border-light">
                            <span className="font-bold uppercase tracking-[0.10em] text-[12px]">Total a cobrar</span>
                            <span className="tabular-nums font-bold text-[14px]">Bs. {fmtN(totals.total)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* IGTF percepción */}
            <div className="rounded-xl border border-border-light bg-surface-1 p-6">
                <IgtfPerceptionSection
                    value={igtf}
                    onChange={setIgtf}
                    dollarRate={null /* TODO: integrar tasa BCV de la fecha */ }
                    readOnly={isReadOnly}
                />
                <div className="mt-3 px-3 py-2 rounded border border-border-light bg-surface-2 text-[10px] font-sans text-[var(--text-tertiary)] leading-snug">
                    Tip: edita la tasa BCV manualmente — la integración automática con la cabecera llega en una iteración siguiente.
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 flex-wrap">
                {!isReadOnly && (
                    <>
                        <BaseButton.Root variant="secondary" size="md" leftIcon={<Save size={14} strokeWidth={2} />} onClick={handleSaveDraft} disabled={saving || confirming}>
                            {saving ? "Guardando…" : "Guardar borrador"}
                        </BaseButton.Root>
                        <BaseButton.Root variant="primary" size="md" leftIcon={<CheckCircle2 size={14} strokeWidth={2} />} onClick={handleConfirm} disabled={saving || confirming}>
                            {confirming ? "Confirmando…" : "Confirmar factura"}
                        </BaseButton.Root>
                    </>
                )}
                {isConfirmed && (
                    <BaseButton.Root variant="primary" size="md" leftIcon={<FileText size={14} strokeWidth={2} />} onClick={handleDownloadPdf} disabled={generatingPdf}>
                        {generatingPdf ? "Generando…" : "Descargar PDF legal"}
                    </BaseButton.Root>
                )}
            </div>
        </div>
    );
}
