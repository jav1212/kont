"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { ResponsiveDrawer } from "@/src/shared/frontend/components/responsive-drawer";
import { notify } from "@/src/shared/frontend/notify";
import { executePayablesCommand, formatPayablesAmount, payablesToday } from "./payables-client";
import { exportPayablesCsv, exportPayablesPdf, type PayablesExportColumn } from "./payables-export";
import { PayablesPaymentForm } from "./payables-payment-form";
import { usePayablesReport, usePayablesScope } from "./use-payables-report";

interface Payment {
  readonly id: string; readonly supplierId: string; readonly supplierName: string | null; readonly method: string; readonly amount: string; readonly currency: string; readonly rate: string;
  readonly operationalAmountVes: string; readonly accountName: string | null; readonly reference: string | null; readonly checkNumber: string | null; readonly occurredAt: string; readonly status: string;
  readonly version: number; readonly reason: string | null; readonly reversalDate: string | null; readonly reconciled: boolean; readonly batchId: string | null;
  readonly applications: readonly { readonly lineId: string; readonly documentId: string; readonly documentNumber: string; readonly paymentAmount: string; readonly appliedAmount: string; readonly currency: string; readonly exchangeDifferenceVes: string }[];
  readonly withholdings: readonly { readonly id: string; readonly kind: string; readonly receiptNumber: string; readonly amountVes: string; readonly status: string; readonly late: boolean }[];
}
const METHOD_LABELS: Readonly<Record<string, string>> = { cash: "Efectivo", transfer: "Transferencia", check: "Cheque" };
const STATUS_LABELS: Readonly<Record<string, string>> = { posted: "Registrado", voided: "Anulado", reversed: "Reversado" };
const CONTROL = "rounded-lg border border-default-300 bg-background px-3 py-2 text-sm";

/** Supplier payments: new payment, filtered history and void/reverse/accounting actions.
 * @returns The payments page.
 */
