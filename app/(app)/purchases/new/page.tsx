"use client";

// Page: NuevaFacturaPage
// Purpose: Create a new purchase invoice (factura de compra) with line items.
// Architectural role: Page-level composition using inventory hook and shared domain types.
// All identifiers use English domain types; JSX user-facing text remains in Spanish.

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, Plus, X, CheckCircle2, ArrowRight, Save, ChevronDown, Info } from "lucide-react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { CompanyContextPill } from "@/src/shared/frontend/components/company-context-pill";
import { AutoSaveStatusPill } from "@/src/shared/frontend/components/autosave-status-pill";
import { ConfirmCompanyDialog, SummaryRow } from "@/src/shared/frontend/components/confirm-company-dialog";
import { ResumeDraftBanner } from "@/src/shared/frontend/components/resume-draft-banner";
import { useDebouncedAutoSave } from "@/src/shared/frontend/hooks/use-debounced-autosave";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { InvoiceDetailCard, InvoiceSectionCard, InvoiceSummaryCard } from "@/src/shared/frontend/components/invoices/invoice-form-cards";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { usePurchases } from "@/src/modules/purchases/frontend/hooks/use-purchases";
import { notify } from "@/src/shared/frontend/notify";
import type { PurchaseInvoice, PurchaseInvoiceItem, PurchaseDocumentType, PurchaseInventoryEffect } from "@/src/modules/purchases/backend/domain/purchase-invoice";
import { FacturaItemsGrid, emptyItem } from "@/src/modules/purchases/frontend/components/factura-items-grid";
import { parseRateStr, roundRateValue, useBcvRate } from "@/src/modules/inventory/frontend/components/bcv-rate-input";
import type { ProductType, VatType } from "@/src/modules/inventory/backend/domain/product";
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
import { PeriodoContableInput } from "@/src/modules/inventory/frontend/components/periodo-contable-input";
import { SupplierCombobox } from "@/src/modules/purchases/frontend/components/supplier-combobox";
import { useInvoiceExchangeRates } from "@/src/modules/inventory/frontend/hooks/use-invoice-exchange-rates";
import { isLocalCurrency, normalizeCurrencyCode, type CurrencyCode } from "@/src/modules/inventory/shared/currency";
import { CurrencyCombobox } from "@/src/modules/inventory/frontend/components/currency-combobox";

// ── helpers ──────────────────────────────────────────────────────────────────

