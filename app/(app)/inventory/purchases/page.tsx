"use client";

// Page: Entradas de Inventario (hub).
// Promotes purchase-invoice list into the module's primary entry point so
// users landing here after a save/confirm see operational context, not an
// empty placeholder. The cross-period archive lives at /invoices and the
// detail/edit surface remains at /[id].

import { useEffect, useMemo, useState } from "react";
import {
    Search,
    ChevronLeft,
    ChevronRight,
    Calendar,
    FileText,
    Plus,
    BookOpen,
    Archive,
    Trash2,
    AlertTriangle,
} from "lucide-react";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { DashboardKpiCard } from "@/src/shared/frontend/components/dashboard-kpi-card";
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

const MONTHS_LONG = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

function currentPeriodKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function periodLabel(key: string): string {
    const [y, m] = key.split("-");
    const month = MONTHS_LONG[(Number(m) - 1) | 0] ?? "";
    return `${month} ${y}`;
}

function shiftPeriod(key: string, delta: number): string {
    const [y, m] = key.split("-").map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: InvoiceStatus }) {
    const cls = status === "confirmada" ? "badge-success" : "badge-warning";
    const label = status === "confirmada" ? "Confirmada" : "Borrador";
    return (
        <span className={`inline-flex px-1.5 py-0.5 rounded border text-[11px] uppercase tracking-[0.08em] font-medium ${cls}`}>
            {label}
        </span>
    );
}

// ── Status filter chips ───────────────────────────────────────────────────────

type StatusFilter = "all" | InvoiceStatus;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: "all",        label: "Todas" },
    { value: "borrador",   label: "Borradores" },
    { value: "confirmada", label: "Confirmadas" },
];

