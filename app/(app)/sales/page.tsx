"use client";

// Page: Ventas — tablero principal del módulo Sales.
// KPIs del período + tabla compacta de facturas + accesos rápidos.

import { useEffect, useMemo, useState } from "react";
import {
    Search, ChevronLeft, ChevronRight, Calendar, FileText, Plus,
    Archive, Trash2, AlertTriangle, Receipt, Users, ShoppingCart,
} from "lucide-react";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { DashboardKpiCard } from "@/src/shared/frontend/components/dashboard-kpi-card";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";
import { useSales } from "@/src/modules/sales/frontend/hooks/use-sales";
import type { SalesInvoiceStatus } from "@/src/modules/sales/backend/domain/sales-invoice";
import type { SalesPerformanceReportDto, SalesPerformanceDimensionDto } from "@kontave/client-contracts";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null | undefined) => {
    if (!d) return "—";
    const [y, m, day] = d.split("T")[0].split("-");
    return `${day}/${m}/${y}`;
};

const MONTHS = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function currentPeriodKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function periodLabel(key: string): string {
    const [y, m] = key.split("-");
    return `${MONTHS[(Number(m) - 1) | 0] ?? ""} ${y}`;
}
function shiftPeriod(key: string, delta: number): string {
    const [y, m] = key.split("-").map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function StatusBadge({ status }: { status: SalesInvoiceStatus }) {
    const cls =
        status === "confirmada" ? "badge-success" :
        status === "anulada"    ? "badge-error" :
        "badge-warning";
    const label =
        status === "confirmada" ? "Confirmada" :
        status === "anulada"    ? "Anulada" :
        "Borrador";
    return (
        <span className={`inline-flex px-1.5 py-0.5 rounded border text-[11px] uppercase tracking-[0.08em] font-medium ${cls}`}>
            {label}
        </span>
    );
}

type StatusFilter = "all" | SalesInvoiceStatus;
type DocumentTypeFilter = "all" | "venta" | "nota_entrega";
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: "all",        label: "Todas" },
    { value: "borrador",   label: "Borradores" },
    { value: "confirmada", label: "Confirmadas" },
    { value: "anulada",    label: "Anuladas" },
];

