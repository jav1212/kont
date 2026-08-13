"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Minus, Package, Plus, Search, ShoppingCart, Trash2, UserPlus, X } from "lucide-react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { Product } from "@/src/modules/inventory/backend/domain/product";
import { resolveProductSalePrice } from "@/src/modules/inventory/frontend/utils/product-sale-price";
import { useInvoiceExchangeRates } from "@/src/modules/inventory/frontend/hooks/use-invoice-exchange-rates";
import { computeInvoiceTotals, emptyHeaderAdjustments, emptyLineAdjustments, type HeaderAdjustments, type LineInput } from "@/src/modules/inventory/shared/totals";
import { normalizeCurrencyCode } from "@/src/modules/inventory/shared/currency";
import { useSales, type Customer, type SalesInvoice, type SalesInvoiceItem } from "../hooks/use-sales";
import { CustomerCombobox } from "./customer-combobox";
import { useDeviceSubscription } from "@/src/shared/frontend/devices/device-manager-provider";
import { DeviceStatusControl } from "@/src/shared/frontend/devices/device-status-control";
import { notify } from "@/src/shared/frontend/notify";
import { generateSalesInvoicePdf } from "../utils/sales-invoice-pdf";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";

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

export function PosSaleScreen() {
    const { companyId, company } = useCompany();
    const { products, departments, loadProducts, loadDepartments } = useInventory();
    const { customers, loadCustomers, saveCustomer, ensureConsumerFinal, saveSalesInvoice, confirmSalesInvoice } = useSales();
    const date = getTodayIsoDate();
    const { appliedRates, getRate, publishedDate } = useInvoiceExchangeRates(date);
    const searchRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    const [departmentId, setDepartmentId] = useState("all");
    const [cart, setCart] = useState<CartLine[]>([]);
    const [customerId, setCustomerId] = useState("");
    const [discountType, setDiscountType] = useState<"porcentaje" | "monto">("porcentaje");
    const [discountValue, setDiscountValue] = useState(0);
    const [cartOpen, setCartOpen] = useState(false);
    const [pendingPrice, setPendingPrice] = useState<Product | null>(null);
    const [manualPrice, setManualPrice] = useState("");
    const [creatingCustomer, setCreatingCustomer] = useState(false);
    const [customerDraft, setCustomerDraft] = useState({ rif: "", name: "" });
    const [finishing, setFinishing] = useState(false);
    const [completed, setCompleted] = useState<SalesInvoice | null>(null);
    const [generatingPdf, setGeneratingPdf] = useState(false);

    useEffect(() => {
        if (!companyId) return;
        void Promise.all([loadProducts(companyId), loadDepartments(companyId), loadCustomers(companyId)]);
        void ensureConsumerFinal(companyId).then((customer) => { if (customer?.id) setCustomerId(customer.id); });
    }, [companyId, ensureConsumerFinal, loadCustomers, loadDepartments, loadProducts]);

    const resolvePrice = useCallback((product: Product) => {
        const rate = getRate(product.salePricing?.currency ?? "VES");
        return { resolved: resolveProductSalePrice(product, rate), rate };
    }, [getRate]);

    const addResolvedProduct = useCallback((product: Product, overridePrice?: number) => {
        if (!product.id) return;
        const { resolved, rate } = resolvePrice(product);
        const unitPrice = overridePrice ?? resolved?.unitPriceBs;
        if (unitPrice == null || unitPrice <= 0) {
            setPendingPrice(product);
            setManualPrice("");
            return;
        }
        setCart((current) => {
            const existing = current.find((line) => line.product.id === product.id);
            if (existing) return current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line);
            return [...current, {
                product, quantity: 1, unitPrice,
                sourceCurrency: overridePrice != null ? "VES" : normalizeCurrencyCode(resolved?.currency ?? "VES"),
                sourcePrice: overridePrice != null ? null : resolved?.sourcePrice ?? null,
                exchangeRate: overridePrice != null ? null : rate,
                manualPrice: overridePrice != null,
            }];
        });
        setQuery("");
        requestAnimationFrame(() => searchRef.current?.focus());
    }, [resolvePrice]);

    useDeviceSubscription("sale", (scan) => {
        const product = products.find((candidate) => candidate.active && candidate.barcode === scan.barcode);
        if (!product) notify.error(`Código de barras no registrado: ${scan.barcode}`);
        else addResolvedProduct(product);
    });

    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    const visibleProducts = useMemo(() => products
        .filter((product) => product.active !== false)
        .filter((product) => departmentId === "all" || (departmentId === "none" ? !product.departmentId : product.departmentId === departmentId))
        .filter((product) => !normalizedQuery || [product.name, product.code, product.barcode ?? ""].some((value) => value.toLocaleLowerCase("es").includes(normalizedQuery)))
        .sort((a, b) => a.name.localeCompare(b.name, "es")), [departmentId, normalizedQuery, products]);

    const headerAdjustment: HeaderAdjustments = {
        ...emptyHeaderAdjustments(),
        descuentoTipo: discountValue > 0 ? discountType : null,
        descuentoValor: Math.max(0, discountValue),
        descuentoMoneda: "VES",
    };
    const lineInputs: LineInput[] = cart.map((line) => ({
        quantity: line.quantity, unitCost: line.unitPrice, currency: "VES", currencyCost: null,
        vatRate: line.product.vatType === "exento" ? "exenta" : "general_16",
        adjustments: emptyLineAdjustments(),
    }));
    const totals = useMemo(() => computeInvoiceTotals(lineInputs, headerAdjustment, 2, 0, [], 1, "VES", getRate), [cart, discountType, discountValue, getRate]);

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
            companyId, customerId, documentType: "venta", salesChannel: "pos", invoiceNumber: "", controlNumber: "",
            date, period: date.slice(0, 7), periodoManual: false, dueDate: null, paymentTerms: "contado", status: "borrador",
            currency: "VES", exchangeRates: appliedRates, subtotal: totals.baseIVA, vatAmount: totals.ivaMonto,
            total: totals.total, notes: "Venta rápida POS", descuentoTipo: headerAdjustment.descuentoTipo,
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
            const bases = { exenta: 0, reducida_8: 0, general_16: 0 };
            (completed.items ?? []).forEach((item) => { bases[item.vatRate] += item.baseIVA ?? item.totalLine; });
            await generateSalesInvoicePdf({
                issuer: { name: company.name, rif: company.rif ?? "", address: company.address, phone: company.phone },
                customer: { name: customer.name, rif: customer.rif, address: customer.address },
                invoice: { number: completed.invoiceNumber, controlNumber: completed.controlNumber ?? "", date: completed.date, paymentTerms: completed.paymentTerms, notes: completed.notes },
                items: (completed.items ?? []).map((item) => ({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, totalLine: item.totalLine, vatRate: item.vatRate, currencyCode: item.currency, sourceUnitAmount: item.currencyPrice, exchangeRate: item.exchangeRate })),
                totals: { subtotal: completed.subtotal, baseExempt: bases.exenta, baseTaxed8: bases.reducida_8, baseTaxed16: bases.general_16, iva8: round2(bases.reducida_8 * .08), iva16: round2(bases.general_16 * .16), ivaTotal: completed.vatAmount, total: completed.total },
            });
        } finally { setGeneratingPdf(false); }
    }

    function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const exact = products.find((product) => product.active && (product.barcode === query.trim() || product.code.toLocaleLowerCase("es") === normalizedQuery));
        const candidate = exact ?? (visibleProducts.length === 1 ? visibleProducts[0] : null);
        if (candidate) addResolvedProduct(candidate);
    }

    const cartPanel = <div className="flex h-full min-h-0 flex-col bg-surface-1">
        <div className="flex items-center justify-between border-b border-border-light px-5 py-4">
            <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[var(--text-tertiary)]">Venta actual</p><h2 className="mt-1 text-[17px] font-semibold text-foreground">{cart.reduce((sum, line) => sum + line.quantity, 0)} artículos</h2></div>
            <button type="button" onClick={() => setCartOpen(false)} className="rounded-lg p-2 text-[var(--text-tertiary)] lg:hidden"><X size={18} /></button>
        </div>
        <div className="border-b border-border-light p-4">
            <div className="flex gap-2"><CustomerCombobox customerId={customerId} customers={customers} onChange={setCustomerId} /><button type="button" onClick={() => setCreatingCustomer(true)} className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border-light text-primary-500 hover:bg-primary-500/10" title="Nuevo cliente"><UserPlus size={16} /></button></div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
            {cart.length === 0 ? <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-[var(--text-tertiary)]"><ShoppingCart size={34} strokeWidth={1.4} /><p className="text-[13px]">Escanea o selecciona productos para comenzar.</p></div> : cart.map((line) => <div key={line.product.id} className="border-b border-border-light p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[13px] font-semibold text-foreground">{line.product.name}</p><p className="mt-1 font-mono text-[10px] text-[var(--text-tertiary)]">{line.product.code || "Sin código"}{line.manualPrice ? " · Precio temporal" : ""}</p></div><button type="button" onClick={() => changeQuantity(line.product.id!, 0)} className="p-1.5 text-[var(--text-tertiary)] hover:text-red-500"><Trash2 size={14} /></button></div>
                <div className="mt-3 flex items-center justify-between"><div className="flex items-center rounded-lg border border-border-light"><button type="button" onClick={() => changeQuantity(line.product.id!, line.quantity - 1)} className="size-8"><Minus size={13} className="mx-auto" /></button><input aria-label={`Cantidad de ${line.product.name}`} type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => changeQuantity(line.product.id!, Number(event.target.value))} className="h-8 w-14 border-x border-border-light bg-transparent text-center font-mono text-[12px] outline-none"/><button type="button" onClick={() => changeQuantity(line.product.id!, line.quantity + 1)} className="size-8"><Plus size={13} className="mx-auto" /></button></div><div className="text-right"><p className="font-mono text-[12px] text-[var(--text-secondary)]">Bs {money(line.unitPrice)}</p><p className="font-mono text-[14px] font-bold text-foreground">Bs {money(line.unitPrice * line.quantity)}</p></div></div>
                {line.quantity > line.product.currentStock && <p className="mt-2 text-[10px] font-medium text-amber-600">La venta dejará existencia negativa ({stock(line.product.currentStock - line.quantity)}).</p>}
            </div>)}
        </div>
        <div className="space-y-3 border-t border-border-light p-5 shadow-[0_-8px_24px_rgba(0,0,0,.04)]">
            <div className="grid grid-cols-[120px_1fr] gap-2"><select value={discountType} onChange={(event) => setDiscountType(event.target.value as typeof discountType)} className="h-9 rounded-lg border border-border-light bg-surface-1 px-2 text-[12px]"><option value="porcentaje">Descuento %</option><option value="monto">Descuento Bs</option></select><input type="number" min="0" value={discountValue || ""} onChange={(event) => setDiscountValue(Number(event.target.value))} placeholder="0" className="h-9 rounded-lg border border-border-light bg-surface-1 px-3 text-right font-mono text-[12px] outline-none focus:border-primary-500" /></div>
            <div className="space-y-1.5 text-[12px]"><div className="flex justify-between text-[var(--text-secondary)]"><span>Subtotal</span><span>Bs {money(totals.subtotalBruto)}</span></div><div className="flex justify-between text-[var(--text-secondary)]"><span>Descuento</span><span>− Bs {money(totals.descuentoHeader)}</span></div><div className="flex justify-between text-[var(--text-secondary)]"><span>IVA</span><span>Bs {money(totals.ivaMonto)}</span></div><div className="flex justify-between border-t border-border-light pt-2 text-[18px] font-bold text-foreground"><span>Total</span><span>Bs {money(totals.total)}</span></div></div>
            <button type="button" onClick={finishSale} disabled={!cart.length || !customerId || finishing} className="h-12 w-full rounded-xl bg-primary-500 text-[13px] font-bold uppercase tracking-[.12em] text-white shadow-sm transition hover:bg-primary-600 disabled:opacity-50">{finishing ? "Confirmando…" : "Finalizar venta"}</button>
            <button type="button" onClick={() => { if (cart.length && window.confirm("¿Vaciar la venta actual?")) setCart([]); }} disabled={!cart.length} className="h-8 w-full text-[11px] uppercase tracking-[.1em] text-[var(--text-tertiary)] hover:text-red-500 disabled:opacity-40">Vaciar venta</button>
        </div>
    </div>;

    return <div className="flex min-h-full flex-1 flex-col bg-background">
        <header className="flex flex-wrap items-center gap-3 border-b border-border-light bg-surface-1 px-4 py-3 sm:px-6">
            <div className="mr-auto"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-primary-500">Ventas</p><h1 className="text-xl font-semibold text-foreground">Punto de venta</h1></div>
            <DeviceStatusControl />
            <button type="button" onClick={() => setCartOpen(true)} className="flex h-10 items-center gap-2 rounded-lg bg-primary-500 px-4 text-[12px] font-semibold text-white lg:hidden"><ShoppingCart size={15} /> Carrito ({cart.reduce((sum, line) => sum + line.quantity, 0)})</button>
        </header>
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_390px]">
            <section className="min-h-0 overflow-y-auto p-4 sm:p-6">
                <div className="sticky top-0 z-10 -mx-1 mb-5 bg-background/95 px-1 pb-3 backdrop-blur">
                    <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={18}/><input ref={searchRef} autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onSearchKeyDown} placeholder="Escanea o busca por nombre, código o código de barras…" className="h-12 w-full rounded-xl border border-border-light bg-surface-1 pl-12 pr-4 text-[14px] shadow-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10" /></div>
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1"><button type="button" onClick={() => setDepartmentId("all")} className={`shrink-0 rounded-lg border px-3 py-2 text-[11px] ${departmentId === "all" ? "border-primary-500 bg-primary-500/10 text-primary-500" : "border-border-light bg-surface-1 text-[var(--text-secondary)]"}`}>Todos</button>{departments.filter((department) => department.active).map((department) => <button key={department.id} type="button" onClick={() => setDepartmentId(department.id!)} className={`shrink-0 rounded-lg border px-3 py-2 text-[11px] ${departmentId === department.id ? "border-primary-500 bg-primary-500/10 text-primary-500" : "border-border-light bg-surface-1 text-[var(--text-secondary)]"}`}>{department.name}</button>)}<button type="button" onClick={() => setDepartmentId("none")} className={`shrink-0 rounded-lg border px-3 py-2 text-[11px] ${departmentId === "none" ? "border-primary-500 bg-primary-500/10 text-primary-500" : "border-border-light bg-surface-1 text-[var(--text-secondary)]"}`}>Sin departamento</button></div>
                </div>
                {visibleProducts.length === 0 ? <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-[var(--text-tertiary)]"><Package size={36} strokeWidth={1.3}/><p className="text-[13px]">No hay productos que coincidan.</p></div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{visibleProducts.map((product) => { const { resolved } = resolvePrice(product); const noPrice = !resolved || resolved.unitPriceBs <= 0; return <button key={product.id} type="button" onClick={() => addResolvedProduct(product)} className="group flex min-h-36 flex-col rounded-xl border border-border-light bg-surface-1 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary-500/50 hover:shadow-md active:translate-y-0">
                    <div className="flex w-full items-start justify-between gap-2"><span className="font-mono text-[10px] text-[var(--text-tertiary)]">{product.code || "SIN CÓDIGO"}</span><span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${product.currentStock <= 0 ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"}`}>{stock(product.currentStock)} {product.measureUnit}</span></div>
                    <p className="mt-3 line-clamp-2 flex-1 text-[13px] font-semibold leading-snug text-foreground">{product.name}</p><div className="mt-3 flex items-end justify-between gap-2"><span className="text-[9px] uppercase text-[var(--text-tertiary)]">{product.vatType === "exento" ? "Exento" : "IVA 16%"}</span><span className={`font-mono text-[14px] font-bold ${noPrice ? "text-amber-600" : "text-primary-500"}`}>{noPrice ? "Ingresar precio" : `Bs ${money(resolved.unitPriceBs)}`}</span></div>
                </button>; })}</div>}
            </section>
            <aside className="hidden min-h-0 border-l border-border-light lg:block">{cartPanel}</aside>
        </div>
        {cartOpen && <div className="fixed inset-0 z-[90] bg-black/45 lg:hidden" onClick={() => setCartOpen(false)}><aside className="ml-auto h-full w-full max-w-md" onClick={(event) => event.stopPropagation()}>{cartPanel}</aside></div>}
        {pendingPrice && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4"><div className="w-full max-w-sm rounded-xl border border-border-light bg-surface-1 p-6 shadow-2xl"><h2 className="text-[16px] font-semibold text-foreground">Precio temporal</h2><p className="mt-1 text-[13px] text-[var(--text-secondary)]">{pendingPrice.name} no tiene un precio de venta disponible.</p><label className="mt-5 block font-mono text-[10px] uppercase tracking-[.12em] text-[var(--text-tertiary)]">Precio unitario en bolívares</label><input autoFocus type="number" min="0.01" step="0.01" value={manualPrice} onChange={(event) => setManualPrice(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && Number(manualPrice) > 0) { addResolvedProduct(pendingPrice, Number(manualPrice)); setPendingPrice(null); } }} className="mt-2 h-11 w-full rounded-lg border border-border-light px-3 font-mono outline-none focus:border-primary-500"/><div className="mt-5 flex justify-end gap-2"><button onClick={() => setPendingPrice(null)} className="h-9 rounded-lg border border-border-light px-4 text-[12px]">Cancelar</button><button onClick={() => { if (Number(manualPrice) > 0) { addResolvedProduct(pendingPrice, Number(manualPrice)); setPendingPrice(null); } }} disabled={Number(manualPrice) <= 0} className="h-9 rounded-lg bg-primary-500 px-4 text-[12px] font-semibold text-white disabled:opacity-50">Agregar</button></div></div></div>}
        {creatingCustomer && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4"><div className="w-full max-w-md rounded-xl border border-border-light bg-surface-1 p-6 shadow-2xl"><h2 className="text-[16px] font-semibold">Nuevo cliente</h2><div className="mt-5 grid gap-3"><input autoFocus value={customerDraft.rif} onChange={(event) => setCustomerDraft((current) => ({ ...current, rif: event.target.value }))} placeholder="RIF o cédula" className="h-10 rounded-lg border border-border-light px-3 outline-none focus:border-primary-500"/><input value={customerDraft.name} onChange={(event) => setCustomerDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Nombre o razón social" className="h-10 rounded-lg border border-border-light px-3 outline-none focus:border-primary-500"/></div><div className="mt-5 flex justify-end gap-2"><button onClick={() => setCreatingCustomer(false)} className="h-9 rounded-lg border border-border-light px-4 text-[12px]">Cancelar</button><button onClick={createCustomer} disabled={!customerDraft.rif.trim() || !customerDraft.name.trim()} className="h-9 rounded-lg bg-primary-500 px-4 text-[12px] font-semibold text-white disabled:opacity-50">Crear cliente</button></div></div></div>}
        {completed && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-md rounded-2xl border border-border-light bg-surface-1 p-7 text-center shadow-2xl"><div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600"><CheckCircle2 size={30}/></div><h2 className="mt-4 text-xl font-semibold">Venta confirmada</h2><p className="mt-1 font-mono text-[12px] text-[var(--text-tertiary)]">Factura Nº {completed.invoiceNumber}</p><p className="mt-5 font-mono text-3xl font-bold text-foreground">Bs {money(completed.total)}</p><div className="mt-6 grid gap-2"><button onClick={downloadPdf} disabled={generatingPdf} className="h-11 rounded-xl bg-primary-500 text-[12px] font-bold uppercase tracking-[.1em] text-white">{generatingPdf ? "Generando…" : "Descargar factura A4"}</button><Link href={`/sales/${completed.id}`} className="flex h-10 items-center justify-center rounded-xl border border-border-light text-[12px]">Abrir factura</Link><button onClick={resetSale} className="h-10 rounded-xl text-[12px] font-semibold text-primary-500">Nueva venta</button></div></div></div>}
    </div>;
}
