"use client";

import { useMemo, useState } from "react";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { ResponsiveDrawer } from "@/src/shared/frontend/components/responsive-drawer";
import { notify } from "@/src/shared/frontend/notify";
import { executePayablesCommand, formatPayablesAmount, newPayablesId, payablesToday, type PayablesRequestScope } from "./payables-client";
import { PayablesPaymentForm, type PayablesBatchToPay } from "./payables-payment-form";
import { usePayablesReport, usePayablesScope } from "./use-payables-report";

interface Batch extends PayablesBatchToPay { readonly supplierName: string | null; readonly plannedDate: string; readonly status: string; readonly preparedBy: string; readonly rejectionReason: string | null; readonly paymentId: string | null; readonly items: readonly { readonly documentId: string; readonly documentNumber: string; readonly dueAt: string; readonly amount: string }[] }
interface OpenDocument { readonly documentId: string; readonly documentNumber: string; readonly side: string; readonly dueAt: string; readonly currency: string; readonly balance: string; readonly daysOverdue: number }
const STATUS_LABELS: Readonly<Record<string, string>> = { draft: "Borrador", submitted: "Enviado", authorized: "Autorizado", rejected: "Rechazado", executed: "Ejecutado" };
const CONTROL = "rounded-lg border border-default-300 bg-background px-3 py-2 text-sm";

/** Payment scheduling (CXP-013–015): batches reserve balances, a second step authorizes them and execution pays them once.
 * @returns The schedule page.
 */
export function PayablesSchedule(): React.JSX.Element {
  const scope = usePayablesScope();
  const { can } = useOrganizationModuleAccess("/payables");
  const [status, setStatus] = useState("");
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [rejecting, setRejecting] = useState<Batch | null>(null);
  const [paying, setPaying] = useState<Batch | null>(null);
  const batches = usePayablesReport<Batch>({ kind: "payment_batches", limit: 200, ...(status ? { status } : {}) }, revision);
  const refresh = () => setRevision((value) => value + 1);
  async function run(command: Readonly<Record<string, unknown>> & { readonly kind: string }, message: string): Promise<void> {
    if (!scope) return;
    try { await executePayablesCommand(scope, command); notify.success(message); refresh(); }
    catch (cause: unknown) { notify.failure(cause, "No se pudo completar la operación."); }
  }
  return <main className="mx-auto max-w-7xl space-y-6 p-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><p className="text-sm text-[var(--text-secondary)]">Cuentas por pagar</p><h1 className="text-3xl font-semibold">Programación de pagos</h1><p className="text-[var(--text-secondary)]">Un lote reserva saldos por proveedor y moneda; autorizarlo no mueve dinero.</p></div>
      {can("payables.create") && <button type="button" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white" onClick={() => setCreating(true)}>Nuevo lote</button>}</header>
    <label className="grid w-48 gap-1 text-sm">Estado<select className={CONTROL} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option>{Object.entries(STATUS_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
    <section className="space-y-3">
      {batches.error ? <p role="alert" className="text-danger">{batches.error}</p> : batches.loading ? <p role="status">Cargando…</p> : (batches.data?.rows ?? []).length === 0 ? <p className="text-sm text-[var(--text-secondary)]">No hay lotes.</p>
        : (batches.data?.rows ?? []).map((batch) => <article key={batch.id} className="rounded-xl border border-border-light bg-surface-1 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{batch.supplierName ?? batch.supplierId} · {batch.currency} · {batch.plannedDate}</h2><span className="rounded bg-default-100 px-2 py-0.5">{STATUS_LABELS[batch.status] ?? batch.status}</span></div>
          <ul className="my-2 space-y-1">{batch.items.map((item) => <li key={item.documentId} className="flex justify-between"><span>{item.documentNumber || item.documentId} · vence {item.dueAt}</span><span className="tabular-nums">{formatPayablesAmount(item.amount)}</span></li>)}</ul>
          <p className="font-medium">Reservado: <span className="tabular-nums">{formatPayablesAmount(batch.reserved)} {batch.currency}</span></p>
          {batch.rejectionReason && <p className="text-danger">Rechazado: {batch.rejectionReason}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {batch.status === "draft" && can("payables.create") && <><button type="button" className="rounded-lg border border-border-light px-3 py-1.5" onClick={() => setEditing(batch)}>Agregar documentos</button>{batch.items.length > 0 && <button type="button" className="rounded-lg border border-border-light px-3 py-1.5" onClick={() => void run({ kind: "submit_payment_batch", batchId: batch.id, expectedVersion: batch.version }, "Lote enviado a autorización.")}>Enviar a autorización</button>}</>}
            {batch.status === "submitted" && can("payables.authorize") && <><button type="button" className="rounded-lg bg-primary px-3 py-1.5 text-white" onClick={() => void run({ kind: "authorize_payment_batch", batchId: batch.id, expectedVersion: batch.version, decision: "authorized", separationRequired: false }, "Lote autorizado.")}>Autorizar</button><button type="button" className="rounded-lg border border-danger px-3 py-1.5 text-danger" onClick={() => setRejecting(batch)}>Rechazar</button></>}
            {batch.status === "authorized" && can("payables.post") && <button type="button" className="rounded-lg bg-primary px-3 py-1.5 text-white" onClick={() => setPaying(batch)}>Ejecutar pago</button>}
            {batch.paymentId && <a className="text-primary underline" href={`/payables/payments?paymentId=${encodeURIComponent(batch.paymentId)}`}>Ver pago</a>}
          </div>
        </article>)}
    </section>
    {creating && scope && <CreateBatch scope={scope} onClose={() => setCreating(false)} onDone={() => { setCreating(false); refresh(); }} />}
    {editing && scope && <BatchItems scope={scope} batch={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); refresh(); }} />}
    {rejecting && scope && <Reject onClose={() => setRejecting(null)} onSubmit={(reason) => run({ kind: "authorize_payment_batch", batchId: rejecting.id, expectedVersion: rejecting.version, decision: "rejected", reason, separationRequired: false }, "Lote rechazado.").then(() => setRejecting(null))} />}
    {paying && scope && <PayablesPaymentForm scope={scope} batch={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); refresh(); }} />}
  </main>;
}

