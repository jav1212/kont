"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TreasuryCheckRow } from "../treasury-rows";
import { useTreasuryContext } from "../context/treasury-context";
import { useTreasuryCatalogs } from "../hooks/use-treasury-catalogs";
import { CHECK_DELIVERY_BATCH_LIMIT, type WebCheckDeliveryBatchItem, type WebCheckDeliveryBatchOutcome } from "../treasury-client";
import { notifyTreasuryFailure, treasuryAccountLabel } from "./treasury-form-controls";
import { notify } from "@/src/shared/frontend/notify";

type ItemIdentity = Pick<WebCheckDeliveryBatchItem, "deliveryEventId" | "idempotencyKey" | "correlationId">;

/** Lists issued checks awaiting delivery and records up to one hundred deliveries in one submission.
 *
 * Each check keeps its delivery identifiers until the server answers for it, so resubmitting after a
 * lost response replays the same deliveries instead of duplicating them. Checks that failed stay
 * selected with their reason so the operator can correct and retry only those.
 *
 * @param props - Optional bank-account filter from the page URL and whether the actor holds `treasury.checks`.
 * @returns The pending-delivery tab of the checks page.
 */
export function CheckDeliveryBatch({ bankAccountId, canDeliver }: { readonly bankAccountId: string; readonly canDeliver: boolean }): React.JSX.Element {
  const { query, revision, deliverChecks } = useTreasuryContext();
  const catalogs = useTreasuryCatalogs();
  const [checks, setChecks] = useState<readonly TreasuryCheckRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReadonlyMap<string, TreasuryCheckRow>>(new Map());
  const [recipient, setRecipient] = useState("");
  const [evidence, setEvidence] = useState("");
  const [outcomes, setOutcomes] = useState<readonly WebCheckDeliveryBatchOutcome[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const identities = useRef(new Map<string, ItemIdentity>());

  useEffect(() => { setPage(1); setSelected(new Map()); }, [bankAccountId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await query<TreasuryCheckRow>({ kind: "list_checks", status: "issued", ...(bankAccountId ? { bankAccountId } : {}), page, pageSize: CHECK_DELIVERY_BATCH_LIMIT });
      setChecks(result.items); setTotal(result.total);
      // Selections keep the version last seen; refresh it so a retry does not fail on a stale version.
      setSelected((current) => new Map([...current].map(([id, check]) => [id, result.items.find((item) => item.id === id) ?? check])));
    } catch (cause: unknown) { notifyTreasuryFailure(cause, "No se pudieron consultar los cheques por entregar.", "treasury:checks:load"); }
    finally { setLoading(false); }
  }, [bankAccountId, page, query]);
  useEffect(() => { void load(); }, [load, revision]);

  const toggle = (check: TreasuryCheckRow) => setSelected((current) => {
    const next = new Map(current);
    if (next.has(check.id)) next.delete(check.id);
    else if (next.size < CHECK_DELIVERY_BATCH_LIMIT) next.set(check.id, check);
    return next;
  });
  const pageSelectable = checks.filter((check) => !selected.has(check.id)).slice(0, CHECK_DELIVERY_BATCH_LIMIT - selected.size);
  const allOnPageSelected = checks.length > 0 && checks.every((check) => selected.has(check.id));
  const togglePage = () => setSelected((current) => {
    const next = new Map(current);
    if (allOnPageSelected) checks.forEach((check) => next.delete(check.id));
    else pageSelectable.forEach((check) => next.set(check.id, check));
    return next;
  });

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = recipient.trim();
    if (!canDeliver || !name || selected.size === 0) return;
    const deliveredAt = new Date().toISOString();
    const reference = evidence.trim();
    const items = [...selected.values()].map((check): WebCheckDeliveryBatchItem => {
      const identity = identities.current.get(check.id) ?? { deliveryEventId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() };
      identities.current.set(check.id, identity);
      return { ...identity, checkId: check.id, recipientName: name, deliveredAt, ...(reference ? { evidenceReference: reference } : {}), expectedVersion: check.version };
    });
    setSubmitting(true); setOutcomes([]);
    try {
      const result = await deliverChecks(items);
      // Every item received a definitive answer; failed ones restart with fresh identifiers.
      result.forEach((outcome) => identities.current.delete(outcome.checkId));
      setOutcomes(result);
      const failed = new Set(result.filter((outcome) => outcome.status === "failed").map((outcome) => outcome.checkId));
      setSelected((current) => new Map([...current].filter(([id]) => failed.has(id))));
      if (failed.size === 0) { setRecipient(""); setEvidence(""); }
      else notify.warning(`${failed.size} cheque${failed.size === 1 ? " no se entregó" : "s no se entregaron"}.`, { deduplicationKey: "treasury:checks:delivery-results" });
    } catch (cause: unknown) {
      notifyTreasuryFailure(cause, "No se pudo procesar el lote de entregas. Reintenta: las entregas ya registradas no se duplicarán.", "treasury:checks:deliver");
    } finally { setSubmitting(false); }
  };

  const accountName = (id: string) => {
    const account = catalogs.accounts.find((item) => item.id === id);
    return account ? treasuryAccountLabel(account) : id;
  };
  const recorded = outcomes.filter((outcome) => outcome.status === "recorded").length;
  const failures = outcomes.filter((outcome): outcome is Extract<WebCheckDeliveryBatchOutcome, { status: "failed" }> => outcome.status === "failed");

  return <section className="space-y-4">
    {canDeliver && <form onSubmit={submit} className="grid gap-3 rounded-xl border border-default-200 bg-content1 p-5 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2 lg:col-span-4"><h2 className="font-semibold">Entrega masiva</h2><p className="text-sm text-default-500">Selecciona hasta {CHECK_DELIVERY_BATCH_LIMIT} cheques. Cada entrega se confirma por separado y un fallo no revierte las demás.</p></div>
      <label className="grid gap-1 text-sm">Recibido por<input required maxLength={160} value={recipient} onChange={(event) => setRecipient(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label>
      <label className="grid gap-1 text-sm">Evidencia (opcional)<input maxLength={240} value={evidence} onChange={(event) => setEvidence(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label>
      <p className="self-end text-sm text-default-500">{selected.size} de {CHECK_DELIVERY_BATCH_LIMIT} seleccionados</p>
      <button type="submit" disabled={submitting || selected.size === 0 || !recipient.trim()} className="self-end rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{submitting ? "Registrando…" : `Entregar ${selected.size} ${selected.size === 1 ? "cheque" : "cheques"}`}</button>
    </form>}
    {outcomes.length > 0 && <div role="status" className="space-y-2 rounded-lg border border-default-200 bg-content1 p-4 text-sm">
      <p>{recorded} entregas registradas · {failures.length} con error.</p>
      {failures.length > 0 && <div className="overflow-x-auto"><table className="min-w-full text-left"><thead><tr><th className="py-2">Cheque</th><th className="py-2">Resultado</th></tr></thead><tbody>{failures.map((outcome) => <tr key={outcome.checkId} className="border-t border-default-100"><td className="py-2">{checks.find((check) => check.id === outcome.checkId)?.number ?? outcome.checkId}</td><td className="py-2"><span className="rounded-full bg-surface-2 px-2 py-1 text-xs text-[var(--text-secondary)]">No entregado</span></td></tr>)}</tbody></table></div>}
    </div>}
    <section className="overflow-hidden rounded-xl border border-default-200 bg-content1">
      <div className="flex justify-between border-b border-default-200 p-4"><h2 className="font-semibold">Cheques por entregar</h2><span className="text-sm">{total} cheques</span></div>
      {loading ? <p className="p-6 text-sm">Cargando…</p> : checks.length === 0 ? <p className="p-6 text-sm text-default-500">No hay cheques emitidos pendientes de entrega.</p> : <div className="overflow-x-auto"><table className="min-w-full text-sm">
        <thead className="bg-default-100 text-left"><tr>{canDeliver && <th className="px-4 py-3"><input type="checkbox" aria-label="Seleccionar página" checked={allOnPageSelected} onChange={togglePage} /></th>}<th className="px-4 py-3">Número</th><th className="px-4 py-3">Cuenta</th><th className="px-4 py-3">Emisión</th><th className="px-4 py-3 text-right">Monto</th></tr></thead>
        <tbody>{checks.map((check) => <tr key={check.id} className="border-t border-default-100">
          {canDeliver && <td className="px-4 py-3"><input type="checkbox" aria-label={`Seleccionar cheque ${check.number}`} checked={selected.has(check.id)} disabled={!selected.has(check.id) && selected.size >= CHECK_DELIVERY_BATCH_LIMIT} onChange={() => toggle(check)} /></td>}
          <td className="px-4 py-3">{check.number}</td><td className="px-4 py-3">{accountName(check.bankAccountId)}</td><td className="px-4 py-3">{check.issueDate}</td><td className="px-4 py-3 text-right">{check.amount} {check.currency}</td>
        </tr>)}</tbody>
      </table></div>}
      <div className="flex justify-between border-t border-default-200 p-4 text-sm"><button type="button" disabled={page === 1 || loading} onClick={() => setPage((current) => current - 1)} className="disabled:opacity-50">Anterior</button><span>Página {page}</span><button type="button" disabled={page * CHECK_DELIVERY_BATCH_LIMIT >= total || loading} onClick={() => setPage((current) => current + 1)} className="disabled:opacity-50">Siguiente</button></div>
    </section>
  </section>;
}
