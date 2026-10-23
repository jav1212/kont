"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { formatPayablesAmount, PAYABLE_KIND_LABELS, PAYABLE_STATUS_LABELS, payablesToday } from "./payables-client";
import { PayablesDocumentCreate } from "./payables-document-create";
import { exportPayablesCsv, exportPayablesPdf, type PayablesExportColumn } from "./payables-export";
import { PayablesPolicyPanel } from "./payables-policy-panel";
import { usePayablesReport, usePayablesScope } from "./use-payables-report";

/** One document row returned by the stable payables list reports. */
interface DocumentRow {
  readonly documentId: string;
  readonly supplierId: string;
  readonly supplierName: string | null;
  readonly documentNumber: string;
  readonly concept: string;
  readonly kind: string;
  readonly side: "debit" | "credit";
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly currency: string;
  readonly principal: string;
  readonly balance: string;
  readonly status: string;
  readonly approvalStatus: string;
  readonly settledAt: string | null;
  readonly voidedAt: string | null;
  readonly daysOverdue: number;
}
/** One supplier and currency balance aggregated in SQL (CXP-006). */
interface SupplierBalanceRow {
  readonly supplierId: string;
  readonly supplierName: string;
  readonly currency: string;
  readonly debt: string;
  readonly credit: string;
  readonly net: string;
  readonly current: string;
  readonly overdue1to30: string;
  readonly overdue31to60: string;
  readonly overdue61to90: string;
  readonly overdueOver90: string;
  readonly overdue: string;
}
type Mode = "dashboard" | "documents" | "suppliers";
const TABS = [["list_pending", "Pendientes"], ["list_settled", "Cancelados"], ["list_voided", "Anulados"]] as const;
const CONTROL = "rounded-lg border border-default-300 bg-background px-3 py-2 text-sm";

/** Renders the Accounts Payable dashboard, document lists and supplier balances.
 * @param props - View mode and page copy.
 * @returns The company-scoped payables view.
 */
export function PayablesReportWorkspace({ mode, title, description }: { readonly mode: Mode; readonly title: string; readonly description: string }): React.JSX.Element {
  return <main className="mx-auto max-w-7xl space-y-6 p-6">
    <header className="space-y-2"><p className="text-sm text-[var(--text-secondary)]">Cuentas por pagar</p><h1 className="text-3xl font-semibold">{title}</h1><p className="text-[var(--text-secondary)]">{description}</p></header>
    {mode === "dashboard" ? <Dashboard /> : mode === "documents" ? <Documents /> : <Suppliers />}
  </main>;
}

function Dashboard(): React.JSX.Element {
  const { can } = useOrganizationModuleAccess("/payables");
  const today = payablesToday();
  const aging = usePayablesReport<SupplierBalanceRow>({ kind: "aging", asOf: today, limit: 200 });
  const upcoming = usePayablesReport<DocumentRow>({ kind: "list_pending", dueFrom: today, dueTo: addDays(today, 7), limit: 50 });
  const batches = usePayablesReport<{ readonly id: string }>({ kind: "payment_batches", status: "submitted", limit: 50 });
  return <>
    <section aria-label="Antigüedad de saldos" className="overflow-hidden rounded-xl border border-border-light bg-surface-1">
      <h2 className="border-b border-border-light p-4 font-semibold">Antigüedad de saldos al {today}</h2>
      {aging.error ? <p role="alert" className="p-4 text-danger">{aging.error}</p> : aging.loading ? <p className="p-4" role="status">Cargando…</p> : (aging.data?.totals ?? []).length === 0 ? <p className="p-4 text-sm text-[var(--text-secondary)]">No hay deuda abierta.</p>
        : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Moneda", "Por vencer", "1–30", "31–60", "61–90", "> 90", "Créditos"].map((label) => <th key={label} className="border-b border-border-light px-4 py-2 text-left font-medium">{label}</th>)}</tr></thead>
          <tbody>{(aging.data?.totals ?? []).map((row) => <tr key={row.currency}>{[row.currency, row.current, row.overdue1to30, row.overdue31to60, row.overdue61to90, row.overdueOver90, row.credit].map((value, index) => <td key={index} className={`border-b border-border-light px-4 py-2 ${index ? "text-right tabular-nums" : ""}`}>{index ? formatPayablesAmount(value) : value}</td>)}</tr>)}</tbody></table></div>}
    </section>
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="overflow-hidden rounded-xl border border-border-light bg-surface-1"><h2 className="border-b border-border-light p-4 font-semibold">Vencen en los próximos 7 días</h2>
        {upcoming.loading ? <p className="p-4" role="status">Cargando…</p> : (upcoming.data?.rows ?? []).length === 0 ? <p className="p-4 text-sm text-[var(--text-secondary)]">Nada vence esta semana.</p>
          : <ul className="divide-y divide-border-light text-sm">{(upcoming.data?.rows ?? []).map((row) => <li key={row.documentId} className="flex justify-between gap-4 px-4 py-2"><Link className="text-primary underline" href={`/payables/documents/${encodeURIComponent(row.documentId)}`}>{row.supplierName ?? row.supplierId} · {row.documentNumber || PAYABLE_KIND_LABELS[row.kind]}</Link><span className="tabular-nums">{row.dueAt} · {formatPayablesAmount(row.balance)} {row.currency}</span></li>)}</ul>}
      </section>
      <section className="overflow-hidden rounded-xl border border-border-light bg-surface-1"><h2 className="border-b border-border-light p-4 font-semibold">Lotes por autorizar</h2>
        <p className="p-4 text-sm">{batches.loading ? "Cargando…" : `${batches.data?.total ?? 0} lote(s) enviados esperan autorización.`} <Link className="text-primary underline" href="/payables/schedule">Ir a programación</Link></p>
      </section>
    </div>
    {can("payables.authorize") && <PayablesPolicyPanel />}
  </>;
}

