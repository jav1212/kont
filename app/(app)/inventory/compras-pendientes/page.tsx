"use client";

// Page: ComprasPendientesPage
// Bandeja de facturas de compra confirmadas que se crearon vía flujo rápido
// (proveedor + total) y todavía no tienen items detallados. El asistente de
// inventario abre cada una para imputar productos y mover stock.

import { useEffect, useMemo } from "react";
import { ChevronLeft, Inbox, ArrowRight } from "lucide-react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { usePurchases } from "@/src/modules/purchases/frontend/hooks/use-purchases";
import { isPendingImputation } from "@/src/modules/purchases/backend/domain/purchase-invoice";

const fmtMoney = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) => (d ? d.split("T")[0] : "—");

export default function ComprasPendientesPage() {
    const router = useRouter();
    const { companyId } = useCompany();
    const { purchaseInvoices, loadingPurchaseInvoices, loadPurchaseInvoices, suppliers, loadSuppliers } = usePurchases();

    useEffect(() => {
        if (companyId) {
            loadPurchaseInvoices(companyId);
            loadSuppliers(companyId);
        }
    }, [companyId, loadPurchaseInvoices, loadSuppliers]);

    const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";

    const pendientes = useMemo(
        () => purchaseInvoices.filter(isPendingImputation),
        [purchaseInvoices],
    );

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader
                title="Compras pendientes de imputar"
                subtitle="Facturas confirmadas sin detalle de productos"
            >
                <BaseButton.Root
                    variant="secondary"
                    size="sm"
                    leftIcon={<ChevronLeft size={14} strokeWidth={2} />}
                    onClick={() => router.back()}
                >
                    Volver
                </BaseButton.Root>
            </PageHeader>

            <div className="px-6 py-6 max-w-5xl mx-auto">
                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border-light flex items-center justify-between">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-bold">
                            {pendientes.length} pendiente{pendientes.length === 1 ? "" : "s"}
                        </p>
                        <p className="text-[11px] text-[var(--text-tertiary)]">
                            Tip: imputar items mueve el stock y reescribe el asiento contable.
                        </p>
                    </div>

                    {loadingPurchaseInvoices ? (
                        <div className="px-4 py-12 text-center text-[12px] text-[var(--text-tertiary)]">
                            Cargando…
                        </div>
                    ) : pendientes.length === 0 ? (
                        <div className="px-4 py-16 flex flex-col items-center justify-center gap-3 text-center">
                            <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center">
                                <Inbox size={20} className="text-[var(--text-tertiary)]" strokeWidth={1.5} />
                            </div>
                            <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                                No hay facturas pendientes
                            </p>
                            <p className="font-sans text-[12px] text-[var(--text-tertiary)] max-w-sm">
                                Cuando el contador registre una factura por flujo rápido (sin productos), aparecerá aquí para que la imputes.
                            </p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-border-light">
                            {pendientes.map((inv) => (
                                <li key={inv.id}>
                                    <Link
                                        href={`/inventory/compras-pendientes/${inv.id}`}
                                        className="grid grid-cols-[1fr_120px_140px_40px] items-center gap-4 px-4 py-3 hover:bg-surface-2 transition-colors"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-[13px] text-foreground font-bold truncate">
                                                {inv.invoiceNumber || `#${inv.id?.slice(0, 8)}`}
                                            </p>
                                            <p className="text-[11px] text-[var(--text-tertiary)] truncate">
                                                {supplierName(inv.supplierId)}
                                            </p>
                                        </div>
                                        <div className="text-[12px] text-[var(--text-secondary)] tabular-nums">
                                            {fmtDate(inv.date)}
                                        </div>
                                        <div className="text-[13px] text-foreground font-bold tabular-nums text-right">
                                            Bs. {fmtMoney(inv.total)}
                                        </div>
                                        <ArrowRight size={14} className="text-[var(--text-tertiary)]" strokeWidth={2} />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