function CreateBatch({ scope, onClose, onDone }: { readonly scope: PayablesRequestScope; readonly onClose: () => void; readonly onDone: () => void }): React.JSX.Element {
  const suppliers = usePayablesReport<{ readonly id: string; readonly name: string }>({ kind: "suppliers", limit: 200 });
  const [form, setForm] = useState({ supplierId: "", currency: "VES", plannedDate: payablesToday() });
  return <Panel title="Nuevo lote de pago" onClose={onClose} onSubmit={async () => { await executePayablesCommand(scope, { kind: "create_payment_batch", batchId: newPayablesId(), ...form }); notify.success("Lote creado. Agrega sus documentos."); onDone(); }}>
    <label className="grid gap-1">Proveedor<select required className={CONTROL} value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}><option value="">Selecciona</option>{(suppliers.data?.rows ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    <label className="grid gap-1">Moneda<select className={CONTROL} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}><option>VES</option><option>USD</option><option>EUR</option></select></label>
    <label className="grid gap-1">Fecha prevista<input required type="date" className={CONTROL} value={form.plannedDate} onChange={(event) => setForm({ ...form, plannedDate: event.target.value })} /></label>
  </Panel>;
}

function BatchItems({ scope, batch, onClose, onDone }: { readonly scope: PayablesRequestScope; readonly batch: Batch; readonly onClose: () => void; readonly onDone: () => void }): React.JSX.Element {
  const documents = usePayablesReport<OpenDocument>({ kind: "list_pending", supplierId: batch.supplierId, currency: batch.currency, limit: 200 });
  const debts = useMemo(() => (documents.data?.rows ?? []).filter((row) => row.side === "debit").sort((left, right) => left.dueAt.localeCompare(right.dueAt)), [documents.data]);
  const existing = new Map(batch.items.map((item) => [item.documentId, item.amount]));
  const [amounts, setAmounts] = useState<Readonly<Record<string, string>>>({});
  return <Panel title="Documentos del lote" onClose={onClose} onSubmit={async () => {
    // Reserving items does not bump the batch version; each item is still checked against it in SQL.
    for (const [documentId, amount] of Object.entries(amounts).filter(([, value]) => value.trim() !== "")) {
      await executePayablesCommand(scope, { kind: "set_payment_batch_item", batchId: batch.id, itemId: newPayablesId(), documentId, amount: amount.trim(), expectedVersion: batch.version });
    }
    notify.success("Reservas actualizadas."); onDone();
  }}>
    <div className="flex justify-between"><p className="text-[var(--text-secondary)]">Ordenados por vencimiento. La reserva no puede superar el saldo no reservado.</p><button type="button" className="underline" onClick={() => setAmounts(Object.fromEntries(debts.filter((row) => row.dueAt <= batch.plannedDate).map((row) => [row.documentId, row.balance.replace(/(\.\d{2})\d*$/, "$1")])))}>Sugerir vencidos al {batch.plannedDate}</button></div>
    <table className="w-full text-left"><thead><tr><th className="py-1">Documento</th><th className="py-1">Vence</th><th className="py-1 text-right">Saldo</th><th className="py-1">Reservar</th></tr></thead><tbody>{debts.map((row) => <tr key={row.documentId}>
      <td className="py-1">{row.documentNumber || row.documentId}{row.daysOverdue > 0 && <span className="ml-1 text-xs text-danger">vencido</span>}</td><td className="py-1">{row.dueAt}</td><td className="py-1 text-right tabular-nums">{formatPayablesAmount(row.balance)}</td>
      <td className="py-1"><input inputMode="decimal" placeholder={existing.get(row.documentId) ? formatPayablesAmount(existing.get(row.documentId)) : "0.00"} value={amounts[row.documentId] ?? ""} onChange={(event) => setAmounts({ ...amounts, [row.documentId]: event.target.value })} className={`${CONTROL} w-28`} aria-label={`Reserva para ${row.documentNumber}`} /></td>
    </tr>)}</tbody></table>
  </Panel>;
}

