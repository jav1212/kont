"use client";

// Page: Archivo de facturas — todas las facturas (todos los períodos).

import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Archive } from "lucide-react";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useSales } from "@/src/modules/sales/frontend/hooks/use-sales";
import type { SalesInvoiceStatus } from "@/src/modules/sales/backend/domain/sales-invoice";

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("T")[0].split("-");
    return `${day}/${m}/${y}`;
};

function StatusBadge({ status }: { status: SalesInvoiceStatus }) {
    const cls = status === "confirmada" ? "badge-success" : status === "anulada" ? "badge-error" : "badge-warning";
    const label = status === "confirmada" ? "Confirmada" : status === "anulada" ? "Anulada" : "Borrador";
    return <span className={`inline-flex px-1.5 py-0.5 rounded border text-[11px] uppercase tracking-[0.08em] font-medium ${cls}`}>{label}</span>;
}

export default function SalesArchivePage() {
    const { companyId } = useCompany();
    const { salesInvoices, loadingSalesInvoices, loadSalesInvoices } = useSales();

    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState<"all" | "venta" | "nota_entrega">("all");

    useEffect(() => {
        if (companyId) loadSalesInvoices(companyId);
    }, [companyId, loadSalesInvoices]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return salesInvoices.filter((f) =>
            (typeFilter === "all" || (f.documentType ?? "venta") === typeFilter) &&
            (!q ||
            (f.customerName ?? "").toLowerCase().includes(q) ||
            (f.customerRif ?? "").toLowerCase().includes(q) ||
            (f.invoiceNumber ?? "").toLowerCase().includes(q)),
        );
    }, [salesInvoices, search, typeFilter]);

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Archivo de Ventas" subtitle="Ventas y notas de entrega">
                <BaseButton.Root as={Link} href="/sales/new" variant="primary" size="sm" leftIcon={<Plus size={14} strokeWidth={2} />}>
                    Nuevo documento
                </BaseButton.Root>
            </PageHeader>

            <div className="px-8 py-6 space-y-4">
                <div className="flex flex-wrap gap-3">
                <div className="relative max-w-md flex-1">
                    <Search size={14} strokeWidth={2} className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[var(--text-tertiary)]" />
                    <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, Nº o RIF…"
                        className="h-9 w-full rounded-lg border border-border-light bg-surface-1 !pl-11 pr-3 font-mono text-[13px] text-foreground outline-none transition-colors focus:border-primary-500/60" />
                </div>
                <div className="inline-flex overflow-hidden rounded-lg border border-border-light bg-surface-1">
                    {([{ value: "all", label: "Todos" }, { value: "venta", label: "Ventas" }, { value: "nota_entrega", label: "Notas" }] as const).map((option, index) => (
                        <button key={option.value} type="button" onClick={() => setTypeFilter(option.value)} className={["h-9 px-3 text-[11px] uppercase tracking-[0.12em]", index ? "border-l border-border-light" : "", typeFilter === option.value ? "bg-primary-500/10 text-primary-500" : "text-[var(--text-secondary)]"].join(" ")}>{option.label}</button>
                    ))}
                </div>
                </div>

                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    {loadingSalesInvoices ? (
                        <div className="px-5 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">Cargando…</div>
                    ) : filtered.length === 0 ? (
                        <div className="px-5 py-16 flex flex-col items-center justify-center gap-3 text-center">
                            <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                                <Archive size={20} strokeWidth={1.8} />
                            </div>
                            <p className="text-[12px] uppercase tracking-[0.12em] text-foreground">Sin facturas</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1024px] text-[13px]">
                                <thead>
                                    <tr className="border-b border-border-light bg-surface-2/50">
                                        {["Fecha", "Tipo", "Período", "Nº", "Cliente", "RIF", "Total", "Estado", ""].map((h, i) => (
                                            <th key={i} className={["px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal whitespace-nowrap", h === "Total" ? "text-right" : "text-left"].join(" ")}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((f) => (
                                        <tr key={f.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                            <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">{fmtDate(f.date)}</td>
                                            <td className="px-4 py-2.5 whitespace-nowrap">{(f.documentType ?? "venta") === "nota_entrega" ? "Nota de entrega" : "Venta"}</td>
                                            <td className="px-4 py-2.5 tabular-nums text-[var(--text-secondary)] whitespace-nowrap">{f.period}</td>
                                            <td className="px-4 py-2.5 tabular-nums text-foreground whitespace-nowrap">{f.invoiceNumber}</td>
                                            <td className="px-4 py-2.5 text-foreground font-medium">{f.customerName}</td>
                                            <td className="px-4 py-2.5 tabular-nums text-[var(--text-secondary)] whitespace-nowrap">{f.customerRif}</td>
                                            <td className="px-4 py-2.5 tabular-nums font-medium text-right whitespace-nowrap">{fmtN(f.total)}</td>
                                            <td className="px-4 py-2.5 whitespace-nowrap"><StatusBadge status={f.status} /></td>
                                            <td className="px-4 py-2.5 whitespace-nowrap">
                                                <Link href={`/sales/${f.id}`} className="text-[11px] uppercase tracking-[0.10em] text-primary-500 hover:text-primary-600 transition-colors">Ver</Link>
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
