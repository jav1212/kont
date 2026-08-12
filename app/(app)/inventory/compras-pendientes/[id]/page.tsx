"use client";

// Page: ComprasPendientesDetailPage
// Wizard de imputación de items. El header viene read-only desde la factura
// confirmada; el editor de items reusa FacturaItemsGrid del módulo purchases.
// Al confirmar, llama a /api/purchases/[id]/impute-items que crea movimientos,
// recalcula totales del header y reescribe el asiento contable.

import { use, useEffect, useMemo, useState } from "react";
import { ChevronLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { usePurchases } from "@/src/modules/purchases/frontend/hooks/use-purchases";
import { notify } from "@/src/shared/frontend/notify";
import type { PurchaseInvoiceItem } from "@/src/modules/purchases/backend/domain/purchase-invoice";
import { isPendingImputation } from "@/src/modules/purchases/backend/domain/purchase-invoice";
import { getPurchaseBookImportMeta, isPurchaseBookImported } from "@/src/modules/purchases/backend/domain/purchase-book-import";
import { FacturaItemsGrid, emptyItem } from "@/src/modules/purchases/frontend/components/factura-items-grid";
import { QuickProductCreator } from "@/src/modules/purchases/frontend/components/quick-product-creator";
import type { Product } from "@/src/modules/inventory/backend/domain/product";

const fmt = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const labelCls = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]";

