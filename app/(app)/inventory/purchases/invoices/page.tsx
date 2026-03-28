"use client";

// Purchase invoices list page (Facturas de Compra).
// Lists all purchase invoices with status and allows deletion.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { InvoiceStatus } from "@/src/modules/inventory/backend/domain/purchase-invoice";

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("T")[0].split("-");
    return `${day}/${m}/${y}`;
};

function StatusBadge({ status }: { status: InvoiceStatus }) {
    if (status === "confirmada") {
        return (
            <span className="inline-flex px-1.5 py-0.5 rounded border text-[11px] uppercase tracking-[0.08em] font-medium badge-success">
                Confirmada
            </span>
        );
    }
    return (
        <span className="inline-flex px-1.5 py-0.5 rounded border text-[11px] uppercase tracking-[0.08em] font-medium badge-warning">
            Borrador
        </span>
    );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function PurchaseInvoicesPage() {
    const { companyId } = useCompany();
    const { purchaseInvoices, loadingPurchaseInvoices, error, setError, loadPurchaseInvoices, deletePurchaseInvoice } = useInventory();

    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [confirmDeleteConfirmada, setConfirmDeleteConfirmada] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (companyId) loadPurchaseInvoices(companyId);
    }, [companyId, loadPurchaseInvoices]);

    function requestDelete(id: string, status: string) {
        if (status === "confirmada") {
            setConfirmDeleteConfirmada(id);
        } else {
            setConfirmDelete(id);
        }
    }

    async function handleDelete(id: string) {
        setDeleting(true);
        await deletePurchaseInvoice(id);
        setDeleting(false);
        setConfirmDelete(null);
        setConfirmDeleteConfirmada(null);
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[16px] font-bold uppercase tracking-[0.14em] text-foreground">
                            Facturas de Compra
                        </h1>
                        <p className="text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em] mt-0.5">
                            Registro de compras a proveedores
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link
                            href="/inventory/purchases"
                            className="h-9 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[12px] uppercase tracking-[0.12em] transition-colors inline-flex items-center"
                        >
                            ← Libro de entradas
                        </Link>
                        <Link
                            href="/inventory/purchases/new"
                            className="h-9 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[12px] uppercase tracking-[0.12em] transition-colors inline-flex items-center"
                        >
                            + Nueva factura
                        </Link>
                    </div>
                </div>
            </div>

            {/* Warning modal for deleting a confirmed invoice */}
            {confirmDeleteConfirmada && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-surface-1 border border-yellow-500/20 rounded-xl shadow-xl w-full max-w-lg mx-4">
                        <div className="px-6 py-4 border-b border-yellow-500/20 bg-yellow-500/[0.06] rounded-t-xl">
                            <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-yellow-600">
                                Advertencia: Factura confirmada
                            </h2>
                        </div>
                        <div className="px-6 py-5">
                            <p className="text-[14px] text-foreground leading-relaxed">
                                Eliminar una factura confirmada puede distorsionar el costo promedio del inventario si hubo movimientos posteriores a esta compra.
                                La práctica contable correcta es registrar una <strong>devolución de compra</strong>.
                            </p>
                            <p className="mt-3 text-[13px] text-yellow-600 font-medium">
                                ¿Deseas continuar de todas formas?
                            </p>
                        </div>
                        <div className="px-6 py-4 border-t border-border-light flex items-center justify-end gap-3">
                            <button
                                onClick={() => { setConfirmDeleteConfirmada(null); setError(null); }}
                                disabled={deleting}
                                className="h-9 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 disabled:opacity-50 text-foreground text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleDelete(confirmDeleteConfirmada)}
                                disabled={deleting}
                                className="h-9 px-4 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                {deleting ? "Eliminando…" : "Sí, eliminar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="px-8 py-6 space-y-4">
                {/* Error */}
                {error && (
                    <div className="px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[13px]">
                        {error}
                    </div>
                )}

                {/* Table */}
                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    {loadingPurchaseInvoices ? (
                        <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">Cargando…</div>
                    ) : purchaseInvoices.length === 0 ? (
                        <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">
                            No hay facturas. Haz clic en &quot;+ Nueva factura&quot; para crear una.
                        </div>
                    ) : (
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="border-b border-border-light">
                                    {["Fecha", "Proveedor", "Nº Factura", "Subtotal", "IVA", "Total", "Estado", "Ver", ""].map((h, i) => (
                                        <th key={i} className="px-4 py-2.5 text-left text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal whitespace-nowrap">
                                            {h === "Ver" ? "" : h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {purchaseInvoices.map((f) => (
                                    <tr key={f.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                        <td className="px-4 py-2.5 text-[var(--text-secondary)] tabular-nums">{fmtDate(f.date)}</td>
                                        <td className="px-4 py-2.5 text-foreground font-medium">{f.supplierName ?? "—"}</td>
                                        <td className="px-4 py-2.5 text-[var(--text-secondary)]">{f.invoiceNumber || "—"}</td>
                                        <td className="px-4 py-2.5 tabular-nums text-[var(--text-primary)]">{fmtN(f.subtotal)}</td>
                                        <td className="px-4 py-2.5 tabular-nums text-[var(--text-secondary)]">{fmtN(f.vatAmount)}</td>
                                        <td className="px-4 py-2.5 tabular-nums font-medium text-foreground">{fmtN(f.total)}</td>
                                        <td className="px-4 py-2.5"><StatusBadge status={f.status} /></td>
                                        <td className="px-4 py-2.5">
                                            <Link
                                                href={`/inventory/purchases/${f.id}`}
                                                className="text-[11px] uppercase tracking-[0.10em] text-primary-500 hover:text-primary-600 transition-colors"
                                            >
                                                Ver
                                            </Link>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {confirmDelete === f.id ? (
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => handleDelete(f.id!)}
                                                        disabled={deleting}
                                                        className="text-[11px] uppercase tracking-[0.10em] text-red-500 hover:text-red-600 disabled:opacity-50 transition-colors"
                                                    >
                                                        {deleting ? "…" : "Confirmar"}
                                                    </button>
                                                    <span className="text-[var(--text-tertiary)]">·</span>
                                                    <button
                                                        onClick={() => { setConfirmDelete(null); setError(null); }}
                                                        className="text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] hover:text-foreground transition-colors"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => requestDelete(f.id!, f.status)}
                                                    className="text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
                                                >
                                                    Eliminar
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
