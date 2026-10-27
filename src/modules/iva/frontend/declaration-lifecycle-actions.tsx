"use client";

import { useRef, useState, type FormEvent } from "react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { ApiRequestFailure } from "@/src/shared/frontend/feedback/api-request-failure";

type DeclarationState = "draft" | "prepared" | "submitted" | "paid" | "void";
interface Money { readonly minorAmount: string; readonly currency: { readonly code: string; readonly minorUnit: number } }
export interface DeclarationLifecycleSnapshot {
  readonly id: string;
  readonly period: string;
  readonly revision: number;
  readonly status: DeclarationState;
  readonly summary: { readonly payable: Money };
  readonly payments: readonly { readonly reference: string; readonly amount: Money; readonly paidAt: string }[];
}
type Action = "submit" | "record_payment" | "void";

/** Records external declaration or payment evidence for the current revision.
 * @param props - Current declaration, company scope, and refresh callback.
 * @returns The lifecycle action form available for this revision.
 */
export function DeclarationLifecycleActions({ declaration, companyId, current, onSaved }: { readonly declaration: DeclarationLifecycleSnapshot; readonly companyId: string | null; readonly current: boolean; readonly onSaved: () => void }): React.JSX.Element {
  const [action, setAction] = useState<Action | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ readonly fingerprint: string; readonly key: string; readonly body: string } | null>(null);
  const available: readonly Action[] = declaration.status === "prepared" ? ["submit", "void"] : declaration.status === "submitted" ? ["record_payment"] : [];

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!action || !companyId) return;
    const form = new FormData(event.currentTarget);
    const rawDate = String(form.get("occurredAt") ?? "");
    const date = new Date(rawDate);
    if (action !== "void" && (!rawDate || !Number.isFinite(date.getTime()))) { setError("Ingresa una fecha y hora válidas."); return; }
    const evidence = action === "submit" ? { reference: text(form, "reference"), submittedAt: date.toISOString() }
      : action === "record_payment" ? { reference: text(form, "reference"), amount: text(form, "amount"), paidAt: date.toISOString() }
      : { reason: text(form, "reason") };
    const fingerprint = JSON.stringify([companyId, declaration.id, declaration.revision, action, evidence]);
    const previous = pending.current;
    const command = previous?.fingerprint === fingerprint ? previous : { fingerprint, key: crypto.randomUUID(), body: JSON.stringify({ companyId, period: declaration.period, expectedRevision: declaration.revision, action, evidence }) };
    pending.current = command; setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/fiscal/iva/declarations/${encodeURIComponent(declaration.id)}/lifecycle`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": command.key }, body: command.body });
      const body: unknown = await response.json();
      if (!response.ok) throw new ApiRequestFailure(response, errorMessage(body), body);
      pending.current = null; setAction(null); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar la evidencia."); }
    finally { setSaving(false); }
  }

  return <section className="rounded-xl border border-border-light bg-surface-1 p-5"><h3 className="font-semibold">Acciones de la revisión</h3>{!current ? <p className="mt-2 text-sm text-[var(--text-secondary)]">Solo la revisión vigente permite registrar nuevas acciones.</p> : <>
    {declaration.status === "submitted" && declaration.payments.length > 0 && <p className="mt-2 text-xs text-[var(--text-secondary)]">Pagos con evidencia: {declaration.payments.length}</p>}
    {!action && <div className="mt-3 flex flex-wrap gap-2">{available.map((value) => <BaseButton.Root key={value} size="sm" variant={value === "void" ? "dangerOutline" : "secondary"} onPress={() => setAction(value)}>{actionLabel(value)}</BaseButton.Root>)}</div>}
    {action && <form onSubmit={(event) => void submit(event)} className="mt-4 grid max-w-xl gap-3"><p className="text-sm">{action === "submit" ? "Registrar referencia de presentación externa ya realizada." : action === "record_payment" ? "Registrar evidencia de un pago ya ejecutado." : "Anular internamente un borrador sin evidencia externa."}</p>
      {action === "void" ? <BaseInput.Field label="Motivo" name="reason" isRequired maxLength={256} /> : <><BaseInput.Field label={action === "submit" ? "Referencia de constancia" : "Referencia de pago"} name="reference" isRequired maxLength={256} />{action === "record_payment" && <BaseInput.Field label="Monto pagado" name="amount" isRequired inputMode="decimal" pattern="\d+(\.\d{1,2})?" prefix="Bs." inputClassName="text-right" />}<BaseInput.Field label={action === "submit" ? "Fecha y hora de presentación" : "Fecha y hora del pago"} name="occurredAt" type="datetime-local" isRequired defaultValue={localNow()} /></>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}<div className="flex flex-wrap gap-2"><BaseButton.Root type="submit" variant="primary" loading={saving}>Guardar evidencia</BaseButton.Root><BaseButton.Root variant="secondary" isDisabled={saving} onPress={() => setAction(null)}>Cancelar</BaseButton.Root></div>
    </form>}
  </>}</section>;
}

function text(form: FormData, name: string): string { return String(form.get(name) ?? "").trim(); }
function actionLabel(action: Action): string { return action === "submit" ? "Registrar presentación" : action === "record_payment" ? "Registrar pago" : "Anular borrador"; }
function localNow(): string { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function errorMessage(value: unknown): string { return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : "No fue posible completar la operación."; }
