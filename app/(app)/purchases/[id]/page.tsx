"use client";

// Page: PurchaseInvoiceDetailPage
// Purpose: View and edit a single purchase invoice, confirm it, and register purchase returns.
// Architectural role: Page-level composition using inventory hook and English domain types.
// All identifiers use English; JSX user-facing text remains in Spanish.

import { useEffect, useState, use, useCallback, Fragment } from "react";
import { ChevronLeft, ArrowRight, RotateCcw, Save, CheckCircle2, X, Lock, Unlock, Receipt } from "lucide-react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { InvoiceDetailCard, InvoiceSectionCard, InvoiceSummaryCard } from "@/src/shared/frontend/components/invoices/invoice-form-cards";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { usePurchases } from "@/src/modules/purchases/frontend/hooks/use-purchases";
import { notify } from "@/src/shared/frontend/notify";
import type { PurchaseInvoice, PurchaseInvoiceItem, PurchaseDocumentType } from "@/src/modules/purchases/backend/domain/purchase-invoice";
import { isPendingImputation } from "@/src/modules/purchases/backend/domain/purchase-invoice";
import { Inbox } from "lucide-react";
import { generateComprobanteIvaPdf } from "@/src/modules/purchases/frontend/utils/comprobante-iva-pdf";
import { generateComprobanteIslrPdf } from "@/src/modules/purchases/frontend/utils/comprobante-islr-pdf";
import { FacturaItemsGrid, emptyItem } from "@/src/modules/purchases/frontend/components/factura-items-grid";
import { ConfirmCompanyDialog, SummaryRow } from "@/src/shared/frontend/components/confirm-company-dialog";
import {
    computeInvoiceTotals,
    emptyHeaderAdjustments,
    type HeaderAdjustments,
    type AdjustmentKind,
    type InvoiceTax,
    type LineInput,
} from "@/src/modules/inventory/shared/totals";
import { HeaderAdjustmentsSection } from "@/src/modules/purchases/frontend/components/header-adjustments-section";
import { IvaRetencionToggle } from "@/src/modules/purchases/frontend/components/iva-retencion-toggle";
import { InvoiceTaxesSection } from "@/src/modules/purchases/frontend/components/invoice-taxes-section";
import { IslrRetencionSection, emptyIslrValue, type IslrFormValue } from "@/src/modules/purchases/frontend/components/islr-retencion-section";
import { IgtfSection, emptyIgtfValue, type IgtfFormValue } from "@/src/modules/purchases/frontend/components/igtf-section";
import { PeriodoContableInput } from "@/src/modules/inventory/frontend/components/periodo-contable-input";
import {
    DEFAULT_RATE_DECIMALS,
} from "@/src/modules/inventory/frontend/components/bcv-rate-input";
import { useInvoiceExchangeRates } from "@/src/modules/inventory/frontend/hooks/use-invoice-exchange-rates";
import { CurrencyCombobox } from "@/src/modules/inventory/frontend/components/currency-combobox";
import { isLocalCurrency, normalizeCurrencyCode, type AppliedExchangeRate, type CurrencyCode } from "@/src/modules/inventory/shared/currency";

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
    const { companyId, company } = useCompany();
    const {
        products, loadProducts,
        saveMovement,
    } = useInventory();
    const {
        suppliers, loadSuppliers,
        currentPurchaseInvoice, purchaseInvoices, loadingPurchaseInvoice, loadPurchaseInvoice, loadPurchaseInvoices,
        savePurchaseInvoice, confirmPurchaseInvoice, unconfirmPurchaseInvoice,
    } = usePurchases();

    // Editable form state (only used when draft)
    const [supplierId, setSupplierId] = useState("");
    const [documentType, setDocumentType] = useState<PurchaseDocumentType>("factura");
    const [affectedInvoiceNumber, setAffectedInvoiceNumber] = useState("");
    const [affectedControlNumber, setAffectedControlNumber] = useState("");
    const [noteReason, setNoteReason] = useState("");
    const [invoiceNumber, setInvoiceNumber] = useState("");
    const [controlNumber, setControlNumber] = useState("");
    const [date, setDate] = useState("");
    const [invoiceCurrencyCode, setInvoiceCurrencyCode] = useState<CurrencyCode>("VES");
    const [applyCurrencyToAll, setApplyCurrencyToAll] = useState(true);
    const { options: currencyOptions, appliedRates, setAppliedRates, getRate, setManualRate, publishedDate, loading: currenciesLoading } = useInvoiceExchangeRates(date);
    const [notes, setNotes] = useState("");
    const [items, setItems] = useState<PurchaseInvoiceItem[]>([]);
    const [periodo, setPeriodo] = useState<string>("");
    const [periodoManual, setPeriodoManual] = useState<boolean>(false);
    const [headerAdj, setHeaderAdj] = useState<HeaderAdjustments>(() => emptyHeaderAdjustments());
    const [retencionIvaPct, setRetencionIvaPct] = useState<number>(0);
    const [impuestos, setImpuestos] = useState<InvoiceTax[]>([]);
    const [islr, setIslr] = useState<IslrFormValue>(() => emptyIslrValue());
    const [igtf, setIgtf] = useState<IgtfFormValue>(() => emptyIgtfValue());
    const [showHeaderAdj, setShowHeaderAdj] = useState<boolean>(false);

    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
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
            loadPurchaseInvoices(companyId);
        }
    }, [companyId, loadProducts, loadSuppliers, loadPurchaseInvoices]);

    useEffect(() => {
        if (id) loadPurchaseInvoice(id);
    }, [id, loadPurchaseInvoice]);

    const isDraft = currentPurchaseInvoice?.status === "borrador";

    // Auto-fetch BCV rate when fecha changes — only while in draft. Confirmadas
    // freeze the rate until the user desconfirma; refetching there would be a
    // surprise side-effect.
    // Populate form when invoice loads — render-phase state update to avoid
    // setState-in-effect cascading renders. React batches all these setters
    // into a single re-render.
    const [formSourceId, setFormSourceId] = useState<string | null>(null);
    if (currentPurchaseInvoice?.id === id && formSourceId !== id) {
        setFormSourceId(id ?? null);
        setSupplierId(currentPurchaseInvoice.supplierId);
        setDocumentType(currentPurchaseInvoice.documentType ?? "factura");
        setAffectedInvoiceNumber(currentPurchaseInvoice.affectedInvoiceNumber ?? "");
        setAffectedControlNumber(currentPurchaseInvoice.affectedControlNumber ?? "");
        setNoteReason(currentPurchaseInvoice.noteReason ?? "");
        setInvoiceNumber(currentPurchaseInvoice.invoiceNumber);
        setControlNumber(currentPurchaseInvoice.controlNumber ?? '');
        setDate(fmtDate(currentPurchaseInvoice.date));
        const storedCurrency = normalizeCurrencyCode(currentPurchaseInvoice.currency);
        setInvoiceCurrencyCode(storedCurrency);
        const storedRates = [...(currentPurchaseInvoice.exchangeRates ?? [])];
        if (!isLocalCurrency(storedCurrency)
            && currentPurchaseInvoice.dollarRate != null
            && !storedRates.some((rate) => normalizeCurrencyCode(rate.currencyCode) === storedCurrency)) {
            storedRates.push({
                currencyCode: storedCurrency,
                vesPerUnit: currentPurchaseInvoice.dollarRate,
                decimals: currentPurchaseInvoice.rateDecimals ?? DEFAULT_RATE_DECIMALS,
                effectiveDate: currentPurchaseInvoice.date,
                source: "legacy",
            } as AppliedExchangeRate);
        }
        setAppliedRates(storedRates);
        setNotes(currentPurchaseInvoice.notes);
        setItems(
            currentPurchaseInvoice.items && currentPurchaseInvoice.items.length > 0
                ? currentPurchaseInvoice.items.map((i) => ({ ...i }))
                : [emptyItem()]
        );
        setPeriodo(currentPurchaseInvoice.period ?? "");
        setPeriodoManual(Boolean(currentPurchaseInvoice.periodoManual || (currentPurchaseInvoice.period && currentPurchaseInvoice.date && currentPurchaseInvoice.period !== currentPurchaseInvoice.date.slice(0, 7))));
        setHeaderAdj({
            descuentoTipo:  (currentPurchaseInvoice.descuentoTipo ?? null) as AdjustmentKind | null,
            descuentoValor: currentPurchaseInvoice.descuentoValor ?? 0,
            descuentoMoneda: currentPurchaseInvoice.descuentoMoneda ?? 'B',
            recargoTipo:    (currentPurchaseInvoice.recargoTipo ?? null) as AdjustmentKind | null,
            recargoValor:   currentPurchaseInvoice.recargoValor ?? 0,
            recargoMoneda: currentPurchaseInvoice.recargoMoneda ?? 'B',
        });
        setRetencionIvaPct(currentPurchaseInvoice.retencionIvaPct ?? 0);
        setImpuestos(currentPurchaseInvoice.impuestos ?? []);
        setIslr({
            concepto:         currentPurchaseInvoice.islrConcepto ?? null,
            porcentaje:       currentPurchaseInvoice.islrPorcentaje ?? 0,
            baseRetencion:    currentPurchaseInvoice.islrBaseRetencion ?? 0,
            sustraendo:       currentPurchaseInvoice.islrSustraendo ?? 0,
            monto:            currentPurchaseInvoice.islrMonto ?? 0,
            unidadTributaria: currentPurchaseInvoice.islrUnidadTributaria ?? 9,
        });
        setIgtf({
            aplica:     currentPurchaseInvoice.igtfAplica ?? false,
            porcentaje: currentPurchaseInvoice.igtfPorcentaje ?? 3,
            baseDivisa: currentPurchaseInvoice.igtfBaseDivisa ?? 0,
            baseBs:     currentPurchaseInvoice.igtfBaseBs ?? 0,
            monto:      currentPurchaseInvoice.igtfMonto ?? 0,
            currencyCode: currentPurchaseInvoice.igtfCurrencyCode ?? "USD",
        });
        const hasAdj =
            (currentPurchaseInvoice.descuentoTipo != null && (currentPurchaseInvoice.descuentoValor ?? 0) > 0) ||
            (currentPurchaseInvoice.recargoTipo   != null && (currentPurchaseInvoice.recargoValor   ?? 0) > 0) ||
            (currentPurchaseInvoice.retencionIvaPct ?? 0) > 0 ||
            (currentPurchaseInvoice.impuestos && currentPurchaseInvoice.impuestos.length > 0) ||
            (currentPurchaseInvoice.islrConcepto != null) ||
            (currentPurchaseInvoice.igtfAplica === true);
        if (hasAdj) setShowHeaderAdj(true);
    }

    const invoiceCurrency = invoiceCurrencyCode;
    const effectiveDollarRate = getRate(invoiceCurrency);
    const selectedAppliedRate = appliedRates.find(
        (rate) => normalizeCurrencyCode(rate.currencyCode) === invoiceCurrency,
    );
    const rateDecimals = selectedAppliedRate?.decimals
        ?? currentPurchaseInvoice?.rateDecimals
        ?? DEFAULT_RATE_DECIMALS;
    // Derived totals — uses shared math
    const lineInputs: LineInput[] = items.map((i) => ({
        quantity: i.quantity ?? 0,
        unitCost: i.currencyCost != null && normalizeCurrencyCode(i.currency) !== "VES" && getRate(i.currency)
            ? i.currencyCost * getRate(i.currency)!
            : (i.unitCost ?? 0),
        currency: "VES",
        currencyCost: null,
        vatRate:  i.vatRate ?? "general_16",
        adjustments: {
            descuentoTipo:  (i.descuentoTipo ?? null) as AdjustmentKind | null,
            descuentoValor: i.descuentoValor ?? 0,
            descuentoMoneda: i.descuentoMoneda ?? 'B',
            recargoTipo:    (i.recargoTipo ?? null) as AdjustmentKind | null,
            recargoValor:   i.recargoValor ?? 0,
            recargoMoneda: i.recargoMoneda ?? 'B',
        },
    }));
    // Decimals binding: while editing, the form's rateDecimals drives precision.
    // For confirmed invoices, the persisted `rateDecimals` is the source of truth.
    const effectiveDecimals = currentPurchaseInvoice?.status === "confirmada"
        ? (currentPurchaseInvoice.rateDecimals ?? rateDecimals)
        : rateDecimals;
    const fmtN = makeFmt(effectiveDecimals);
    const totals = computeInvoiceTotals(lineInputs, headerAdj, effectiveDecimals, retencionIvaPct, impuestos, 1, "VES", getRate);
    const subtotal  = totals.baseIVA;
    const vatAmount = totals.ivaMonto;
    const total     = totals.total;
    const retencionIva = totals.retencionIva;
    const totalAPagar  = totals.totalAPagar;
    const heroTotal    = total + totals.totalImpuestos;
    const hasImpuestos = totals.totalImpuestos > 0;
    const hasRetencion = retencionIvaPct > 0 && retencionIva > 0;
    const headerAdjActive =
        (headerAdj.descuentoTipo != null && headerAdj.descuentoValor > 0) ||
        (headerAdj.recargoTipo   != null && headerAdj.recargoValor   > 0) ||
        retencionIvaPct > 0 ||
        impuestos.length > 0 ||
        islr.concepto != null ||
        igtf.aplica;

    const buildInvoice = useCallback((): PurchaseInvoice => ({
        id,
        companyId:      currentPurchaseInvoice?.companyId ?? companyId!,
        supplierId,
        documentType,
        affectedInvoiceNumber: documentType === "factura" ? null : affectedInvoiceNumber || null,
        affectedControlNumber: documentType === "factura" ? null : affectedControlNumber || null,
        noteReason: documentType === "factura" ? null : noteReason || null,
        inventoryEffect: documentType === "factura" ? "additional_purchase" : "none",
        invoiceNumber,
        controlNumber,
        date,
        period:         periodoManual && periodo ? periodo : date.slice(0, 7),
        periodoManual,
        currency: invoiceCurrency,
        exchangeRates: appliedRates,
        status:         "borrador",
        subtotal: subtotal * (documentType === "nota_credito" ? -1 : 1),
        vatPercentage:  0,
        vatAmount: vatAmount * (documentType === "nota_credito" ? -1 : 1),
        total: total * (documentType === "nota_credito" ? -1 : 1),
        notes,
        dollarRate:     getRate(invoiceCurrency),
        rateDecimals,
        descuentoTipo:  headerAdj.descuentoTipo,
        descuentoValor: headerAdj.descuentoValor,
        descuentoMoneda: headerAdj.descuentoMoneda,
        descuentoMonto: totals.descuentoHeader,
        recargoTipo:    headerAdj.recargoTipo,
        recargoValor:   headerAdj.recargoValor,
        recargoMoneda: headerAdj.recargoMoneda,
        recargoMonto:   totals.recargoHeader,
        retencionIvaPct,
        retencionIvaMonto: retencionIva,
        islrConcepto:          islr.concepto,
        islrPorcentaje:        islr.porcentaje,
        islrBaseRetencion:     islr.baseRetencion,
        islrSustraendo:        islr.sustraendo,
        islrMonto:             islr.monto,
        islrUnidadTributaria:  islr.unidadTributaria,
        igtfAplica:     igtf.aplica,
        igtfPorcentaje: igtf.porcentaje,
        igtfBaseDivisa: igtf.baseDivisa,
        igtfBaseBs:     igtf.baseBs,
        igtfMonto:      igtf.monto,
        igtfCurrencyCode: igtf.currencyCode,
        igtfExchangeRate: getRate(igtf.currencyCode),
        impuestos:      totals.impuestos,
    }), [id, currentPurchaseInvoice, companyId, supplierId, documentType, affectedInvoiceNumber, affectedControlNumber, noteReason, invoiceNumber, controlNumber, date, periodo, periodoManual, invoiceCurrency, appliedRates, getRate, subtotal, vatAmount, total, notes, rateDecimals, headerAdj, totals.descuentoHeader, totals.recargoHeader, retencionIvaPct, retencionIva, islr, igtf, totals.impuestos]);

    // Items con montos resueltos para persistir
    const itemsForSave = (): PurchaseInvoiceItem[] => items.map((it, idx) => {
        const t = totals.items[idx];
        return {
            ...it,
            exchangeRate: getRate(it.currency),
            dollarRate: getRate(it.currency),
            descuentoMonto: t.descuentoMonto,
            recargoMonto:   t.recargoMonto,
            baseIVA: t.baseIVAFinal,
                unitCost: t.base / Math.max(1, it.quantity),
                totalCost: t.base,
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

    function handleConfirm() {
        if (!validate()) return;
        setShowConfirm(true);
    }

    async function handleConfirmInvoice() {
        setConfirming(true);
        const saved = await savePurchaseInvoice(buildInvoice(), itemsForSave());
        if (!saved) { setConfirming(false); return; }
        const confirmed = await confirmPurchaseInvoice(saved.id!);
        setConfirming(false);
        setShowConfirm(false);
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

    async function handleDownloadComprobanteIslr() {
        const inv = currentPurchaseInvoice;
        if (!inv || !company) return;
        if (!inv.comprobanteIslrNumero) {
            notify.error("Esta factura no tiene un N° de comprobante ISLR asignado.");
            return;
        }
        if (!inv.islrConcepto) {
            notify.error("Falta el concepto ISLR — no se puede emitir el comprobante.");
            return;
        }
        const supplier = suppliers.find((s) => s.id === inv.supplierId);
        if (!supplier) { notify.error("No se pudo cargar el proveedor."); return; }
        if (!company.rif)  { notify.error("La empresa no tiene RIF configurado."); return; }
        if (!supplier.rif) { notify.error("El proveedor no tiene RIF — requerido por SENIAT."); return; }

        try {
            await generateComprobanteIslrPdf({
                agent: {
                    name:    company.name,
                    rif:     company.rif,
                    address: company.address,
                },
                supplier: {
                    name:    supplier.name,
                    rif:     supplier.rif,
                    address: supplier.address,
                },
                operation: {
                    invoiceNumber: inv.invoiceNumber,
                    controlNumber: inv.controlNumber ?? "",
                    invoiceDate:   fmtDate(inv.date),
                    period:        inv.period,
                },
                retention: {
                    conceptCode:      inv.islrConcepto,
                    operationAmount:  inv.islrBaseRetencion ?? 0,
                    percentage:       inv.islrPorcentaje ?? 0,
                    sustraendo:       inv.islrSustraendo ?? 0,
                    withheldAmount:   inv.islrMonto ?? 0,
                    unidadTributaria: inv.islrUnidadTributaria,
                },
                voucherNumber: inv.comprobanteIslrNumero,
            });
            notify.success("Comprobante de retención ISLR generado.");
        } catch (e) {
            notify.error(e instanceof Error ? e.message : "Error al generar el comprobante ISLR.");
        }
    }

    async function handleDownloadComprobante() {
        const inv = currentPurchaseInvoice;
        if (!inv || !company) return;
        if (!inv.comprobanteRetencionIvaNumero) {
            notify.error("Esta factura no tiene un N° de comprobante asignado.");
            return;
        }
        const supplier = suppliers.find((s) => s.id === inv.supplierId);
        if (!supplier) {
            notify.error("No se pudo cargar el proveedor.");
            return;
        }
        if (!company.rif) {
            notify.error("La empresa no tiene RIF configurado.");
            return;
        }
        if (!supplier.rif) {
            notify.error("El proveedor no tiene RIF — requerido por SENIAT.");
            return;
        }

        // Desglose por alícuota a partir de los items para detectar la
        // alícuota predominante y separar exento.
        const items = inv.items ?? [];
        const exemptBase  = items
            .filter((i) => i.vatRate === "exenta")
            .reduce((acc, i) => acc + (i.baseIVA ?? i.totalCost ?? 0), 0);
        const base16 = items
            .filter((i) => i.vatRate === "general_16")
            .reduce((acc, i) => acc + (i.baseIVA ?? i.totalCost ?? 0), 0);
        const base8  = items
            .filter((i) => i.vatRate === "reducida_8")
            .reduce((acc, i) => acc + (i.baseIVA ?? i.totalCost ?? 0), 0);
        // Predominante: la alícuota con mayor base. Si solo hay una, esa.
        const predominantRate = base16 >= base8 && base16 > 0 ? 16 : base8 > 0 ? 8 : 16;
        const taxableBase = base16 + base8;

        try {
            await generateComprobanteIvaPdf({
                agent: {
                    name:    company.name,
                    rif:     company.rif,
                    address: company.address,
                },
                supplier: {
                    name:    supplier.name,
                    rif:     supplier.rif,
                    address: supplier.address,
                },
                operation: {
                    invoiceNumber: inv.invoiceNumber,
                    controlNumber: inv.controlNumber ?? "",
                    invoiceDate:   fmtDate(inv.date),
                    period:        inv.period,
                },
                amounts: {
                    invoiceTotal:    inv.subtotal + inv.vatAmount,
                    taxableBase,
                    exemptBase,
                    ivaRate:         predominantRate,
                    ivaCaused:       inv.vatAmount,
                    retentionPct:    inv.retencionIvaPct ?? 0,
                    retentionAmount: inv.retencionIvaMonto ?? 0,
                },
                voucherNumber: inv.comprobanteRetencionIvaNumero,
            });
            notify.success("Comprobante de retención IVA generado.");
        } catch (e) {
            notify.error(e instanceof Error ? e.message : "Error al generar el comprobante.");
        }
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
    const affectedInvoiceCandidates = purchaseInvoices.filter((candidate) => candidate.id !== id && candidate.status === "confirmada" && candidate.documentType === "factura" && candidate.supplierId === supplierId);
    const handleAffectedInvoiceNumberChange = (value: string) => {
        setAffectedInvoiceNumber(value);
        const candidate = affectedInvoiceCandidates.find((invoice) => invoice.invoiceNumber === value);
        if (candidate) setAffectedControlNumber(candidate.controlNumber ?? "");
    };
    const activeDocumentType = isDraft ? documentType : (invoice.documentType ?? "factura");
    const documentTypeLabel = activeDocumentType === "nota_credito" ? "Nota de crédito" : activeDocumentType === "nota_debito" ? "Nota de débito" : "Factura";
    const documentNumberLabel = activeDocumentType === "nota_credito" ? "Nº Nota de crédito" : activeDocumentType === "nota_debito" ? "Nº Nota de débito" : "Nº Factura";

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader
                title={`${documentTypeLabel} de Compra`}
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

            {/* Banner: factura confirmada sin items detallados (flujo rápido) */}
            {invoice && isPendingImputation(invoice) && (
                <div className="px-6 pt-4">
                    <div className="flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/40 px-4 py-3">
                        <Inbox size={18} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" strokeWidth={2} />
                        <div className="flex-1 min-w-0">
                            <p className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-amber-900 dark:text-amber-200">
                                Pendiente de imputar inventario
                            </p>
                            <p className="font-sans text-[12px] text-amber-800/90 dark:text-amber-300/90 leading-snug mt-0.5">
                                Esta factura se contabilizó con el total declarado. El detalle de productos puede completarse desde la bandeja de inventario para mover el stock.
                            </p>
                        </div>
                        <Link
                            href={`/inventory/compras-pendientes/${invoice.id}`}
                            className="shrink-0 inline-flex items-center h-8 px-3 rounded-lg border border-amber-400/60 bg-amber-100/80 hover:bg-amber-100 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 dark:border-amber-700/60 font-mono text-[11px] uppercase tracking-[0.12em] text-amber-900 dark:text-amber-200 font-semibold transition-colors"
                        >
                            Imputar items
                        </Link>
                    </div>
                </div>
            )}

            {/* Confirm dialog — always shown before (re)confirming */}
            <ConfirmCompanyDialog
                isOpen={showConfirm}
                onClose={() => { if (!confirming) setShowConfirm(false); }}
                onConfirm={handleConfirmInvoice}
                loading={confirming}
                title="Confirmar factura de compra"
                subtitle="Al confirmar, las existencias y el costo promedio se actualizan inmediatamente y la factura entra en el período contable seleccionado."
                summary={
                    <>
                        <SummaryRow label={documentNumberLabel} value={invoiceNumber || "—"} />
                        {controlNumber && <SummaryRow label="Nº Control" value={controlNumber} />}
                        <SummaryRow label="Proveedor" value={suppliers.find((s) => s.id === supplierId)?.name ?? "—"} />
                        <SummaryRow label="Período" value={(periodoManual && periodo) || date.slice(0, 7) || "—"} />
                        <SummaryRow label="Ítems" value={String(items.filter((i) => i.productId).length)} />
                        <div className="border-t border-border-light/60 pt-2.5 mt-1 space-y-2.5">
                            {hasImpuestos && (
                                <SummaryRow label="Impuestos" value={`+ Bs. ${fmtN(totals.totalImpuestos)}`} />
                            )}
                            <SummaryRow label="Total" value={`Bs. ${fmtN(heroTotal)}`} emphasis />
                            {effectiveDollarRate && heroTotal > 0 && (
                                <SummaryRow label={`≈ ${invoiceCurrencyCode}`} value={`${invoiceCurrencyCode} ${fmtN(heroTotal / effectiveDollarRate)}`} />
                            )}
                            {hasRetencion && (
                                <SummaryRow label="Total a pagar" value={`Bs. ${fmtN(totalAPagar)}`} />
                            )}
                        </div>
                    </>
                }
                warning={hasRetencion
                    ? `Se retendrá Bs. ${fmtN(retencionIva)} (${retencionIvaPct}% IVA) que se enteran a SENIAT.`
                    : undefined}
                confirmLabel={confirming ? "Confirmando…" : "Sí, confirmar"}
            />

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

            <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 xl:px-8">

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
                    </div>
                )}

                <div className="flex flex-col gap-4">
                    {/* Left panel */}
                    <div className="contents">

                        {/* Invoice data */}
                        <InvoiceSectionCard title={`Datos de la ${documentTypeLabel.toLowerCase()}`} subtitle="Identifica el comprobante y define su período contable.">

                            {isDraft && (
                                <div className="mb-4">
                                    <label className={labelCls}>Tipo de documento</label>
                                    <select className={fieldCls} value={documentType} onChange={(e) => setDocumentType(e.target.value as PurchaseDocumentType)}>
                                        <option value="factura">Factura</option>
                                        <option value="nota_credito">Nota de crédito</option>
                                        <option value="nota_debito">Nota de débito</option>
                                    </select>
                                </div>
                            )}

                            <div className="grid grid-cols-1 gap-4 mb-4 md:grid-cols-2 xl:grid-cols-4">
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
                                        <BaseInput.Field label={documentNumberLabel} value={invoiceNumber} onValueChange={setInvoiceNumber} />
                                    ) : (
                                        <>
                                            <label className={labelCls}>{documentNumberLabel}</label>
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
                                        <CurrencyCombobox
                                            label="Moneda principal"
                                            options={currencyOptions}
                                            value={invoiceCurrencyCode}
                                            onChange={(value) => setInvoiceCurrencyCode(normalizeCurrencyCode(value))}
                                        />
                                    ) : (
                                        <>
                                            <label className={labelCls}>Moneda principal</label>
                                            <div className={readonlyCls + " flex items-center"}>
                                                {normalizeCurrencyCode(invoice.currency)}
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div>
                                    {isDraft ? (
                                        isLocalCurrency(invoiceCurrencyCode) ? (
                                            <>
                                                <label className={labelCls}>Tasa de cambio</label>
                                                <div className={readonlyCls + " flex items-center"}>No aplica · moneda local</div>
                                            </>
                                        ) : (
                                            <BaseInput.Field
                                                label={`Tasa · Bs/${invoiceCurrencyCode}`}
                                                type="number"
                                                min="0"
                                                step="0.0001"
                                                value={getRate(invoiceCurrencyCode) ? String(getRate(invoiceCurrencyCode)) : ""}
                                                onValueChange={(value) => setManualRate(invoiceCurrencyCode, Number(String(value).replace(",", ".")) || 0, rateDecimals)}
                                                description={publishedDate ? `BCV ${publishedDate}` : "Tasa manual"}
                                                isDisabled={currenciesLoading}
                                            />
                                        )
                                    ) : (
                                        <>
                                            <label className={labelCls}>
                                                {isLocalCurrency(invoice.currency)
                                                    ? "Tasa de cambio"
                                                    : `Tasa · Bs/${normalizeCurrencyCode(invoice.currency)}`}
                                            </label>
                                            <div className={readonlyCls + " flex items-center"}>
                                                {isLocalCurrency(invoice.currency)
                                                    ? "No aplica · moneda local"
                                                    : invoice.dollarRate != null
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

                            {activeDocumentType !== "factura" && (
                                <div className="rounded-lg border border-border-light bg-surface-2 p-4 mb-4">
                                    <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-3">Documento afectado</h3>
                                    <div className="grid grid-cols-3 gap-4 text-[12px]">
                                        <div>{isDraft ? <><select className={fieldCls} value={affectedInvoiceNumber} onChange={(e) => handleAffectedInvoiceNumberChange(e.target.value)}>
                                                <option value="">Seleccionar factura existente...</option>
                                                {affectedInvoiceCandidates.map((candidate) => <option key={candidate.id} value={candidate.invoiceNumber}>{candidate.invoiceNumber}{candidate.controlNumber ? ` · Control ${candidate.controlNumber}` : ""}</option>)}
                                            </select>
                                            <BaseInput.Field label="Nº Factura afectada" value={affectedInvoiceNumber} onValueChange={handleAffectedInvoiceNumberChange} list="detail-affected-invoice-options" helperText="Busca una factura confirmada del proveedor" />
                                            <datalist id="detail-affected-invoice-options">
                                                {affectedInvoiceCandidates.map((candidate) => <option key={candidate.id} value={candidate.invoiceNumber}>{candidate.controlNumber ? `Control ${candidate.controlNumber}` : ""}</option>)}
                                            </datalist></> : <><span className={labelCls}>Nº Factura afectada</span><span className="text-foreground tabular-nums">{invoice.affectedInvoiceNumber || "—"}</span></>}</div>
                                        <div>{isDraft ? <BaseInput.Field label="Control afectado" value={affectedControlNumber} onValueChange={setAffectedControlNumber} /> : <><span className={labelCls}>Control afectado</span><span className="text-foreground tabular-nums">{invoice.affectedControlNumber || "—"}</span></>}</div>
                                        <div>{isDraft ? <BaseInput.Field label="Motivo" value={noteReason} onValueChange={setNoteReason} /> : <><span className={labelCls}>Motivo</span><span className="text-foreground">{invoice.noteReason || "—"}</span></>}</div>
                                    </div>
                                </div>
                            )}

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
                                            (descuento/recargo/retención activos)
                                        </span>
                                    )}
                                </button>
                                {showHeaderAdj && (
                                    <div className="mt-3 px-4 py-3 rounded-lg border border-border-light bg-surface-2/40 space-y-4">
                                        <div>
                                            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] mb-3">
                                                Se prorratean por línea según base IVA
                                            </p>
                                            <HeaderAdjustmentsSection value={headerAdj} onChange={setHeaderAdj} readOnly={!isDraft} dollarRate={effectiveDollarRate} currencyOptions={currencyOptions} />
                                        </div>
                                        <div className="pt-3 border-t border-border-light/60">
                                            <InvoiceTaxesSection
                                                value={isDraft ? impuestos : (invoice.impuestos ?? [])}
                                                onChange={setImpuestos}
                                                baseIVA={subtotal}
                                                total={subtotal + vatAmount}
                                                decimals={effectiveDecimals}
                                                readOnly={!isDraft}
                                            />
                                        </div>
                                        <div className="pt-3 border-t border-border-light/60">
                                            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] mb-3">
                                                Se aplica POST-IVA y reduce el total a pagar al proveedor
                                            </p>
                                            <IvaRetencionToggle
                                                value={retencionIvaPct}
                                                onChange={setRetencionIvaPct}
                                                readOnly={!isDraft}
                                            />
                                        </div>
                                        <div className="pt-3 border-t border-border-light/60">
                                            <IslrRetencionSection
                                                value={islr}
                                                onChange={setIslr}
                                                defaultBase={subtotal}
                                                readOnly={!isDraft}
                                            />
                                        </div>
                                        <div className="pt-3 border-t border-border-light/60">
                                            <IgtfSection
                                                value={igtf}
                                                onChange={setIgtf}
                                                dollarRate={getRate(igtf.currencyCode)}
                                                currencyOptions={currencyOptions}
                                                readOnly={!isDraft}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </InvoiceSectionCard>

                        {/* Items */}
                        <InvoiceDetailCard
                            count={items.filter((item) => item.productId).length}
                            subtitle="Productos que ingresan al inventario al confirmar."
                            readOnly={!isDraft}
                            onAddLine={() => setItems((current) => [...current, emptyItem(invoiceCurrencyCode)])}
                        >
                            <FacturaItemsGrid
                                items={items}
                                products={products}
                                onChange={setItems}
                                readOnly={!isDraft}
                                currencyOptions={currencyOptions}
                                getExchangeRate={getRate}
                                dollarRate={effectiveDollarRate}
                                decimals={effectiveDecimals}
                                selectedCurrency={invoiceCurrencyCode}
                                applyCurrencyToAll={applyCurrencyToAll}
                                onApplyCurrencyToAllChange={setApplyCurrencyToAll}
                            />

                            {/* Totals */}
                            {(() => {
                                // Use the same shared math for draft and confirmed.
                                const displayItems = isDraft ? items : (invoice.items ?? []);
                                const displayHeader: HeaderAdjustments = isDraft ? headerAdj : {
                                    descuentoTipo:  (invoice.descuentoTipo ?? null) as AdjustmentKind | null,
                                    descuentoValor: invoice.descuentoValor ?? 0,
                                    descuentoMoneda: invoice.descuentoMoneda ?? 'B',
                                    recargoTipo:    (invoice.recargoTipo ?? null) as AdjustmentKind | null,
                                    recargoValor:   invoice.recargoValor ?? 0,
                                    recargoMoneda: invoice.recargoMoneda ?? 'B',
                                };
                                const dInputs: LineInput[] = displayItems.map((i) => ({
                                    quantity: i.quantity ?? 0,
                                    unitCost: !isLocalCurrency(i.currency) && i.currencyCost != null && getRate(i.currency) != null
            ? i.currencyCost * getRate(i.currency)!
            : (i.unitCost ?? 0),
                                    currency: i.currency ?? "B",
                                    currencyCost: i.currencyCost ?? null,
                                    vatRate:  i.vatRate ?? "general_16",
                                    adjustments: {
                                        descuentoTipo:  (i.descuentoTipo ?? null) as AdjustmentKind | null,
                                        descuentoValor: i.descuentoValor ?? 0,
                                        descuentoMoneda: i.descuentoMoneda ?? 'B',
                                        recargoTipo:    (i.recargoTipo ?? null) as AdjustmentKind | null,
                                        recargoValor:   i.recargoValor ?? 0,
                                        recargoMoneda: i.recargoMoneda ?? 'B',
                                    },
                                }));
                                const dRetencionPct = isDraft ? retencionIvaPct : (invoice.retencionIvaPct ?? 0);
                                const dImpuestos = isDraft ? impuestos : (invoice.impuestos ?? []);
                                const t = computeInvoiceTotals(dInputs, displayHeader, effectiveDecimals, dRetencionPct, dImpuestos, isDraft ? (effectiveDollarRate ?? 0) : (invoice.dollarRate ?? 0), invoiceCurrency, getRate);
                                const dBaseExempt   = dInputs.reduce((acc, l, idx) => l.vatRate === "exenta"     ? acc + t.items[idx].baseIVAFinal : acc, 0);
                                const dBaseTaxed8   = dInputs.reduce((acc, l, idx) => l.vatRate === "reducida_8" ? acc + t.items[idx].baseIVAFinal : acc, 0);
                                const dBaseTaxed16  = dInputs.reduce((acc, l, idx) => l.vatRate === "general_16" ? acc + t.items[idx].baseIVAFinal : acc, 0);
                                const dVat8         = t.ivaPorAlicuota.reducida_8;
                                const dVat16        = t.ivaPorAlicuota.general_16;
                                const dVatAmount    = t.ivaMonto;
                                // Total bruto factura (antes de retenciones).
                                const dGross        = isDraft ? t.total : (invoice.subtotal + invoice.vatAmount);
                                const dTotalImpuestos = t.totalImpuestos;
                                const dResolvedImpuestos = t.impuestos;
                                const dRetencionIva = isDraft ? t.retencionIva : (invoice.retencionIvaMonto ?? 0);
                                const dRetencionIslr= isDraft ? islr.monto      : (invoice.islrMonto ?? 0);
                                const dIslrConcepto = isDraft ? islr.concepto   : (invoice.islrConcepto ?? null);
                                const dIslrPct      = isDraft ? islr.porcentaje : (invoice.islrPorcentaje ?? 0);
                                const dIgtfMonto    = isDraft ? igtf.monto      : (invoice.igtfMonto ?? 0);
                                const dIgtfPct      = isDraft ? igtf.porcentaje : (invoice.igtfPorcentaje ?? 0);
                                const dTotalAPagar  = dGross + dTotalImpuestos - dRetencionIva - dRetencionIslr + dIgtfMonto;
                                const dTotal        = dGross + dTotalImpuestos;
                                const dHasRetencion = dRetencionPct > 0 && dRetencionIva > 0;
                                const dHasIslr      = dRetencionIslr > 0;
                                const dHasIgtf      = dIgtfMonto > 0;
                                const dHasImpuestos = dTotalImpuestos > 0;
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
                                    <div className="hidden">
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
                                                        {dBaseTaxed8   > 0 && renderRow("Base imponible 8%",  dBaseTaxed8,  { kind: "muted",   indent: true })}
                                                        {dVat8         > 0 && renderRow("IVA 8%",            dVat8,        { kind: "neutral", indent: true, note: "8% × base" })}
                                                        {dBaseTaxed16  > 0 && renderRow("Base imponible", dBaseTaxed16, { kind: "muted",   indent: true })}
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

                                                {/* Block 4b — Dynamic taxes */}
                                                {dHasImpuestos && dResolvedImpuestos.map((tax, idx) => (
                                                    <Fragment key={`tax-${idx}`}>
                                                        {renderRow(
                                                            tax.nombre || `Impuesto ${idx + 1}`,
                                                            tax.monto,
                                                            { kind: "pos", sign: "+", indent: true, note: tax.tipo === "porcentaje" ? `${tax.valor}% ${tax.base === "post_iva" ? "post-IVA" : "pre-IVA"}` : undefined },
                                                        )}
                                                    </Fragment>
                                                ))}

                                                <div className="col-span-3 h-px bg-border-light my-1" aria-hidden="true" />
                                                {renderRow((dHasRetencion || dHasIslr) ? "Total factura" : "Total", dTotal, {
                                                    kind: "total",
                                                    note: hasIva || dHasImpuestos ? "= base + IVA + impuestos" : undefined,
                                                })}

                                                {dHasRetencion && (
                                                    renderRow(
                                                        `Retención IVA ${dRetencionPct}%`,
                                                        dRetencionIva,
                                                        { kind: "neg", sign: "−", indent: true, note: `${dRetencionPct}% × IVA` },
                                                    )
                                                )}

                                                {dHasIslr && dIslrConcepto && (
                                                    renderRow(
                                                        `Retención ISLR ${dIslrPct}%`,
                                                        dRetencionIslr,
                                                        { kind: "neg", sign: "−", indent: true, note: `concepto ${dIslrConcepto}` },
                                                    )
                                                )}

                                                {dHasIgtf && (
                                                    renderRow(
                                                        `IGTF ${dIgtfPct}%`,
                                                        dIgtfMonto,
                                                        { kind: "pos", sign: "+", indent: true, note: "pago en divisa" },
                                                    )
                                                )}

                                                {(dHasRetencion || dHasIslr || dHasIgtf) && (
                                                    <>
                                                        <div className="col-span-3 h-px bg-border-light my-1" aria-hidden="true" />
                                                        {renderRow("Total a pagar", dTotalAPagar, {
                                                            kind: "total",
                                                            note: [
                                                                dHasRetencion && "− ret. IVA",
                                                                dHasIslr      && "− ret. ISLR",
                                                                dHasIgtf      && "+ IGTF",
                                                            ].filter(Boolean).length > 0
                                                                ? `= total ${[
                                                                    dHasRetencion && "− ret. IVA",
                                                                    dHasIslr      && "− ret. ISLR",
                                                                    dHasIgtf      && "+ IGTF",
                                                                  ].filter(Boolean).join(" ")}`
                                                                : undefined,
                                                        })}
                                                    </>
                                                )}

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
                        </InvoiceDetailCard>
                        {returnSuccess && (
                            <div className="order-3 flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/[0.05] px-4 py-3 font-sans text-[13px] text-green-600">
                                <CheckCircle2 size={14} strokeWidth={2} />
                                Devolución registrada — movimientos de devolución de compra creados.
                            </div>
                        )}
                    </div>

                    {/* Right panel — summary */}
                    <aside className="order-1 w-full">
                        <InvoiceSummaryCard status={isConfirmed ? "confirmed" : "draft"}>
                            <div className="space-y-4">
                            <div className="space-y-3 text-[13px]">
                                <div className="flex justify-between gap-3">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px] flex-shrink-0">Proveedor</span>
                                    <span className="text-foreground font-medium truncate text-right">
                                        {(isDraft ? suppliers.find((supplier) => supplier.id === supplierId)?.name : invoice.supplierName) ?? "—"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Nº Control</span>
                                    <span className="text-foreground tabular-nums">{(isDraft ? controlNumber : invoice.controlNumber) || "—"}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Fecha</span>
                                    <span className="text-foreground tabular-nums">{fmtDate(isDraft ? date : invoice.date)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Período</span>
                                    <span className="flex items-center gap-1.5">
                                        <span className="text-foreground tabular-nums">{isDraft ? ((periodoManual && periodo) || date.slice(0, 7)) : invoice.period}</span>
                                        {(isDraft ? periodoManual : invoice.periodoManual) && (
                                            <span className="px-1 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-600 font-mono text-[8px] uppercase tracking-[0.12em] font-bold">
                                                Manual
                                            </span>
                                        )}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Ítems</span>
                                    <span className="text-foreground tabular-nums">{(isDraft ? items : (invoice.items ?? [])).filter((item) => item.productId).length}</span>
                                </div>
                            </div>
                            <div className="pt-3 border-t border-border-light space-y-2 text-[13px]">
                                {(() => {
                                    const summaryRate = (isDraft ? effectiveDollarRate : invoice.dollarRate) ?? effectiveDollarRate;
                                    // The summary reflects persisted invoice amounts. This prevents a second
                                    // local recalculation from changing a loaded foreign-currency invoice while its rate hydrates.
                                    const summarySubtotal = isDraft ? totals.baseIVA : invoice.subtotal;
                                    const summaryVatAmount = isDraft ? totals.ivaMonto : invoice.vatAmount;
                                    const summaryTotal = isDraft ? total + totals.totalImpuestos : invoice.total;
                                    const hasSourceCurrency = !isLocalCurrency(invoiceCurrency) && summaryRate && summaryRate > 0;
                                    const sourceSubtotal = hasSourceCurrency ? summarySubtotal / summaryRate : null;
                                    const sourceVatAmount = hasSourceCurrency ? summaryVatAmount / summaryRate : null;
                                    const sourceTotal = hasSourceCurrency ? summaryTotal / summaryRate : null;
                                    const usd = (n: number, source?: number | null) =>
                                        isLocalCurrency(invoiceCurrency)
                                            ? null
                                            : source != null
                                                ? `${invoiceCurrency} ${fmtN(source)}`
                                                : (summaryRate && summaryRate > 0 ? `${invoiceCurrency} ${fmtN(n / summaryRate)}` : null);
                                    // Skip "Base IVA" + "IVA" rows when there's no IVA — they
                                    // would just echo the Total. Show only the Total in that case.
                                    const summaryHasIva = summaryVatAmount > 0;
                                    const summaryRetencionMonto = invoice.retencionIvaMonto ?? 0;
                                    const summaryRetencionPct   = invoice.retencionIvaPct ?? 0;
                                    const summaryHasRetencion   = summaryRetencionMonto > 0;
                                    const summaryIslrMonto      = invoice.islrMonto ?? 0;
                                    const summaryIslrConcepto   = invoice.islrConcepto ?? null;
                                    const summaryHasIslr        = summaryIslrMonto > 0 && !!summaryIslrConcepto;
                                    const summaryIgtfMonto      = invoice.igtfMonto ?? 0;
                                    const summaryIgtfPct        = invoice.igtfPorcentaje ?? 0;
                                    const summaryHasIgtf        = (invoice.igtfAplica ?? false) && summaryIgtfMonto > 0;
                                    // Impuestos adicionales (mig. 111): ya están sumados en invoice.total,
                                    // se listan aquí para que Base + IVA + Impuestos − retenciones = Total cuadre.
                                    const summaryImpuestos      = (invoice.impuestos ?? []).filter((t) => (t.monto ?? 0) > 0);
                                    return (
                                        <>
                                            {isDraft && totals.descuentoHeader > 0 && (
                                                <div className="flex justify-between items-baseline">
                                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Descuento</span>
                                                    <div className="text-right"><div className="tabular-nums text-error/80">−Bs. {fmtN(totals.descuentoHeader)}</div>{usd(totals.descuentoHeader) && <div className="tabular-nums text-[10px] text-[var(--text-tertiary)]">−{usd(totals.descuentoHeader)}</div>}</div>
                                                </div>
                                            )}
                                            {summaryHasIva && (
                                                <>
                                                    <div className="flex justify-between items-baseline">
                                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Base IVA</span>
                                                        <div className="text-right">
                                                            <div className="tabular-nums text-[var(--text-primary)]">Bs. {fmtN(summarySubtotal)}</div>
                                                            {usd(summarySubtotal, sourceSubtotal) && (
                                                                <div className="tabular-nums text-[10px] text-[var(--text-tertiary)]">≈ {usd(summarySubtotal, sourceSubtotal)}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-between items-baseline">
                                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">IVA</span>
                                                        <div className="text-right">
                                                            <div className="tabular-nums text-[var(--text-secondary)]">Bs. {fmtN(summaryVatAmount)}</div>
                                                            {usd(summaryVatAmount, sourceVatAmount) && (
                                                                <div className="tabular-nums text-[10px] text-[var(--text-tertiary)]">≈ {usd(summaryVatAmount, sourceVatAmount)}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                            {summaryImpuestos.map((tax, i) => (
                                                <div key={`imp-${i}`} className="flex justify-between items-baseline gap-3">
                                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px] truncate">
                                                        {tax.nombre || `Impuesto ${i + 1}`}
                                                    </span>
                                                    <div className="text-right">
                                                        <div className="tabular-nums text-amber-600">
                                                            <span className="opacity-60 mr-0.5">+</span>
                                                            Bs. {fmtN(tax.monto)}
                                                        </div>
                                                        {usd(tax.monto) && (
                                                            <div className="tabular-nums text-[10px] text-[var(--text-tertiary)]">
                                                                <span className="opacity-60 mr-0.5">+</span>
                                                                ≈ {usd(tax.monto)}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {summaryHasRetencion && (
                                                <div className="flex justify-between items-baseline">
                                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">
                                                        Ret. IVA {summaryRetencionPct}%
                                                    </span>
                                                    <div className="text-right">
                                                        <div className="tabular-nums text-error/80">
                                                            <span className="opacity-60 mr-0.5">−</span>
                                                            Bs. {fmtN(summaryRetencionMonto)}
                                                        </div>
                                                        {usd(summaryRetencionMonto) && (
                                                            <div className="tabular-nums text-[10px] text-[var(--text-tertiary)]">
                                                                <span className="opacity-60 mr-0.5">−</span>
                                                                ≈ {usd(summaryRetencionMonto)}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            {summaryHasIslr && (
                                                <div className="flex justify-between items-baseline">
                                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">
                                                        Ret. ISLR ({summaryIslrConcepto})
                                                    </span>
                                                    <div className="text-right">
                                                        <div className="tabular-nums text-error/80">
                                                            <span className="opacity-60 mr-0.5">−</span>
                                                            Bs. {fmtN(summaryIslrMonto)}
                                                        </div>
                                                        {usd(summaryIslrMonto) && (
                                                            <div className="tabular-nums text-[10px] text-[var(--text-tertiary)]">
                                                                <span className="opacity-60 mr-0.5">−</span>
                                                                ≈ {usd(summaryIslrMonto)}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            {summaryHasIgtf && (
                                                <div className="flex justify-between items-baseline">
                                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">
                                                        IGTF {summaryIgtfPct}%
                                                    </span>
                                                    <div className="text-right">
                                                        <div className="tabular-nums text-info">
                                                            <span className="opacity-60 mr-0.5">+</span>
                                                            Bs. {fmtN(summaryIgtfMonto)}
                                                        </div>
                                                        {usd(summaryIgtfMonto) && (
                                                            <div className="tabular-nums text-[10px] text-[var(--text-tertiary)]">
                                                                <span className="opacity-60 mr-0.5">+</span>
                                                                ≈ {usd(summaryIgtfMonto)}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            <div className="flex justify-between items-baseline font-bold pt-1">
                                                <span className="text-foreground uppercase tracking-[0.12em] text-[11px]">Total</span>
                                                <div className="text-right">
                                                    <div className="tabular-nums text-foreground text-[14px]">Bs. {fmtN(summaryTotal)}</div>
                                                    {usd(summaryTotal, sourceTotal) && (
                                                        <div className="tabular-nums text-[11px] font-semibold text-[var(--text-secondary)]">≈ {usd(summaryTotal, sourceTotal)}</div>
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
                            <div className="grid gap-2 border-t border-border-light pt-4">
                                {isDraft && <>
                                    <BaseButton.Root className="w-full" variant="primary" size="md" leftIcon={<CheckCircle2 size={14} strokeWidth={2} />} onClick={handleConfirm} disabled={saving || confirming}>
                                        {confirming ? "Confirmando…" : "Confirmar factura"}
                                    </BaseButton.Root>
                                    <BaseButton.Root className="w-full" variant="secondary" size="md" leftIcon={<Save size={14} strokeWidth={2} />} onClick={handleSaveDraft} disabled={saving || confirming}>
                                        {saving ? "Guardando…" : "Guardar borrador"}
                                    </BaseButton.Root>
                                </>}
                                {isConfirmed && <>
                                    {invoice.comprobanteRetencionIvaNumero && (
                                        <BaseButton.Root className="w-full" variant="primary" size="md" leftIcon={<Receipt size={14} strokeWidth={2} />} onClick={handleDownloadComprobante}>Comprobante Ret. IVA</BaseButton.Root>
                                    )}
                                    {invoice.comprobanteIslrNumero && (
                                        <BaseButton.Root className="w-full" variant="primary" size="md" leftIcon={<Receipt size={14} strokeWidth={2} />} onClick={handleDownloadComprobanteIslr}>Comprobante Ret. ISLR</BaseButton.Root>
                                    )}
                                    <BaseButton.Root as={Link} href={`/inventory/movements?periodo=${invoice.period}`} className="w-full" variant="secondary" size="md" rightIcon={<ArrowRight size={14} strokeWidth={2} />}>Ver movimientos</BaseButton.Root>
                                    <BaseButton.Root className="w-full" variant="secondary" size="md" leftIcon={<Unlock size={14} strokeWidth={2} />} onClick={handleUnconfirm} disabled={unconfirming}>{unconfirming ? "Desconfirmando…" : "Desconfirmar"}</BaseButton.Root>
                                    <BaseButton.Root className="w-full" variant="dangerOutline" size="md" leftIcon={<RotateCcw size={14} strokeWidth={2} />} onClick={openReturnModal}>Registrar devolución</BaseButton.Root>
                                </>}
                            </div>
                            </div>
                        </InvoiceSummaryCard>
                    </aside>
                </div>
            </div>
        </div>
    );
}



