"use client";

// Page: ComprasPendientesPage
// Bandeja de facturas de compra confirmadas que se crearon vía flujo rápido
// (proveedor + total) y todavía no tienen items detallados. El asistente de
// inventario abre cada una para imputar productos y mover stock.

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Inbox, Search, Trash2 } from "lucide-react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseListCard } from "@/src/shared/frontend/components/base-list-card";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { usePurchases } from "@/src/modules/purchases/frontend/hooks/use-purchases";
import { isPendingImputation } from "@/src/modules/purchases/backend/domain/purchase-invoice";
import { isPurchaseBookImported } from "@/src/modules/purchases/backend/domain/purchase-book-import";

const fmtMoney = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) => (d ? d.split("T")[0] : "—");

export default function ComprasPendientesPage() {
    const router = useRouter();
    const { companyId } = useCompany();
    const { purchaseInvoices, loadingPurchaseInvoices, loadPurchaseInvoices, suppliers, loadSuppliers, deletePurchaseInvoice } = usePurchases();

    useEffect(() => {
        if (companyId) {
            loadPurchaseInvoices(companyId);
            loadSuppliers(companyId);
        }
    }, [companyId, loadPurchaseInvoices, loadSuppliers]);

    const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
    const [search, setSearch] = useState("");
    const [deletingBatch, setDeletingBatch] = useState(false);

    const supplierNameById = useMemo(
        () => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])),
        [suppliers],
    );

    const pendientes = useMemo(
        () => purchaseInvoices.filter((invoice) => isPendingImputation(invoice) || (invoice.status === "borrador" && isPurchaseBookImported(invoice))),
        [purchaseInvoices],
    );

    const filteredPendientes = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return pendientes;

        return pendientes.filter((invoice) => [
            invoice.supplierName ?? supplierNameById.get(invoice.supplierId) ?? "",
            invoice.invoiceNumber ?? "",
            invoice.controlNumber ?? "",
        ].join(" ").toLowerCase().includes(query));
    }, [pendientes, search, supplierNameById]);


    const importedDrafts = useMemo(
        () => purchaseInvoices.filter((invoice) => invoice.status === "borrador" && invoice.period === period && isPurchaseBookImported(invoice)),
        [purchaseInvoices, period],
    );

    async function handleDeleteBatch() {
        if (importedDrafts.length === 0 || deletingBatch) return;
        const confirmed = window.confirm(
            "Se eliminaran " + importedDrafts.length + " facturas importadas en borrador del periodo " + period + ". Las facturas confirmadas no seran afectadas. Continuar?"
        );
        if (!confirmed) return;
        setDeletingBatch(true);
        for (const invoice of importedDrafts) {
            if (invoice.id) await deletePurchaseInvoice(invoice.id);
        }
        setDeletingBatch(false);
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader
                title="Compras pendientes de imputar"
                subtitle="Facturas precargadas que esperan productos"
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

            <div className="px-4 sm:px-6 py-4 sm:py-6 max-w-5xl mx-auto">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-bold">
                        {search.trim() ? `${filteredPendientes.length} de ${pendientes.length}` : pendientes.length} pendiente{pendientes.length === 1 ? "" : "s"}
                    </p>
                    <p className="hidden sm:block font-sans text-[12px] text-[var(--text-tertiary)]">
                        Los productos se validan contra el libro antes de confirmar.
                    </p>
                </div>

                <div className="mb-4 rounded-xl border border-border-light bg-surface-1 p-3 shadow-[var(--shadow-sm)]">
                    <div className="relative w-full sm:max-w-[520px]">
                        <Search size={14} strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Buscar proveedor, Nº factura o Nº control…"
                            className="w-full h-9 !pl-9 !pr-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[13px] text-foreground placeholder:text-[var(--text-tertiary)] focus:border-primary-500/60 hover:border-border-medium transition-colors"
                        />
                    </div>
                </div>

                <div className="mb-4 rounded-xl border border-border-light bg-surface-1 px-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Lote importado</p>
                        <p className="text-[12px] text-[var(--text-secondary)] mt-1">Borra solo facturas precargadas sin confirmar.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="h-9 rounded-lg border border-border-default bg-surface-1 px-2 text-[12px] text-foreground" aria-label="Período del lote" />
                        <BaseButton.Root variant="secondary" size="sm" leftIcon={<Trash2 size={13} />} disabled={importedDrafts.length === 0 || deletingBatch} onClick={handleDeleteBatch}>
                            {deletingBatch ? "Eliminando…" : `Eliminar ${importedDrafts.length} borrador${importedDrafts.length === 1 ? "" : "es"}`}
                        </BaseButton.Root>
                    </div>
                </div>

                {loadingPurchaseInvoices ? (
                    <div className="rounded-xl border border-border-light bg-surface-1 px-4 py-12 text-center font-mono text-[12px] text-[var(--text-tertiary)]">
                        Cargando…
                    </div>
                ) : pendientes.length === 0 ? (
                    <div className="rounded-xl border border-border-light bg-surface-1 px-4 py-16 flex flex-col items-center justify-center gap-3 text-center">
                        <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center">
                            <Inbox size={20} className="text-[var(--text-tertiary)]" strokeWidth={1.5} />
                        </div>
                        <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                            No hay facturas pendientes
                        </p>
                        <p className="font-sans text-[13px] text-[var(--text-tertiary)] max-w-sm leading-relaxed">
                            Cuando el contador registre una factura por flujo rápido (sin productos), aparecerá aquí para que la imputes.
                        </p>
                    </div>
                ) : filteredPendientes.length === 0 ? (
                    <div className="rounded-xl border border-border-light bg-surface-1 px-4 py-12 flex flex-col items-center gap-2 text-center">
                        <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-foreground">
                            Sin resultados
                        </p>
                        <p className="font-sans text-[13px] text-[var(--text-tertiary)]">
                            Ninguna compra pendiente coincide con la búsqueda.
                        </p>
                        <button
                            type="button"
                            onClick={() => setSearch("")}
                            className="mt-2 text-[11px] uppercase tracking-[0.14em] text-primary-500 hover:text-primary-600 transition-colors"
                        >
                            Limpiar búsqueda
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {filteredPendientes.map((inv) => (
                            <BaseListCard
                                key={inv.id}
                                href={`/inventory/compras-pendientes/${inv.id}`}
                                title={inv.invoiceNumber || `#${inv.id?.slice(0, 8)}`}
                                subtitle={inv.supplierName ?? supplierNameById.get(inv.supplierId) ?? "—"}
                                rows={[
                                    { label: "Fecha", value: fmtDate(inv.date), align: "right", numeric: true },
                                    {
                                        label: "Total",
                                        value: <span className="font-bold">Bs. {fmtMoney(inv.total)}</span>,
                                        align: "right",
                                        numeric: true,
                                    },
                                ]}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