export default function ComprasPendientesDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { companyId } = useCompany();
    const { products, departments, loadProducts, saveProduct } = useInventory();
    const {
        currentPurchaseInvoice, loadingPurchaseInvoice, loadPurchaseInvoice,
        suppliers, loadSuppliers,
        imputePurchaseInvoiceItems, savePurchaseInvoice, confirmPurchaseInvoice,
    } = usePurchases();

    const [items, setItems] = useState<PurchaseInvoiceItem[]>([emptyItem()]);
    const [applyCurrencyToAll, setApplyCurrencyToAll] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [createProductName, setCreateProductName] = useState<string | null>(null);
    const [createProductIndex, setCreateProductIndex] = useState<number | null>(null);

    useEffect(() => {
        if (companyId) {
            loadProducts(companyId);
            loadSuppliers(companyId);
        }
    }, [companyId, loadProducts, loadSuppliers]);

    useEffect(() => {
        if (id) loadPurchaseInvoice(id);
    }, [id, loadPurchaseInvoice]);

    const supplierName = (sid: string) => suppliers.find((s) => s.id === sid)?.name ?? "—";

    const itemsTotal = useMemo(
        () => items.reduce((acc, it) => acc + (Number(it.totalCost) || 0), 0),
        [items],
    );

    const imported = Boolean(currentPurchaseInvoice && isPurchaseBookImported(currentPurchaseInvoice));
    const importMeta = getPurchaseBookImportMeta(currentPurchaseInvoice?.notes);
    const headerTotal = imported ? (importMeta?.exempt ?? 0) + (importMeta?.taxableBase ?? 0) : (currentPurchaseInvoice?.subtotal ?? 0);
    const expectedVat = imported ? (importMeta?.vatAmount ?? 0) : 0;
    const itemsVat = useMemo(() => items.reduce((acc, item) => { const base = Number(item.baseIVA ?? item.totalCost) || 0; return acc + (item.vatRate === "general_16" ? base * 0.16 : item.vatRate === "reducida_8" ? base * 0.08 : 0); }, 0), [items]);
    const diff = imported ? (itemsTotal - headerTotal) + (itemsVat - expectedVat) : itemsTotal - headerTotal;
    const cuadra = !imported || (Math.abs(itemsTotal - headerTotal) < 0.02 && Math.abs(itemsVat - expectedVat) < 0.02);

    const validItems = items.filter((it) => it.productId && (it.quantity ?? 0) > 0);
    const canSubmit = validItems.length > 0 && (!imported || cuadra) && !submitting;

    function handleProductCreated(product: Product) {
        const productId = product.id;
        if (!productId) return;
        setItems((current) => {
            const index = createProductIndex ?? current.findIndex((item) => !item.productId);
            if (index < 0) return current;
            const next = { ...current[index], productId, productName: product.name, vatRate: product.vatType === "exento" ? "exenta" as const : "general_16" as const };
            return current.map((item, itemIndex) => itemIndex === index ? next : item);
        });
        setCreateProductName(null);
        setCreateProductIndex(null);
    }

    async function handleSubmit() {
        if (!canSubmit || !currentPurchaseInvoice?.id) return;
        setSubmitting(true);
        const result = imported
            ? await (async () => { const draft = await savePurchaseInvoice(currentPurchaseInvoice, validItems); return draft?.id ? confirmPurchaseInvoice(draft.id) : null; })()
            : await imputePurchaseInvoiceItems(currentPurchaseInvoice.id, validItems);
        setSubmitting(false);
        if (result) {
            notify.success(imported ? "Factura conciliada y confirmada." : "Items imputados; stock y asiento contable actualizados.");
            router.push("/inventory/compras-pendientes");
        }
    }

    if (loadingPurchaseInvoice || !currentPurchaseInvoice) {
        return (
            <div className="min-h-full bg-surface-2 font-mono px-6 py-12 text-center text-[12px] text-[var(--text-tertiary)]">
                Cargando factura…
            </div>
        );
    }

    if (!isPendingImputation(currentPurchaseInvoice) && !(currentPurchaseInvoice.status === "borrador" && imported)) {
        return (
            <div className="min-h-full bg-surface-2 font-mono">
                <PageHeader title="Imputar inventario" subtitle="Factura no apta">
                    <BaseButton.Root variant="secondary" size="sm" leftIcon={<ChevronLeft size={14} strokeWidth={2} />} onClick={() => router.back()}>
                        Volver
                    </BaseButton.Root>
                </PageHeader>
                <div className="px-6 py-12 max-w-2xl mx-auto">
                    <div className="rounded-xl border border-border-light bg-surface-1 px-6 py-8 text-center">
                        <AlertTriangle size={28} className="mx-auto text-amber-500 mb-3" strokeWidth={1.5} />
                        <p className="text-[13px] text-foreground font-bold mb-1">Esta factura no está pendiente de imputar.</p>
                        <p className="text-[12px] text-[var(--text-tertiary)] font-sans">
                            Sólo se pueden imputar facturas confirmadas que se crearon vía flujo rápido y aún no tienen items.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader
                title="Imputar inventario"
                subtitle={currentPurchaseInvoice.invoiceNumber || `#${id.slice(0, 8)}`}
            >
                <BaseButton.Root variant="secondary" size="sm" leftIcon={<ChevronLeft size={14} strokeWidth={2} />} onClick={() => router.back()}>
                    Volver
                </BaseButton.Root>
            </PageHeader>

            <div className="px-4 sm:px-6 py-4 sm:py-6 max-w-5xl mx-auto space-y-4 sm:space-y-6">
                {/* Tutorial inline */}
                <p className="font-sans text-[12px] text-[var(--text-tertiary)] leading-snug">
                    Agrega los productos de la factura abajo. Al guardar, se crearán los movimientos de inventario, se actualizará el stock, y los totales reales reemplazarán el monto declarado del header. El asiento contable se reescribirá con los nuevos totales.
                </p>

                {/* Header read-only */}
                <div className="rounded-xl border border-border-light bg-surface-1 px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <p className={labelCls}>Proveedor</p>
                        <p className="text-[13px] text-foreground font-bold mt-1 truncate">
                            {supplierName(currentPurchaseInvoice.supplierId)}
                        </p>
                    </div>
                    <div>
                        <p className={labelCls}>Fecha</p>
                        <p className="text-[13px] text-foreground tabular-nums mt-1">
                            {currentPurchaseInvoice.date}
                        </p>
                    </div>
                    <div>
                        <p className={labelCls}>Período</p>
                        <p className="text-[13px] text-foreground tabular-nums mt-1">
                            {currentPurchaseInvoice.period}
                        </p>
                    </div>
                    <div>
                        <p className={labelCls}>{imported ? "Total del libro" : "Total declarado"}</p>
                        <p className="text-[14px] text-foreground font-bold tabular-nums mt-1">
                            Bs. {fmt(currentPurchaseInvoice.total)}
                        </p>
                    </div>
                </div>

                {/* Editor de items */}
                <div className="rounded-xl border border-border-light bg-surface-1 p-4">
                    <FacturaItemsGrid
                        items={items}
                        products={products}
                        onChange={setItems}
                        dollarRate={currentPurchaseInvoice.dollarRate ?? null}
                        selectedCurrency={currentPurchaseInvoice.currency ?? "VES"}
                        applyCurrencyToAll={applyCurrencyToAll}
                        onApplyCurrencyToAllChange={setApplyCurrencyToAll}
                        decimals={2}
                        onRequestCreateProduct={(search, index) => { setCreateProductName(search); setCreateProductIndex(index ?? null); }}
                    />
                </div>

                {createProductName !== null && companyId && (
                    <QuickProductCreator
                        companyId={companyId}
                        departments={departments}
                        initialName={createProductName}
                        saveProduct={saveProduct}
                        onCreated={handleProductCreated}
                        onClose={() => { setCreateProductName(null); setCreateProductIndex(null); }}
                    />
                )}

                {/* Comparación de totales */}
                <div className={[
                    "rounded-xl border px-4 sm:px-5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4",
                    cuadra
                        ? "border-emerald-300/50 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800/40"
                        : "border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/40",
                ].join(" ")}>
                    <div>
                        <p className={labelCls}>Subtotal declarado</p>
                        <p className="text-[13px] text-foreground tabular-nums mt-1 font-bold">
                            Bs. {fmt(headerTotal)}
                        </p>
                    </div>
                    <div>
                        <p className={labelCls}>Suma de items</p>
                        <p className="text-[13px] text-foreground tabular-nums mt-1 font-bold">
                            Bs. {fmt(itemsTotal)}
                        </p>
                    </div>
                    {imported && <div><p className={labelCls}>IVA del libro / items</p><p className="text-[13px] text-foreground tabular-nums mt-1 font-bold">Bs. {fmt(expectedVat)} / {fmt(itemsVat)}</p></div>}
                    <div className="col-span-2 sm:col-span-1">
                        <p className={labelCls}>Diferencia</p>
                        <p className={[
                            "text-[13px] tabular-nums mt-1 font-bold",
                            cuadra ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-300",
                        ].join(" ")}>
                            {diff >= 0 ? "+" : ""}{fmt(diff)}
                        </p>
                    </div>
                    {!cuadra && (
                        <p className="col-span-2 sm:col-span-3 text-[11px] text-amber-800 dark:text-amber-300 font-sans leading-snug">
                            Los items no cuadran con el subtotal declarado. Al guardar, el header se recalculará desde los items y el asiento contable se reescribirá con los nuevos montos.
                        </p>
                    )}
                </div>

                {/* CTA */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3">
                    <BaseButton.Root
                        variant="secondary"
                        size="md"
                        onClick={() => router.back()}
                    >
                        Cancelar
                    </BaseButton.Root>
                    <BaseButton.Root
                        variant="primary"
                        size="md"
                        leftIcon={<CheckCircle2 size={14} strokeWidth={2} />}
                        disabled={!canSubmit}
                        onClick={handleSubmit}
                    >
                        {submitting ? "Imputando…" : "Confirmar imputación"}
                    </BaseButton.Root>
                </div>
            </div>
        </div>
    );
}
