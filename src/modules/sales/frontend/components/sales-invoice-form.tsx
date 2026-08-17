"use client";

// SalesInvoiceForm — formulario único para crear/editar/ver una factura de venta.
// Para drafts es totalmente editable; para confirmadas pasa a read-only y
// expone botones Confirmar / Desconfirmar / Descargar PDF.

import { useEffect, useMemo, useState } from "react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { Trash2, FileText, CheckCircle2, Lock, Unlock, Save, UserRound, CalendarDays, Plus, X } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { BaseSelect } from "@/src/shared/frontend/components/base-select";
import { CustomerCombobox } from "./customer-combobox";
import { BaseTextarea } from "@/src/shared/frontend/components/base-textarea";
import { InvoiceDetailCard, InvoiceSectionCard, InvoiceSummaryCard } from "@/src/shared/frontend/components/invoices/invoice-form-cards";
import { notify } from "@/src/shared/frontend/notify";
import { useSales, type Customer, type SalesInvoice, type SalesInvoiceItem } from "@/src/modules/sales/frontend/hooks/use-sales";
import {
    IgtfPerceptionSection,
    emptyIgtfPerceptionValue,
    type IgtfPerceptionFormValue,
} from "./igtf-perception-section";
import type { VatRate, PaymentTerms, IgtfConcept, SalesDocumentType } from "../../backend/domain/sales-invoice";
import { computeInvoiceTotals, emptyHeaderAdjustments, type HeaderAdjustments, type InvoiceTax, type LineInput } from "@/src/modules/inventory/shared/totals";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { SalesLineCombobox } from "./sales-line-combobox";
import { generateSalesInvoicePdf } from "../utils/sales-invoice-pdf";
import { generateDeliveryNotePdf } from "../utils/delivery-note-pdf";
import { resolveProductSalePrice } from "@/src/modules/inventory/frontend/utils/product-sale-price";
import { useInvoiceExchangeRates } from "@/src/modules/inventory/frontend/hooks/use-invoice-exchange-rates";
import { isLocalCurrency, normalizeCurrencyCode, type CurrencyCode } from "@/src/modules/inventory/shared/currency";
import { CurrencyCombobox } from "@/src/modules/inventory/frontend/components/currency-combobox";
import { CurrencyAdjustmentRow } from "@/src/modules/inventory/frontend/components/currency-adjustment-row";
import { InvoiceTaxesSection } from "@/src/modules/purchases/frontend/components/invoice-taxes-section";
import { useDeviceSubscription } from "@/src/shared/frontend/devices/device-manager-provider";
import { DeviceStatusControl } from "@/src/shared/frontend/devices/device-status-control";

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
        currency:     "VES",
        ivaIncluido:  false,
    };
}

