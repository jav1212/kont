"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, FileClock, RefreshCcw } from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";

interface SerializedMoney { readonly minorAmount: string; readonly currency: { readonly code: string; readonly minorUnit: number }; }
interface DeclarationRecord {
  readonly id: string;
  readonly period: string;
  readonly revision: number;
  readonly status: "draft" | "prepared" | "submitted" | "paid" | "void";
  readonly summary: { readonly debitTax: SerializedMoney; readonly deductibleCredit: SerializedMoney; readonly withheldTax: SerializedMoney; readonly carryForwardIn: SerializedMoney; readonly adjustments: SerializedMoney; readonly payable: SerializedMoney };
  readonly submittedEvidence: { readonly reference: string; readonly submittedAt: string } | null;
  readonly voidEvidence?: { readonly reason: string; readonly voidedAt: string; readonly actorId: string } | null;
  readonly payments: readonly { readonly reference: string; readonly amount: SerializedMoney; readonly paidAt: string }[];
  readonly createdAt: string;
}
interface HistoryPage { readonly items: readonly DeclarationRecord[]; readonly nextCursor: { readonly period: string; readonly id: string; readonly revision: number } | null; }
type DeclarationCursor = NonNullable<HistoryPage["nextCursor"]>;

/** Provides an internal IVA draft and immutable declaration history for a selected company.
 * @returns A period-scoped declaration preparation and history screen.
 */
export default function IvaDeclarationsPage(): React.JSX.Element {
  const { companyId } = useCompany();
  const [period, setPeriod] = useState(() => currentPeriod());
  const [carryForward, setCarryForward] = useState("0.00");
  const [adjustments, setAdjustments] = useState("0.00");
  const [history, setHistory] = useState<HistoryPage | null>(null);
  const [latest, setLatest] = useState<DeclarationRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ fingerprint: string; key: string; body: string } | null>(null);

  const loadHistory = useCallback(async (cursor: DeclarationCursor | null = null, append = false) => {
    if (!companyId) { setHistory(null); return; }
    if (!append) setHistory(null);
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ companyId, fromPeriod: period, toPeriod: period, limit: "50" });
      if (cursor) query.set("cursor", JSON.stringify(cursor));
      const response = await fetch(`/api/fiscal/iva/declarations?${query}`, { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body));
      const data = record(body).data as HistoryPage;
      setHistory((current) => append && current ? { ...data, items: [...current.items, ...data.items] } : data);
    } catch (cause) {
      setHistory(null);
      setError(cause instanceof Error ? cause.message : "No fue posible consultar el historial de declaraciones.");
    } finally { setLoading(false); }
  }, [companyId, period]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  async function prepare(): Promise<void> {
    if (!companyId) return;
    setSaving(true);
    setError(null);
    const fingerprint = JSON.stringify([companyId, period, carryForward, adjustments]);
    const previous = pending.current;
    const submission = previous?.fingerprint === fingerprint ? previous : {
      fingerprint,
      key: crypto.randomUUID(),
      body: JSON.stringify({
        companyId,
        period,
        carryForwardIn: carryForward,
        adjustments,
        declarationId: history?.items.at(-1)?.id ?? crypto.randomUUID(),
        expectedRevision: history?.items.at(-1)?.revision ?? null,
        createdAt: new Date().toISOString(),
      }),
    };
    pending.current = submission;
    try {
      const response = await fetch("/api/fiscal/iva/declarations/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": submission.key },
        body: submission.body,
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body));
      const data = record(body).data as { readonly declaration: DeclarationRecord; readonly replayed: boolean };
      pending.current = null;
      setLatest(data.declaration);
      await loadHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible preparar el borrador interno.");
    } finally { setSaving(false); }
  }

  return <div className="min-h-full bg-surface-2 font-mono">
    <PageHeader title="Declaraciones internas de IVA" subtitle="Preparación y consulta de borradores basados en hechos históricos" />
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8">
      <div className="flex gap-3 rounded-xl border border-warning/30 bg-surface-1 p-4 text-sm"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" /><p>Este resumen es un registro interno, no es la Forma IVA 30 oficial ni una constancia de presentación. El arrastre y los ajustes deben ser revisados e ingresados por el responsable contable.</p></div>
      {!companyId && <div className="rounded-xl border border-border-light bg-surface-1 p-5 text-sm">Selecciona una empresa para consultar su historial.</div>}
      <section className="space-y-4 rounded-xl border border-border-light bg-surface-1 p-5 md:p-7">
        <h2 className="text-sm font-bold">Preparar borrador del período</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Período"><input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className={inputClass} /></Field>
          <Field label="Arrastre revisado (VES)"><input inputMode="decimal" value={carryForward} onChange={(event) => setCarryForward(event.target.value)} pattern="\d+(\.\d{1,2})?" className={inputClass} /></Field>
          <Field label="Ajustes revisados (VES; débito positivo)"><input inputMode="decimal" value={adjustments} onChange={(event) => setAdjustments(event.target.value)} pattern="-?\d+(\.\d{1,2})?" className={inputClass} /></Field>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">El sistema consulta todos los hechos del mes. Si alguno está pendiente de conciliación, deducibilidad o clasificación, se rechazará la preparación.</p>
        <button type="button" disabled={!companyId || saving || loading || Boolean(history?.nextCursor)} onClick={() => void prepare()} className="h-10 rounded-lg bg-primary-500 px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Preparando…" : loading ? "Cargando historial…" : history?.nextCursor ? "Carga el historial completo para continuar" : history?.items.at(-1) ? "Crear siguiente revisión interna" : "Preparar borrador interno"}</button>
      </section>
      {latest && <DeclarationSummary declaration={latest} title="Borrador preparado" />}
      {error && <div role="alert" className="rounded-xl border border-warning/30 bg-surface-1 p-4 text-sm">{error}</div>}
      <section className="overflow-hidden rounded-xl border border-border-light bg-surface-1">
        <div className="flex items-center justify-between border-b border-border-light p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold"><FileClock size={16} /> Historial del período {period}</h2>
          <button type="button" onClick={() => void loadHistory()} disabled={loading || !companyId} aria-label="Actualizar historial" className="rounded-md p-2 hover:bg-surface-2 disabled:opacity-50"><RefreshCcw size={15} /></button>
        </div>
        {loading ? <p role="status" className="p-8 text-center text-sm">Consultando historial…</p>
          : history && history.items.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border-light text-xs uppercase text-[var(--text-tertiary)]"><th className="p-3">Período</th><th className="p-3">Estado</th><th className="p-3">Revisión</th><th className="p-3">Fecha</th><th className="p-3 text-right">Débito</th><th className="p-3 text-right">Crédito</th><th className="p-3 text-right">Retenciones</th><th className="p-3 text-right">Resultado interno</th><th className="p-3">Acciones</th></tr></thead><tbody>{history.items.map((item, index) => <tr key={`${item.id}:${item.revision}`} className="border-t border-border-light/70"><td className="p-3">{item.period}</td><td className="p-3">{statusLabel(item.status)}</td><td className="p-3">{item.revision}</td><td className="p-3">{item.createdAt.slice(0, 10)}</td><td className="p-3 text-right">{moneyLabel(item.summary.debitTax)}</td><td className="p-3 text-right">{moneyLabel(item.summary.deductibleCredit)}</td><td className="p-3 text-right">{moneyLabel(item.summary.withheldTax)}</td><td className="p-3 text-right">{moneyLabel(item.summary.payable)}</td><td className="min-w-64 p-3"><DeclarationActions declaration={item} companyId={companyId} current={!history.nextCursor && index === history.items.length - 1} onSaved={() => { setLatest(null); void loadHistory(); }} /></td></tr>)}</tbody></table></div>
          : !error && <p className="p-8 text-center text-sm text-[var(--text-secondary)]">No hay revisiones guardadas para este período.</p>}
        {history?.nextCursor && <div className="border-t border-border-light p-3 text-center"><button type="button" disabled={loading} onClick={() => void loadHistory(history.nextCursor, true)} className="text-xs font-semibold text-primary-500 disabled:opacity-50">Cargar siguientes revisiones para preparar la siguiente versión</button></div>}
      </section>
    </main>
  </div>;
}

