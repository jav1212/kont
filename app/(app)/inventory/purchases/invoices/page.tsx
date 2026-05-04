"use client";

// Purchase invoices list page (Archivo de Facturas).
// Lists all purchase invoices across periods. Editing — including the
// unconfirm → edit → reconfirm cycle for confirmed invoices — happens on the
// detail page at /inventory/purchases/[id]. This page only filters, searches,
// navigates and deletes.

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, ChevronLeft, Plus, Search, Trash2, X } from "lucide-react";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { InvoiceStatus } from "@/src/modules/inventory/backend/domain/purchase-invoice";
import { MigrateInvoicesDialog } from "./migrate-dialog";

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("T")[0].split("-");
    return `${day}/${m}/${y}`;
};

const MONTHS_SHORT = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
] as const;

const fmtPeriod = (period: string) => {
    if (!period) return "—";
    const [y, m] = period.split("-");
    const month = MONTHS_SHORT[(Number(m) - 1) | 0] ?? "";
    return `${month} ${y}`;
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

// ── Page ─────────────────────────────────────────────────────────────────────

type StatusFilter = "all" | InvoiceStatus;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: "all",        label: "Todas" },
    { value: "borrador",   label: "Borradores" },
    { value: "confirmada", label: "Confirmadas" },
];