function todayStr(): string {
    return new Date().toISOString().split("T")[0];
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function emptyCustomer(companyId: string): Customer {
    return { companyId, rif: "", name: "", contact: "", phone: "", email: "", address: "", notes: "", active: true };
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
        customers, loadCustomers, saveCustomer,
        currentSalesInvoice, loadingSalesInvoice, loadSalesInvoice,
        saveSalesInvoice, confirmSalesInvoice, unconfirmSalesInvoice,
    } = useSales();

    // Form state
    const [customerId, setCustomerId]       = useState("");
    const [documentType, setDocumentType]   = useState<SalesDocumentType>("venta");
    const [invoiceNumber, setInvoiceNumber] = useState("");
    const [controlNumber, setControlNumber] = useState("");
    const [date, setDate]                   = useState(todayStr());
    const [invoiceCurrency, setInvoiceCurrency] = useState<CurrencyCode>("VES");
    const [dueDate, setDueDate]             = useState<string>("");
    const [paymentTerms, setPaymentTerms]   = useState<PaymentTerms>("contado");
    const [notes, setNotes]                 = useState("");
    const [items, setItems]                 = useState<SalesInvoiceItem[]>(() => [emptyItem()]);
    const [igtf, setIgtf]                   = useState<IgtfPerceptionFormValue>(() => emptyIgtfPerceptionValue());
    const [headerAdj, setHeaderAdj]         = useState<HeaderAdjustments>(() => emptyHeaderAdjustments());
    const [impuestos, setImpuestos]         = useState<InvoiceTax[]>([]);
    const [showIgtf, setShowIgtf]           = useState(false);
    const [newCustomer, setNewCustomer]     = useState<Customer | null>(null);
    const [savingCustomer, setSavingCustomer] = useState(false);
    const [suggestedLines, setSuggestedLines] = useState<Set<number>>(() => new Set());
    const { options: currencyOptions, appliedRates, setAppliedRates, getRate, setManualRate, publishedDate, loading: rateLoading } = useInvoiceExchangeRates(date);
    const invoiceRate = getRate(invoiceCurrency);

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
        setDocumentType(currentSalesInvoice.documentType ?? "venta");
        setInvoiceNumber(currentSalesInvoice.invoiceNumber ?? "");
        setControlNumber(currentSalesInvoice.controlNumber ?? "");
        setDate(currentSalesInvoice.date.split("T")[0]);
        setInvoiceCurrency(normalizeCurrencyCode(currentSalesInvoice.currency));
        setAppliedRates(currentSalesInvoice.exchangeRates ?? []);
        setDueDate(currentSalesInvoice.dueDate ?? "");
        setPaymentTerms((currentSalesInvoice.paymentTerms as PaymentTerms) ?? "contado");
        setNotes(currentSalesInvoice.notes ?? "");
        setHeaderAdj({ descuentoTipo: currentSalesInvoice.descuentoTipo ?? null, descuentoValor: currentSalesInvoice.descuentoValor ?? 0, descuentoMoneda: currentSalesInvoice.descuentoMoneda ?? "VES", recargoTipo: currentSalesInvoice.recargoTipo ?? null, recargoValor: currentSalesInvoice.recargoValor ?? 0, recargoMoneda: currentSalesInvoice.recargoMoneda ?? "VES" });
        setImpuestos(currentSalesInvoice.impuestos ?? []);
        setItems(
            currentSalesInvoice.items && currentSalesInvoice.items.length > 0
                ? currentSalesInvoice.items.map((i) => ({ ...i }))
                : [emptyItem()]
        );
        setSuggestedLines(new Set());
        setIgtf({
            applies:     currentSalesInvoice.igtfPerceptionApplies ?? false,
            concept:    currentSalesInvoice.igtfPerceptionConcept ?? null,
            percentage: currentSalesInvoice.igtfPerceptionPercentage ?? 3,
            foreignBase: currentSalesInvoice.igtfPerceptionForeignBase ?? 0,
            localBase:  currentSalesInvoice.igtfPerceptionLocalBase ?? 0,
            amount:     currentSalesInvoice.igtfPerceptionAmount ?? 0,
            currencyCode: currentSalesInvoice.igtfPerceptionCurrencyCode ?? "USD",
        });
        setShowIgtf(currentSalesInvoice.igtfPerceptionApplies ?? false);
    }

    const isExistingInvoice = invoiceId != null && invoiceId !== "";
    const isConfirmed       = isExistingInvoice && currentSalesInvoice?.status === "confirmada";
    const isReadOnly        = isConfirmed;
    const isDeliveryNote    = documentType === "nota_entrega";

    function changeDocumentType(nextType: SalesDocumentType) {
        if (nextType === documentType) return;
        setDocumentType(nextType);
        // Each document class owns a different correlativo. Clearing the number
        // lets the shared save function assign the correct Venta/NE sequence.
        setInvoiceNumber("");
        if (nextType === "nota_entrega") {
            setControlNumber("");
            setDueDate("");
            setPaymentTerms("contado");
            setShowIgtf(false);
            setIgtf(emptyIgtfPerceptionValue());
        }
    }

    // Recompute item totals when qty/price/vat changes
    function updateItem(idx: number, patch: Partial<SalesInvoiceItem>) {
        setItems((prev) => prev.map((it, i) => {
            if (i !== idx) return it;
            const next = { ...it, ...patch };
            const qty   = next.quantity ?? 0;
            const price = next.unitPrice ?? 0;
            next.totalLine = round2(qty * price);
            next.baseIVA = next.totalLine;
            return next;
        }));
    }

    function updatePriceManually(idx: number, value: number) {
        setSuggestedLines((current) => { const next = new Set(current); next.delete(idx); return next; });
        const item = items[idx];
        const rate = getRate(item.currency);
        if (!isLocalCurrency(item.currency)) {
            updateItem(idx, {
                currencyPrice: value,
                dollarRate: rate,
                exchangeRate: rate,
                unitPrice: rate ? round2(value * rate) : 0,
            });
        } else updateItem(idx, { unitPrice: value, currencyPrice: null, dollarRate: null });
    }

    function changeItemCurrency(idx: number, currency: CurrencyCode) {
        const item = items[idx];
        const rate = getRate(currency);
        setSuggestedLines((current) => { const next = new Set(current); next.delete(idx); return next; });
        updateItem(idx, !isLocalCurrency(currency) ? {
            currency,
            currencyPrice: rate ? round2(item.unitPrice / rate) : 0,
            dollarRate: rate,
            exchangeRate: rate,
        } : { currency, currencyPrice: null, dollarRate: null });
    }

    function addItem() { setItems((prev) => [...prev, emptyItem()]); }
    function removeItem(idx: number) {
        setItems((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));
        setSuggestedLines((current) => new Set([...current].filter((i) => i !== idx).map((i) => i > idx ? i - 1 : i)));
    }

    function selectProduct(idx: number, productId: string) {
        const product = products.find((candidate) => candidate.id === productId);
        if (!product) { updateItem(idx, { productId: null }); return; }
        const productRate = getRate(product.salePricing?.currency ?? "VES");
        const resolved = resolveProductSalePrice(product, productRate);
        if (product.salePricing) {
            setSuggestedLines((current) => new Set(current).add(idx));
            if (!resolved && !isLocalCurrency(product.salePricing.currency)) notify.error(`Se necesita una tasa BCV para precargar este precio en ${normalizeCurrencyCode(product.salePricing.currency)}`);
        } else {
            setSuggestedLines((current) => { const next = new Set(current); next.delete(idx); return next; });
        }
        updateItem(idx, {
            productId: product.id,
            description: product.name,
            vatRate: product.vatType === "exento" ? "exenta" : "general_16",
            currency: resolved?.currency ?? product.salePricing?.currency ?? "VES",
            currencyPrice: resolved && !isLocalCurrency(resolved.currency) ? resolved.sourcePrice : null,
            unitPrice: resolved?.unitPriceBs ?? 0,
            dollarRate: resolved && !isLocalCurrency(resolved.currency) ? productRate : null,
            exchangeRate: resolved && !isLocalCurrency(resolved.currency) ? productRate : null,
        });
    }

    useDeviceSubscription("sale", (scan) => {
        if (isReadOnly) return;
        const product = products.find((candidate) => candidate.active && candidate.barcode === scan.barcode);
        if (!product?.id) { notify.error(`Código de barras no registrado: ${scan.barcode}`); return; }
        setItems((current) => {
            const existing = current.findIndex((item) => item.productId === product.id);
            if (existing >= 0) return current.map((item, index) => index === existing ? { ...item, quantity: item.quantity + 1, totalLine: round2((item.quantity + 1) * item.unitPrice), baseIVA: round2((item.quantity + 1) * item.unitPrice) } : item);
            const empty = current.findIndex((item) => !item.productId && !item.description.trim());
            const rate = getRate(product.salePricing?.currency ?? "VES");
            const resolved = resolveProductSalePrice(product, rate);
            const item: SalesInvoiceItem = {
                ...emptyItem(), productId: product.id, description: product.name,
                vatRate: product.vatType === "exento" ? "exenta" : "general_16",
                currency: resolved?.currency ?? product.salePricing?.currency ?? "VES",
                currencyPrice: resolved && !isLocalCurrency(resolved.currency) ? resolved.sourcePrice : null,
                unitPrice: resolved?.unitPriceBs ?? 0,
                totalLine: resolved?.unitPriceBs ?? 0,
                baseIVA: resolved?.unitPriceBs ?? 0,
                dollarRate: resolved && !isLocalCurrency(resolved.currency) ? rate : null,
                exchangeRate: resolved && !isLocalCurrency(resolved.currency) ? rate : null,
            };
            return empty >= 0 ? current.map((candidate, index) => index === empty ? item : candidate) : [...current, item];
        });
    }, !isReadOnly);

    useEffect(() => {
        if (suggestedLines.size === 0) return;
        setItems((current) => current.map((item, index) => {
            if (!suggestedLines.has(index) || !item.productId) return item;
            const product = products.find((candidate) => candidate.id === item.productId);
            if (!product) return item;
            const productRate = getRate(product.salePricing?.currency ?? "VES");
            const resolved = resolveProductSalePrice(product, productRate);
            if (!resolved) return item;
            const next = {
                ...item,
                currency: resolved.currency,
                currencyPrice: !isLocalCurrency(resolved.currency) ? resolved.sourcePrice : null,
                unitPrice: resolved.unitPriceBs,
                dollarRate: !isLocalCurrency(resolved.currency) ? productRate : null,
                exchangeRate: !isLocalCurrency(resolved.currency) ? productRate : null,
            };
            next.totalLine = round2(next.quantity * next.unitPrice);
            next.baseIVA = next.totalLine;
            return next;
        }));
    }, [appliedRates, getRate, products, suggestedLines]);

    // Totals are calculated by the shared invoice engine.
    const salesCurrency = "VES";
    const salesLineInputs: LineInput[] = items.map((item) => ({
        quantity: item.quantity ?? 0,
        unitCost: item.unitPrice ?? 0,
        currency: "VES",
        currencyCost: null,
        vatRate: item.vatRate,
        adjustments: {
            descuentoTipo: item.descuentoTipo ?? null,
            descuentoValor: item.descuentoValor ?? 0,
            descuentoMoneda: "VES",
            recargoTipo: item.recargoTipo ?? null,
            recargoValor: item.recargoValor ?? 0,
            recargoMoneda: "VES",
        },
    }));

    const totals = useMemo(() => {
        const calculated = computeInvoiceTotals(
            salesLineInputs,
            headerAdj,
            2,
            0,
            impuestos,
            1,
            salesCurrency,
            getRate,
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
            descuentoMonto: calculated.descuentoHeader,
            recargoMonto: calculated.recargoHeader,
            igtfMonto,
            total: round2(calculated.total + calculated.totalImpuestos + igtfMonto),
        };
    }, [salesLineInputs, salesCurrency, igtf, headerAdj, impuestos, getRate]);

    const customerObj = customers.find((c) => c.id === customerId);
    const usedCurrencies = [...new Set([invoiceCurrency, ...items.map((item) => normalizeCurrencyCode(item.currency))])];

    function changeInvoiceCurrency(next: CurrencyCode) {
        const previous = normalizeCurrencyCode(invoiceCurrency);
        const code = normalizeCurrencyCode(next);
        setInvoiceCurrency(code);
        setItems((current) => current.map((item) => {
            if (normalizeCurrencyCode(item.currency) !== previous) return item;
            const rate = getRate(code);
            return { ...item, currency: code,
                currencyPrice: isLocalCurrency(code) ? null : (rate ? round2(item.unitPrice / rate) : 0),
                dollarRate: isLocalCurrency(code) ? null : rate,
                exchangeRate: isLocalCurrency(code) ? null : rate };
        }));
    }

    // Build invoice payload
    function buildInvoice(): SalesInvoice {
        return {
            id:              invoiceId ?? undefined,
            companyId:       companyId!,
            customerId,
            documentType,
            invoiceNumber,
            controlNumber:   isDeliveryNote ? "" : controlNumber,
            date,
            period:          date.slice(0, 7),
            periodoManual:   false,
            dueDate:         isDeliveryNote ? null : dueDate || null,
            paymentTerms:    isDeliveryNote ? "contado" : paymentTerms,
            status:          "borrador",
            subtotal:        totals.subtotal,
            vatAmount:       totals.ivaTotal,
            total:           totals.total,
            notes,
            currency: invoiceCurrency,
            exchangeRates: appliedRates,
            dollarRate: invoiceRate,
            rateDecimals: appliedRates.find((rate) => normalizeCurrencyCode(rate.currencyCode) === normalizeCurrencyCode(invoiceCurrency))?.decimals ?? 4,
            descuentoTipo:   headerAdj.descuentoTipo, descuentoValor: headerAdj.descuentoValor, descuentoMonto: totals.descuentoMonto, descuentoMoneda: headerAdj.descuentoMoneda,
            recargoTipo:     headerAdj.recargoTipo, recargoValor: headerAdj.recargoValor, recargoMonto: totals.recargoMonto, recargoMoneda: headerAdj.recargoMoneda,
            impuestos,
            igtfPerceptionApplies:     igtf.applies,
            igtfPerceptionConcept:   (igtf.concept ?? null) as IgtfConcept | null,
            igtfPerceptionPercentage: igtf.percentage,
            igtfPerceptionForeignBase: igtf.foreignBase,
            igtfPerceptionLocalBase:     igtf.localBase,
            igtfPerceptionAmount:      igtf.amount,
            igtfPerceptionCurrencyCode: igtf.currencyCode,
            igtfPerceptionExchangeRate: getRate(igtf.currencyCode),
        };
    }

    function validate(): boolean {
        if (!customerId) { notify.error("Selecciona un cliente"); return false; }
        if (!date)       { notify.error("La fecha es obligatoria"); return false; }
        for (const it of items) {
            if (!it.description.trim()) { notify.error("Cada línea necesita una descripción"); return false; }
            if ((it.quantity ?? 0) <= 0) { notify.error("La cantidad debe ser mayor a 0"); return false; }
            if (!isLocalCurrency(it.currency) && !getRate(it.currency)) { notify.error(`Falta la tasa BCV de ${normalizeCurrencyCode(it.currency)}`); return false; }
        }
        const selectedProductIds = new Set<string>();
        for (const item of items) {
            if (!item.productId) continue;
            selectedProductIds.add(item.productId);
        }
        for (const productId of selectedProductIds) {
            const product = products.find((candidate) => candidate.id === productId);
            if (!product) { notify.error("Uno de los productos seleccionados ya no está disponible"); return false; }
        }
        return true;
    }

    function itemsForSave(): SalesInvoiceItem[] {
        return items.map((item) => {
            const rate = getRate(item.currency);
            if (isLocalCurrency(item.currency)) return { ...item, currency: "VES", currencyPrice: null, dollarRate: null, exchangeRate: null };
            const source = item.currencyPrice ?? 0;
            const unitPrice = rate ? round2(source * rate) : 0;
            return { ...item, currency: normalizeCurrencyCode(item.currency), unitPrice, totalLine: round2(item.quantity * unitPrice), dollarRate: rate, exchangeRate: rate, rateEffectiveDate: publishedDate ?? date, rateSource: appliedRates.find((entry) => normalizeCurrencyCode(entry.currencyCode) === normalizeCurrencyCode(item.currency))?.source ?? "manual" };
        });
    }

    async function handleSaveDraft() {
        if (!validate()) return;
        setSaving(true);
        const saved = await saveSalesInvoice(buildInvoice(), itemsForSave());
        setSaving(false);
        if (saved && !isExistingInvoice) {
            router.replace(`/sales/${saved.id}`);
        }
    }

    async function handleCreateCustomer() {
        if (!newCustomer || !newCustomer.rif.trim() || !newCustomer.name.trim()) return;
        setSavingCustomer(true);
        const saved = await saveCustomer(newCustomer);
        setSavingCustomer(false);
        if (!saved) return;
        setCustomerId(saved.id!);
        setNewCustomer(null);
        notify.success("Cliente creado y seleccionado.");
    }

    async function handleConfirm() {
        if (!validate()) return;
        setConfirming(true);
        const saved = await saveSalesInvoice(buildInvoice(), itemsForSave());
        if (!saved) { setConfirming(false); return; }
        const confirmed = await confirmSalesInvoice(saved.id!, { allowNegativeStock: true });
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
        if (!isDeliveryNote && !customerObj.rif) { notify.error("El cliente no tiene RIF — requerido por SENIAT."); return; }
        setGeneratingPdf(true);
        try {
            const commonItems = (currentSalesInvoice.items ?? []).map((i) => ({
                description: i.description,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                totalLine: i.totalLine,
                vatRate: i.vatRate,
                currencyCode: normalizeCurrencyCode(i.currency),
                sourceUnitAmount: i.currencyPrice,
                exchangeRate: i.exchangeRate ?? i.dollarRate,
            }));
            if (isDeliveryNote) {
                await generateDeliveryNotePdf({
                    issuer: { name: company.name, rif: company.rif, address: company.address, phone: company.phone, logoUrl: company.logoUrl, showLogoInPdf: company.showLogoInPdf },
                    customer: { name: customerObj.name, rif: customerObj.rif, address: customerObj.address },
                    document: {
                        number: currentSalesInvoice.invoiceNumber,
                        date: currentSalesInvoice.date.split("T")[0],
                        notes: currentSalesInvoice.notes,
                        referenceRate: currentSalesInvoice.exchangeRates?.find(
                            (rate) => normalizeCurrencyCode(rate.currencyCode) === "USD",
                        )?.vesPerUnit ?? (normalizeCurrencyCode(currentSalesInvoice.currency) === "USD" ? currentSalesInvoice.dollarRate : null),
                        referenceCurrency: "USD",
                    },
                    items: commonItems,
                    totals: { subtotal: currentSalesInvoice.subtotal, iva: currentSalesInvoice.vatAmount, igtf: currentSalesInvoice.igtfPerceptionAmount ?? 0, total: currentSalesInvoice.total },
                });
            } else await generateSalesInvoicePdf({
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
                items: commonItems,
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
                    currencyCode: currentSalesInvoice.igtfPerceptionCurrencyCode ?? "USD",
                } : null,
            });
            notify.success(isDeliveryNote ? "Nota de entrega PDF generada." : "Factura PDF generada.");
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
            {newCustomer && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-lg rounded-xl border border-border-medium bg-surface-1 shadow-xl">
                        <div className="flex items-center justify-between border-b border-border-light px-6 py-4">
                            <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">Nuevo cliente</h2>
                            <button type="button" onClick={() => setNewCustomer(null)} className="flex size-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-surface-2 hover:text-foreground"><X size={15} /></button>
                        </div>
                        <div className="space-y-4 px-6 py-5">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <BaseInput.Field label="RIF *" value={newCustomer.rif} onValueChange={(value) => setNewCustomer({ ...newCustomer, rif: value })} placeholder="J-12345678-9" />
                                <BaseInput.Field label="Razón Social *" value={newCustomer.name} onValueChange={(value) => setNewCustomer({ ...newCustomer, name: value })} />
                            </div>
                            <BaseInput.Field label="Dirección" value={newCustomer.address} onValueChange={(value) => setNewCustomer({ ...newCustomer, address: value })} />
                            <div className="grid gap-4 sm:grid-cols-2">
                                <BaseInput.Field label="Contacto" value={newCustomer.contact} onValueChange={(value) => setNewCustomer({ ...newCustomer, contact: value })} />
                                <BaseInput.Field label="Teléfono" value={newCustomer.phone} onValueChange={(value) => setNewCustomer({ ...newCustomer, phone: value })} />
                            </div>
                            <BaseInput.Field label="Email" type="email" value={newCustomer.email} onValueChange={(value) => setNewCustomer({ ...newCustomer, email: value })} />
                        </div>
                        <div className="flex justify-end gap-3 border-t border-border-light px-6 py-4">
                            <BaseButton.Root variant="secondary" size="md" onClick={() => setNewCustomer(null)} disabled={savingCustomer}>Cancelar</BaseButton.Root>
                            <BaseButton.Root variant="primary" size="md" onClick={handleCreateCustomer} disabled={savingCustomer || !newCustomer.rif.trim() || !newCustomer.name.trim()}>{savingCustomer ? "Guardando…" : "Crear y seleccionar"}</BaseButton.Root>
                        </div>
                    </div>
                </div>
            )}
            {isConfirmed && (
                <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3 font-sans text-[13px]">
                    <div className="flex items-center gap-2 text-amber-700">
                        <Lock size={14} strokeWidth={2} />
                        <span>{isDeliveryNote ? "Nota de entrega confirmada" : "Venta confirmada"} — solo lectura. Para editar, desconfirma primero.</span>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-4">
                <div className="min-w-0 flex-1 space-y-4">
            {/* Datos del documento */}
            <InvoiceSectionCard title={`Datos de la ${isDeliveryNote ? "nota de entrega" : "venta"}`} subtitle={isDeliveryNote ? "Identifica al destinatario y la fecha de la entrega." : "Identifica al cliente y define las condiciones de cobro."} bodyClassName="space-y-5 p-6">
                    <div className="grid gap-4 md:grid-cols-4">
                        {isReadOnly ? (
                            <BaseInput.Field label="Tipo de documento" value={isDeliveryNote ? "Nota de Entrega" : "Factura de Venta"} readOnly />
                        ) : (
                            <div className="space-y-2">
                                <label className="block text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-secondary)]">Tipo de documento</label>
                                <BaseSelect
                                    items={[{ id: "venta", name: "Factura de Venta" }, { id: "nota_entrega", name: "Nota de Entrega" }]}
                                    value={documentType}
                                    onValueChange={(value) => changeDocumentType(value as SalesDocumentType)}
                                    selectionMode="single"
                                />
                            </div>
                        )}
                        {isReadOnly ? (
                            <BaseInput.Field label="Cliente" value={customerObj?.name ?? "—"} readOnly />
                        ) : (
                            <div className="space-y-2">
                                <label className="block text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-secondary)]">Cliente</label>
                                <div className="flex gap-2">
                                    <CustomerCombobox customerId={customerId} customers={customers} onChange={setCustomerId} />
                                    <button
                                        type="button"
                                        onClick={() => companyId && setNewCustomer(emptyCustomer(companyId))}
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-default bg-surface-1 text-[var(--text-tertiary)] transition-colors hover:border-border-medium hover:bg-surface-2 hover:text-foreground"
                                        title="Crear nuevo cliente"
                                        aria-label="Crear nuevo cliente"
                                    >
                                        <Plus size={14} strokeWidth={2} />
                                    </button>
                                </div>
                            </div>
                        )}
                        <BaseInput.Field label={isDeliveryNote ? "Nº Nota de Entrega" : "Nº Venta"} value={invoiceNumber} onValueChange={setInvoiceNumber} placeholder="Auto-asignado al guardar" readOnly={isReadOnly || isDeliveryNote} />
                        {!isDeliveryNote && <BaseInput.Field label="Nº Control" value={controlNumber} onValueChange={setControlNumber} placeholder="00-12345678" readOnly={isReadOnly} />}
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <BaseInput.Field label="Fecha" type="date" value={date} onValueChange={setDate} readOnly={isReadOnly} />
                        {!isDeliveryNote && (isReadOnly ? (
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
                        ))}
                        {!isDeliveryNote && <BaseInput.Field label="Fecha de vencimiento" type="date" value={dueDate} onValueChange={setDueDate} readOnly={isReadOnly} isDisabled={!isReadOnly && paymentTerms === "contado"} />}
                    </div>

                    <BaseTextarea
                        label="Notas"
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="Observaciones, condiciones especiales o referencia interna…"
                        readOnly={isReadOnly}
                        rows={3}
                    />
            </InvoiceSectionCard>

            <InvoiceSectionCard title="Moneda y tasas" subtitle="Convierte cada divisa seleccionada a bolívares con su tasa BCV histórica.">
                <div className="grid max-w-3xl gap-4 md:grid-cols-2">
                    <CurrencyCombobox label="Moneda principal" options={currencyOptions} value={invoiceCurrency} onChange={changeInvoiceCurrency} disabled={isReadOnly || rateLoading} />
                    {usedCurrencies.filter((code) => !isLocalCurrency(code)).map((code) => (
                        <BaseInput.Field key={code} label={`Tasa BCV · Bs/${code}`} type="number" min="0" step="0.0001" value={getRate(code) ? String(getRate(code)) : ""} onValueChange={(value) => setManualRate(code, Number(String(value).replace(",", ".")) || 0)} description={publishedDate ? `Publicación ${publishedDate}` : "Ingresa la tasa manualmente"} isReadOnly={isReadOnly} />
                    ))}
                </div>
            </InvoiceSectionCard>

            {/* Items */}
            {!isReadOnly && <div className="flex justify-end"><DeviceStatusControl /></div>}
            <InvoiceDetailCard
                count={items.filter((item) => item.productId || item.description.trim()).length}
                itemName="línea"
                emptyLabel="Sin líneas"
                subtitle="Productos de inventario y servicios vendidos."
                readOnly={isReadOnly}
                onAddLine={addItem}
            >

                <div className="overflow-x-auto overscroll-x-contain">
                    <div className="min-w-[860px]">
                        <div style={{ gridTemplateColumns: "minmax(260px, 1fr) 80px 82px 120px 100px 110px 32px" }} className="grid gap-3 border-b border-border-light px-2 py-2 text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                            <span>Producto / descripción</span><span className="text-right">Cantidad</span><span className="text-center">Moneda</span><span className="text-right">Precio unit.</span><span className="text-center">IVA</span><span className="text-right">Total Bs.</span><span />
                        </div>
                        {items.map((it, idx) => (
                            <div key={idx} style={{ gridTemplateColumns: "minmax(260px, 1fr) 80px 82px 120px 100px 110px 32px" }} className="group grid items-start gap-3 border-b border-border-light/60 px-2 py-2 transition-colors hover:bg-surface-2/30 last:border-b-0">
                                <SalesLineCombobox
                                    productId={it.productId}
                                    description={it.description}
                                    products={products.filter((product) => product.active)}
                                    readOnly={isReadOnly}
                                    onFreeTextChange={(value) => updateItem(idx, { productId: null, description: value })}
                                    onProductSelect={(product) => selectProduct(idx, product.id!)}
                                    onClear={() => updateItem(idx, { productId: null, description: "" })}
                                />
                                <BaseInput.Field aria-label="Cantidad" type="number" min="0" step="0.01" inputClassName="text-right tabular-nums" value={it.quantity ? String(it.quantity) : ""} onValueChange={(value) => updateItem(idx, { quantity: parseFloat(value) || 0 })} isReadOnly={isReadOnly} />
                                <CurrencyCombobox label="" options={currencyOptions} value={normalizeCurrencyCode(it.currency)} onChange={(value) => changeItemCurrency(idx, value)} disabled={isReadOnly} />
                                <BaseInput.Field aria-label="Precio unitario" type="number" min="0" step="0.01" inputClassName="text-right tabular-nums" value={(!isLocalCurrency(it.currency) ? it.currencyPrice : it.unitPrice) ? String(!isLocalCurrency(it.currency) ? it.currencyPrice : it.unitPrice) : ""} onValueChange={(value) => updatePriceManually(idx, parseFloat(value) || 0)} isReadOnly={isReadOnly} />
                                <BaseSelect aria-label="Alícuota IVA" items={VAT_OPTIONS.map((option) => ({ id: option.value, name: option.label }))} value={it.vatRate} onValueChange={(value) => updateItem(idx, { vatRate: value as VatRate })} selectionMode="single" isDisabled={isReadOnly} />
                                <div className="pt-2 text-right text-[13px] font-semibold tabular-nums text-foreground">Bs. {fmtN(it.totalLine)}</div>
                                {!isReadOnly && items.length > 1 ? (
                                    <button type="button" aria-label="Eliminar línea" onClick={() => removeItem(idx)} className="mt-1 flex size-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100 focus:opacity-100">
                                        <Trash2 size={14} strokeWidth={2} />
                                    </button>
                                ) : <span />}
                            </div>
                        ))}
                    </div>
                </div>
                {!isReadOnly && (
                    <button type="button" onClick={addItem} className="ml-1 mt-2 text-[12px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] transition-colors hover:text-foreground">
                        + agregar fila <span className="ml-1 normal-case tracking-normal opacity-40">(también admite servicios)</span>
                    </button>
                )}
                <div className="mt-3 flex items-center justify-between gap-4 border-t border-border-light pt-3 text-[11px] text-[var(--text-tertiary)] opacity-70">
                    <span>Busca por nombre o código · escribe libremente para registrar un servicio</span>
                    <span className="shrink-0">El inventario se descuenta al confirmar.</span>
                </div>
            </InvoiceDetailCard>

            <InvoiceSectionCard title="Ajustes e impuestos" subtitle="Descuentos, recargos e impuestos adicionales con monedas BCV.">
                <div className="space-y-4">
                    <div>
                        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Ajustes de factura</p>
                        <div className="space-y-2"><CurrencyAdjustmentRow label="Descuento" accent="negative" tipo={headerAdj.descuentoTipo} valor={headerAdj.descuentoValor} moneda={headerAdj.descuentoMoneda} options={currencyOptions} readOnly={isReadOnly} onChange={(patch) => setHeaderAdj((current) => ({ ...current, descuentoTipo: patch.tipo === undefined ? current.descuentoTipo : patch.tipo, descuentoValor: patch.valor === undefined ? current.descuentoValor : patch.valor, descuentoMoneda: patch.moneda ?? current.descuentoMoneda }))} /><CurrencyAdjustmentRow label="Recargo" accent="warning" tipo={headerAdj.recargoTipo} valor={headerAdj.recargoValor} moneda={headerAdj.recargoMoneda} options={currencyOptions} readOnly={isReadOnly} onChange={(patch) => setHeaderAdj((current) => ({ ...current, recargoTipo: patch.tipo === undefined ? current.recargoTipo : patch.tipo, recargoValor: patch.valor === undefined ? current.recargoValor : patch.valor, recargoMoneda: patch.moneda ?? current.recargoMoneda }))} /></div>
                    </div>
                    <InvoiceTaxesSection value={impuestos} onChange={setImpuestos} baseIVA={totals.subtotal} total={totals.subtotal + totals.ivaTotal} dollarRate={invoiceRate} currencyOptions={currencyOptions} getExchangeRate={getRate} readOnly={isReadOnly} />
                </div>
            </InvoiceSectionCard>

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
                    <span aria-hidden="true" className={`shrink-0 text-[16px] leading-none text-[var(--text-tertiary)] transition-transform ${showIgtf || (isReadOnly && igtf.applies) ? "rotate-180" : ""}`}>⌄</span>
                </button>
                {(showIgtf || (isReadOnly && igtf.applies)) && (
                    <div className="border-t border-border-light p-6">
                        <IgtfPerceptionSection value={igtf} onChange={setIgtf} dollarRate={getRate(igtf.currencyCode)} currencyOptions={currencyOptions} readOnly={isReadOnly} />
                    </div>
                )}
            </div>
                </div>

                <aside className="flex w-full flex-col gap-4">
                    <InvoiceSummaryCard status={isConfirmed ? "confirmed" : "draft"}>
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
                                <BaseButton.Root className="w-full" variant="primary" size="md" leftIcon={<CheckCircle2 size={14} strokeWidth={2} />} onClick={handleConfirm} disabled={saving || confirming}>{confirming ? "Confirmando…" : isDeliveryNote ? "Confirmar nota de entrega" : "Confirmar factura"}</BaseButton.Root>
                                <BaseButton.Root className="w-full" variant="secondary" size="md" leftIcon={<Save size={14} strokeWidth={2} />} onClick={handleSaveDraft} disabled={saving || confirming}>{saving ? "Guardando…" : "Guardar borrador"}</BaseButton.Root>
                            </>}
                            {isConfirmed && <>
                                <BaseButton.Root className="w-full" variant="primary" size="md" leftIcon={<FileText size={14} strokeWidth={2} />} onClick={handleDownloadPdf} disabled={generatingPdf}>{generatingPdf ? "Generando…" : isDeliveryNote ? "Descargar Nota de Entrega" : "Descargar PDF legal"}</BaseButton.Root>
                                <BaseButton.Root className="w-full" variant="secondary" size="md" leftIcon={<Unlock size={14} strokeWidth={2} />} onClick={handleUnconfirm} disabled={unconfirming}>{unconfirming ? "Desconfirmando…" : "Desconfirmar"}</BaseButton.Root>
                            </>}
                        </div>
                    </InvoiceSummaryCard>
                </aside>
            </div>
        </div>
    );
}