function DeclarationSummary({ declaration, title }: { readonly declaration: DeclarationRecord; readonly title: string }): React.JSX.Element {
  return <section className="space-y-3 rounded-xl border border-border-light bg-surface-1 p-5"><h2 className="text-sm font-bold">{title} · {declaration.period}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Kpi label="Débito fiscal" value={moneyLabel(declaration.summary.debitTax)} /><Kpi label="Crédito elegible" value={moneyLabel(declaration.summary.deductibleCredit)} /><Kpi label="Retenciones" value={moneyLabel(declaration.summary.withheldTax)} /><Kpi label="Resultado interno" value={moneyLabel(declaration.summary.payable)} /></div></section>;
}

type LifecycleAction = "submit" | "record_payment" | "void";

function DeclarationActions({ declaration, companyId, current, onSaved }: { readonly declaration: DeclarationRecord; readonly companyId: string | null; readonly current: boolean; readonly onSaved: () => void }): React.JSX.Element {
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ readonly fingerprint: string; readonly key: string; readonly body: string } | null>(null);

  async function recordEvidence(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!action || !companyId) return;
    const form = new FormData(event.currentTarget);
    let evidence: Record<string, string>;
    try {
      evidence = action === "submit"
        ? { reference: field(form, "reference"), submittedAt: toInstant(field(form, "occurredAt")) }
        : action === "record_payment"
          ? { reference: field(form, "reference"), amount: field(form, "amount"), paidAt: toInstant(field(form, "occurredAt")) }
          : { reason: field(form, "reason") };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Completa la evidencia solicitada.");
      return;
    }
    const fingerprint = JSON.stringify([companyId, declaration.id, declaration.revision, action, evidence]);
    const previous = pending.current;
    const submission = previous?.fingerprint === fingerprint ? previous : {
      fingerprint,
      key: crypto.randomUUID(),
      body: JSON.stringify({ companyId, period: declaration.period, expectedRevision: declaration.revision, action, evidence }),
    };
    pending.current = submission;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/fiscal/iva/declarations/${encodeURIComponent(declaration.id)}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": submission.key },
        body: submission.body,
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body));
      pending.current = null;
      setAction(null);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar la evidencia.");
    } finally { setSaving(false); }
  }

  const available: readonly LifecycleAction[] = declaration.status === "prepared" ? ["submit", "void"]
    : declaration.status === "submitted" ? ["record_payment"] : [];
  if (!current) return <p className="text-[10px] text-[var(--text-tertiary)]">Solo disponible en la revisión vigente.</p>;
  return <div className="space-y-2">
    {declaration.status === "submitted" && declaration.payments.length > 0 && <p className="text-[10px] text-[var(--text-tertiary)]">Pagos con evidencia: {declaration.payments.length}</p>}
    {!action && available.map((item) => <button key={item} type="button" onClick={() => setAction(item)} className="mr-2 text-xs font-semibold text-primary-500 hover:underline">{actionLabel(item)}</button>)}
    {action && <form onSubmit={(event) => void recordEvidence(event)} className="grid min-w-64 gap-2">
      <p className="text-xs font-semibold">{actionLabel(action)}{action === "submit" ? " (ya realizada fuera del sistema)" : action === "record_payment" ? " (pago ya ejecutado)" : " (solo anulación interna)"}</p>
      {action === "void" ? <Field label="Motivo"><input name="reason" required maxLength={256} className={inputClass} /></Field> : <>
        <Field label={action === "submit" ? "Referencia de constancia externa" : "Referencia de pago"}><input name="reference" required maxLength={256} className={inputClass} /></Field>
        {action === "record_payment" && <Field label={`Monto pagado (VES; exigible ${moneyLabel(declaration.summary.payable)})`}><input name="amount" required inputMode="decimal" pattern="\d+(\.\d{1,2})?" className={inputClass} /></Field>}
        <Field label={action === "submit" ? "Fecha y hora de presentación" : "Fecha y hora del pago"}><input name="occurredAt" type="datetime-local" required defaultValue={localDateTimeNow()} className={inputClass} /></Field>
      </>}
      {error && <p role="alert" className="text-xs text-warning">{error}</p>}
      <div className="flex gap-2"><button type="submit" disabled={saving} className="rounded bg-primary-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar evidencia"}</button><button type="button" onClick={() => setAction(null)} className="rounded border border-border-light px-3 py-2 text-xs">Cancelar</button></div>
    </form>}
  </div>;
}