export default function SalesDashboardPage() {
    const { companyId } = useCompany();
    const { organization } = useOrganization();
    const {
        salesInvoices, loadingSalesInvoices,
        loadSalesInvoices, deleteSalesInvoice,
    } = useSales();

    const [period, setPeriod] = useState<string>(currentPeriodKey());
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [typeFilter, setTypeFilter] = useState<DocumentTypeFilter>("all");
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [reportDimension, setReportDimension] = useState<SalesPerformanceDimensionDto>("user");
    const [performanceReport, setPerformanceReport] = useState<SalesPerformanceReportDto | null>(null);
    const [loadingPerformanceReport, setLoadingPerformanceReport] = useState(false);
    const [performanceReportError, setPerformanceReportError] = useState<string | null>(null);

    useEffect(() => {
        if (companyId) loadSalesInvoices(companyId);
    }, [companyId, loadSalesInvoices]);

    useEffect(() => {
        if (!companyId || !organization) return;
        let cancelled = false;
        const [year, month] = period.split("-").map(Number);
        const from = `${period}-01`;
        const to = new Date(year, month, 0).toISOString().slice(0, 10);
        const params = new URLSearchParams({ from, to, dimension: reportDimension, currency: "VES" });
        setLoadingPerformanceReport(true);
        setPerformanceReportError(null);
        void apiFetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/sales/reporting?${params}`)
            .then(async (response) => {
                const payload = await response.json() as { data?: SalesPerformanceReportDto; error?: { message?: string } };
                if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo cargar el reporte.");
                if (!cancelled) setPerformanceReport(payload.data ?? null);
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setPerformanceReport(null);
                    setPerformanceReportError(error instanceof Error ? error.message : "No se pudo cargar el reporte.");
                }
            })
            .finally(() => { if (!cancelled) setLoadingPerformanceReport(false); });
        return () => { cancelled = true; };
    }, [companyId, organization, period, reportDimension]);

    const inPeriod = useMemo(
        () => salesInvoices.filter((f) => f.period === period),
        [salesInvoices, period],
    );

    const counts = useMemo<Record<StatusFilter, number>>(() => ({
        all:        inPeriod.length,
        borrador:   inPeriod.filter((f) => f.status === "borrador").length,
        confirmada: inPeriod.filter((f) => f.status === "confirmada").length,
        anulada:    inPeriod.filter((f) => f.status === "anulada").length,
    }), [inPeriod]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return inPeriod
            .filter((f) => statusFilter === "all" || f.status === statusFilter)
            .filter((f) => typeFilter === "all" || (f.documentType ?? "venta") === typeFilter)
            .filter((f) => {
                if (!q) return true;
                const hay = [
                    f.customerName ?? "", f.customerRif ?? "",
                    f.invoiceNumber ?? "", f.controlNumber ?? "",
                ].join(" ").toLowerCase();
                return hay.includes(q);
            })
            .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    }, [inPeriod, statusFilter, typeFilter, search]);

    const kpi = useMemo(() => {
        const sales = inPeriod.filter((f) => (f.documentType ?? "venta") === "venta");
        const confirmed = sales.filter((f) => f.status === "confirmada");
        return {
            confirmedCount: confirmed.length,
            draftCount:     sales.filter((f) => f.status === "borrador").length,
            totalBs:        confirmed.reduce((acc, f) => acc + (f.total ?? 0), 0),
            ivaBs:          confirmed.reduce((acc, f) => acc + (f.vatAmount ?? 0), 0),
        };
    }, [inPeriod]);

    async function handleDelete(id: string) {
        setDeleting(true);
        await deleteSalesInvoice(id);
        setDeleting(false);
        setConfirmDelete(null);
    }

    return (
        <div className="min-h-full bg-background font-mono">
            <PageHeader title="Ventas" subtitle={`Tablero · ${periodLabel(period)}`}>
                <BaseButton.Root as={Link} href="/sales/pos" variant="primary" size="sm" leftIcon={<ShoppingCart size={14} strokeWidth={2} />}>
                    Punto de venta
                </BaseButton.Root>
                <BaseButton.Root as={Link} href="/sales/customers" variant="ghost" size="sm" leftIcon={<Users size={14} strokeWidth={2} />}>
                    Clientes
                </BaseButton.Root>
                <BaseButton.Root as={Link} href="/sales/archive" variant="ghost" size="sm" leftIcon={<Archive size={14} strokeWidth={2} />}>
                    Archivo
                </BaseButton.Root>
                <BaseButton.Root as={Link} href="/sales/igtf-fortnightly" variant="secondary" size="sm" leftIcon={<Receipt size={14} strokeWidth={2} />}>
                    IGTF Quincenal
                </BaseButton.Root>
                <BaseButton.Root as={Link} href="/sales/new" variant="secondary" size="sm" leftIcon={<Plus size={14} strokeWidth={2} />}>
                    Nuevo documento
                </BaseButton.Root>
            </PageHeader>

            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-surface-1 border border-yellow-500/20 rounded-xl shadow-xl w-full max-w-md mx-4">
                        <div className="px-6 py-4 border-b border-yellow-500/20 bg-yellow-500/[0.06] rounded-t-xl flex items-center gap-2">
                            <AlertTriangle size={16} strokeWidth={2} className="text-yellow-600" />
                            <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-yellow-600">Eliminar factura</h2>
                        </div>
                        <div className="px-6 py-5 font-sans text-[14px] text-foreground leading-relaxed">
                            Solo se pueden eliminar borradores. Para anular una factura confirmada, desconfírmala primero.
                        </div>
                        <div className="px-6 py-4 border-t border-border-light flex items-center justify-end gap-3">
                            <BaseButton.Root variant="secondary" size="md" onClick={() => setConfirmDelete(null)} disabled={deleting}>
                                Cancelar
                            </BaseButton.Root>
                            <BaseButton.Root variant="danger" size="md" onClick={() => handleDelete(confirmDelete)} disabled={deleting}>
                                {deleting ? "Eliminando…" : "Eliminar"}
                            </BaseButton.Root>
                        </div>
                    </div>
                </div>
            )}

            <div className="px-8 py-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <DashboardKpiCard label="Facturas confirmadas" value={kpi.confirmedCount} color="success" icon={FileText} loading={loadingSalesInvoices} sublabel={`del período ${periodLabel(period)}`} />
                    <DashboardKpiCard label="Borradores" value={kpi.draftCount} color={kpi.draftCount > 0 ? "warning" : "default"} icon={Archive} loading={loadingSalesInvoices} sublabel={kpi.draftCount === 0 ? "todo confirmado" : "pendientes por confirmar"} />
                    <DashboardKpiCard label="Total facturado" value={`Bs ${fmtN(kpi.totalBs)}`} color="primary" loading={loadingSalesInvoices} sublabel="suma de facturas confirmadas" />
                    <DashboardKpiCard label="IVA del período" value={`Bs ${fmtN(kpi.ivaBs)}`} color="default" loading={loadingSalesInvoices} sublabel="débito fiscal acumulado" />
                </div>

                <section className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    <div className="px-5 py-4 border-b border-border-light flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">Rendimiento de ventas</h2>
                            <p className="mt-1 text-xs text-[var(--text-secondary)]">Ventas confirmadas · montos en bolívares</p>
                        </div>
                        <div className="inline-flex rounded-lg border border-border-light bg-surface-1 overflow-hidden" role="group" aria-label="Agrupar reporte de ventas">
                            {([
                                ["user", "Usuario"], ["role", "Rol"], ["device", "Dispositivo"],
                            ] as const).map(([dimension, label], index) => (
                                <button key={dimension} type="button" onClick={() => setReportDimension(dimension)} aria-pressed={reportDimension === dimension}
                                    className={["px-3 h-9 text-[11px] uppercase tracking-[0.1em] transition-colors", index > 0 ? "border-l border-border-light" : "", reportDimension === dimension ? "bg-primary-500/10 text-primary-500" : "text-[var(--text-secondary)] hover:bg-surface-2"].join(" ")}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {loadingPerformanceReport ? (
                        <p className="px-5 py-8 text-center text-xs text-[var(--text-secondary)]">Cargando reporte…</p>
                    ) : performanceReportError ? (
                        <p role="alert" className="px-5 py-8 text-center text-xs text-danger-500">{performanceReportError}</p>
                    ) : !performanceReport?.rows.length ? (
                        <p className="px-5 py-8 text-center text-xs text-[var(--text-secondary)]">No hay ventas confirmadas para agrupar en este período.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead><tr className="border-b border-border-light text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]"><th className="px-5 py-3">{reportDimension === "user" ? "Usuario" : reportDimension === "role" ? "Rol" : "Dispositivo"}</th><th className="px-5 py-3 text-right">Facturas</th><th className="px-5 py-3 text-right">Total vendido</th></tr></thead>
                                <tbody>{performanceReport.rows.map((row) => (
                                    <tr key={row.key} className="border-b border-border-light last:border-0">
                                        <td className="px-5 py-3 text-foreground">{row.label}{!row.attributed && <span className="ml-2 text-[10px] text-[var(--text-tertiary)]">Sin atribución</span>}</td>
                                        <td className="px-5 py-3 text-right tabular-nums text-[var(--text-secondary)]">{row.invoiceCount}</td>
                                        <td className="px-5 py-3 text-right tabular-nums text-foreground">Bs {fmtN(Number(row.grossAmount.amount))}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}
                </section>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex items-center gap-1 rounded-lg border border-border-light bg-surface-1 px-1 h-9">
                        <button type="button" onClick={() => setPeriod(shiftPeriod(period, -1))} className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors">
                            <ChevronLeft size={14} strokeWidth={2} />
                        </button>
                        <div className="px-2 flex items-center gap-1.5 min-w-[140px] justify-center">
                            <Calendar size={12} strokeWidth={2} className="text-[var(--text-tertiary)]" />
                            <span className="text-[12px] uppercase tracking-[0.12em] text-foreground tabular-nums">{periodLabel(period)}</span>
                        </div>
                        <button type="button" onClick={() => setPeriod(shiftPeriod(period, 1))} className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors">
                            <ChevronRight size={14} strokeWidth={2} />
                        </button>
                    </div>
                    <div className="inline-flex rounded-lg border border-border-light bg-surface-1 overflow-hidden">
                        {STATUS_OPTIONS.map((opt, i) => {
                            const active = statusFilter === opt.value;
                            return (
                                <button key={opt.value} type="button" onClick={() => setStatusFilter(opt.value)}
                                    className={["px-3 h-9 text-[11px] uppercase tracking-[0.12em] transition-colors flex items-center gap-1.5", i > 0 ? "border-l border-border-light" : "", active ? "bg-primary-500/10 text-primary-500" : "text-[var(--text-secondary)] hover:bg-surface-2"].join(" ")}>
                                    {opt.label}
                                    <span className={["px-1.5 py-0.5 rounded text-[10px] tabular-nums", active ? "bg-primary-500/15 text-primary-500" : "bg-surface-2 text-[var(--text-tertiary)]"].join(" ")}>
                                        {counts[opt.value]}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="inline-flex rounded-lg border border-border-light bg-surface-1 overflow-hidden">
                        {([{ value: "all", label: "Todos" }, { value: "venta", label: "Ventas" }, { value: "nota_entrega", label: "Notas de entrega" }] as const).map((option, index) => (
                            <button key={option.value} type="button" onClick={() => setTypeFilter(option.value)} className={["px-3 h-9 text-[11px] uppercase tracking-[0.12em] transition-colors", index > 0 ? "border-l border-border-light" : "", typeFilter === option.value ? "bg-primary-500/10 text-primary-500" : "text-[var(--text-secondary)] hover:bg-surface-2"].join(" ")}>
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <div className="relative flex-1 min-w-[220px] max-w-md">
                        <Search size={14} strokeWidth={2} className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[var(--text-tertiary)]" />
                        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, Nº factura o RIF…"
                            className="h-9 w-full rounded-lg border border-border-light bg-surface-1 !pl-11 pr-3 font-mono text-[13px] text-foreground outline-none transition-colors placeholder:text-[var(--text-tertiary)] hover:border-border-medium focus:border-primary-500/60" />
                    </div>
                </div>

                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
                        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">Facturas del período</h2>
                        <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] tabular-nums">
                            {filtered.length} {filtered.length === 1 ? "registro" : "registros"}
                        </span>
                    </div>

                    {loadingSalesInvoices ? (
                        <div className="px-5 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">Cargando facturas…</div>
                    ) : filtered.length === 0 ? (
                        <div className="px-5 py-16 flex flex-col items-center justify-center gap-3 text-center">
                            <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                                <FileText size={20} strokeWidth={1.8} />
                            </div>
                            <p className="text-[12px] uppercase tracking-[0.12em] text-foreground">Sin facturas en {periodLabel(period)}</p>
                            <p className="font-sans text-[13px] text-[var(--text-tertiary)] max-w-md">
                                Registra una factura de venta — el N° correlativo se asigna automáticamente al primer guardado.
                            </p>
                            <BaseButton.Root as={Link} href="/sales/new" variant="primary" size="sm" leftIcon={<Plus size={14} strokeWidth={2} />}>
                                Nueva factura
                            </BaseButton.Root>
                        </div>
                    ) : (
                        <div className="isolate overflow-x-auto">
                            <table className="w-full min-w-[1024px] text-[13px]">
                                <thead>
                                    <tr className="border-b border-border-light bg-surface-2/50">
                                        {["Fecha", "Tipo", "Nº", "Cliente", "RIF", "Subtotal", "IVA", "IGTF", "Total", "Estado"].map((h) => (
                                            <th key={h}
                                                className={["px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal whitespace-nowrap", ["Subtotal", "IVA", "IGTF", "Total"].includes(h) ? "text-right" : "text-left"].join(" ")}>
                                                {h}
                                            </th>
                                        ))}
                                        <th scope="col" className="sticky right-0 z-20 w-[116px] border-l border-border-light bg-surface-2 px-4 py-2.5 text-right text-[11px] font-normal uppercase tracking-[0.12em] text-[var(--text-tertiary)] shadow-[-8px_0_14px_-12px_rgba(15,23,42,0.45)]">
                                            Acciones
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((f) => (
                                        <tr key={f.id} className="group border-b border-border-light/50 transition-colors hover:bg-surface-2">
                                            <td className="px-4 py-2.5 text-[var(--text-secondary)] tabular-nums whitespace-nowrap">{fmtDate(f.date)}</td>
                                            <td className="px-4 py-2.5 whitespace-nowrap"><span className="inline-flex rounded border border-border-light px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">{(f.documentType ?? "venta") === "nota_entrega" ? "Nota de entrega" : f.salesChannel === "pos" ? "Venta · POS" : "Venta"}</span></td>
                                            <td className="px-4 py-2.5 text-foreground tabular-nums whitespace-nowrap">{f.invoiceNumber}</td>
                                            <td className="px-4 py-2.5 text-foreground font-medium">{f.customerName ?? "—"}</td>
                                            <td className="px-4 py-2.5 text-[var(--text-secondary)] tabular-nums whitespace-nowrap">{f.customerRif ?? "—"}</td>
                                            <td className="px-4 py-2.5 tabular-nums text-right whitespace-nowrap">{fmtN(f.subtotal)}</td>
                                            <td className="px-4 py-2.5 tabular-nums text-[var(--text-secondary)] text-right whitespace-nowrap">{fmtN(f.vatAmount)}</td>
                                            <td className="px-4 py-2.5 tabular-nums text-info text-right whitespace-nowrap">
                                                {f.igtfPerceptionApplies ? fmtN(f.igtfPerceptionAmount ?? 0) : "—"}
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums font-medium text-foreground text-right whitespace-nowrap">{fmtN(f.total)}</td>
                                            <td className="px-4 py-2.5 whitespace-nowrap"><StatusBadge status={f.status} /></td>
                                            <td className="sticky right-0 z-10 w-[116px] border-l border-border-light bg-surface-1 px-4 py-2.5 shadow-[-8px_0_14px_-12px_rgba(15,23,42,0.45)] transition-colors group-hover:bg-surface-2">
                                                <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                                                    <Link
                                                        href={`/sales/${f.id}`}
                                                        className="inline-flex h-9 items-center rounded px-2 text-[11px] uppercase tracking-[0.10em] text-primary-500 transition-colors hover:bg-primary-500/10 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
                                                        aria-label={`Ver factura ${f.invoiceNumber}`}
                                                    >
                                                        Ver
                                                    </Link>
                                                    {f.status === "borrador" && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmDelete(f.id!)}
                                                            className="flex size-9 items-center justify-center rounded text-[var(--text-tertiary)] transition-colors hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                                                            aria-label={`Eliminar factura ${f.invoiceNumber}`}
                                                            title="Eliminar borrador"
                                                        >
                                                            <Trash2 size={14} strokeWidth={2} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
