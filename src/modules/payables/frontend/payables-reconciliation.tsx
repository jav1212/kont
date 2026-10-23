"use client";

import { useState } from "react";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { notify } from "@/src/shared/frontend/notify";
import { executePayablesCommand, formatPayablesAmount, payablesToday } from "./payables-client";
import { usePayablesReport, usePayablesScope } from "./use-payables-report";

interface Row { readonly paymentId: string; readonly occurredAt: string; readonly status: string; readonly amount: string; readonly currency: string; readonly operationalAmountVes: string; readonly state: "sin_asiento" | "contabilizado" | "diferencia"; readonly entryNumber: number | null; readonly journalDebits: string; readonly expectedDebits: string }
const STATE_LABELS: Readonly<Record<Row["state"], string>> = { sin_asiento: "Sin asiento", contabilizado: "Contabilizado", diferencia: "Diferencia" };
const CONTROL = "rounded-lg border border-default-300 bg-background px-3 py-2 text-sm";

/** Payment-to-journal reconciliation (CXP-031). Hidden until the company activates payables accounting rules.
 * @returns The reconciliation page.
 */
export function PayablesReconciliation(): React.JSX.Element {
  const scope = usePayablesScope();
  const { can } = useOrganizationModuleAccess("/payables");
  const today = payablesToday();
  const [range, setRange] = useState({ from: `${today.slice(0, 8)}01`, to: today });
  const [revision, setRevision] = useState(0);
  const report = usePayablesReport<Row>({ kind: "accounting_reconciliation", ...range, limit: 200 }, revision);
  async function act(row: Row): Promise<void> {
    if (!scope) return;
    try { await executePayablesCommand(scope, { kind: row.status === "posted" ? "post_payment_accounting" : "reverse_payment_accounting", paymentId: row.paymentId }); notify.success("Asiento registrado."); setRevision((value) => value + 1); }
    catch (cause: unknown) { notify.error(cause instanceof Error ? cause.message : "No se pudo contabilizar."); }
  }
  if (report.data && !report.data.rulesActive) return <main className="mx-auto max-w-3xl space-y-3 p-6"><h1 className="text-3xl font-semibold">Conciliación contable</h1><p className="text-[var(--text-secondary)]">Disponible cuando Contabilidad active las reglas de integración de pagos a proveedores (pago, retenciones y diferencial cambiario).</p></main>;
  return <main className="mx-auto max-w-7xl space-y-6 p-6">
    <header className="space-y-2"><p className="text-sm text-[var(--text-secondary)]">Cuentas por pagar</p><h1 className="text-3xl font-semibold">Conciliación contable de pagos</h1><p className="text-[var(--text-secondary)]">Cada pago debe tener su asiento; un pago anulado o reversado, su asiento compensatorio.</p></header>
    <div className="flex gap-3"><label className="grid gap-1 text-sm">Desde<input type="date" className={CONTROL} value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} /></label><label className="grid gap-1 text-sm">Hasta<input type="date" className={CONTROL} value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} /></label></div>
    <section className="overflow-hidden rounded-xl border border-border-light bg-surface-1">
      {report.error ? <p role="alert" className="p-5 text-danger">{report.error}</p> : report.loading ? <p className="p-5" role="status">Cargando…</p> : (report.data?.rows ?? []).length === 0 ? <p className="p-5 text-sm text-[var(--text-secondary)]">Sin pagos en el rango.</p>
        : <table className="w-full text-left text-sm"><thead><tr>{["Fecha", "Pago", "Monto", "Equivalente Bs", "Estado", "Asiento", "Débitos (asiento / esperado)", ""].map((label) => <th key={label} className="border-b border-border-light px-4 py-3 font-medium">{label}</th>)}</tr></thead>
          <tbody>{(report.data?.rows ?? []).map((row) => <tr key={row.paymentId}>
            <td className="border-b border-border-light px-4 py-2">{row.occurredAt}</td><td className="border-b border-border-light px-4 py-2"><a className="text-primary underline" href={`/payables/payments?paymentId=${encodeURIComponent(row.paymentId)}`}>{row.status === "posted" ? "Registrado" : row.status === "voided" ? "Anulado" : "Reversado"}</a></td>
            <td className="border-b border-border-light px-4 py-2 tabular-nums">{formatPayablesAmount(row.amount)} {row.currency}</td><td className="border-b border-border-light px-4 py-2 tabular-nums">{formatPayablesAmount(row.operationalAmountVes)}</td>
            <td className={`border-b border-border-light px-4 py-2 ${row.state === "diferencia" ? "text-danger" : ""}`}>{STATE_LABELS[row.state]}</td>
            <td className="border-b border-border-light px-4 py-2">{row.entryNumber ? `N° ${row.entryNumber}` : "—"}</td>
            <td className="border-b border-border-light px-4 py-2 tabular-nums">{formatPayablesAmount(row.journalDebits)} / {formatPayablesAmount(row.expectedDebits)}</td>
            <td className="border-b border-border-light px-4 py-2 text-right">{can("payables.post") && row.state !== "contabilizado" && <button type="button" className="text-primary underline" onClick={() => void act(row)}>{row.status === "posted" ? "Contabilizar" : "Compensar"}</button>}</td>
          </tr>)}</tbody></table>}
    </section>
  </main>;
}