function StatusFilterChips({
    value,
    onChange,
    counts,
}: {
    value: StatusFilter;
    onChange: (v: StatusFilter) => void;
    counts: Record<StatusFilter, number>;
}) {
    return (
        <div className="inline-flex rounded-lg border border-border-light bg-surface-1 overflow-hidden">
            {STATUS_OPTIONS.map((opt, i) => {
                const active = value === opt.value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(opt.value)}
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
    );
}

// ── Period picker ─────────────────────────────────────────────────────────────

function PeriodPicker({
    period,
    onChange,
}: {
    period: string;
    onChange: (next: string) => void;
}) {
    const today = currentPeriodKey();
    const isCurrent = period === today;

    return (
        <div className="inline-flex items-center gap-1 rounded-lg border border-border-light bg-surface-1 px-1 h-9">
            <button
                type="button"
                onClick={() => onChange(shiftPeriod(period, -1))}
                className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                aria-label="Mes anterior"
            >
                <ChevronLeft size={14} strokeWidth={2} />
            </button>
            <div className="px-2 flex items-center gap-1.5 min-w-[140px] justify-center">
                <Calendar size={12} strokeWidth={2} className="text-[var(--text-tertiary)]" />
                <span className="text-[12px] uppercase tracking-[0.12em] text-foreground tabular-nums">
                    {periodLabel(period)}
                </span>
            </div>
            <button
                type="button"
                onClick={() => onChange(shiftPeriod(period, 1))}
                className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                aria-label="Mes siguiente"
            >
                <ChevronRight size={14} strokeWidth={2} />
            </button>
            {!isCurrent && (
                <button
                    type="button"
                    onClick={() => onChange(today)}
                    className="ml-1 px-2 h-7 rounded text-[10px] uppercase tracking-[0.14em] text-primary-500 hover:bg-primary-500/10 transition-colors"
                >
                    Hoy
                </button>
            )}
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EntradasPage() {
    const { companyId } = useCompany();
    const {
        purchaseInvoices, loadingPurchaseInvoices,
        loadPurchaseInvoices, deletePurchaseInvoice,
    } = useInventory();

    const [period, setPeriod] = useState<string>(currentPeriodKey());
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [confirmDeleteConfirmada, setConfirmDeleteConfirmada] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (companyId) loadPurchaseInvoices(companyId);
    }, [companyId, loadPurchaseInvoices]);

    // ── derived ────────────────────────────────────────────────────────────────

    const inPeriod = useMemo(
        () => purchaseInvoices.filter((f) => f.period === period),
        [purchaseInvoices, period],
    );

    const counts = useMemo<Record<StatusFilter, number>>(() => ({
        all:        inPeriod.length,
        borrador:   inPeriod.filter((f) => f.status === "borrador").length,
        confirmada: inPeriod.filter((f) => f.status === "confirmada").length,
    }), [inPeriod]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return inPeriod
            .filter((f) => statusFilter === "all" || f.status === statusFilter)
            .filter((f) => {
                if (!q) return true;
                const haystack = [
                    f.supplierName ?? "",
                    f.invoiceNumber ?? "",
                    f.controlNumber ?? "",
                ].join(" ").toLowerCase();
                return haystack.includes(q);
            })
            .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    }, [inPeriod, statusFilter, search]);

    const kpi = useMemo(() => {
        const confirmed = inPeriod.filter((f) => f.status === "confirmada");
        const drafts    = inPeriod.filter((f) => f.status === "borrador");
        const totalBs   = confirmed.reduce((acc, f) => acc + (f.total ?? 0), 0);
        const ivaBs     = confirmed.reduce((acc, f) => acc + (f.vatAmount ?? 0), 0);
        return {
            confirmedCount: confirmed.length,
            draftCount:     drafts.length,
            totalBs,
            ivaBs,
        };
    }, [inPeriod]);

    // ── handlers ───────────────────────────────────────────────────────────────

    function requestDelete(id: string, status: InvoiceStatus) {
        if (status === "confirmada") setConfirmDeleteConfirmada(id);
        else setConfirmDelete(id);
    }

    async function handleDelete(id: string) {
        setDeleting(true);
        await deletePurchaseInvoice(id);
        setDeleting(false);
        setConfirmDelete(null);
        setConfirmDeleteConfirmada(null);
    }

    // ── render ─────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader
                title="Entradas de Inventario"
                subtitle={`Tablero · ${periodLabel(period)}`}
            >
                <BaseButton.Root
                    as={Link}
                    href="/inventory/purchase-ledger"
                    variant="ghost"
                    size="sm"
                    leftIcon={<BookOpen size={14} strokeWidth={2} />}
                >
                    Libro de entradas
                </BaseButton.Root>
                <BaseButton.Root
                    as={Link}
                    href="/inventory/purchases/invoices"
                    variant="secondary"
                    size="sm"
                    leftIcon={<Archive size={14} strokeWidth={2} />}
                >
                    Archivo de facturas
                </BaseButton.Root>
                <BaseButton.Root
                    as={Link}
                    href="/inventory/purchases/new-manual"
                    variant="secondary"
                    size="sm"
                    leftIcon={<Plus size={14} strokeWidth={2} />}
                >
                    Entrada manual
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

            {/* Confirm-delete dialog (borrador) */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-surface-1 border border-border-medium rounded-xl shadow-xl w-full max-w-md mx-4">
                        <div className="px-6 py-4 border-b border-border-light">
                            <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">
                                Eliminar borrador
                            </h2>
                        </div>
                        <div className="px-6 py-5 font-sans text-[13px] text-[var(--text-secondary)] leading-relaxed">
                            Esta acción elimina la factura sin afectar el inventario. ¿Continuar?
                        </div>
                        <div className="px-6 py-4 border-t border-border-light flex items-center justify-end gap-3">
                            <BaseButton.Root variant="secondary" size="md" onClick={() => { setConfirmDelete(null); }} disabled={deleting}>
                                Cancelar
                            </BaseButton.Root>
                            <BaseButton.Root variant="danger" size="md" onClick={() => handleDelete(confirmDelete)} disabled={deleting}>
                                {deleting ? "Eliminando…" : "Eliminar borrador"}
                            </BaseButton.Root>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm-delete dialog (confirmada — warning) */}
            {confirmDeleteConfirmada && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-surface-1 border border-yellow-500/20 rounded-xl shadow-xl w-full max-w-lg mx-4">
                        <div className="px-6 py-4 border-b border-yellow-500/20 bg-yellow-500/[0.06] rounded-t-xl flex items-center gap-2">
                            <AlertTriangle size={16} strokeWidth={2} className="text-yellow-600" />
                            <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-yellow-600">
                                Advertencia: Factura confirmada
                            </h2>
                        </div>
                        <div className="px-6 py-5 font-sans text-[14px] text-foreground leading-relaxed">
                            <p>
                                Eliminar una factura confirmada puede distorsionar el costo promedio del inventario si hubo movimientos posteriores a esta compra.
                                La práctica contable correcta es registrar una <strong className="font-mono uppercase tracking-[0.06em]">devolución de compra</strong>.
                            </p>
                            <p className="mt-3 text-[13px] text-yellow-700 font-medium">
                                ¿Deseas continuar de todas formas?
                            </p>
                        </div>
                        <div className="px-6 py-4 border-t border-border-light flex items-center justify-end gap-3">
                            <BaseButton.Root variant="secondary" size="md" onClick={() => { setConfirmDeleteConfirmada(null); }} disabled={deleting}>
                                Cancelar
                            </BaseButton.Root>
                            <BaseButton.Root variant="danger" size="md" onClick={() => handleDelete(confirmDeleteConfirmada)} disabled={deleting}>
                                {deleting ? "Eliminando…" : "Sí, eliminar"}
                            </BaseButton.Root>
                        </div>
                    </div>
                </div>
            )}

            <div className="px-8 py-6 space-y-6">
                {/* ── KPI strip ─────────────────────────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <DashboardKpiCard
                        label="Facturas confirmadas"
                        value={kpi.confirmedCount}
                        color="success"
                        icon={FileText}
                        loading={loadingPurchaseInvoices}
                        sublabel={`del período ${periodLabel(period)}`}
                    />
                    <DashboardKpiCard
                        label="Borradores"
                        value={kpi.draftCount}
                        color={kpi.draftCount > 0 ? "warning" : "default"}
                        icon={Archive}
                        loading={loadingPurchaseInvoices}
                        sublabel={kpi.draftCount === 0 ? "todo confirmado" : "pendientes por confirmar"}
                    />
                    <DashboardKpiCard
                        label="Total facturado"
                        value={`Bs ${fmtN(kpi.totalBs)}`}
                        color="primary"
                        loading={loadingPurchaseInvoices}
                        sublabel="suma de facturas confirmadas"
                    />
                    <DashboardKpiCard
                        label="IVA del período"
                        value={`Bs ${fmtN(kpi.ivaBs)}`}
                        color="default"
                        loading={loadingPurchaseInvoices}
                        sublabel="crédito fiscal acumulado"
                    />
                </div>

                {/* ── Toolbar: period picker + filters + search ─────────────── */}
                <div className="flex flex-wrap items-center gap-3">
                    <PeriodPicker period={period} onChange={setPeriod} />
                    <StatusFilterChips value={statusFilter} onChange={setStatusFilter} counts={counts} />
                    <div className="relative flex-1 min-w-[220px] max-w-md">
                        <Search size={14} strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar proveedor, Nº factura o Nº control…"
                            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[13px] text-foreground placeholder:text-[var(--text-tertiary)] focus:border-primary-500/60 hover:border-border-medium transition-colors"
                        />
                    </div>
                </div>


                {/* ── Entradas table ────────────────────────────────────────── */}
                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
                        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                            Entradas del período
                        </h2>
                        <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] tabular-nums">
                            {filtered.length} {filtered.length === 1 ? "registro" : "registros"}
                        </span>
                    </div>

                    {loadingPurchaseInvoices ? (
                        <div className="px-5 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">
                            Cargando entradas…
                        </div>
                    ) : inPeriod.length === 0 ? (
                        <div className="px-5 py-16 flex flex-col items-center justify-center gap-3 text-center">
                            <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                                <FileText size={20} strokeWidth={1.8} />
                            </div>
                            <p className="text-[12px] uppercase tracking-[0.12em] text-foreground">
                                Sin entradas en {periodLabel(period)}
                            </p>
                            <p className="font-sans text-[13px] text-[var(--text-tertiary)] max-w-md">
                                Registra una factura de compra para reflejar entradas con datos de proveedor e IVA, o usa una entrada manual cuando no exista factura formal.
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                                <BaseButton.Root
                                    as={Link}
                                    href="/inventory/purchases/new"
                                    variant="primary"
                                    size="sm"
                                    leftIcon={<Plus size={14} strokeWidth={2} />}
                                >
                                    Nueva factura
                                </BaseButton.Root>
                                <BaseButton.Root
                                    as={Link}
                                    href="/inventory/purchases/new-manual"
                                    variant="secondary"
                                    size="sm"
                                    leftIcon={<Plus size={14} strokeWidth={2} />}
                                >
                                    Entrada manual
                                </BaseButton.Root>
                            </div>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="px-5 py-12 flex flex-col items-center gap-2 text-center">
                            <p className="text-[12px] uppercase tracking-[0.12em] text-foreground">
                                Sin resultados
                            </p>
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
                            <table className="w-full min-w-[1024px] text-[13px]">
                                <thead>
                                    <tr className="border-b border-border-light bg-surface-2/50">
                                        {["Fecha", "Proveedor", "Nº Factura", "Tasa", "Subtotal", "IVA", "Total", "Estado", "", ""].map((h, i) => (
                                            <th
                                                key={i}
                                                className={[
                                                    "px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal whitespace-nowrap",
                                                    ["Subtotal", "IVA", "Total", "Tasa"].includes(h) ? "text-right" : "text-left",
                                                ].join(" ")}
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((f) => (
                                        <tr key={f.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                            <td className="px-4 py-2.5 text-[var(--text-secondary)] tabular-nums whitespace-nowrap">{fmtDate(f.date)}</td>
                                            <td className="px-4 py-2.5 text-foreground font-medium">{f.supplierName ?? "—"}</td>
                                            <td className="px-4 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">{f.invoiceNumber || "—"}</td>
                                            <td className="px-4 py-2.5 text-[var(--text-secondary)] tabular-nums text-right whitespace-nowrap">
                                                {f.dollarRate != null
                                                    ? f.dollarRate.toLocaleString("es-VE", {
                                                        maximumFractionDigits: f.rateDecimals ?? 2,
                                                        minimumFractionDigits: f.rateDecimals ?? 2,
                                                    })
                                                    : "—"}
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums text-[var(--text-primary)] text-right whitespace-nowrap">{fmtN(f.subtotal)}</td>
                                            <td className="px-4 py-2.5 tabular-nums text-[var(--text-secondary)] text-right whitespace-nowrap">{fmtN(f.vatAmount)}</td>
                                            <td className="px-4 py-2.5 tabular-nums font-medium text-foreground text-right whitespace-nowrap">{fmtN(f.total)}</td>
                                            <td className="px-4 py-2.5 whitespace-nowrap"><StatusBadge status={f.status} /></td>
                                            <td className="px-4 py-2.5 whitespace-nowrap">
                                                <Link
                                                    href={`/inventory/purchases/${f.id}`}
                                                    className="text-[11px] uppercase tracking-[0.10em] text-primary-500 hover:text-primary-600 transition-colors"
                                                >
                                                    Ver
                                                </Link>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <button
                                                    type="button"
                                                    onClick={() => requestDelete(f.id!, f.status)}
                                                    className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                                    aria-label="Eliminar"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={14} strokeWidth={2} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* ── Footer hint linking to ledger ─────────────────────────── */}
                <div className="flex items-center justify-between pt-2 pb-4 font-sans text-[12px] text-[var(--text-tertiary)]">
                    <span>
                        Las entradas manuales se registran como movimientos sin factura asociada y no aparecen aquí. Consulta el{" "}
                        <Link href="/inventory/purchase-ledger" className="text-primary-500 hover:text-primary-600">libro de entradas</Link>
                        {" "}para verlas todas.
                    </span>
                    <Link
                        href="/inventory/purchases/invoices"
                        className="font-mono uppercase tracking-[0.12em] text-[11px] text-[var(--text-tertiary)] hover:text-foreground transition-colors"
                    >
                        Ver todas las facturas →
                    </Link>
                </div>
            </div>
        </div>
    );
}