function Kpi({ label, value }: { readonly label: string; readonly value: string }): React.JSX.Element { return <div className="rounded-lg bg-surface-2 p-3"><p className="text-[10px] uppercase text-[var(--text-tertiary)]">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }
function Field({ label, children }: { readonly label: string; readonly children: React.ReactNode }): React.JSX.Element { return <label className="grid gap-1.5 text-xs text-[var(--text-secondary)]">{label}{children}</label>; }
const inputClass = "h-10 rounded-lg border border-border-light bg-surface-1 px-3 text-sm text-foreground";
function currentPeriod(): string { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; }
function localDateTimeNow(): string { const now = new Date(); const offset = now.getTimezoneOffset() * 60_000; return new Date(now.getTime() - offset).toISOString().slice(0, 16); }
function field(form: FormData, name: string): string { return String(form.get(name) ?? "").trim(); }
function toInstant(value: string): string { const date = new Date(value); if (!value || !Number.isFinite(date.getTime())) throw new Error("Ingresa una fecha y hora válidas."); return date.toISOString(); }
function actionLabel(action: LifecycleAction): string { return action === "submit" ? "Registrar presentación" : action === "record_payment" ? "Registrar pago" : "Anular borrador"; }
function record(value: unknown): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("La respuesta del servidor no es válida."); return value as Record<string, unknown>; }
function errorMessage(value: unknown): string { const body = record(value); return typeof body.error === "string" ? body.error : "No fue posible completar la operación."; }
function statusLabel(status: DeclarationRecord["status"]): string { return ({ draft: "Borrador", prepared: "Preparada", submitted: "Presentada (evidencia)", paid: "Pagada (evidencia)", void: "Anulada internamente" })[status]; }
function moneyLabel(value: SerializedMoney): string {
  const minor = BigInt(value.minorAmount);
  const unit = 10n ** BigInt(value.currency.minorUnit);
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const fraction = value.currency.minorUnit === 0 ? "" : `.${(absolute % unit).toString().padStart(value.currency.minorUnit, "0")}`;
  return `${negative ? "-" : ""}${(absolute / unit).toString()}${fraction} ${value.currency.code}`;
}