function Reject({ onClose, onSubmit }: { readonly onClose: () => void; readonly onSubmit: (reason: string) => Promise<void> }): React.JSX.Element {
  const [reason, setReason] = useState("");
  return <Panel title="Rechazar lote" onClose={onClose} onSubmit={() => onSubmit(reason.trim())}><label className="grid gap-1">Motivo<textarea required className={CONTROL} value={reason} onChange={(event) => setReason(event.target.value)} /></label></Panel>;
}

function Panel({ title, onClose, onSubmit, children }: { readonly title: string; readonly onClose: () => void; readonly onSubmit: () => Promise<void>; readonly children: React.ReactNode }): React.JSX.Element {
  const [saving, setSaving] = useState(false);
  return <ResponsiveDrawer isOpen onClose={onClose} title={title} footer={<div className="flex justify-end gap-2 p-4"><button type="button" className="rounded-lg border border-border-light px-3 py-2 text-sm" onClick={onClose}>Cancelar</button><button form="payables-schedule-panel" type="submit" disabled={saving} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Guardando…" : "Confirmar"}</button></div>}>
    <form id="payables-schedule-panel" className="grid gap-4 p-5 text-sm" onSubmit={(event) => { event.preventDefault(); setSaving(true); void onSubmit().catch((cause: unknown) => notify.failure(cause, "No se pudo completar.")).finally(() => setSaving(false)); }}>{children}</form>
  </ResponsiveDrawer>;
}