function Documents(): React.JSX.Element {
  const { can } = useOrganizationModuleAccess("/payables");
  const { company } = useCompany();
  const scope = usePayablesScope();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("list_pending");
  const [filters, setFilters] = useState({ currency: "", documentKind: "", dueFrom: "", dueTo: "", overdueMin: "" });
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const query = useMemo(() => ({ kind: tab, limit: 200, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "")) }), [tab, filters]);
  const report = usePayablesReport<DocumentRow>(query, revision);
  const rows = report.data?.rows ?? [];
  const columns: readonly PayablesExportColumn<DocumentRow>[] = [
    { header: "Documento", value: (row) => row.documentNumber }, { header: "Proveedor", value: (row) => row.supplierName ?? row.supplierId },
    { header: "Tipo", value: (row) => PAYABLE_KIND_LABELS[row.kind] ?? row.kind }, { header: "Emisión", value: (row) => row.issuedAt },
    { header: "Vencimiento", value: (row) => row.side === "debit" ? row.dueAt : "" }, { header: "Moneda", value: (row) => row.currency },
    { header: "Principal", value: (row) => row.principal, numeric: true }, { header: "Saldo", value: (row) => row.side === "credit" ? `-${row.balance}` : row.balance, numeric: true },
    { header: tab === "list_settled" ? "Cancelado" : tab === "list_voided" ? "Anulado" : "Días vencido", value: (row) => tab === "list_settled" ? row.settledAt ?? "" : tab === "list_voided" ? row.voidedAt ?? "" : String(row.daysOverdue) },
  ];
  const label = TABS.find(([value]) => value === tab)?.[1] ?? "";
  return <>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <nav aria-label="Estado de los documentos" className="flex gap-2 text-sm">{TABS.map(([value, text]) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)} className={`rounded-lg border px-3 py-1.5 ${tab === value ? "border-primary bg-primary/10 font-medium" : "border-border-light"}`}>{text}</button>)}</nav>
      <div className="flex gap-2">
        <button type="button" className="rounded-lg border border-border-light px-3 py-2 text-sm" disabled={!rows.length} onClick={() => exportPayablesCsv(`cxp-documentos-${tab}`, columns, rows)}>CSV</button>
        <button type="button" className="rounded-lg border border-border-light px-3 py-2 text-sm" disabled={!rows.length} onClick={() => void exportPayablesPdf(`cxp-documentos-${tab}`, `Cuentas por pagar · ${label}`, `${company?.name ?? ""} · ${payablesToday()}`, columns, rows)}>PDF</button>
        {(can("payables.create") || can("payables.adjust")) && <button type="button" onClick={() => setCreating(true)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">Nuevo documento</button>}
      </div>
    </div>
    <section aria-label="Filtros" className="grid gap-3 rounded-xl border border-border-light bg-surface-1 p-4 sm:grid-cols-5">
      <label className="grid gap-1 text-sm">Moneda<select className={CONTROL} value={filters.currency} onChange={(event) => setFilters({ ...filters, currency: event.target.value })}><option value="">Todas</option><option>VES</option><option>USD</option><option>EUR</option></select></label>
      <label className="grid gap-1 text-sm">Tipo<select className={CONTROL} value={filters.documentKind} onChange={(event) => setFilters({ ...filters, documentKind: event.target.value })}><option value="">Todos</option>{Object.entries(PAYABLE_KIND_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Vence desde<input type="date" className={CONTROL} value={filters.dueFrom} onChange={(event) => setFilters({ ...filters, dueFrom: event.target.value })} /></label>
      <label className="grid gap-1 text-sm">Vence hasta<input type="date" className={CONTROL} value={filters.dueTo} onChange={(event) => setFilters({ ...filters, dueTo: event.target.value })} /></label>
      <label className="grid gap-1 text-sm">Antigüedad<select className={CONTROL} value={filters.overdueMin} onChange={(event) => setFilters({ ...filters, overdueMin: event.target.value })}><option value="">Todas</option><option value="1">Vencidos</option><option value="31">Más de 30 días</option><option value="61">Más de 60 días</option><option value="91">Más de 90 días</option></select></label>
    </section>
    {(report.data?.totals ?? []).length > 0 && <section aria-label="Totales por moneda" className="grid gap-3 sm:grid-cols-3">{(report.data?.totals ?? []).map((total) => <div key={total.currency} className="rounded-xl border border-border-light bg-surface-1 p-4 text-sm"><p className="text-[var(--text-secondary)]">{total.currency}</p><p className="text-2xl font-semibold tabular-nums">{formatPayablesAmount(total.net)}</p><p className="text-[var(--text-secondary)]">Deuda {formatPayablesAmount(total.debt)} · Créditos {formatPayablesAmount(total.credit)}</p></div>)}</section>}
    <section className="overflow-hidden rounded-xl border border-border-light bg-surface-1">
      <div className="flex items-center justify-between border-b border-border-light p-4"><p className="text-sm text-[var(--text-secondary)]">{report.data?.total ?? 0} documentos</p><button className="rounded-lg border border-border-light px-3 py-2 text-sm" onClick={() => setRevision((value) => value + 1)} disabled={report.loading}>Actualizar</button></div>
      {report.error ? <p role="alert" className="p-5 text-danger">{report.error}</p> : report.loading ? <p className="p-5" role="status">Cargando…</p> : rows.length === 0 ? <p className="p-5 text-sm text-[var(--text-secondary)]">No hay registros para mostrar.</p> : <DocumentTable rows={rows} tab={tab} />}
    </section>
    <PayablesDocumentCreate scope={scope} isOpen={creating} onClose={() => setCreating(false)} onCreated={() => { setTab("list_pending"); setRevision((value) => value + 1); }} />
  </>;
}

function DocumentTable({ rows, tab }: { readonly rows: readonly DocumentRow[]; readonly tab: string }): React.JSX.Element {
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Documento", "Proveedor", "Tipo", "Emisión", "Vencimiento", "Moneda", "Principal", "Saldo", tab === "list_settled" ? "Cancelado el" : tab === "list_voided" ? "Anulado el" : "Estado"].map((label) => <th key={label} className="border-b border-border-light px-4 py-3 font-medium">{label}</th>)}</tr></thead>
    <tbody>{rows.map((row) => <tr key={row.documentId}>
      <td className="border-b border-border-light px-4 py-3"><Link className="text-primary underline" href={`/payables/documents/${encodeURIComponent(row.documentId)}`}>{row.documentNumber || "Sin número"}</Link></td>
      <td className="border-b border-border-light px-4 py-3"><Link className="hover:underline" href={`/payables/suppliers/${encodeURIComponent(row.supplierId)}`}>{row.supplierName ?? row.supplierId}</Link></td>
      <td className="border-b border-border-light px-4 py-3">{PAYABLE_KIND_LABELS[row.kind] ?? row.kind}{row.approvalStatus === "pending" && <span className="ml-2 rounded bg-warning/20 px-1.5 text-xs">Por aprobar</span>}</td>
      <td className="border-b border-border-light px-4 py-3">{row.issuedAt}</td>
      <td className="border-b border-border-light px-4 py-3">{row.side === "debit" ? <>{row.dueAt}{row.status === "open" && row.daysOverdue > 0 && <span className="ml-2 text-xs text-danger">{row.daysOverdue} d vencido</span>}</> : "—"}</td>
      <td className="border-b border-border-light px-4 py-3">{row.currency}</td>
      <td className="border-b border-border-light px-4 py-3 text-right tabular-nums">{formatPayablesAmount(row.principal)}</td>
      <td className="border-b border-border-light px-4 py-3 text-right tabular-nums">{row.side === "credit" ? `−${formatPayablesAmount(row.balance)}` : formatPayablesAmount(row.balance)}</td>
      <td className="border-b border-border-light px-4 py-3">{tab === "list_settled" ? row.settledAt ?? "—" : tab === "list_voided" ? row.voidedAt ?? "—" : PAYABLE_STATUS_LABELS[row.status] ?? row.status}</td>
    </tr>)}</tbody></table></div>;
}

function Suppliers(): React.JSX.Element {
  const { company } = useCompany();
  const [asOf, setAsOf] = useState(payablesToday());
  const report = usePayablesReport<SupplierBalanceRow>({ kind: "supplier_balance", asOf, limit: 200 });
  const rows = report.data?.rows ?? [];
  const columns: readonly PayablesExportColumn<SupplierBalanceRow>[] = [
    { header: "Proveedor", value: (row) => row.supplierName }, { header: "Moneda", value: (row) => row.currency },
    { header: "Deuda abierta", value: (row) => row.debt, numeric: true }, { header: "Créditos", value: (row) => row.credit, numeric: true },
    { header: "Neto", value: (row) => row.net, numeric: true }, { header: "Vencido", value: (row) => row.overdue, numeric: true },
  ];
  return <>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <label className="grid gap-1 text-sm">Saldo al<input type="date" className={CONTROL} value={asOf} onChange={(event) => setAsOf(event.target.value || payablesToday())} /></label>
      <div className="flex gap-2"><button type="button" className="rounded-lg border border-border-light px-3 py-2 text-sm" disabled={!rows.length} onClick={() => exportPayablesCsv(`cxp-saldos-${asOf}`, columns, rows)}>CSV</button><button type="button" className="rounded-lg border border-border-light px-3 py-2 text-sm" disabled={!rows.length} onClick={() => void exportPayablesPdf(`cxp-saldos-${asOf}`, "Saldos por proveedor", `${company?.name ?? ""} · al ${asOf}`, columns, rows)}>PDF</button></div>
    </div>
    {(report.data?.totals ?? []).length > 0 && <section className="grid gap-3 sm:grid-cols-3">{(report.data?.totals ?? []).map((total) => <div key={total.currency} className="rounded-xl border border-border-light bg-surface-1 p-4 text-sm"><p className="text-[var(--text-secondary)]">{total.currency}</p><p className="text-2xl font-semibold tabular-nums">{formatPayablesAmount(total.net)}</p><p className="text-[var(--text-secondary)]">Deuda {formatPayablesAmount(total.debt)} · Créditos {formatPayablesAmount(total.credit)}</p></div>)}</section>}
    <section className="overflow-hidden rounded-xl border border-border-light bg-surface-1">
      {report.error ? <p role="alert" className="p-5 text-danger">{report.error}</p> : report.loading ? <p className="p-5" role="status">Cargando…</p> : rows.length === 0 ? <p className="p-5 text-sm text-[var(--text-secondary)]">Ningún proveedor tiene saldo a esa fecha.</p>
        : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{columns.map((column) => <th key={column.header} className={`border-b border-border-light px-4 py-3 font-medium ${column.numeric ? "text-right" : ""}`}>{column.header}</th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={`${row.supplierId}:${row.currency}`}><td className="border-b border-border-light px-4 py-3"><Link className="text-primary underline" href={`/payables/suppliers/${encodeURIComponent(row.supplierId)}`}>{row.supplierName}</Link></td><td className="border-b border-border-light px-4 py-3">{row.currency}</td>{[row.debt, row.credit, row.net, row.overdue].map((value, index) => <td key={index} className="border-b border-border-light px-4 py-3 text-right tabular-nums">{formatPayablesAmount(value)}</td>)}</tr>)}</tbody></table></div>}
    </section>
  </>;
}

function addDays(date: string, days: number): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