const fieldCls = [
    "w-full h-10 px-3 rounded-lg border border-border-default bg-surface-1 outline-none",
    "font-mono text-[14px] text-foreground tabular-nums",
    "focus:border-primary-500 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

// Subtle uppercase chip used as in-card group label. Reads as chrome — never
// content. Sits above each subgroup of fields inside the "Datos" card.
const groupLabelCls = "font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] font-semibold";

const makeFmt = (decimals: number) => (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const todayStr = () => getTodayIsoDate();

// ── QuickModal ────────────────────────────────────────────────────────────────

function QuickModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-[440px] max-h-[85vh] overflow-y-auto bg-surface-1 rounded-xl border border-border-medium shadow-2xl p-6">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-[14px] font-bold uppercase tracking-[0.14em] text-foreground">{title}</h3>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                        aria-label="Cerrar"
                    >
                        <X size={14} strokeWidth={2} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

// ── StatusChip ────────────────────────────────────────────────────────────────
// Small uppercase pill used in the page header + resumen header. Tone maps to
// the semantic badge tokens so it reads consistently across light/dark modes.

type ChipTone = "neutral" | "success" | "warning" | "info";

function StatusChip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
    const toneCls =
        tone === "success" ? "badge-success"
        : tone === "warning" ? "badge-warning"
        : tone === "info"    ? "badge-info"
        : "bg-surface-2 text-[var(--text-tertiary)] border-border-light";
    return (
        <span className={[
            "inline-flex items-center gap-1 px-2 h-6 rounded-md border",
            "font-mono text-[10px] font-bold uppercase tracking-[0.14em] whitespace-nowrap",
            toneCls,
        ].join(" ")}>
            {children}
        </span>
    );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function NuevaFacturaPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const draftIdParam = searchParams.get("draft");
    const { companyId } = useCompany();
    const {
        products, loadProducts,
        loadPeriodCloses,
        currentDollarRate,
        saveProduct,
        departments, loadDepartments,
        saveDepartment,
    } = useInventory();
    const {
        suppliers, loadSuppliers,
        savePurchaseInvoice, confirmPurchaseInvoice,
        loadPurchaseInvoice, loadPurchaseInvoices,
        deletePurchaseInvoice,
        currentPurchaseInvoice,
        purchaseInvoices,
        saveSupplier,
    } = usePurchases();

    // Form state
    const [supplierId, setSupplierId] = useState("");
    const [documentType, setDocumentType] = useState<PurchaseDocumentType>("factura");
    const [invoiceNumber, setInvoiceNumber] = useState("");
    const [controlNumber, setControlNumber] = useState("");
    const [affectedInvoiceNumber, setAffectedInvoiceNumber] = useState("");
    const [affectedInvoiceId, setAffectedInvoiceId] = useState<string | null>(null);
    const [affectedControlNumber, setAffectedControlNumber] = useState("");
    const [noteReason, setNoteReason] = useState("");
    const [inventoryEffect, setInventoryEffect] = useState<PurchaseInventoryEffect>("none");
    const [date, setDate] = useState(todayStr());
    const [invoiceCurrencyCode, setInvoiceCurrencyCode] = useState<CurrencyCode>("VES");
    const [applyCurrencyToAll, setApplyCurrencyToAll] = useState(true);
    const { options: currencyOptions, appliedRates, setAppliedRates, getRate, setManualRate, publishedDate, loading: currenciesLoading } = useInvoiceExchangeRates(date);
    const [notes, setNotes] = useState("");
    const {
        rate: dollarRate,
        decimals: rateDecimals,
        setRateFromApi,
        applyDecimals,
    } = useBcvRate();
    const [_rateDateBcv, setRateDateBcv] = useState<string | null>(null);
    const [rateLoading, setRateLoading] = useState(false);
    const [_rateError, setRateError] = useState<string | null>(null);
    const [items, setItems] = useState<PurchaseInvoiceItem[]>([emptyItem()]);
    const [periodo, setPeriodo] = useState<string>(() => date.slice(0, 7));
    const [periodoManual, setPeriodoManual] = useState<boolean>(false);
    const [headerAdj, setHeaderAdj] = useState<HeaderAdjustments>(() => emptyHeaderAdjustments());
    const [retencionIvaPct, setRetencionIvaPct] = useState<number>(0);
    const [impuestos, setImpuestos] = useState<InvoiceTax[]>([]);
    const [showHeaderAdj, setShowHeaderAdj] = useState<boolean>(false);

    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [savedId, setSavedId] = useState<string | null>(null);
    const [confirmed, setConfirmed] = useState(false);

    // Confirmation dialog + resume-draft banner
    const [showConfirm, setShowConfirm] = useState(false);
    const [pendingDraft, setPendingDraft] = useState<PurchaseInvoice | null>(null);
    const [resuming, setResuming] = useState(false);
    const [discarding, setDiscarding] = useState(false);
    const [draftLoaded, setDraftLoaded] = useState(false);

    // Quick-create state
    const [qcMode, setQcMode] = useState<'supplier' | 'product' | null>(null);
    const [qcSaving, setQcSaving] = useState(false);

    // Quick create supplier form
    const [qcSupplier, setQcSupplier] = useState({ name: '', rif: '' });

    // Quick create product form
    const [qcProduct, setQcProduct] = useState({ name: '', code: '', type: 'mercancia' as ProductType, vatType: 'general' as VatType, departmentId: '' });
    // Quick create department (nested inside product modal)
    const [qcDeptName, setQcDeptName] = useState('');
    const [qcDeptOpen, setQcDeptOpen] = useState(false);
    const [qcDeptSaving, setQcDeptSaving] = useState(false);

    useEffect(() => {
        if (companyId) {
            loadProducts(companyId);
            loadSuppliers(companyId);
            loadPeriodCloses(companyId);
            loadDepartments(companyId);
            loadPurchaseInvoices(companyId);
        }
    }, [companyId, loadProducts, loadSuppliers, loadPeriodCloses, loadDepartments, loadPurchaseInvoices]);

    // ── Resume-draft banner ───────────────────────────────────────────────────
    // Shows the most recent unconfirmed invoice for this company when the user
    // didn't open the page with `?draft=<id>` already. Reset whenever the
    // active company changes.
    useEffect(() => {
        if (draftIdParam || savedId || confirmed || draftLoaded) {
            setPendingDraft(null);
            return;
        }
        const drafts = purchaseInvoices
            .filter((i) => i.status === "borrador" && i.companyId === companyId)
            .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
        setPendingDraft(drafts[0] ?? null);
    }, [purchaseInvoices, draftIdParam, savedId, confirmed, draftLoaded, companyId]);

    // ── Load draft from `?draft=<id>` ─────────────────────────────────────────
    useEffect(() => {
        if (!draftIdParam || !companyId || draftLoaded) return;
        loadPurchaseInvoice(draftIdParam);
    }, [draftIdParam, companyId, draftLoaded, loadPurchaseInvoice]);

    // Prefill the form once `currentPurchaseInvoice` matches the requested draft.
    useEffect(() => {
        if (!draftIdParam || draftLoaded) return;
        const inv = currentPurchaseInvoice;
        if (!inv || inv.id !== draftIdParam) return;

        setSupplierId(inv.supplierId ?? "");
        setDocumentType(inv.documentType ?? "factura");
        setInvoiceNumber(inv.invoiceNumber ?? "");
        setControlNumber(inv.controlNumber ?? "");
        setAffectedInvoiceNumber(inv.affectedInvoiceNumber ?? "");
        setAffectedInvoiceId(inv.affectedInvoiceId ?? null);
        setAffectedControlNumber(inv.affectedControlNumber ?? "");
        setNoteReason(inv.noteReason ?? "");
        setInventoryEffect(inv.inventoryEffect ?? "none");
        setDate(inv.date ?? todayStr());
        setInvoiceCurrencyCode(normalizeCurrencyCode(inv.currency));
        setAppliedRates(inv.exchangeRates ?? []);
        setPeriodo(inv.period ?? (inv.date ?? todayStr()).slice(0, 7));
        setPeriodoManual(Boolean(inv.periodoManual || (inv.period && inv.date && inv.period !== inv.date.slice(0, 7))));
        setNotes(inv.notes ?? "");
        const loadedItems = (inv.items && inv.items.length > 0) ? inv.items : [emptyItem()];
        setItems(loadedItems);
        setHeaderAdj({
            descuentoTipo:  inv.descuentoTipo  ?? null,
            descuentoValor: inv.descuentoValor ?? 0,
            descuentoMoneda: inv.descuentoMoneda ?? 'B',
            recargoTipo:    inv.recargoTipo    ?? null,
            recargoValor:   inv.recargoValor   ?? 0,
            recargoMoneda: inv.recargoMoneda ?? 'B',
        });
        setRetencionIvaPct(inv.retencionIvaPct ?? 0);
        setImpuestos(inv.impuestos ?? []);
        if (inv.dollarRate != null) {
            const decimals = inv.rateDecimals ?? rateDecimals;
            applyDecimals(decimals);
            setRateFromApi(inv.dollarRate, decimals);
        }
        const hasAdj =
            (inv.descuentoTipo && (inv.descuentoValor ?? 0) > 0) ||
            (inv.recargoTipo   && (inv.recargoValor   ?? 0) > 0) ||
            (inv.retencionIvaPct ?? 0) > 0 ||
            (inv.impuestos && inv.impuestos.length > 0);
        if (hasAdj) setShowHeaderAdj(true);

        setSavedId(inv.id ?? null);
        setDraftLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPurchaseInvoice, draftIdParam]);

    // Pre-fill rate from last period close when closes load (only if BCV hasn't filled it)
    useEffect(() => {
        if (currentDollarRate != null && dollarRate === "" && !rateLoading) {
            setRateFromApi(currentDollarRate, rateDecimals);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDollarRate]);

    // Auto-fetch BCV rate when date changes
    useEffect(() => {
        if (!date) return;
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
            .catch(() => {
                if (!cancelled) {
                    setRateError("Error al consultar BCV");
                    setRateDateBcv(null);
                }
            })
            .finally(() => { if (!cancelled) setRateLoading(false); });
        return () => { cancelled = true; };
    // Auto-fetch on date change only; `rateDecimals` shouldn't retrigger a fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date]);

    const preciseLineDollarRate = items
        .map((item) => !isLocalCurrency(item.currency) && item.dollarRate != null && item.dollarRate > 0 ? item.dollarRate : null)
        .find((rate): rate is number => rate != null);
    const effectiveDollarRate = (() => {
        const typedRate = parseRateStr(dollarRate);
        const lineRateMatchesDisplay = preciseLineDollarRate != null && (
            typedRate == null || roundRateValue(preciseLineDollarRate, rateDecimals) === roundRateValue(typedRate, rateDecimals)
        );
        const calculationRate = lineRateMatchesDisplay ? preciseLineDollarRate : typedRate;
        return getRate(invoiceCurrencyCode) ?? (isFinite(calculationRate ?? NaN) ? roundRateValue(calculationRate as number, 4) : null);
    })();
    const invoiceCurrency = invoiceCurrencyCode;
    // Derived totals — computed by shared math (computeInvoiceTotals)
    const lineInputs: LineInput[] = items.map((i) => ({
        quantity: i.quantity ?? 0,
        unitCost: i.unitCost ?? 0,
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
    const totals = computeInvoiceTotals(lineInputs, headerAdj, rateDecimals, retencionIvaPct, impuestos, 1, "VES", getRate);
    const fmtN = makeFmt(rateDecimals);
    const {
        subtotalBruto, descuentoLinea, recargoLinea,
        descuentoHeader, recargoHeader,
        baseIVA, ivaPorAlicuota, ivaMonto, total,
        impuestos: resolvedImpuestos, totalImpuestos,
        retencionIva, totalAPagar,
    } = totals;
    const subtotal  = baseIVA;       // legacy alias used by header rollup
    const vatAmount = ivaMonto;      // legacy alias
    const heroTotal = total + totalImpuestos;
    const baseExempt  = lineInputs.reduce((acc, l, idx) => l.vatRate === "exenta"     ? acc + totals.items[idx].baseIVAFinal : acc, 0);
    const baseTaxed8  = lineInputs.reduce((acc, l, idx) => l.vatRate === "reducida_8" ? acc + totals.items[idx].baseIVAFinal : acc, 0);
    const baseTaxed16 = lineInputs.reduce((acc, l, idx) => l.vatRate === "general_16" ? acc + totals.items[idx].baseIVAFinal : acc, 0);
    const vat8  = ivaPorAlicuota.reducida_8;
    const vat16 = ivaPorAlicuota.general_16;
    const hasRetencion = retencionIvaPct > 0 && retencionIva > 0;
    const hasImpuestos = totalImpuestos > 0;
    const headerAdjActive =
        (headerAdj.descuentoTipo != null && headerAdj.descuentoValor > 0) ||
        (headerAdj.recargoTipo   != null && headerAdj.recargoValor   > 0) ||
        retencionIvaPct > 0 ||
        impuestos.length > 0;

    const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? null;
    const itemCount = items.filter((i) => i.productId).length;

    const affectedInvoiceCandidates = useMemo(() => purchaseInvoices
        .filter((invoice) => invoice.id !== savedId && invoice.status === "confirmada" && invoice.documentType !== "nota_credito" && (!supplierId || invoice.supplierId === supplierId))
        .slice(0, 200), [purchaseInvoices, savedId, supplierId]);

    const handleAffectedInvoiceNumberChange = useCallback((value: string) => {
        setAffectedInvoiceNumber(value);
        const normalized = value.trim().toLowerCase();
        const match = affectedInvoiceCandidates.find((invoice) => invoice.invoiceNumber.trim().toLowerCase() === normalized);
        setAffectedInvoiceId(match?.id ?? null);
        if (match?.controlNumber) setAffectedControlNumber(match.controlNumber);
    }, [affectedInvoiceCandidates]);

    const documentSign = documentType === "nota_credito" ? -1 : 1;
    const buildInvoice = useCallback((): PurchaseInvoice => ({
        companyId:     companyId!,
        supplierId,
        documentType,
        invoiceNumber,
        controlNumber,
        affectedInvoiceId: documentType === "factura" ? null : affectedInvoiceId,
        affectedInvoiceNumber: documentType === "factura" ? null : affectedInvoiceNumber || null,
        affectedControlNumber: documentType === "factura" ? null : affectedControlNumber || null,
        noteReason: documentType === "factura" ? null : noteReason || null,
        inventoryEffect: documentType === "factura" ? "additional_purchase" : inventoryEffect,
        date,
        period:        periodoManual && periodo ? periodo : date.slice(0, 7),
        periodoManual,
        currency: invoiceCurrency,
        exchangeRates: appliedRates,
        status:        "borrador",
        subtotal:      subtotal * documentSign,
        vatPercentage: 0,
        vatAmount:     vatAmount * documentSign,
        total:         total * documentSign,
        notes,
        dollarRate:    getRate(invoiceCurrency),
        rateDecimals,
        descuentoTipo:  headerAdj.descuentoTipo,
        descuentoValor: headerAdj.descuentoValor,
        descuentoMoneda: headerAdj.descuentoMoneda,
        descuentoMonto: descuentoHeader,
        recargoTipo:    headerAdj.recargoTipo,
        recargoValor:   headerAdj.recargoValor,
        recargoMoneda: headerAdj.recargoMoneda,
        recargoMonto:   recargoHeader,
        retencionIvaPct,
        retencionIvaMonto: retencionIva,
        impuestos: resolvedImpuestos,
    }), [companyId, supplierId, documentType, invoiceNumber, controlNumber, affectedInvoiceId, affectedInvoiceNumber, affectedControlNumber, noteReason, inventoryEffect, date, periodo, periodoManual, invoiceCurrency, appliedRates, getRate, subtotal, vatAmount, total, notes, rateDecimals, headerAdj, descuentoHeader, recargoHeader, retencionIvaPct, retencionIva, resolvedImpuestos, documentSign]);

    // Items con montos resueltos para persistir (descuentoMonto, recargoMonto,
    // baseIVA reflejan el spread proporcional del header).
    // Filtramos filas en blanco (productId vacío o cantidad ≤ 0) para que el
    // autosave no dispare FK violations contra inventario_facturas_compra_items.
    const itemsForSave = useCallback((): PurchaseInvoiceItem[] => items
        .map((it, idx) => {
            const t = totals.items[idx];
            return {
                ...it,
                descuentoMonto: t.descuentoMonto,
                recargoMonto:   t.recargoMonto,
                baseIVA: t.baseIVAFinal,
                unitCost: t.base / Math.max(1, it.quantity),
                totalCost: t.base,
            };
        })
        .filter((it) => it.productId && it.quantity > 0),
        [items, totals]);

    // ── Auto-save ─────────────────────────────────────────────────────────────
    // Snapshots only the user-editable shape so the watcher fires on real
    // edits, not on every render. Keys are flattened to avoid deep diffs.
    const autosavePayload = useMemo(() => ({
        supplierId, documentType, invoiceNumber, controlNumber, affectedInvoiceId, affectedInvoiceNumber, affectedControlNumber, noteReason, inventoryEffect, date, periodo, periodoManual, notes,
        rate: effectiveDollarRate, rateDecimals, retencionIvaPct,
        headerAdj: {
            d: headerAdj.descuentoTipo, dv: headerAdj.descuentoValor, dm: headerAdj.descuentoMoneda,
            r: headerAdj.recargoTipo,   rv: headerAdj.recargoValor, rm: headerAdj.recargoMoneda,
        },
        impuestos: impuestos.map((t) => ({
            n: t.nombre, t: t.tipo, v: t.valor, m: t.moneda, b: t.base,
        })),
        items: items.map((it) => ({
            p: it.productId, q: it.quantity, c: it.unitCost, cc: it.currencyCost ?? null,
            cur: it.currency, v: it.vatRate,
            dt: it.descuentoTipo ?? null, dv: it.descuentoValor ?? 0, dm: it.descuentoMoneda ?? 'B',
            rt: it.recargoTipo   ?? null, rv: it.recargoValor   ?? 0, rm: it.recargoMoneda ?? 'B',
        })),
    }), [supplierId, documentType, invoiceNumber, controlNumber, affectedInvoiceId, affectedInvoiceNumber, affectedControlNumber, noteReason, inventoryEffect, date, periodo, periodoManual, notes,
        effectiveDollarRate, rateDecimals, retencionIvaPct, headerAdj, impuestos, items]);

    const autosaveSave = useCallback(async () => {
        const invoice = buildInvoice();
        if (savedId) invoice.id = savedId;
        const saved = await savePurchaseInvoice(invoice, itemsForSave());
        if (saved?.id) setSavedId(saved.id);
        return saved?.id ?? null;
    }, [buildInvoice, itemsForSave, savedId, savePurchaseInvoice]);

    const autosave = useDebouncedAutoSave({
        payload: autosavePayload,
        save: autosaveSave,
        isValid: () => Boolean(supplierId && companyId && (documentType !== "factura" || items.some((it) => it.productId && it.quantity > 0))),
        enabled: !confirmed,
        delayMs: 2000,
    });

    function validate(): boolean {
        if (!supplierId) { notify.error("Selecciona un proveedor"); return false; }
        if (documentType !== "factura" && !affectedInvoiceNumber.trim()) {
            notify.error("Indica la factura afectada por la nota"); return false;
        }
        if (documentType === "factura" && itemsForSave().length === 0) {
            notify.error("Agrega al menos un producto con cantidad mayor a 0");
            return false;
        }
        return true;
    }

    async function handleSaveDraft() {
        if (!validate()) return;
        setSaving(true);
        await autosave.flush();
        setSaving(false);
    }

    function handleOpenConfirm() {
        if (!validate()) return;
        setShowConfirm(true);
    }

    async function handleConfirmInvoice() {
        setConfirming(true);
        // Flush any pending autosave before committing.
        await autosave.flush();
        const idToConfirm = savedId;
        if (!idToConfirm) {
            // Fallback: save synchronously if autosave didn't have a chance to run.
            const invoice = buildInvoice();
            const saved = await savePurchaseInvoice(invoice, itemsForSave());
            if (!saved) { setConfirming(false); return; }
            setSavedId(saved.id!);
            const confirmedInvoice = await confirmPurchaseInvoice(saved.id!);
            setConfirming(false);
            setShowConfirm(false);
            if (confirmedInvoice) {
                setConfirmed(true);
                setSavedId(confirmedInvoice.id!);
            }
            return;
        }
        const confirmedInvoice = await confirmPurchaseInvoice(idToConfirm);
        setConfirming(false);
        setShowConfirm(false);
        if (confirmedInvoice) {
            setConfirmed(true);
            setSavedId(confirmedInvoice.id!);
        }
    }

    // ── Resume / discard banner handlers ──────────────────────────────────────
    function handleResumeDraft() {
        if (!pendingDraft?.id) return;
        setResuming(true);
        router.replace(`/purchases/new?draft=${pendingDraft.id}`);
        // The effect watching `draftIdParam` will load + prefill.
        // `setResuming(false)` happens implicitly when the URL change re-mounts
        // the page state. Leave the flag to prevent double-clicks during
        // navigation.
    }

    async function handleDiscardDraft() {
        if (!pendingDraft?.id) return;
        setDiscarding(true);
        const ok = await deletePurchaseInvoice(pendingDraft.id);
        setDiscarding(false);
        if (ok) {
            setPendingDraft(null);
            notify.info("Borrador descartado");
        }
    }

    async function handleQcSupplier() {
        if (!qcSupplier.name.trim()) { notify.error('El nombre es requerido'); return; }
        setQcSaving(true);
        const saved = await saveSupplier({ companyId: companyId!, name: qcSupplier.name.trim(), rif: qcSupplier.rif.trim(), contact: '', phone: '', email: '', address: '', notes: '', active: true });
        setQcSaving(false);
        if (saved) {
            setSupplierId(saved.id!);
            setQcMode(null);
            setQcSupplier({ name: '', rif: '' });
        }
    }

    async function handleQcDepartment() {
        if (!qcDeptName.trim()) return;
        setQcDeptSaving(true);
        const saved = await saveDepartment({ companyId: companyId!, name: qcDeptName.trim(), description: '', active: true });
        setQcDeptSaving(false);
        if (saved) {
            setQcProduct(p => ({ ...p, departmentId: saved.id! }));
            setQcDeptName('');
            setQcDeptOpen(false);
        }
    }

    async function handleQcProduct() {
        if (!qcProduct.name.trim()) { notify.error('El nombre del producto es requerido'); return; }
        setQcSaving(true);
        const saved = await saveProduct({
            companyId: companyId!,
            name: qcProduct.name.trim(),
            code: qcProduct.code.trim(),
            description: '',
            type: qcProduct.type,
            measureUnit: 'unidad',
            valuationMethod: 'promedio_ponderado',
            currentStock: 0,
            averageCost: 0,
            active: true,
            vatType: qcProduct.vatType,
            departmentId: qcProduct.departmentId || undefined,
        });
        setQcSaving(false);
        if (saved) {
            setQcMode(null);
            setQcProduct({ name: '', code: '', type: 'mercancia', vatType: 'general', departmentId: '' });
        }
    }

    if (confirmed && savedId) {
        const period = (periodoManual && periodo) || date.slice(0, 7);
        return (
            <div className="min-h-full bg-surface-2 font-mono">
                <PageHeader title="Nueva Factura de Compra" subtitle="Registro completado">
                    <CompanyContextPill />
                    <StatusChip tone="success">
                        <CheckCircle2 size={10} strokeWidth={2.5} />
                        Confirmada
                    </StatusChip>
                </PageHeader>

                <div className="px-8 py-10 flex justify-center">
                    <div className="w-full max-w-xl rounded-xl border border-border-light bg-surface-1 shadow-sm overflow-hidden">
                        {/* Success banner */}
                        <div className="px-6 py-5 border-b border-border-light bg-[var(--badge-success-bg)]/40 flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-[var(--badge-success-bg)] border border-[var(--badge-success-border)] flex items-center justify-center text-[var(--text-success)] flex-shrink-0">
                                <CheckCircle2 size={20} strokeWidth={2} />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-[14px] font-bold uppercase tracking-[0.14em] text-foreground">
                                    Factura confirmada
                                </h2>
                                <p className="text-[12px] text-[var(--text-secondary)] font-sans leading-snug mt-0.5">
                                    Entradas registradas en el período {period}. Las existencias ya reflejan el movimiento.
                                </p>
                            </div>
                        </div>

                        {/* Meta */}
                        <dl className="px-6 py-4 space-y-2.5 text-[13px]">
                            <div className="flex justify-between gap-3">
                                <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">{documentType === "factura" ? "Nº Factura" : documentType === "nota_credito" ? "Nº Nota de crédito" : "Nº Nota de débito"}</dt>
                                <dd className="text-foreground font-medium tabular-nums">{invoiceNumber || "—"}</dd>
                            </div>
                            {controlNumber && (
                                <div className="flex justify-between gap-3">
                                    <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Nº Control</dt>
                                    <dd className="text-foreground font-medium tabular-nums">{controlNumber}</dd>
                                </div>
                            )}
                            <div className="flex justify-between gap-3">
                                <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Proveedor</dt>
                                <dd className="text-foreground font-medium truncate max-w-[60%] text-right">
                                    {supplierName ?? "—"}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Fecha</dt>
                                <dd className="text-foreground tabular-nums">{date || "—"}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Ítems</dt>
                                <dd className="text-foreground tabular-nums">{itemCount}</dd>
                            </div>
                            {effectiveDollarRate && (
                                <div className="flex justify-between gap-3">
                                    <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Tasa BCV</dt>
                                    <dd className="text-foreground tabular-nums">
                                        {effectiveDollarRate.toLocaleString("es-VE", { minimumFractionDigits: rateDecimals, maximumFractionDigits: rateDecimals })} Bs/{invoiceCurrencyCode}
                                    </dd>
                                </div>
                            )}
                        </dl>

                        {/* Total */}
                        <div className="px-6 py-4 border-t border-border-light bg-surface-2/40">
                            <div className="flex items-baseline justify-between">
                                <span className="text-foreground uppercase tracking-[0.14em] text-[11px] font-bold">Total</span>
                                <span className="tabular-nums font-bold text-foreground text-[24px] tracking-tight">
                                    Bs. {fmtN(total)}
                                </span>
                            </div>
                            {effectiveDollarRate && total > 0 && (
                                <div className="flex items-baseline justify-between mt-0.5">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">≈ {invoiceCurrencyCode}</span>
                                    <span className="tabular-nums text-[var(--text-tertiary)] text-[13px] font-semibold">
                                        ${fmtN(total / effectiveDollarRate)}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="px-6 py-4 border-t border-border-light flex items-center gap-3 flex-wrap">
                            <BaseButton.Root
                                variant="secondary"
                                size="md"
                                onClick={() => router.push(`/inventory/movements?periodo=${period}`)}
                            >
                                Ver movimientos
                            </BaseButton.Root>
                            <BaseButton.Root
                                variant="primary"
                                size="md"
                                rightIcon={<ArrowRight size={14} strokeWidth={2} />}
                                onClick={() => router.push("/purchases")}
                                className="ml-auto"
                            >
                                Ver facturas
                            </BaseButton.Root>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Nueva Factura de Compra" subtitle="Registrar compra a proveedor">
                <CompanyContextPill />
                <AutoSaveStatusPill state={autosave} />
                <BaseButton.Root
                    variant="secondary"
                    size="md"
                    leftIcon={<ChevronLeft size={14} strokeWidth={2} />}
                    onClick={() => router.back()}
                >
                    Volver
                </BaseButton.Root>
            </PageHeader>

            <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 xl:px-8">

                {pendingDraft && (
                    <div className="mb-4">
                        <ResumeDraftBanner
                            timestampLabel={formatDraftTimestamp(pendingDraft.updatedAt ?? pendingDraft.createdAt ?? "")}
                            summary={pendingDraftSummary(pendingDraft)}
                            onResume={handleResumeDraft}
                            onDiscard={handleDiscardDraft}
                            resuming={resuming}
                            discarding={discarding}
                        />
                    </div>
                )}

                <div className="flex flex-col gap-4">
                    {/* Row 1 — Datos de la factura + Resumen */}
                    <div className="contents">
                        {/* Datos de la factura */}
                        <InvoiceSectionCard className="order-1" title="Datos de la factura" subtitle="Identifica el comprobante y define cómo entra al período contable." bodyClassName="">

                            {/* ── Group 1 · Identificación ───────────────────────── */}
                            <div className="px-6 pt-5 pb-5">
                                <div className="mb-3 flex items-center gap-2">
                                    <span className={groupLabelCls}>Identificación</span>
                                    <span className="flex-1 h-px bg-border-light" />
                                </div>

                                {/* Proveedor (span 2) + Nº Factura */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="col-span-2">
                                        <label className={labelCls}>Tipo de documento <span className="text-error/80">*</span></label>
                                        <select className={`${fieldCls} mb-4`} value={documentType} onChange={(e) => setDocumentType(e.target.value as PurchaseDocumentType)}>
                                            <option value="factura">Factura de compra</option>
                                            <option value="nota_credito">Nota de crédito</option>
                                            <option value="nota_debito">Nota de débito</option>
                                        </select>
                                        <label className={labelCls}>
                                            Proveedor <span className="text-error/80">*</span>
                                        </label>
                                        <div className="flex gap-2">
                                            <SupplierCombobox
                                                supplierId={supplierId}
                                                suppliers={suppliers}
                                                onChange={setSupplierId}
                                                onRequestCreate={(search) => {
                                                    setQcSupplier(s => ({ ...s, name: search }));
                                                    setQcMode('supplier');
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => { setQcSupplier({ name: '', rif: '' }); setQcMode('supplier'); }}
                                                className="h-10 w-10 shrink-0 rounded-lg border border-border-default bg-surface-1 hover:bg-surface-2 hover:border-border-medium text-[var(--text-tertiary)] hover:text-foreground transition-colors flex items-center justify-center"
                                                title="Crear nuevo proveedor"
                                                aria-label="Crear nuevo proveedor"
                                            >
                                                <Plus size={14} strokeWidth={2} />
                                            </button>
                                        </div>
                                    </div>
                                    <BaseInput.Field
                                        label={documentType === "factura" ? "Nº Factura" : documentType === "nota_credito" ? "Nº Nota de crédito" : "Nº Nota de débito"}
                                        isRequired
                                        value={invoiceNumber}
                                        onValueChange={setInvoiceNumber}
                                        placeholder="0001-00123456"
                                    />
                                </div>

                                {/* Nº Control — single column, half-width on its own row */}
                                {documentType !== "factura" && (
                                    <div className="mt-4 rounded-lg border border-border-light bg-surface-2/40 p-4">
                                        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Documento afectado</div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <BaseInput.Field
                                                label="Nº factura afectada"
                                                isRequired
                                                value={affectedInvoiceNumber}
                                                onValueChange={handleAffectedInvoiceNumberChange}
                                                list="affected-invoice-options"
                                                helperText={affectedInvoiceId ? "Factura vinculada correctamente" : "Escribe el número y selecciónalo de las facturas existentes"}
                                            />
                                            <datalist id="affected-invoice-options">
                                                {affectedInvoiceCandidates.map((invoice) => (
                                                    <option key={invoice.id} value={invoice.invoiceNumber}>
                                                        {invoice.controlNumber ? `Control ${invoice.controlNumber}` : ""}
                                                    </option>
                                                ))}
                                            </datalist>
                                            <BaseInput.Field label="Control afectado" value={affectedControlNumber} onValueChange={setAffectedControlNumber} placeholder="Opcional" />
                                            <div>
                                                <label className={labelCls}>Efecto en inventario</label>
                                                <select className={fieldCls} value={inventoryEffect} onChange={(e) => setInventoryEffect(e.target.value as PurchaseInventoryEffect)}>
                                                    <option value="none">Solo ajuste fiscal/financiero</option>
                                                    {documentType === "nota_credito"
                                                        ? <option value="return_to_supplier">Devolución al proveedor</option>
                                                        : <option value="additional_purchase">Entrada adicional</option>}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="mt-3">
                                            <BaseInput.Field label="Motivo de la nota" value={noteReason} onValueChange={setNoteReason} placeholder="Ej. devolución de mercancía" />
                                        </div>
                                    </div>
                                )}

                                <div className="mt-4 grid grid-cols-3 gap-4">
                                    <BaseInput.Field
                                        label="Nº Control"
                                        value={controlNumber}
                                        onValueChange={setControlNumber}
                                        placeholder="00-00123456"
                                    />
                                </div>
                            </div>

                            {/* ── Group 2 · Fechas y tasa ────────────────────────── */}
                            <div className="px-6 pt-5 pb-5 border-t border-border-light">
                                <div className="mb-3 flex items-center gap-2">
                                    <span className={groupLabelCls}>Fechas y tasa</span>
                                    <span className="flex-1 h-px bg-border-light" />
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <BaseInput.Field
                                        label="Fecha"
                                        type="date"
                                        value={date}
                                        onValueChange={setDate}
                                    />
                                    <PeriodoContableInput
                                        fecha={date}
                                        periodo={periodo}
                                        periodoManual={periodoManual}
                                        onChange={(p, manual) => { setPeriodo(p); setPeriodoManual(manual); }}
                                    />
                                    <CurrencyCombobox label="Moneda principal" options={currencyOptions} value={invoiceCurrencyCode} onChange={(value) => {
                                            const next = normalizeCurrencyCode(value);
                                            setInvoiceCurrencyCode(next);
                                        }} disabled={currenciesLoading} />
                                    {!isLocalCurrency(invoiceCurrencyCode) && <BaseInput.Field label={`Tasa · Bs/${invoiceCurrencyCode}`} type="number" min="0" step="0.0001" value={getRate(invoiceCurrencyCode) ? String(getRate(invoiceCurrencyCode)) : ""} onValueChange={(value) => setManualRate(invoiceCurrencyCode, Number(String(value).replace(",", ".")) || 0)} description={publishedDate ? `BCV ${publishedDate}` : "Tasa manual"} />}
                                </div>

                                <div className="mt-3 flex items-start gap-1.5">
                                    <Info size={12} strokeWidth={2} className="mt-[2px] flex-shrink-0 text-[var(--text-tertiary)]" />
                                    <p className="text-[11px] font-sans text-[var(--text-tertiary)] leading-snug">
                                        La <span className="font-mono uppercase tracking-[0.10em] text-[10px]">fecha</span> determina la tasa BCV consultada. El <span className="font-mono uppercase tracking-[0.10em] text-[10px]">período</span> define a qué mes contable entran las existencias al confirmar.
                                    </p>
                                </div>
                            </div>

                            {/* ── Group 3 · Notas ────────────────────────────────── */}
                            <div className="px-6 pt-5 pb-5 border-t border-border-light">
                                <div className="mb-3 flex items-center gap-2">
                                    <span className={groupLabelCls}>Notas</span>
                                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]/70">opcional</span>
                                    <span className="flex-1 h-px bg-border-light" />
                                </div>
                                <textarea
                                    className={`${fieldCls} h-auto py-2.5 resize-none leading-snug`}
                                    rows={3}
                                    maxLength={500}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Observaciones internas: condiciones de pago, retenciones aplicadas, referencia de orden de compra…"
                                />
                                <div className="mt-1.5 flex items-center justify-end">
                                    <span className="font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]/70">
                                        {notes.length} / 500
                                    </span>
                                </div>
                            </div>

                            {/* ── Group 4 · Ajustes (collapsible) ───────────────── */}
                            <div className="px-6 pt-5 pb-5 border-t border-border-light">
                                <button
                                    type="button"
                                    onClick={() => setShowHeaderAdj((v) => !v)}
                                    aria-expanded={showHeaderAdj}
                                    className={[
                                        "w-full flex items-center justify-between gap-3 px-3.5 h-11 rounded-lg",
                                        "border bg-surface-1 transition-colors text-left",
                                        showHeaderAdj || headerAdjActive
                                            ? "border-border-medium hover:border-border-strong"
                                            : "border-border-default hover:border-border-medium hover:bg-surface-2/50",
                                    ].join(" ")}
                                >
                                    <span className="flex items-center gap-2.5 min-w-0">
                                        <ChevronDown
                                            size={13}
                                            strokeWidth={2.4}
                                            className={[
                                                "text-[var(--text-tertiary)] transition-transform duration-150 flex-shrink-0",
                                                showHeaderAdj ? "rotate-0" : "-rotate-90",
                                            ].join(" ")}
                                        />
                                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground font-bold">
                                            Ajustes de factura
                                        </span>
                                        {headerAdjActive && (
                                            <span className="badge-info inline-flex items-center h-5 px-1.5 rounded border font-mono text-[9px] font-bold uppercase tracking-[0.14em] whitespace-nowrap">
                                                Activo
                                            </span>
                                        )}
                                    </span>
                                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] hidden sm:inline whitespace-nowrap">
                                        Descuento · Recargo · Impuestos · Retención
                                    </span>
                                </button>
                                {showHeaderAdj && (
                                    <div className="mt-3 px-4 py-3.5 rounded-lg border border-border-light bg-surface-2/40 space-y-4">
                                        <div>
                                            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] mb-3">
                                                Se prorratean por línea según base IVA
                                            </p>
                                            <HeaderAdjustmentsSection value={headerAdj} onChange={setHeaderAdj} dollarRate={effectiveDollarRate} currencyOptions={currencyOptions} />
                                        </div>
                                        <div className="pt-3 border-t border-border-light/60">
                                            <InvoiceTaxesSection
                                                value={impuestos}
                                                dollarRate={effectiveDollarRate}
                                                currencyOptions={currencyOptions}
                                                getExchangeRate={getRate}
                                                onChange={setImpuestos}
                                                baseIVA={baseIVA}
                                                total={total}
                                                decimals={rateDecimals}
                                            />
                                        </div>
                                        <div className="pt-3 border-t border-border-light/60">
                                            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] mb-3">
                                                Se aplica POST-IVA y reduce el total a pagar al proveedor
                                            </p>
                                            <IvaRetencionToggle value={retencionIvaPct} onChange={setRetencionIvaPct} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </InvoiceSectionCard>

                        {/* Resumen — same row as Datos */}
                        <aside className="order-3 w-full">
                            <InvoiceSummaryCard status="draft" contentClassName="p-0">

                                {/* Meta */}
                                <dl className="px-5 py-3.5 space-y-2 text-[12px]">
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">Proveedor</dt>
                                        <dd className="text-foreground font-medium truncate text-right max-w-[60%]">
                                            {supplierName ?? "—"}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">{documentType === "factura" ? "Nº Factura" : documentType === "nota_credito" ? "Nº Nota de crédito" : "Nº Nota de débito"}</dt>
                                        <dd className="text-foreground tabular-nums truncate text-right max-w-[60%]">
                                            {invoiceNumber || "—"}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">Fecha</dt>
                                        <dd className="text-foreground tabular-nums">{date || "—"}</dd>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">Período</dt>
                                        <dd className="flex items-center gap-1.5">
                                            <span className="text-foreground tabular-nums">{(periodoManual && periodo) || date.slice(0, 7) || "—"}</span>
                                            {periodoManual && periodo && periodo !== date.slice(0, 7) && (
                                                <span className="px-1 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-600 font-mono text-[8px] uppercase tracking-[0.12em] font-bold">
                                                    Manual
                                                </span>
                                            )}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">Tasa BCV</dt>
                                        <dd className="text-foreground tabular-nums">
                                            {effectiveDollarRate
                                                ? effectiveDollarRate.toLocaleString("es-VE", { minimumFractionDigits: rateDecimals, maximumFractionDigits: rateDecimals })
                                                : "—"}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">Ítems</dt>
                                        <dd className="text-foreground tabular-nums">{itemCount}</dd>
                                    </div>
                                </dl>

                                {/* Compact breakdown row — Bs above, USD below.
                                    Same renderer used for ajustes, alícuotas y rollup. */}
                                {(() => {
                                    const usd = (n: number) =>
                                        effectiveDollarRate && effectiveDollarRate > 0
                                            ? `≈ $ ${fmtN(n / effectiveDollarRate)}`
                                            : null;
                                    type Tone = "muted" | "neutral" | "neg" | "pos" | "warn";
                                    const valueColor: Record<Tone, string> = {
                                        muted:   "text-[var(--text-secondary)]",
                                        neutral: "text-[var(--text-secondary)]",
                                        neg:     "text-error/80 font-medium",
                                        pos:     "text-amber-600 font-medium",
                                        warn:    "text-[var(--text-warning)] font-medium",
                                    };
                                    const breakdownRow = (
                                        label: string,
                                        value: number,
                                        opts: { tone?: Tone; sign?: "+" | "−"; note?: string; indent?: boolean } = {},
                                    ) => {
                                        const { tone = "muted", sign, note, indent } = opts;
                                        return (
                                            <div className="flex justify-between items-baseline gap-3">
                                                <dt className={`text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px] ${indent ? "pl-2.5" : ""}`}>
                                                    {label}
                                                    {note && (
                                                        <span className="ml-1.5 normal-case tracking-normal text-[9px] opacity-80">
                                                            {note}
                                                        </span>
                                                    )}
                                                </dt>
                                                <dd className="text-right">
                                                    <div className={`tabular-nums ${valueColor[tone]}`}>
                                                        {sign && <span className="opacity-60 mr-0.5">{sign}</span>}
                                                        Bs. {fmtN(value)}
                                                    </div>
                                                    {usd(value) && (
                                                        <div className="tabular-nums text-[9px] text-[var(--text-tertiary)] mt-0.5">
                                                            {sign && <span className="opacity-60 mr-0.5">{sign}</span>}
                                                            {usd(value)}
                                                        </div>
                                                    )}
                                                </dd>
                                            </div>
                                        );
                                    };

                                    // ── Same view-shape rules as the detail page ─────────────
                                    // Collapse rows that hold the same value as a sibling. The
                                    // intermediate "Base IVA" only earns its keep when there are
                                    // adjustments OR mixed alícuotas.
                                    const hasAdj = (descuentoLinea > 0 || recargoLinea > 0 || descuentoHeader > 0 || recargoHeader > 0);
                                    const aliquotCount =
                                        (baseExempt  > 0 ? 1 : 0) +
                                        (baseTaxed8  > 0 ? 1 : 0) +
                                        (baseTaxed16 > 0 ? 1 : 0);
                                    const isOnlyExempt   = aliquotCount === 1 && baseExempt > 0;
                                    const isMixed        = aliquotCount > 1;
                                    const hasIva         = vatAmount > 0;
                                    const hasMultipleTaxedAlicuotas = (vat8 > 0 && vat16 > 0);

                                    const showAdjustmentSection = hasAdj;
                                    const showBaseIntermediate  = hasAdj || isMixed;
                                    const showAlicuotaBreakdown = isMixed;

                                    const singleAliquotaLabel: string =
                                        isOnlyExempt ? "exenta"
                                        : baseTaxed8 > 0 ? "gravada 8%"
                                        : "gravada 16%";

                                    return (
                                        <>
                                            {showAdjustmentSection && (
                                                <dl className="px-5 py-3 border-t border-border-light bg-surface-2/40 space-y-2 text-[12px]">
                                                    {breakdownRow("Subtotal bruto", subtotalBruto, { tone: "muted", note: "Σ qty × costo" })}
                                                    {descuentoLinea  > 0 && breakdownRow("Descuento líneas",  descuentoLinea,  { tone: "neg", sign: "−", indent: true })}
                                                    {descuentoHeader > 0 && breakdownRow("Descuento factura", descuentoHeader, { tone: "neg", sign: "−", indent: true, note: "prorrateado" })}
                                                    {recargoLinea    > 0 && breakdownRow("Recargo líneas",    recargoLinea,    { tone: "pos", sign: "+", indent: true })}
                                                    {recargoHeader   > 0 && breakdownRow("Recargo factura",   recargoHeader,   { tone: "pos", sign: "+", indent: true, note: "prorrateado" })}
                                                </dl>
                                            )}

                                            <dl className="px-5 py-3 border-t border-border-light space-y-2 text-[12px]">
                                                {showBaseIntermediate ? (
                                                    isOnlyExempt
                                                        ? breakdownRow("Base imponible", subtotal, {
                                                              tone: "neutral",
                                                              note: hasAdj ? "exenta · = bruto − desc + rec" : "exenta",
                                                          })
                                                        : breakdownRow("Base IVA", subtotal, {
                                                              tone: "neutral",
                                                              note: hasAdj ? "= bruto − desc + rec" : undefined,
                                                          })
                                                ) : (
                                                    breakdownRow("Base imponible", subtotal, { tone: "neutral", note: singleAliquotaLabel })
                                                )}

                                                {showAlicuotaBreakdown && (
                                                    <>
                                                        {baseExempt  > 0 && breakdownRow("Base exenta",       baseExempt,  { tone: "muted",   indent: true })}
                                                        {baseTaxed8  > 0 && breakdownRow("Base imponible 8%",  baseTaxed8,  { tone: "muted",   indent: true })}
                                                        {vat8        > 0 && breakdownRow("IVA 8%",            vat8,        { tone: "warn",    indent: true, note: "8% × base" })}
                                                        {baseTaxed16 > 0 && breakdownRow("Base imponible", baseTaxed16, { tone: "muted",   indent: true })}
                                                        {vat16       > 0 && breakdownRow("IVA 16%",           vat16,       { tone: "neutral", indent: true, note: "16% × base" })}
                                                        {hasMultipleTaxedAlicuotas && breakdownRow("Total IVA", vatAmount, { tone: "neutral", indent: true, note: "= IVA 8% + IVA 16%" })}
                                                    </>
                                                )}

                                                {!showAlicuotaBreakdown && hasIva && (
                                                    vat8 > 0
                                                        ? breakdownRow("IVA 8%",  vat8,  { tone: "warn",    note: "8% × base" })
                                                        : breakdownRow("IVA 16%", vat16, { tone: "neutral", note: "16% × base" })
                                                )}

                                                {hasImpuestos && resolvedImpuestos.map((tax, idx) => (
                                                    breakdownRow(
                                                        tax.nombre || `Impuesto ${idx + 1}`,
                                                        tax.monto,
                                                        { tone: "pos", sign: "+", indent: true, note: tax.tipo === "porcentaje" ? `${tax.valor}% ${tax.base === "post_iva" ? "post-IVA" : "pre-IVA"}` : undefined },
                                                    )
                                                ))}

                                                {hasRetencion && breakdownRow(
                                                    `Retención IVA ${retencionIvaPct}%`,
                                                    retencionIva,
                                                    { tone: "neg", sign: "−", note: `${retencionIvaPct}% × IVA` },
                                                )}
                                            </dl>
                                        </>
                                    );
                                })()}

                                {/* Total hero */}
                                <div className="px-5 py-4 border-t border-border-default bg-surface-1">
                                    <div className="flex items-baseline justify-between">
                                        <span className="text-foreground uppercase tracking-[0.14em] text-[10px] font-bold">
                                            {hasRetencion ? "Total factura" : "Total"}
                                        </span>
                                        <span className="tabular-nums font-bold text-foreground text-[22px] tracking-tight">
                                            Bs. {fmtN(heroTotal)}
                                        </span>
                                    </div>
                                    {effectiveDollarRate && heroTotal > 0 ? (
                                        <div className="flex items-baseline justify-between mt-0.5">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">≈ {invoiceCurrencyCode}</span>
                                            <span className="tabular-nums text-[var(--text-tertiary)] text-[13px] font-semibold">
                                                ${fmtN(heroTotal / effectiveDollarRate)}
                                            </span>
                                        </div>
                                    ) : !effectiveDollarRate && heroTotal > 0 ? (
                                        <p className="mt-1 text-[10px] font-sans text-[var(--text-tertiary)] leading-snug">
                                            Define la tasa BCV para ver el equivalente en {invoiceCurrencyCode}.
                                        </p>
                                    ) : null}

                                    {hasRetencion && (
                                        <div className="mt-3 pt-3 border-t border-border-light">
                                            <div className="flex items-baseline justify-between">
                                                <span className="text-info uppercase tracking-[0.14em] text-[10px] font-bold">
                                                    Total a pagar
                                                </span>
                                                <span className="tabular-nums font-bold text-info text-[18px] tracking-tight">
                                                    Bs. {fmtN(totalAPagar)}
                                                </span>
                                            </div>
                                            {effectiveDollarRate && totalAPagar > 0 && (
                                                <div className="flex items-baseline justify-between mt-0.5">
                                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">≈ {invoiceCurrencyCode}</span>
                                                    <span className="tabular-nums text-[var(--text-tertiary)] text-[12px] font-semibold">
                                                        ${fmtN(totalAPagar / effectiveDollarRate)}
                                                    </span>
                                                </div>
                                            )}
                                            <p className="mt-1.5 font-sans text-[10px] text-[var(--text-tertiary)] leading-snug">
                                                Bs. {fmtN(retencionIva)} se enteran a SENIAT
                                            </p>
                                        </div>
                                    )}
                                </div>
                                <div className="grid gap-2 border-t border-border-light p-4">
                                    <BaseButton.Root className="w-full" variant="primary" size="md" leftIcon={<CheckCircle2 size={14} strokeWidth={2} />} onClick={handleOpenConfirm} disabled={saving || confirming}>
                                        {confirming ? "Confirmando…" : "Confirmar factura"}
                                    </BaseButton.Root>
                                    <BaseButton.Root className="w-full" variant="secondary" size="md" leftIcon={<Save size={14} strokeWidth={2} />} onClick={handleSaveDraft} loading={saving} disabled={confirming}>
                                        {saving ? "Guardando…" : "Guardar borrador"}
                                    </BaseButton.Root>
                                </div>
                            </InvoiceSummaryCard>
                        </aside>
                    </div>

                    {/* Row 2 — Productos (full width) */}
                    <InvoiceDetailCard
                        className="order-2"
                        count={itemCount}
                        onAddLine={() => setItems((current) => [...current, emptyItem(invoiceCurrencyCode)])}
                        secondaryAction={<BaseButton.Root variant="secondary" size="sm" leftIcon={<Plus size={13} strokeWidth={2} />} onClick={() => setQcMode('product')}>Nuevo producto</BaseButton.Root>}
                    >

                        <FacturaItemsGrid
                            items={items}
                            products={products}
                            onChange={setItems}
                            dollarRate={effectiveDollarRate}
                            currencyOptions={currencyOptions}
                            getExchangeRate={getRate}
                            decimals={rateDecimals}
                            selectedCurrency={invoiceCurrencyCode}
                            applyCurrencyToAll={applyCurrencyToAll}
                            onApplyCurrencyToAllChange={setApplyCurrencyToAll}
                            onRequestCreateProduct={(search) => {
                                setQcProduct(p => ({ ...p, name: search }));
                                setQcMode('product');
                            }}
                        />
                    </InvoiceDetailCard>
                </div>
            </div>

            {/* Quick-create: Supplier */}
            {qcMode === 'supplier' && (
                <QuickModal title="Nuevo Proveedor" onClose={() => setQcMode(null)}>
                    <div className="space-y-3">
                        <BaseInput.Field
                            autoFocus
                            label="Nombre *"
                            value={qcSupplier.name}
                            onValueChange={(v) => setQcSupplier(s => ({ ...s, name: v }))}
                            placeholder="Nombre del proveedor"
                            onKeyDown={(e) => { if (e.key === 'Enter') handleQcSupplier(); }}
                        />
                        <BaseInput.Field
                            label="RIF"
                            value={qcSupplier.rif}
                            onValueChange={(v) => setQcSupplier(s => ({ ...s, rif: v }))}
                            placeholder="J-12345678-9"
                        />
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setQcMode(null)}
                                className="flex-1 h-9 rounded-lg border border-border-medium bg-surface-2 hover:bg-surface-1 text-foreground text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleQcSupplier}
                                disabled={qcSaving}
                                className="flex-1 h-9 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                {qcSaving ? 'Guardando…' : 'Crear proveedor'}
                            </button>
                        </div>
                    </div>
                </QuickModal>
            )}

            {/* Quick-create: Product */}
            {qcMode === 'product' && (
                <QuickModal title="Nuevo Producto" onClose={() => setQcMode(null)}>
                    <div className="space-y-3">
                        <BaseInput.Field
                            autoFocus
                            label="Nombre *"
                            value={qcProduct.name}
                            onValueChange={(v) => setQcProduct(p => ({ ...p, name: v }))}
                            placeholder="Nombre del producto"
                        />
                        <BaseInput.Field
                            label="Código"
                            value={qcProduct.code}
                            onValueChange={(v) => setQcProduct(p => ({ ...p, code: v }))}
                            placeholder="Ej. 001"
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>Tipo</label>
                                <select
                                    className={fieldCls}
                                    value={qcProduct.type}
                                    onChange={(e) => setQcProduct(p => ({ ...p, type: e.target.value as ProductType }))}
                                >
                                    <option value="mercancia">Mercancía</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>IVA</label>
                                <select
                                    className={fieldCls}
                                    value={qcProduct.vatType}
                                    onChange={(e) => setQcProduct(p => ({ ...p, vatType: e.target.value as VatType }))}
                                >
                                    <option value="general">General (16%)</option>
                                    <option value="exento">Exento</option>
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            <div>
                                <label className={labelCls}>Departamento</label>
                                <div className="flex gap-1">
                                    <select
                                        className={fieldCls}
                                        value={qcProduct.departmentId}
                                        onChange={(e) => setQcProduct(p => ({ ...p, departmentId: e.target.value }))}
                                    >
                                        <option value="">Sin departamento</option>
                                        {departments.filter(d => d.active).map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => setQcDeptOpen(v => !v)}
                                        className="h-9 w-9 flex-shrink-0 rounded-lg border border-border-default bg-surface-1 hover:bg-surface-2 hover:border-border-medium text-[var(--text-tertiary)] hover:text-foreground transition-colors flex items-center justify-center shadow-sm"
                                        title="Crear departamento"
                                        aria-label="Crear departamento"
                                    >
                                        <Plus size={12} strokeWidth={2} />
                                    </button>
                                </div>
                            </div>
                        </div>
                        {qcDeptOpen && (
                            <div className="flex gap-2 items-center px-1 py-2 rounded-lg border border-border-light bg-surface-2">
                                <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] whitespace-nowrap pl-1">Nuevo depto.</span>
                                <BaseInput.Field
                                    autoFocus
                                    className="flex-1"
                                    value={qcDeptName}
                                    onValueChange={setQcDeptName}
                                    placeholder="Nombre del departamento"
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleQcDepartment(); if (e.key === 'Escape') setQcDeptOpen(false); }}
                                />
                                <button
                                    onClick={handleQcDepartment}
                                    disabled={qcDeptSaving || !qcDeptName.trim()}
                                    className="h-8 px-4 flex-shrink-0 rounded-md bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.12em] transition-colors"
                                >
                                    {qcDeptSaving ? '…' : 'Crear'}
                                </button>
                                <button
                                    onClick={() => setQcDeptOpen(false)}
                                    className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                                    aria-label="Cancelar"
                                >
                                    <X size={12} strokeWidth={2} />
                                </button>
                            </div>
                        )}
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setQcMode(null)}
                                className="flex-1 h-9 rounded-lg border border-border-medium bg-surface-2 hover:bg-surface-1 text-foreground text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleQcProduct}
                                disabled={qcSaving}
                                className="flex-1 h-9 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                {qcSaving ? 'Guardando…' : 'Crear producto'}
                            </button>
                        </div>
                    </div>
                </QuickModal>
            )}

            {/* Confirm dialog — surfaces the active company before persisting */}
            <ConfirmCompanyDialog
                isOpen={showConfirm}
                onClose={() => { if (!confirming) setShowConfirm(false); }}
                onConfirm={handleConfirmInvoice}
                loading={confirming}
                title="Confirmar factura de compra"
                subtitle={
                    <>
                        Al confirmar, las existencias y el costo promedio se actualizan inmediatamente y la factura entra en el período contable seleccionado. Esta acción no es reversible desde esta pantalla.
                    </>
                }
                summary={
                    <>
                        <SummaryRow label={documentType === "factura" ? "Nº Factura" : documentType === "nota_credito" ? "Nº Nota de crédito" : "Nº Nota de débito"} value={invoiceNumber || "—"} />
                        {controlNumber && <SummaryRow label="Nº Control" value={controlNumber} />}
                        <SummaryRow label="Proveedor" value={supplierName ?? "—"} />
                        <SummaryRow label="Período" value={(periodoManual && periodo) || date.slice(0, 7) || "—"} />
                        <SummaryRow label="Ítems" value={String(itemCount)} />
                        <div className="border-t border-border-light/60 pt-2.5 mt-1 space-y-2.5">
                            {hasImpuestos && (
                                <SummaryRow
                                    label="Impuestos"
                                    value={`+ Bs. ${fmtN(totalImpuestos)}`}
                                />
                            )}
                            <SummaryRow
                                label="Total"
                                value={`Bs. ${fmtN(heroTotal)}`}
                                emphasis
                            />
                            {effectiveDollarRate && heroTotal > 0 && (
                                <SummaryRow
                                    label={`≈ ${invoiceCurrencyCode}`}
                                    value={`$ ${fmtN(heroTotal / effectiveDollarRate)}`}
                                />
                            )}
                            {hasRetencion && (
                                <SummaryRow
                                    label={`Total a pagar`}
                                    value={`Bs. ${fmtN(totalAPagar)}`}
                                />
                            )}
                        </div>
                    </>
                }
                warning={hasRetencion
                    ? `Se retendrá Bs. ${fmtN(retencionIva)} (${retencionIvaPct}% IVA) que se enteran a SENIAT.`
                    : undefined}
                confirmLabel={confirming ? "Confirmando…" : "Sí, confirmar"}
            />
        </div>
    );
}

// ── Helpers para el banner de borrador ──────────────────────────────────────

function formatDraftTimestamp(iso: string): string {
    if (!iso) return "fecha desconocida";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("es-VE", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

function pendingDraftSummary(d: PurchaseInvoice): string {
    const parts: string[] = [];
    if (d.invoiceNumber) parts.push(`Nº ${d.invoiceNumber}`);
    if (typeof d.total === "number" && d.total > 0) {
        parts.push(`Bs. ${d.total.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "Sin datos";
}
