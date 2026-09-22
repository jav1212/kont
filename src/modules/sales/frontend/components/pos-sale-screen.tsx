"use client";

import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Minus, Package, Plus, Search, ShoppingCart, Trash2, UserPlus, X } from "lucide-react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { Product } from "@/src/modules/inventory/backend/domain/product";
import { resolveProductSalePrice } from "@/src/modules/inventory/frontend/utils/product-sale-price";
import { useInvoiceExchangeRates } from "@/src/modules/inventory/frontend/hooks/use-invoice-exchange-rates";
import { CurrencyCombobox } from "@/src/modules/inventory/frontend/components/currency-combobox";
import { computeInvoiceTotals, emptyHeaderAdjustments, emptyLineAdjustments, type HeaderAdjustments, type LineInput } from "@/src/modules/inventory/shared/totals";
import { isLocalCurrency, normalizeCurrencyCode, type CurrencyCode } from "@/src/modules/inventory/shared/currency";
import { useSales, type SalesInvoice, type SalesInvoiceItem } from "../hooks/use-sales";
import { CustomerCombobox } from "./customer-combobox";
import { useDeviceSubscription } from "@/src/shared/frontend/devices/device-manager-provider";
import { DeviceStatusControl } from "@/src/shared/frontend/devices/device-status-control";
import { notify } from "@/src/shared/frontend/notify";
import type { SalesDocumentType } from "../../backend/domain/sales-invoice";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { getSaleableStock, isCompositePending } from "../utils/composite-availability";

type CartLine = {
    product: Product;
    quantity: number;
    unitPrice: number;
    sourceCurrency: string;
    sourcePrice: number | null;
    exchangeRate: number | null;
    manualPrice: boolean;
};

const money = (value: number) => value.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const stock = (value: number) => value.toLocaleString("es-VE", { maximumFractionDigits: 2 });
const round2 = (value: number) => Math.round(value * 100) / 100;
const CATALOG_PAGE_SIZE = 48;
const PRODUCT_CARD_TAP_SLOP_PX = 8;

type CatalogProduct = {
    product: Product;
    searchText: string;
    normalizedCode: string;
    stockLabel: string;
    availableStock: number;
    compositePending: boolean;
    unitPriceBs: number | null;
};