export default function PurchaseInvoicesPage() {
    const { companyId, companies } = useCompany();
    const {
        purchaseInvoices, loadingPurchaseInvoices,
        loadPurchaseInvoices, deletePurchaseInvoice,
        migratePurchaseInvoices,
    } = useInventory();

    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [confirmDeleteConfirmada, setConfirmDeleteConfirmada] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [migrateOpen, setMigrateOpen] = useState(false);

    useEffect(() => {
        if (companyId) loadPurchaseInvoices(companyId);
    }, [companyId, loadPurchaseInvoices]);

    const counts = useMemo<Record<StatusFilter, number>>(() => ({
        all:        purchaseInvoices.length,
        borrador:   purchaseInvoices.filter((f) => f.status === "borrador").length,
        confirmada: purchaseInvoices.filter((f) => f.status === "confirmada").length,
    }), [purchaseInvoices]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return purchaseInvoices
            .filter((f) => statusFilter === "all" || f.status === statusFilter)
            .filter((f) => {
                if (!q) return true;
                const haystack = [
                    f.supplierName ?? "",
                    f.invoiceNumber ?? "",
                    f.controlNumber ?? "",
                    f.period ?? "",
                ].join(" ").toLowerCase();
                return haystack.includes(q);
            })
            .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    }, [purchaseInvoices, statusFilter, search]);

    // Sólo los IDs visibles son seleccionables. La selección persiste a través
    // de cambios de filtro (el usuario puede combinarlos), pero la barra de
    // acciones cuenta sólo los que el usuario tiene marcados explícitamente.
    const selectedInvoices = useMemo(
        () => purchaseInvoices.filter((f) => f.id && selected.has(f.id)),
        [purchaseInvoices, selected],
    );
    const visibleIds = useMemo(
        () => filtered.map((f) => f.id).filter((id): id is string => Boolean(id)),
        [filtered],
    );
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
    const someVisibleSelected = visibleIds.some((id) => selected.has(id)) && !allVisibleSelected;

    function toggleRow(id: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    function toggleAllVisible() {
        setSelected((prev) => {
            const next = new Set(prev);
            if (allVisibleSelected) {
                visibleIds.forEach((id) => next.delete(id));
            } else {
                visibleIds.forEach((id) => next.add(id));
            }
            return next;
        });
    }

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

    async function handleMigrate(targetCompanyId: string, targetPeriod: string | null) {
        const ids = Array.from(selected);
        if (ids.length === 0) return null;
        const res = await migratePurchaseInvoices(ids, targetCompanyId, targetPeriod);
        if (res) {
            // Limpia las migradas/omitidas de la selección — quitarlas todas es
            // suficiente porque ya no pertenecen a esta empresa.
            setSelected((prev) => {
                const next = new Set(prev);
                res.migrated.forEach((m) => next.delete(m.id));
                res.skipped.forEach((s) => next.delete(s.id));
                return next;
            });
        }
        return res;
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Archivo de Facturas" subtitle="Histórico completo · todos los períodos">
                <BaseButton.Root
                    as={Link}
                    href="/inventory/purchases"
                    variant="secondary"
                    size="sm"
                    leftIcon={<ChevronLeft size={14} strokeWidth={2} />}
                >
                    Tablero de entradas
                </BaseButton.Root>
                <BaseButton.Root
                    as={Link}
                    href="/inventory/purchases/new"
                    variant="primary"
                    size="sm"
                    leftIcon={<Plus size={14} strokeWidth={2} />}
                >
                    Nueva factura
                </BaseButton.Root>
            </PageHeader>

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
                            <BaseButton.Root
                                variant="secondary"
                                size="md"
                                onClick={() => { setConfirmDeleteConfirmada(null); }}
                                disabled={deleting}
                            >
                                Cancelar
                            </BaseButton.Root>
                            <BaseButton.Root
                                variant="danger"
                                size="md"
                                onClick={() => handleDelete(confirmDeleteConfirmada)}
                                disabled={deleting}
                            >
                                {deleting ? "Eliminando…" : "Sí, eliminar"}
                            </BaseButton.Root>
                        </div>
                    </div>
                </div>
            )}

            <div className="px-8 py-6 space-y-5">
                {/* Toolbar: status chips + search */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex rounded-lg border border-border-light bg-surface-1 overflow-hidden">
                        {STATUS_OPTIONS.map((opt, i) => {
                            const active = statusFilter === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setStatusFilter(opt.value)}
                                    className={[
                                        "px-3 h-9 text-[11px] uppercase tracking-[0.12em] transition-colors flex items-center gap-1.5",
                                        i > 0 ? "border-l border-border-light" : "",
                                        active
                                            ? "bg-primary-500/10 text-primary-500"
                                            : "text-[var(--text-secondary)] hover:bg-surface-2",
                                    ].join(" ")}
                                >
                                    {opt.label}
                                    <span className={[
                                        "px-1.5 py-0.5 rounded text-[10px] tabular-nums",
                                        active ? "bg-primary-500/15 text-primary-500" : "bg-surface-2 text-[var(--text-tertiary)]",
                                    ].join(" ")}>
                                        {counts[opt.value]}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="relative flex-1 min-w-[240px] max-w-md">
                        <Search size={14} strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar proveedor, Nº factura, Nº control o período (YYYY-MM)…"
                            className="w-full h-9 pl-9 pr-9 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[13px] text-foreground placeholder:text-[var(--text-tertiary)] focus:border-primary-500/60 hover:border-border-medium transition-colors"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded flex items-center justify-center text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                                aria-label="Limpiar búsqueda"
                            >
                                <X size={12} strokeWidth={2} />
                            </button>
                        )}
                    </div>

                    <span className="ml-auto text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] tabular-nums">
                        {filtered.length} {filtered.length === 1 ? "factura" : "facturas"}
                    </span>
                </div>


                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    {loadingPurchaseInvoices ? (
                        <div className="px-5 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">Cargando facturas…</div>
                    ) : purchaseInvoices.length === 0 ? (
                        <div className="px-5 py-16 flex flex-col items-center gap-3 text-center">
                            <p className="text-[12px] uppercase tracking-[0.12em] text-foreground">Sin facturas registradas</p>
                            <p className="font-sans text-[13px] text-[var(--text-tertiary)] max-w-sm">
                                Haz clic en <strong className="text-foreground">Nueva factura</strong> para crear la primera.
                            </p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="px-5 py-12 flex flex-col items-center gap-2 text-center">
                            <p className="text-[12px] uppercase tracking-[0.12em] text-foreground">Sin resultados</p>
                            <p className="font-sans text-[13px] text-[var(--text-tertiary)]">
                                Ningún registro coincide con los filtros activos.
                            </p>
                            <button
                                type="button"
                                onClick={() => { setSearch(""); setStatusFilter("all"); }}
                                className="mt-2 text-[11px] uppercase tracking-[0.14em] text-primary-500 hover:text-primary-600 transition-colors"
                            >
                                Limpiar filtros
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1140px] text-[13px]">
                                <thead>
                                    <tr className="border-b border-border-light bg-surface-2/50">
                                        <th className="w-10 px-3 py-2.5">
                                            <input
                                                type="checkbox"
                                                aria-label="Seleccionar todas las facturas visibles"
                                                checked={allVisibleSelected}
                                                ref={(el) => { if (el) el.indeterminate = someVisibleSelected; }}
                                                onChange={toggleAllVisible}
                                                className="size-3.5 align-middle accent-primary-500 cursor-pointer"
                                            />
                                        </th>
                                        {[
                                            { h: "Fecha", align: "left" },
                                            { h: "Período", align: "left" },
                                            { h: "Proveedor", align: "left" },
                                            { h: "Nº Factura", align: "left" },
                                            { h: "Tasa", align: "right" },
                                            { h: "Subtotal", align: "right" },
                                            { h: "IVA", align: "right" },
                                            { h: "Total", align: "right" },
                                            { h: "Estado", align: "left" },
                                            { h: "", align: "left" },
                                            { h: "", align: "left" },
                                        ].map((c, i) => (
                                            <th key={i} className={`px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal whitespace-nowrap text-${c.align}`}>
                                                {c.h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                {filtered.map((f) => (
                                    <tr
                                        key={f.id}
                                        className={[
                                            "border-b border-border-light/50 transition-colors",
                                            f.id && selected.has(f.id)
                                                ? "bg-primary-500/[0.06] hover:bg-primary-500/[0.10]"
                                                : "hover:bg-surface-2",
                                        ].join(" ")}
                                    >
                                        <td className="w-10 px-3 py-2.5">
                                            <input
                                                type="checkbox"
                                                aria-label={`Seleccionar factura ${f.invoiceNumber || f.id}`}
                                                checked={Boolean(f.id && selected.has(f.id))}
                                                onChange={() => f.id && toggleRow(f.id)}
                                                className="size-3.5 align-middle accent-primary-500 cursor-pointer"
                                            />
                                        </td>
                                        <td className="px-4 py-2.5 text-[var(--text-secondary)] tabular-nums whitespace-nowrap">{fmtDate(f.date)}</td>
                                        <td className="px-4 py-2.5 text-[var(--text-tertiary)] uppercase tracking-[0.08em] text-[11px] tabular-nums whitespace-nowrap">{fmtPeriod(f.period)}</td>
                                        <td className="px-4 py-2.5 text-foreground font-medium">{f.supplierName ?? "—"}</td>
                                        <td className="px-4 py-2.5 text-[var(--text-secondary)]">{f.invoiceNumber || "—"}</td>
                                        <td className="px-4 py-2.5 text-[var(--text-secondary)] tabular-nums text-right">
                                            {f.dollarRate != null
                                                ? f.dollarRate.toLocaleString("es-VE", { maximumFractionDigits: f.rateDecimals ?? 2, minimumFractionDigits: f.rateDecimals ?? 2 })
                                                : "—"}
                                        </td>
                                        <td className="px-4 py-2.5 tabular-nums text-[var(--text-primary)] text-right">{fmtN(f.subtotal)}</td>
                                        <td className="px-4 py-2.5 tabular-nums text-[var(--text-secondary)] text-right">{fmtN(f.vatAmount)}</td>
                                        <td className="px-4 py-2.5 tabular-nums font-medium text-foreground text-right">{fmtN(f.total)}</td>
                                        <td className="px-4 py-2.5"><StatusBadge status={f.status} /></td>
                                        <td className="px-4 py-2.5 whitespace-nowrap">
                                            <Link
                                                href={`/inventory/purchases/${f.id}`}
                                                className="px-2 h-7 inline-flex items-center text-[11px] uppercase tracking-[0.10em] text-primary-500 hover:text-primary-600 transition-colors"
                                            >
                                                Editar
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
                                                        onClick={() => { setConfirmDelete(null); }}
                                                        className="text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] hover:text-foreground transition-colors"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => requestDelete(f.id!, f.status)}
                                                    className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                                    title="Eliminar"
                                                    aria-label="Eliminar"
                                                >
                                                    <Trash2 size={14} strokeWidth={2} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Barra flotante de acciones — visible cuando hay selección de la empresa actual */}
            {selectedInvoices.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border-light bg-surface-1 shadow-lg">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-foreground tabular-nums">
                        {selectedInvoices.length} {selectedInvoices.length === 1 ? "factura seleccionada" : "facturas seleccionadas"}
                    </span>
                    <span className="h-5 w-px bg-border-light" />
                    <button
                        type="button"
                        onClick={() => setSelected(new Set())}
                        className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] hover:text-foreground transition-colors"
                    >
                        Cancelar
                    </button>
                    <BaseButton.Root
                        variant="primary"
                        size="sm"
                        onClick={() => setMigrateOpen(true)}
                        leftIcon={<ArrowRightLeft size={14} strokeWidth={2} />}
                    >
                        Migrar a otra empresa…
                    </BaseButton.Root>
                </div>
            )}

            {/* Dialog de migración — montado/desmontado para resetear estado */}
            {migrateOpen && (
                <MigrateInvoicesDialog
                    invoices={selectedInvoices}
                    companies={companies}
                    sourceCompanyId={companyId ?? ""}
                    onClose={() => setMigrateOpen(false)}
                    onMigrate={handleMigrate}
                />
            )}
        </div>
    );
}