export function PayablesPayments(): React.JSX.Element {
  const scope = usePayablesScope();
  const { company } = useCompany();
  const { can } = useOrganizationModuleAccess("/payables");
  const params = useSearchParams();
  const today = payablesToday();
  // A link to one payment shows it regardless of the date range.
  const [filters, setFilters] = useState({ from: params.get("paymentId") ? "" : `${today.slice(0, 8)}01`, to: params.get("paymentId") ? "" : today, method: "", status: "", supplierId: params.get("supplierId") ?? "", paymentId: params.get("paymentId") ?? "" });
  const [revision, setRevision] = useState(0);
  const [paying, setPaying] = useState(params.get("supplierId") !== null && params.get("paymentId") === null);
  const [closing, setClosing] = useState<{ readonly payment: Payment; readonly mode: "void" | "reverse" } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const query = useMemo(() => ({ kind: "payment_history", limit: 200, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "")) }), [filters]);
  const history = usePayablesReport<Payment>(query, revision);
  const suppliers = usePayablesReport<{ readonly id: string; readonly name: string }>({ kind: "suppliers", limit: 200 });
  const reconciliation = usePayablesReport<{ readonly paymentId: string; readonly state: string; readonly entryNumber: number | null }>({ kind: "accounting_reconciliation", ...(filters.from ? { from: filters.from } : {}), ...(filters.to ? { to: filters.to } : {}), limit: 200 }, revision);
  const accountingActive = reconciliation.data?.rulesActive === true && can("payables.post");
  const accountingState = new Map((reconciliation.data?.rows ?? []).map((row) => [row.paymentId, row]));
  const rows = history.data?.rows ?? [];
  const columns: readonly PayablesExportColumn<Payment>[] = [
    { header: "Fecha", value: (row) => row.occurredAt }, { header: "Proveedor", value: (row) => row.supplierName ?? row.supplierId }, { header: "Forma", value: (row) => METHOD_LABELS[row.method] ?? row.method },
    { header: "Cuenta", value: (row) => row.accountName ?? "" }, { header: "Ref./Cheque", value: (row) => row.checkNumber ?? row.reference ?? "" }, { header: "Moneda", value: (row) => row.currency },
    { header: "Monto", value: (row) => row.amount, numeric: true }, { header: "Equivalente Bs", value: (row) => row.operationalAmountVes ?? "", numeric: true },
    { header: "Retenciones Bs", value: (row) => sum(row.withholdings.filter((item) => item.status !== "voided").map((item) => item.amountVes)), numeric: true }, { header: "Estado", value: (row) => STATUS_LABELS[row.status] ?? row.status },
  ];
  async function account(payment: Payment, kind: "post_payment_accounting" | "reverse_payment_accounting"): Promise<void> {
    if (!scope) return;
    try { await executePayablesCommand(scope, { kind, paymentId: payment.id }); notify.success(kind === "post_payment_accounting" ? "Pago contabilizado." : "Asiento compensatorio registrado."); setRevision((value) => value + 1); }
    catch (cause: unknown) { notify.error(cause instanceof Error ? cause.message : "No se pudo contabilizar."); }
  }
  return <main className="mx-auto max-w-7xl space-y-6 p-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><p className="text-sm text-[var(--text-secondary)]">Cuentas por pagar</p><h1 className="text-3xl font-semibold">Pagos a proveedores</h1><p className="text-[var(--text-secondary)]">Cada pago debita Tesorería en la misma operación y aplica sus retenciones.</p></div>
      <div className="flex gap-2"><button type="button" className="rounded-lg border border-border-light px-3 py-2 text-sm" disabled={!rows.length} onClick={() => exportPayablesCsv("cxp-pagos", columns, rows)}>CSV</button><button type="button" className="rounded-lg border border-border-light px-3 py-2 text-sm" disabled={!rows.length} onClick={() => void exportPayablesPdf("cxp-pagos", "Histórico de pagos a proveedores", `${company?.name ?? ""} · ${filters.from} a ${filters.to}`, columns, rows)}>PDF</button>
        {can("payables.post") && <button type="button" onClick={() => setPaying(true)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">Nuevo pago</button>}</div></header>
    {filters.paymentId && <p className="text-sm">Mostrando un pago. <button type="button" className="text-primary underline" onClick={() => setFilters({ ...filters, paymentId: "", from: `${today.slice(0, 8)}01`, to: today })}>Ver todos</button></p>}
    <section aria-label="Filtros" className="grid gap-3 rounded-xl border border-border-light bg-surface-1 p-4 sm:grid-cols-5">
      <label className="grid gap-1 text-sm">Desde<input type="date" className={CONTROL} value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
      <label className="grid gap-1 text-sm">Hasta<input type="date" className={CONTROL} value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
      <label className="grid gap-1 text-sm">Proveedor<select className={CONTROL} value={filters.supplierId} onChange={(event) => setFilters({ ...filters, supplierId: event.target.value })}><option value="">Todos</option>{(suppliers.data?.rows ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Forma<select className={CONTROL} value={filters.method} onChange={(event) => setFilters({ ...filters, method: event.target.value })}><option value="">Todas</option>{Object.entries(METHOD_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Estado<select className={CONTROL} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Todos</option>{Object.entries(STATUS_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
    </section>
    <section className="overflow-hidden rounded-xl border border-border-light bg-surface-1">
      {history.error ? <p role="alert" className="p-5 text-danger">{history.error}</p> : history.loading ? <p className="p-5" role="status">Cargando…</p> : rows.length === 0 ? <p className="p-5 text-sm text-[var(--text-secondary)]">No hay pagos en el rango.</p>
        : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Fecha", "Proveedor", "Forma", "Cuenta", "Ref./Cheque", "Monto", "Estado", accountingActive ? "Asiento" : "", ""].map((label, index) => <th key={index} className="border-b border-border-light px-4 py-3 font-medium">{label}</th>)}</tr></thead>
          <tbody>{rows.map((row) => { const entry = accountingState.get(row.id); return [<tr key={row.id}>
            <td className="border-b border-border-light px-4 py-2">{row.occurredAt}</td>
            <td className="border-b border-border-light px-4 py-2"><Link className="hover:underline" href={`/payables/suppliers/${encodeURIComponent(row.supplierId)}`}>{row.supplierName ?? row.supplierId}</Link></td>
            <td className="border-b border-border-light px-4 py-2">{METHOD_LABELS[row.method] ?? row.method}{row.batchId && <span className="ml-1 text-xs text-[var(--text-secondary)]">(lote)</span>}</td>
            <td className="border-b border-border-light px-4 py-2">{row.accountName}</td>
            <td className="border-b border-border-light px-4 py-2">{row.checkNumber ? `Cheque ${row.checkNumber}` : row.reference ?? "—"}</td>
            <td className="border-b border-border-light px-4 py-2 text-right tabular-nums">{formatPayablesAmount(row.amount)} {row.currency}</td>
            <td className="border-b border-border-light px-4 py-2">{STATUS_LABELS[row.status] ?? row.status}{row.reconciled && <span className="ml-1 text-xs">· conciliado</span>}</td>
            <td className="border-b border-border-light px-4 py-2">{accountingActive && (entry?.state === "contabilizado" ? `N° ${entry.entryNumber ?? ""}` : entry?.state === "diferencia" ? <button type="button" className="text-danger underline" onClick={() => void account(row, row.status === "posted" ? "post_payment_accounting" : "reverse_payment_accounting")}>{row.status === "posted" ? "Diferencia" : "Compensar"}</button> : row.status === "posted" ? <button type="button" className="text-primary underline" onClick={() => void account(row, "post_payment_accounting")}>Contabilizar</button> : "—")}</td>
            <td className="border-b border-border-light px-4 py-2 text-right whitespace-nowrap">
              <button type="button" className="underline" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>{expanded === row.id ? "Ocultar" : "Detalle"}</button>
              {row.status === "posted" && can("payables.void") && !row.reconciled && <button type="button" className="ml-3 text-danger underline" onClick={() => setClosing({ payment: row, mode: "void" })}>Anular</button>}
              {row.status === "posted" && can("payables.reverse") && <button type="button" className="ml-3 text-danger underline" onClick={() => setClosing({ payment: row, mode: "reverse" })}>Reversar</button>}
            </td>
          </tr>, expanded === row.id && <tr key={`${row.id}:detail`}><td colSpan={9} className="border-b border-border-light bg-default-50 px-6 py-3">
            <p className="mb-1 font-medium">Aplicaciones</p>
            <ul className="mb-2 space-y-1">{row.applications.map((line) => <li key={line.lineId}><Link className="text-primary underline" href={`/payables/documents/${encodeURIComponent(line.documentId)}`}>{line.documentNumber || "Documento"}</Link>: pagado {formatPayablesAmount(line.paymentAmount)} {row.currency} → aplicado {formatPayablesAmount(line.appliedAmount)} {line.currency}{line.exchangeDifferenceVes !== "0.00000000" && line.exchangeDifferenceVes !== "0" && ` · diferencial ${formatPayablesAmount(line.exchangeDifferenceVes)} Bs`}</li>)}</ul>
            {row.withholdings.length > 0 && <><p className="mb-1 font-medium">Retenciones</p><ul className="space-y-1">{row.withholdings.map((item) => <li key={item.id}>{item.kind === "vat" ? "IVA" : "ISLR"} N° {item.receiptNumber}: {formatPayablesAmount(item.amountVes)} Bs · {item.status === "voided" ? "anulada" : item.status === "declared" ? "declarada" : "emitida"}{item.late && " · extemporánea"}</li>)}</ul></>}
            {row.reason && <p className="mt-2">Motivo de {row.status === "voided" ? "anulación" : "reverso"}: {row.reason}{row.reversalDate && ` (${row.reversalDate})`}</p>}
            <p className="mt-2 text-xs text-[var(--text-secondary)]">Tasa del pago: {row.rate} Bs · Equivalente {formatPayablesAmount(row.operationalAmountVes)} Bs</p>
          </td></tr>]; })}</tbody></table></div>}
    </section>
    {paying && scope && <PayablesPaymentForm scope={scope} supplierId={filters.supplierId || undefined} onClose={() => setPaying(false)} onDone={() => { setPaying(false); setRevision((value) => value + 1); }} />}
    {closing && scope && <ClosePayment payment={closing.payment} mode={closing.mode} onClose={() => setClosing(null)} onSubmit={async (reason, date) => {
      await executePayablesCommand(scope, closing.mode === "void" ? { kind: "void_supplier_payment", paymentId: closing.payment.id, expectedVersion: closing.payment.version, reason } : { kind: "reverse_supplier_payment", paymentId: closing.payment.id, expectedVersion: closing.payment.version, reason, reversalDate: date });
      notify.success(closing.mode === "void" ? "Pago anulado." : "Pago reversado.");
      setClosing(null); setRevision((value) => value + 1);
    }} />}
  </main>;
}

function ClosePayment({ payment, mode, onClose, onSubmit }: { readonly payment: Payment; readonly mode: "void" | "reverse"; readonly onClose: () => void; readonly onSubmit: (reason: string, date: string) => Promise<void> }): React.JSX.Element {
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(payablesToday());
  const [saving, setSaving] = useState(false);
  return <ResponsiveDrawer isOpen onClose={onClose} title={mode === "void" ? "Anular pago" : "Reversar pago"} footer={<div className="flex justify-end gap-2 p-4"><button type="button" className="rounded-lg border border-border-light px-3 py-2 text-sm" onClick={onClose}>Cancelar</button><button form="payables-close" type="submit" disabled={saving} className="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Procesando…" : "Confirmar"}</button></div>}>
    <form id="payables-close" className="grid gap-4 p-5 text-sm" onSubmit={(event) => { event.preventDefault(); setSaving(true); void onSubmit(reason.trim(), date).catch((cause: unknown) => notify.error(cause instanceof Error ? cause.message : "No se pudo completar.")).finally(() => setSaving(false)); }}>
      <p className="text-[var(--text-secondary)]">{mode === "void" ? `Deja sin efecto el pago del ${payment.occurredAt} con su misma fecha. Solo en período abierto, sin conciliar y con retenciones sin declarar. Libera los saldos y Tesorería repone el desembolso.` : "Registra un hecho compensatorio con fecha propia (por ejemplo, un cheque devuelto). Reabre los saldos y Tesorería registra el crédito; el número de cheque no se reutiliza."}</p>
      {mode === "reverse" && <label className="grid gap-1">Fecha del reverso<input required type="date" min={payment.occurredAt} value={date} onChange={(event) => setDate(event.target.value)} className={CONTROL} /></label>}
      <label className="grid gap-1">Motivo<textarea required value={reason} onChange={(event) => setReason(event.target.value)} className={CONTROL} /></label>
    </form>
  </ResponsiveDrawer>;
}

function sum(values: readonly string[]): string {
  let cents = 0n;
  for (const value of values) { const [whole = "0", fraction = ""] = value.split("."); cents += BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2)); }
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}