const PosProductCard = memo(function PosProductCard({ entry, onSelect }: {
    entry: CatalogProduct;
    onSelect: (product: Product) => void;
}) {
    const { product, stockLabel, unitPriceBs, availableStock, compositePending } = entry;
    const noPrice = unitPriceBs == null || unitPriceBs <= 0;
    const code = product.code || "SIN CÓDIGO";

    // Keep cancelled gestures until the click or next press: touch devices can emit a delayed click after scrolling.
    const pointerGestureRef = useRef<{
        id: number;
        startX: number;
        startY: number;
        cancelClick: boolean;
        scrollPositions: Array<{ element: HTMLElement; top: number; left: number }>;
    } | null>(null);

    const hasMovedBeyondTapSlop = (event: { clientX: number; clientY: number }, gesture: { startX: number; startY: number }) =>
        Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > PRODUCT_CARD_TAP_SLOP_PX;

    return <button
        type="button"
        onPointerDown={(event) => {
            const scrollPositions: Array<{ element: HTMLElement; top: number; left: number }> = [];
            for (let element = event.currentTarget.parentElement; element; element = element.parentElement) {
                if (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) {
                    scrollPositions.push({ element, top: element.scrollTop, left: element.scrollLeft });
                }
            }
            pointerGestureRef.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, cancelClick: false, scrollPositions };
        }}
        onPointerMove={(event) => {
            const gesture = pointerGestureRef.current;
            if (!gesture || gesture.id !== event.pointerId || gesture.cancelClick) return;
            if (hasMovedBeyondTapSlop(event, gesture)) gesture.cancelClick = true;
        }}
        onPointerUp={(event) => {
            const gesture = pointerGestureRef.current;
            if (!gesture || gesture.id !== event.pointerId) return;
            if (hasMovedBeyondTapSlop(event, gesture)) gesture.cancelClick = true;
        }}
        onPointerCancel={() => {
            const gesture = pointerGestureRef.current;
            if (gesture) gesture.cancelClick = true;
        }}
        onClick={(event) => {
            const gesture = pointerGestureRef.current;
            const scrolled = gesture?.scrollPositions.some(({ element, top, left }) => element.scrollTop !== top || element.scrollLeft !== left);
            pointerGestureRef.current = null;
            if (event.detail !== 0 && (gesture?.cancelClick || scrolled)) return;
            onSelect(product);
        }}
        aria-label={compositePending ? `Consultar ${product.name}: composición pendiente` : `Consultar precio de ${product.name}`}
        className="group flex min-h-36 min-w-0 flex-col rounded-xl border border-border-light bg-surface-1 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary-500/50 hover:shadow-md active:translate-y-0 sm:p-4"
    >
        <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <span title={code} className="min-w-0 truncate font-mono text-[10px] text-[var(--text-tertiary)]">{code}</span>
            <span className={`inline-flex shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-bold ${availableStock <= 0 ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                {compositePending ? "Sin composición" : `${stockLabel} ${product.measureUnit}`}
            </span>
        </div>
        <p className="mt-3 line-clamp-2 flex-1 text-[13px] font-semibold leading-snug text-foreground">{product.name}</p>
        <div className="mt-3 grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-end gap-2">
            <span className="whitespace-nowrap text-[9px] uppercase text-[var(--text-tertiary)]">{product.compositionKind === "composite" ? "Compuesto" : product.vatType === "exento" ? "Exento" : "IVA 16%"}</span>
            <span title={noPrice ? "Ingresar precio" : `Bs ${money(unitPriceBs)}`} className={`min-w-0 truncate text-right font-mono text-[14px] font-bold ${noPrice ? "text-amber-600" : "text-primary-500"}`}>
                {noPrice ? "Ingresar precio" : `Bs ${money(unitPriceBs)}`}
            </span>
        </div>
    </button>;
});

const PosProductCatalog = memo(function PosProductCatalog({ products, loading, onSelect }: {
    products: CatalogProduct[];
    loading: boolean;
    onSelect: (product: Product) => void;
}) {
    const [visibleCount, setVisibleCount] = useState(CATALOG_PAGE_SIZE);
    const sentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || visibleCount >= products.length || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                setVisibleCount((current) => Math.min(current + CATALOG_PAGE_SIZE, products.length));
            }
        }, { rootMargin: "320px 0px" });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [products.length, visibleCount]);

    if (loading && products.length === 0) {
        return <div aria-label="Cargando productos" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {Array.from({ length: 12 }, (_, index) => <div key={index} className="min-h-36 animate-pulse rounded-xl border border-border-light bg-surface-1 p-4"><div className="h-3 w-3/4 rounded bg-surface-3"/><div className="mt-5 h-4 w-full rounded bg-surface-3"/><div className="mt-2 h-4 w-2/3 rounded bg-surface-3"/><div className="mt-7 h-4 w-1/2 rounded bg-surface-3"/></div>)}
        </div>;
    }

    if (products.length === 0) {
        return <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-[var(--text-tertiary)]"><Package size={36} strokeWidth={1.3}/><p className="text-[13px]">No hay productos que coincidan.</p></div>;
    }

    const visibleProducts = products.slice(0, visibleCount);
    return <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {visibleProducts.map((entry) => <PosProductCard key={entry.product.id} entry={entry} onSelect={onSelect}/>)}
        </div>
        {visibleCount < products.length && <div ref={sentinelRef} className="flex justify-center py-6">
            <button type="button" onClick={() => setVisibleCount((current) => Math.min(current + CATALOG_PAGE_SIZE, products.length))} className="h-9 rounded-lg border border-border-light bg-surface-1 px-4 text-[11px] font-semibold text-[var(--text-secondary)] hover:border-primary-500/50 hover:text-primary-500">
                Cargar más ({Math.min(CATALOG_PAGE_SIZE, products.length - visibleCount)})
            </button>
        </div>}
    </>;
});

/**
 * Renders the point-of-sale workspace, including price inquiries and the active sale.
 *
 * @returns The interactive point-of-sale screen.
 */
export function PosSaleScreen() {
    const { companyId, company } = useCompany();
    const { products, departments, loadingProducts, loadProducts, loadDepartments } = useInventory();
    const { customers, loadCustomers, saveCustomer, ensureConsumerFinal, saveSalesInvoice, confirmSalesInvoice } = useSales();
    const date = getTodayIsoDate();
    const { options: currencyOptions, appliedRates, getRate, publishedDate } = useInvoiceExchangeRates(date);
    const searchRef = useRef<HTMLInputElement>(null);
    const departmentTriggerRef = useRef<HTMLButtonElement>(null);
    const departmentOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const scannerFocusRef = useRef<HTMLDivElement>(null);
    const addProductRef = useRef<HTMLButtonElement>(null);
    const manualPriceRef = useRef<HTMLInputElement>(null);
    const scannedInquiryRef = useRef(false);
    const [inquiryFocusRequest, setInquiryFocusRequest] = useState(0);
    const [query, setQuery] = useState("");
    const [departmentId, setDepartmentId] = useState("all");
    const [departmentPickerOpen, setDepartmentPickerOpen] = useState(false);
    const [departmentOptionIndex, setDepartmentOptionIndex] = useState(0);
    const [cart, setCart] = useState<CartLine[]>([]);
    const [customerId, setCustomerId] = useState("");
    const [documentType, setDocumentType] = useState<SalesDocumentType>("venta");
    const [discountType, setDiscountType] = useState<"porcentaje" | "monto">("porcentaje");
    const [discountValue, setDiscountValue] = useState(0);
    const [cartOpen, setCartOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [manualPrice, setManualPrice] = useState("");
    const [manualCurrency, setManualCurrency] = useState<CurrencyCode>("VES");
    const [creatingCustomer, setCreatingCustomer] = useState(false);
    const [customerDraft, setCustomerDraft] = useState({ rif: "", name: "" });
    const [finishing, setFinishing] = useState(false);
    const [completed, setCompleted] = useState<SalesInvoice | null>(null);
    const [generatingPdf, setGeneratingPdf] = useState(false);
    const isDeliveryNote = documentType === "nota_entrega";

    useEffect(() => {
        if (!companyId) return;
        let cancelled = false;
        void Promise.all([loadProducts(companyId), loadDepartments(companyId), loadCustomers(companyId)])
            .then(([, , loadedCustomers]) => {
                if (cancelled) return;
                const consumerFinalId = `consumer-final:${companyId}`;
                const existing = loadedCustomers?.find((customer) => customer.id === consumerFinalId);
                if (existing) {
                    setCustomerId(existing.id!);
                    return;
                }
                void ensureConsumerFinal(companyId).then((customer) => {
                    if (!cancelled && customer?.id) setCustomerId(customer.id);
                });
            });
        return () => { cancelled = true; };
    }, [companyId, ensureConsumerFinal, loadCustomers, loadDepartments, loadProducts]);

    const departmentOptions = useMemo(() => [
        { id: "all", name: "Todos los departamentos", detail: "Mostrar todo el catálogo" },
        ...departments.filter((department) => department.active).map((department) => ({ id: department.id!, name: department.name, detail: "Departamento activo" })),
        { id: "none", name: "Sin departamento", detail: "Productos sin clasificación" },
    ], [departments]);

    const closeDepartmentPicker = useCallback((restoreFocus = true) => {
        setDepartmentPickerOpen(false);
        if (restoreFocus) departmentTriggerRef.current?.focus();
    }, []);

    const selectDepartment = useCallback((nextDepartmentId: string) => {
        setDepartmentId(nextDepartmentId);
        setQuery("");
        closeDepartmentPicker(false);
        searchRef.current?.focus();
    }, [closeDepartmentPicker]);

    useEffect(() => {
        if (!departmentPickerOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeDepartmentPicker();
                return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setDepartmentOptionIndex((current) => {
                    const delta = event.key === "ArrowDown" ? 1 : -1;
                    return (current + delta + departmentOptions.length) % departmentOptions.length;
                });
                return;
            }
            if (event.key === "Home" || event.key === "End") {
                event.preventDefault();
                setDepartmentOptionIndex(event.key === "Home" ? 0 : departmentOptions.length - 1);
                return;
            }
            if (event.key === "Enter") {
                event.preventDefault();
                const option = departmentOptions[departmentOptionIndex];
                if (option) selectDepartment(option.id);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [closeDepartmentPicker, departmentOptionIndex, departmentOptions, departmentPickerOpen, selectDepartment]);

    useLayoutEffect(() => {
        if (!departmentPickerOpen) return;
        departmentOptionRefs.current[departmentOptionIndex]?.focus();
    }, [departmentOptionIndex, departmentPickerOpen]);

    useEffect(() => {
        const onShortcut = (event: KeyboardEvent) => {
            if (event.key !== "F4" || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
            if (selectedProduct || creatingCustomer || completed || cartOpen) return;
            event.preventDefault();
            event.stopPropagation();
            if (departmentPickerOpen) closeDepartmentPicker();
            else {
                const selectedIndex = Math.max(0, departmentOptions.findIndex((option) => option.id === departmentId));
                setDepartmentOptionIndex(selectedIndex);
                setDepartmentPickerOpen(true);
            }
        };
        window.addEventListener("keydown", onShortcut);
        return () => window.removeEventListener("keydown", onShortcut);
    }, [cartOpen, closeDepartmentPicker, completed, creatingCustomer, departmentId, departmentOptions, departmentPickerOpen, selectedProduct]);

    const resolvePrice = useCallback((product: Product) => {
        const rate = getRate(product.salePricing?.currency ?? "VES");
        return { resolved: resolveProductSalePrice(product, rate), rate };
    }, [getRate]);

    const addResolvedProduct = useCallback((product: Product, manual?: { amount: number; currency: CurrencyCode; rate: number }) => {
        if (!product.id) return;
        if (isCompositePending(product)) {
            notify.error("Este producto compuesto todavía no tiene una composición lista para vender.");
            return;
        }
        const { resolved, rate } = resolvePrice(product);
        const unitPrice = manual ? round2(manual.amount * manual.rate) : resolved?.unitPriceBs;
        if (unitPrice == null || unitPrice <= 0) return;
        setCart((current) => {
            const existing = current.find((line) => line.product.id === product.id);
            if (existing) return current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line);
            return [...current, {
                product, quantity: 1, unitPrice,
                sourceCurrency: manual ? normalizeCurrencyCode(manual.currency) : normalizeCurrencyCode(resolved?.currency ?? "VES"),
                sourcePrice: manual && !isLocalCurrency(manual.currency) ? manual.amount : resolved?.sourcePrice ?? null,
                exchangeRate: manual && !isLocalCurrency(manual.currency) ? manual.rate : (!manual ? rate : null),
                manualPrice: manual != null,
            }];
        });
        setQuery("");
    }, [resolvePrice]);

    const openPriceInquiry = useCallback((product: Product, scanned = false) => {
        setDepartmentPickerOpen(false);
        scannedInquiryRef.current = scanned;
        setSelectedProduct(product);
        // Repeated reads should refocus even when React receives the same object,
        // without erasing a price the cashier is entering for this product.
        if (!scanned || selectedProduct?.id !== product.id) {
            setManualPrice("");
            setManualCurrency(normalizeCurrencyCode(product.salePricing?.currency ?? "VES"));
        }
        setInquiryFocusRequest((request) => request + 1);
    }, [selectedProduct]);

    const closePriceInquiry = useCallback(() => {
        setSelectedProduct(null);
        if (scannedInquiryRef.current) scannerFocusRef.current?.focus();
        else searchRef.current?.focus();
    }, []);

    useLayoutEffect(() => {
        if (!selectedProduct) return;
        // A priced preview is a scanner destination, never an editable search.
        // Unpriced products retain their manual amount entry workflow.
        (manualPriceRef.current ?? addProductRef.current)?.focus();
    }, [inquiryFocusRequest, selectedProduct]);

    useEffect(() => {
        if (!selectedProduct) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") closePriceInquiry();
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [closePriceInquiry, selectedProduct]);

    const manualRate = getRate(manualCurrency);
    const manualAmount = Number(manualPrice);
    const manualUnitPriceBs = manualAmount > 0 && manualRate ? round2(manualAmount * manualRate) : 0;
    const canAddManualPrice = manualAmount > 0 && manualRate != null && manualRate > 0;
    const selectedPrice = selectedProduct ? resolvePrice(selectedProduct) : null;
    const selectedBasePrice = selectedPrice?.resolved?.unitPriceBs ?? 0;
    const selectedVatAmount = selectedProduct?.vatType === "exento" ? 0 : round2(selectedBasePrice * 0.16);
    const selectedFinalPrice = round2(selectedBasePrice + selectedVatAmount);
    const manualVatAmount = selectedProduct?.vatType === "exento" ? 0 : round2(manualUnitPriceBs * 0.16);
    const manualFinalPrice = round2(manualUnitPriceBs + manualVatAmount);
    const selectedCartQuantity = selectedProduct?.id
        ? cart.find((line) => line.product.id === selectedProduct.id)?.quantity ?? 0
        : 0;
    const selectedAvailableStock = selectedProduct ? getSaleableStock(selectedProduct) : 0;
    const selectedCompositePending = selectedProduct ? isCompositePending(selectedProduct) : false;

    function addSelectedProduct() {
        if (!selectedProduct || !selectedPrice?.resolved || selectedBasePrice <= 0) return;
        addResolvedProduct(selectedProduct);
        closePriceInquiry();
    }

    function addManualPrice() {
        if (!selectedProduct || !canAddManualPrice || !manualRate) return;
        addResolvedProduct(selectedProduct, { amount: manualAmount, currency: manualCurrency, rate: manualRate });
        closePriceInquiry();
    }

    const preparedProducts = useMemo<CatalogProduct[]>(() => products
        .filter((product) => product.active !== false)
        .map((product) => {
            const { resolved } = resolvePrice(product);
            return {
                product,
                searchText: [product.name, product.code, product.barcode ?? ""].join("\u0000").toLocaleLowerCase("es"),
                normalizedCode: product.code.toLocaleLowerCase("es"),
                stockLabel: stock(getSaleableStock(product)),
                availableStock: getSaleableStock(product),
                compositePending: isCompositePending(product),
                unitPriceBs: resolved?.unitPriceBs ?? null,
            };
        })
        .sort((a, b) => a.product.name.localeCompare(b.product.name, "es")), [products, resolvePrice]);

    const productIndexes = useMemo(() => {
        const byBarcode = new Map<string, Product>();
        const byCode = new Map<string, Product>();
        for (const entry of preparedProducts) {
            if (entry.product.barcode) byBarcode.set(entry.product.barcode, entry.product);
            if (entry.normalizedCode) byCode.set(entry.normalizedCode, entry.product);
        }
        return { byBarcode, byCode };
    }, [preparedProducts]);

    useDeviceSubscription("sale", (scan) => {
        const product = productIndexes.byBarcode.get(scan.barcode);
        if (!product) notify.error(`Código de barras no registrado: ${scan.barcode}`);
        else openPriceInquiry(product, true);
    });

    const deferredQuery = useDeferredValue(query);
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("es");
    const visibleProducts = useMemo(() => preparedProducts
        .filter(({ product }) => departmentId === "all" || (departmentId === "none" ? !product.departmentId : product.departmentId === departmentId))
        .filter((entry) => !normalizedQuery || entry.searchText.includes(normalizedQuery)), [departmentId, normalizedQuery, preparedProducts]);

    const headerAdjustment = useMemo<HeaderAdjustments>(() => ({
        ...emptyHeaderAdjustments(),
        descuentoTipo: discountValue > 0 ? discountType : null,
        descuentoValor: Math.max(0, discountValue),
        descuentoMoneda: "VES",
    }), [discountType, discountValue]);
    const lineInputs = useMemo<LineInput[]>(() => cart.map((line) => ({
        quantity: line.quantity, unitCost: line.unitPrice, currency: "VES", currencyCost: null,
        vatRate: line.product.vatType === "exento" ? "exenta" : "general_16",
        adjustments: emptyLineAdjustments(),
    })), [cart]);
    const totals = useMemo(() => computeInvoiceTotals(lineInputs, headerAdjustment, 2, 0, [], 1, "VES", getRate), [getRate, headerAdjustment, lineInputs]);

    function changeQuantity(productId: string, quantity: number) {
        if (quantity <= 0) setCart((current) => current.filter((line) => line.product.id !== productId));
        else setCart((current) => current.map((line) => line.product.id === productId ? { ...line, quantity } : line));
    }

    async function createCustomer() {
        if (!companyId || !customerDraft.rif.trim() || !customerDraft.name.trim()) return;
        const saved = await saveCustomer({ companyId, rif: customerDraft.rif.trim(), name: customerDraft.name.trim(), contact: "", phone: "", email: "", address: "", notes: "", active: true });
        if (!saved?.id) return;
        setCustomerId(saved.id); setCreatingCustomer(false); setCustomerDraft({ rif: "", name: "" });
    }

    async function finishSale() {
        if (!companyId || !customerId || cart.length === 0 || finishing) return;
        setFinishing(true);
        const items: SalesInvoiceItem[] = cart.map((line, index) => ({
            productId: line.product.id, description: line.product.name, quantity: line.quantity,
            unitPrice: line.unitPrice, totalLine: round2(line.quantity * line.unitPrice),
            baseIVA: totals.items[index]?.baseIVA ?? round2(line.quantity * line.unitPrice),
            vatRate: line.product.vatType === "exento" ? "exenta" : "general_16",
            currency: normalizeCurrencyCode(line.sourceCurrency), currencyPrice: line.sourcePrice,
            dollarRate: line.exchangeRate, exchangeRate: line.exchangeRate,
            rateEffectiveDate: publishedDate ?? date, rateSource: line.exchangeRate ? "bcv" : null,
            ivaIncluido: false,
        }));
        const invoice: SalesInvoice = {
            companyId, customerId, documentType, salesChannel: "pos", invoiceNumber: "", controlNumber: "",
            date, period: date.slice(0, 7), periodoManual: false, dueDate: null, paymentTerms: "contado", status: "borrador",
            currency: "VES", exchangeRates: appliedRates, subtotal: totals.baseIVA, vatAmount: totals.ivaMonto,
            total: totals.total, notes: isDeliveryNote ? "Nota de entrega POS" : "Venta rápida POS", descuentoTipo: headerAdjustment.descuentoTipo,
            descuentoValor: headerAdjustment.descuentoValor, descuentoMonto: totals.descuentoHeader, descuentoMoneda: "VES",
            recargoTipo: null, recargoValor: 0, recargoMonto: 0, recargoMoneda: "VES", impuestos: [],
        };
        const saved = await saveSalesInvoice(invoice, items);
        const confirmed = saved?.id ? await confirmSalesInvoice(saved.id, { allowNegativeStock: true }) : null;
        if (confirmed) {
            setCompleted(confirmed);
            await loadProducts(companyId, true);
            setCartOpen(false);
        }
        setFinishing(false);
    }

    function resetSale() {
        setCart([]); setDiscountValue(0); setCompleted(null); setQuery("");
        if (companyId) void ensureConsumerFinal(companyId).then((customer) => customer?.id && setCustomerId(customer.id));
        requestAnimationFrame(() => searchRef.current?.focus());
    }

    async function downloadPdf() {
        const customer = customers.find((candidate) => candidate.id === completed?.customerId);
        if (!completed || !company || !customer) return;
        setGeneratingPdf(true);
        try {
            const commonItems = (completed.items ?? []).map((item) => ({
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalLine: item.totalLine,
                currencyCode: normalizeCurrencyCode(item.currency),
                sourceUnitAmount: item.currencyPrice,
                exchangeRate: item.exchangeRate ?? item.dollarRate,
            }));
            if (completed.documentType === "nota_entrega") {
                const { generateDeliveryNotePdf } = await import("../utils/delivery-note-pdf");
                await generateDeliveryNotePdf({
                    issuer: { name: company.name, rif: company.rif ?? "", address: company.address, phone: company.phone, logoUrl: company.logoUrl, showLogoInPdf: company.showLogoInPdf },
                    customer: { name: customer.name, rif: customer.rif, address: customer.address },
                    document: {
                        number: completed.invoiceNumber,
                        date: completed.date.split("T")[0],
                        notes: completed.notes,
                        referenceRate: completed.exchangeRates?.find((rate) => normalizeCurrencyCode(rate.currencyCode) === "USD")?.vesPerUnit ?? null,
                        referenceCurrency: "USD",
                    },
                    items: commonItems,
                    totals: { subtotal: completed.subtotal, discount: completed.descuentoMonto ?? 0, iva: completed.vatAmount, igtf: completed.igtfPerceptionAmount ?? 0, total: completed.total },
                });
                return;
            }
            const { generateSalesInvoicePdf } = await import("../utils/sales-invoice-pdf");
            const bases = { exenta: 0, reducida_8: 0, general_16: 0 };
            (completed.items ?? []).forEach((item) => { bases[item.vatRate] += item.baseIVA ?? item.totalLine; });
            await generateSalesInvoicePdf({
                issuer: { name: company.name, rif: company.rif ?? "", address: company.address, phone: company.phone },
                customer: { name: customer.name, rif: customer.rif, address: customer.address },
                invoice: { number: completed.invoiceNumber, controlNumber: completed.controlNumber ?? "", date: completed.date, paymentTerms: completed.paymentTerms, notes: completed.notes },
                items: (completed.items ?? []).map((item, index) => ({ ...commonItems[index], vatRate: item.vatRate })),
                totals: { subtotal: completed.subtotal, baseExempt: bases.exenta, baseTaxed8: bases.reducida_8, baseTaxed16: bases.general_16, iva8: round2(bases.reducida_8 * .08), iva16: round2(bases.general_16 * .16), ivaTotal: completed.vatAmount, total: completed.total },
            });
        } finally { setGeneratingPdf(false); }
    }

    function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const rawQuery = query.trim();
        const immediateNormalizedQuery = rawQuery.toLocaleLowerCase("es");
        const exact = productIndexes.byBarcode.get(rawQuery) ?? productIndexes.byCode.get(immediateNormalizedQuery);
        const immediateMatches = preparedProducts
            .filter(({ product }) => departmentId === "all" || (departmentId === "none" ? !product.departmentId : product.departmentId === departmentId))
            .filter((entry) => !immediateNormalizedQuery || entry.searchText.includes(immediateNormalizedQuery));
        const candidate = exact ?? (immediateMatches.length === 1 ? immediateMatches[0].product : null);
        if (candidate) openPriceInquiry(candidate);
    }

    const cartPanel = <div className="flex h-full min-h-0 flex-col bg-surface-1">
        <div className="flex items-center justify-between border-b border-border-light px-5 py-4">
            <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[var(--text-tertiary)]">{isDeliveryNote ? "Nota de entrega actual" : "Venta actual"}</p><h2 className="mt-1 text-[17px] font-semibold text-foreground">{cart.reduce((sum, line) => sum + line.quantity, 0)} artículos</h2></div>
            <button type="button" onClick={() => setCartOpen(false)} className="rounded-lg p-2 text-[var(--text-tertiary)] lg:hidden"><X size={18} /></button>
        </div>
        <div className="border-b border-border-light p-4">
            <div className="flex gap-2"><CustomerCombobox customerId={customerId} customers={customers} onChange={setCustomerId} /><button type="button" onClick={() => setCreatingCustomer(true)} className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border-light text-primary-500 hover:bg-primary-500/10" title="Nuevo cliente"><UserPlus size={16} /></button></div>
            <div className="mt-3 grid grid-cols-2 rounded-lg border border-border-light bg-surface-2 p-1">
                {([["venta", "Factura"], ["nota_entrega", "Nota de entrega"]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setDocumentType(value)} className={`h-9 rounded-md text-[11px] font-semibold uppercase tracking-[.08em] transition ${documentType === value ? "bg-surface-1 text-primary-500 shadow-sm" : "text-[var(--text-tertiary)] hover:text-foreground"}`}>{label}</button>)}
            </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
            {cart.length === 0 ? <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-[var(--text-tertiary)]"><ShoppingCart size={34} strokeWidth={1.4} /><p className="text-[13px]">Consulta un producto y agrégalo para comenzar.</p></div> : cart.map((line) => <div key={line.product.id} className="border-b border-border-light p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[13px] font-semibold text-foreground">{line.product.name}</p><p className="mt-1 font-mono text-[10px] text-[var(--text-tertiary)]">{line.product.code || "Sin código"}{line.manualPrice ? " · Precio temporal" : ""}</p></div><button type="button" onClick={() => changeQuantity(line.product.id!, 0)} className="p-1.5 text-[var(--text-tertiary)] hover:text-red-500"><Trash2 size={14} /></button></div>
                <div className="mt-3 flex items-center justify-between"><div className="flex items-center rounded-lg border border-border-light"><button type="button" onClick={() => changeQuantity(line.product.id!, line.quantity - 1)} className="size-8"><Minus size={13} className="mx-auto" /></button><input aria-label={`Cantidad de ${line.product.name}`} type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => changeQuantity(line.product.id!, Number(event.target.value))} className="h-8 w-14 border-x border-border-light bg-transparent text-center font-mono text-[12px] outline-none"/><button type="button" onClick={() => changeQuantity(line.product.id!, line.quantity + 1)} className="size-8"><Plus size={13} className="mx-auto" /></button></div><div className="text-right"><p className="font-mono text-[12px] text-[var(--text-secondary)]">Bs {money(line.unitPrice)}</p><p className="font-mono text-[14px] font-bold text-foreground">Bs {money(line.unitPrice * line.quantity)}</p></div></div>
                {line.product.compositionKind === "composite" && line.product.components?.length ? <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[10px] text-[var(--text-secondary)]"><p className="font-semibold uppercase tracking-[.1em] text-[var(--text-tertiary)]">Incluye</p>{line.product.components.map((component) => <p key={component.productId} className="mt-1">{stock(component.quantity * line.quantity)} {component.measureUnit} · {component.name}</p>)}</div> : null}
                {line.quantity > getSaleableStock(line.product) && <p className="mt-2 text-[10px] font-medium text-amber-600">La venta dejará existencia negativa ({stock(getSaleableStock(line.product) - line.quantity)}).</p>}
            </div>)}
        </div>
        <div className="space-y-3 border-t border-border-light p-5 shadow-[0_-8px_24px_rgba(0,0,0,.04)]">
            <div className="grid grid-cols-[120px_1fr] gap-2"><select value={discountType} onChange={(event) => setDiscountType(event.target.value as typeof discountType)} className="h-9 rounded-lg border border-border-light bg-surface-1 px-2 text-[12px]"><option value="porcentaje">Descuento %</option><option value="monto">Descuento Bs</option></select><input type="number" min="0" value={discountValue || ""} onChange={(event) => setDiscountValue(Number(event.target.value))} placeholder="0" className="h-9 rounded-lg border border-border-light bg-surface-1 px-3 text-right font-mono text-[12px] outline-none focus:border-primary-500" /></div>
            <div className="space-y-1.5 text-[12px]"><div className="flex justify-between text-[var(--text-secondary)]"><span>Subtotal</span><span>Bs {money(totals.subtotalBruto)}</span></div><div className="flex justify-between text-[var(--text-secondary)]"><span>Descuento</span><span>− Bs {money(totals.descuentoHeader)}</span></div><div className="flex justify-between text-[var(--text-secondary)]"><span>IVA</span><span>Bs {money(totals.ivaMonto)}</span></div><div className="flex justify-between border-t border-border-light pt-2 text-[18px] font-bold text-foreground"><span>Total</span><span>Bs {money(totals.total)}</span></div></div>
            <button type="button" onClick={finishSale} disabled={!cart.length || !customerId || finishing} className="h-12 w-full rounded-xl bg-primary-500 text-[13px] font-bold uppercase tracking-[.12em] text-white shadow-sm transition hover:bg-primary-600 disabled:opacity-50">{finishing ? "Confirmando…" : isDeliveryNote ? "Emitir nota de entrega" : "Finalizar venta"}</button>
            <button type="button" onClick={() => { if (cart.length && window.confirm("¿Vaciar la venta actual?")) setCart([]); }} disabled={!cart.length} className="h-8 w-full text-[11px] uppercase tracking-[.1em] text-[var(--text-tertiary)] hover:text-red-500 disabled:opacity-40">Vaciar venta</button>
        </div>
    </div>;

    return <div ref={scannerFocusRef} tabIndex={-1} aria-label="Punto de venta: escáner listo" className="flex min-h-full flex-1 flex-col bg-background">
        <header className="flex flex-wrap items-center gap-3 border-b border-border-light bg-surface-1 px-4 py-3 sm:px-6">
            <div className="mr-auto"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-primary-500">Ventas</p><h1 className="text-xl font-semibold text-foreground">Punto de venta</h1></div>
            <DeviceStatusControl />
            <button type="button" onClick={() => setCartOpen(true)} className="flex h-10 items-center gap-2 rounded-lg bg-primary-500 px-4 text-[12px] font-semibold text-white lg:hidden"><ShoppingCart size={15} /> Carrito ({cart.reduce((sum, line) => sum + line.quantity, 0)})</button>
        </header>
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_390px]">
            <section className="min-h-0 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
                <div className="sticky top-0 z-20 -mx-4 mb-5 border-b border-border-light bg-background px-4 pb-3 pt-4 shadow-[0_8px_16px_rgba(0,0,0,0.03)] sm:-mx-6 sm:px-6 sm:pt-6">
                    <div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[var(--text-tertiary)]" size={17}/><input ref={searchRef} autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onSearchKeyDown} placeholder="Escanea o busca un producto para consultar su precio…" style={{ paddingLeft: "3rem", paddingRight: "1rem" }} className="h-12 w-full rounded-xl border border-border-light bg-surface-1 text-[14px] shadow-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10" /></div>
                    <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1"><button ref={departmentTriggerRef} type="button" onClick={() => { setDepartmentOptionIndex(Math.max(0, departmentOptions.findIndex((option) => option.id === departmentId))); setDepartmentPickerOpen(true); }} aria-haspopup="listbox" aria-expanded={departmentPickerOpen} className="flex shrink-0 items-center gap-2 rounded-lg border border-primary-500/50 bg-primary-500/10 px-3 py-2 text-[11px] font-semibold text-primary-500"><span>Departamentos · F4</span>{departmentPickerOpen ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}</button><button type="button" onClick={() => selectDepartment("all")} className={`shrink-0 rounded-lg border px-3 py-2 text-[11px] ${departmentId === "all" ? "border-primary-500 bg-primary-500/10 text-primary-500" : "border-border-light bg-surface-1 text-[var(--text-secondary)]"}`}>Todos</button>{departments.filter((department) => department.active).map((department) => <button key={department.id} type="button" onClick={() => selectDepartment(department.id!)} className={`shrink-0 rounded-lg border px-3 py-2 text-[11px] ${departmentId === department.id ? "border-primary-500 bg-primary-500/10 text-primary-500" : "border-border-light bg-surface-1 text-[var(--text-secondary)]"}`}>{department.name}</button>)}<button type="button" onClick={() => selectDepartment("none")} className={`shrink-0 rounded-lg border px-3 py-2 text-[11px] ${departmentId === "none" ? "border-primary-500 bg-primary-500/10 text-primary-500" : "border-border-light bg-surface-1 text-[var(--text-secondary)]"}`}>Sin departamento</button></div>
                </div>
                <PosProductCatalog key={`${departmentId}\u0000${normalizedQuery}`} products={visibleProducts} loading={loadingProducts} onSelect={openPriceInquiry}/>
            </section>
            <aside className="hidden min-h-0 border-l border-border-light lg:block">{cartPanel}</aside>
        </div>
        {cartOpen && <div className="fixed inset-0 z-[90] bg-black/45 lg:hidden" onClick={() => setCartOpen(false)}><aside className="ml-auto h-full w-full max-w-md" onClick={(event) => event.stopPropagation()}>{cartPanel}</aside></div>}
        {departmentPickerOpen && <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/45 p-3 pt-[5vh] sm:p-6 sm:pt-[8vh]" onClick={() => closeDepartmentPicker()}><div role="dialog" aria-modal="true" aria-labelledby="pos-departments-title" className="w-full max-w-2xl rounded-3xl border border-border-light bg-surface-1 p-5 shadow-2xl sm:p-7" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[11px] uppercase tracking-[.16em] text-primary-500">Acceso rápido · F4</p><h2 id="pos-departments-title" className="mt-2 text-[23px] font-bold text-foreground sm:text-[26px]">Seleccionar departamento</h2><p className="mt-2 text-[13px] text-[var(--text-secondary)]">Elige una tarjeta para ver sus productos.</p></div><button type="button" onClick={() => closeDepartmentPicker()} aria-label="Cerrar departamentos" className="flex size-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-surface-2 hover:text-foreground"><X size={23}/></button></div><div role="listbox" aria-label="Departamentos" aria-activedescendant={`pos-department-option-${departmentOptionIndex}`} className="mt-5 grid max-h-[62vh] gap-2 overflow-y-auto rounded-2xl border border-border-light bg-surface-2 p-2 sm:grid-cols-2">{departmentOptions.map((option, index) => <button key={option.id} ref={(element) => { departmentOptionRefs.current[index] = element; }} id={`pos-department-option-${index}`} type="button" role="option" aria-selected={departmentId === option.id} tabIndex={index === departmentOptionIndex ? 0 : -1} onClick={() => selectDepartment(option.id)} onFocus={() => setDepartmentOptionIndex(index)} className={`flex min-h-[82px] items-center justify-between gap-4 rounded-xl border px-4 py-4 text-left transition sm:min-h-[96px] sm:px-5 ${index === departmentOptionIndex ? "border-primary-500 bg-primary-500/10 text-primary-500 shadow-sm" : "border-transparent bg-surface-1 text-foreground hover:border-primary-500/40 hover:bg-primary-500/5"}`}><span className="min-w-0"><span className="block text-[15px] font-bold leading-snug sm:text-[16px]">{option.name}</span><span className="mt-2 block text-[12px] text-[var(--text-secondary)]">{option.detail}</span></span>{departmentId === option.id && <span className="shrink-0 rounded-full bg-primary-500 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[.08em] text-white">Activo</span>}</button>)}</div><p className="mt-4 text-[11px] text-[var(--text-secondary)]">Usa ↑ ↓ para navegar, Enter para seleccionar y Escape para cerrar.</p></div></div>}
        {selectedProduct && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4" onClick={closePriceInquiry}><div role="dialog" aria-modal="true" aria-labelledby="pos-price-title" className="w-full max-w-sm rounded-2xl border border-border-light bg-surface-1 p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="font-mono text-[10px] uppercase tracking-[.14em] text-primary-500">Consulta de precio</p><h2 id="pos-price-title" className="mt-1 text-[18px] font-semibold text-foreground">{selectedProduct.name}</h2><p className="mt-1 font-mono text-[11px] text-[var(--text-tertiary)]">{selectedProduct.code || "Sin código"}</p></div><button type="button" onClick={closePriceInquiry} aria-label="Cerrar consulta de precio" className="shrink-0 rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-surface-2 hover:text-foreground"><X size={18}/></button></div>
            {selectedCompositePending && <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-[12px] text-amber-700">Este producto compuesto aún no tiene una composición válida. Puedes consultar su precio, pero no agregarlo a una venta.</div>}
            {selectedPrice?.resolved && selectedBasePrice > 0 ? <>
                <div className="mt-5 rounded-xl bg-primary-500/10 px-4 py-5 text-center"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-primary-500">Precio final</p><p className="mt-1 font-mono text-[30px] font-bold text-foreground">Bs {money(selectedFinalPrice)}</p><p className="mt-1 text-[11px] text-[var(--text-secondary)]">{selectedProduct.vatType === "exento" ? "Producto exento de IVA" : "IVA incluido"}</p></div>
                <div className="mt-4 space-y-2 rounded-xl border border-border-light bg-surface-2 p-4 text-[12px]"><div className="flex justify-between text-[var(--text-secondary)]"><span>Precio base</span><span className="font-mono text-foreground">Bs {money(selectedBasePrice)}</span></div><div className="flex justify-between text-[var(--text-secondary)]"><span>{selectedProduct.vatType === "exento" ? "IVA (exento)" : "IVA 16%"}</span><span className="font-mono text-foreground">Bs {money(selectedVatAmount)}</span></div>{!isLocalCurrency(selectedPrice.resolved.currency) && <><div className="border-t border-border-light pt-2 flex justify-between text-[var(--text-secondary)]"><span>Precio de referencia</span><span className="font-mono text-foreground">{money(selectedPrice.resolved.sourcePrice)} {normalizeCurrencyCode(selectedPrice.resolved.currency)}</span></div><div className="flex justify-between text-[var(--text-secondary)]"><span>Tasa aplicada</span><span className="font-mono text-foreground">Bs {money(selectedPrice.rate ?? 0)}</span></div></>}</div>
            </> : <>
                <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-[12px] text-amber-700">Este producto no tiene un precio de venta disponible. Ingresa un precio temporal para esta venta.</div>
                <div className="mt-4 grid grid-cols-[1fr_112px] items-end gap-3"><div><label className="block font-mono text-[10px] uppercase tracking-[.12em] text-[var(--text-tertiary)]">Precio sin IVA</label><input ref={manualPriceRef} aria-label="Precio sin IVA" type="number" min="0.01" step="0.01" value={manualPrice} onChange={(event) => setManualPrice(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addManualPrice(); }} className="mt-2 h-10 w-full rounded-lg border border-border-light bg-surface-1 px-3 font-mono outline-none focus:border-primary-500"/></div><CurrencyCombobox label="Moneda" value={manualCurrency} options={currencyOptions} onChange={setManualCurrency}/></div>
                {!isLocalCurrency(manualCurrency) && <div className={`mt-3 rounded-lg border px-3 py-2 text-[12px] ${manualRate ? "border-border-light bg-surface-2 text-[var(--text-secondary)]" : "border-red-500/20 bg-red-500/5 text-red-600"}`}>{manualRate ? <>Tasa: Bs {money(manualRate)}</> : `No hay una tasa disponible para ${manualCurrency}.`}</div>}
                {canAddManualPrice && <div className="mt-3 rounded-xl bg-primary-500/10 px-4 py-3 text-center"><p className="text-[10px] uppercase tracking-[.12em] text-primary-500">{selectedProduct.vatType === "exento" ? "Precio final · Exento" : "Precio final con IVA"}</p><p className="mt-1 font-mono text-[24px] font-bold text-foreground">Bs {money(manualFinalPrice)}</p></div>}
            </>}
            {selectedProduct.compositionKind === "composite" && selectedProduct.components?.length ? <div className="mt-4 rounded-xl border border-border-light bg-surface-2 p-4"><p className="font-mono text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--text-tertiary)]">Incluye</p><ul className="mt-2 space-y-1.5 text-[12px] text-[var(--text-secondary)]">{selectedProduct.components.map((component) => <li key={component.productId} className="flex justify-between gap-3"><span className="min-w-0 truncate">{component.name}</span><span className="shrink-0 font-mono text-foreground">{stock(component.quantity)} {component.measureUnit}</span></li>)}</ul></div> : null}
            <div className="mt-4 flex items-center justify-between text-[11px] text-[var(--text-secondary)]"><span>{selectedProduct.compositionKind === "composite" ? "Disponibilidad:" : "Existencia:"} <strong className="font-mono text-foreground">{stock(selectedAvailableStock)} {selectedProduct.measureUnit}</strong></span>{selectedCartQuantity > 0 && <span>En carrito: <strong className="font-mono text-foreground">{stock(selectedCartQuantity)}</strong></span>}</div>
            <div className="mt-5 grid grid-cols-[auto_1fr] gap-2"><button type="button" onClick={closePriceInquiry} className="h-10 rounded-lg border border-border-light px-4 text-[12px]">Cerrar</button><button ref={addProductRef} type="button" onClick={selectedPrice?.resolved && selectedBasePrice > 0 ? addSelectedProduct : addManualPrice} disabled={selectedCompositePending || (selectedPrice?.resolved && selectedBasePrice > 0 ? false : !canAddManualPrice)} className="h-10 rounded-lg bg-primary-500 px-4 text-[12px] font-semibold text-white disabled:opacity-50">{selectedCompositePending ? "Composición pendiente" : selectedCartQuantity > 0 ? "Agregar otra unidad" : "Agregar a la venta"}</button></div>
        </div></div>}
        {creatingCustomer && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4"><div className="w-full max-w-md rounded-xl border border-border-light bg-surface-1 p-6 shadow-2xl"><h2 className="text-[16px] font-semibold">Nuevo cliente</h2><div className="mt-5 grid gap-3"><input autoFocus value={customerDraft.rif} onChange={(event) => setCustomerDraft((current) => ({ ...current, rif: event.target.value }))} placeholder="RIF o cédula" className="h-10 rounded-lg border border-border-light px-3 outline-none focus:border-primary-500"/><input value={customerDraft.name} onChange={(event) => setCustomerDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Nombre o razón social" className="h-10 rounded-lg border border-border-light px-3 outline-none focus:border-primary-500"/></div><div className="mt-5 flex justify-end gap-2"><button onClick={() => setCreatingCustomer(false)} className="h-9 rounded-lg border border-border-light px-4 text-[12px]">Cancelar</button><button onClick={createCustomer} disabled={!customerDraft.rif.trim() || !customerDraft.name.trim()} className="h-9 rounded-lg bg-primary-500 px-4 text-[12px] font-semibold text-white disabled:opacity-50">Crear cliente</button></div></div></div>}
        {completed && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-md rounded-2xl border border-border-light bg-surface-1 p-7 text-center shadow-2xl"><div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600"><CheckCircle2 size={30}/></div><h2 className="mt-4 text-xl font-semibold">{completed.documentType === "nota_entrega" ? "Nota de entrega confirmada" : "Venta confirmada"}</h2><p className="mt-1 font-mono text-[12px] text-[var(--text-tertiary)]">{completed.documentType === "nota_entrega" ? "Nota de entrega" : "Factura"} Nº {completed.invoiceNumber}</p><p className="mt-5 font-mono text-3xl font-bold text-foreground">Bs {money(completed.total)}</p><div className="mt-6 grid gap-2"><button onClick={downloadPdf} disabled={generatingPdf} className="h-11 rounded-xl bg-primary-500 text-[12px] font-bold uppercase tracking-[.1em] text-white">{generatingPdf ? "Generando…" : completed.documentType === "nota_entrega" ? "Descargar nota" : "Descargar factura A4"}</button><Link href={`/sales/${completed.id}`} className="flex h-10 items-center justify-center rounded-xl border border-border-light text-[12px]">Abrir {completed.documentType === "nota_entrega" ? "nota de entrega" : "factura"}</Link><button onClick={resetSale} className="h-10 rounded-xl text-[12px] font-semibold text-primary-500">Nueva {completed.documentType === "nota_entrega" ? "nota de entrega" : "venta"}</button></div></div></div>}
    </div>;
}
