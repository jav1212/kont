"use client";

import { useState, type FormEvent } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";

const allocationExample = `[{"fiscalLineId":"ID_LINEA_FISCAL","orderLineId":null,"receiptLineId":"ID_LINEA_RECEPCION","quantity":"1","unit":"each","netAmount":{"minorAmount":"10000","currency":{"code":"VES","minorUnit":2}}}]`;
const evidenceExample = `{"factId":"UUID_HECHO","lineageKey":"purchase:REFERENCIA","recognitionDate":"2026-10-14","counterpartyCountryCode":"VE","deductibleState":"pending_review","deductibleAmount":{"minorAmount":"0","currency":{"code":"VES","minorUnit":2}},"deductibleReason":"Pendiente de evidencia documental","withholding":null,"affectedFactId":null,"recordedAt":"2026-10-14T12:00:00.000Z"}`;

/** Captures supplier-invoice allocations and accountant-reviewed recognition evidence.
 * @returns The purchase VAT matching workspace for the selected company.
 */
export default function IvaPurchaseMatchesPage(): React.JSX.Element {
  const { companyId } = useCompany();
  const [matchId, setMatchId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveDraft(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true); setMessage(null); setError(null);
    try {
      if (!companyId) throw new Error("Selecciona una empresa.");
      const id = crypto.randomUUID();
      const currency = { code: text(data, "currency"), minorUnit: Number(text(data, "minorUnit")) };
      const allocations = JSON.parse(text(data, "allocations")) as Array<Record<string, unknown>>;
      const normalizedAllocations = allocations.map((allocation) => ({
        ...allocation,
        invoicedQuantity: { amount: allocation.quantity, unit: allocation.unit },
        netAmount: allocation.netAmount,
      }));
      const body = {
        companyId, id, supplierId: text(data, "supplierId"), fiscalDocumentId: text(data, "fiscalDocumentId"),
        documentCurrency: currency,
        allocations: normalizedAllocations,
        allocatedNetAmount: { minorAmount: text(data, "allocatedNetAmount"), currency },
      };
      const response = await fetch("/api/fiscal/iva/purchase-matches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { data?: { id?: string }; error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la conciliación.");
      setMatchId(result.data?.id ?? id);
      setMessage(`Borrador guardado: ${result.data?.id ?? id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Revisa los datos ingresados."); }
    finally { setSaving(false); }
  }

  async function confirm(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true); setMessage(null); setError(null);
    try {
      if (!companyId) throw new Error("Selecciona una empresa.");
      const data = new FormData(event.currentTarget);
      const factMetadata = JSON.parse(text(data, "factMetadata"));
      const response = await fetch(`/api/fiscal/iva/purchase-matches/${encodeURIComponent(text(data, "matchId"))}/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, factMetadata }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo confirmar la conciliación.");
      setMessage("Conciliación confirmada y hecho IVA registrado de forma atómica.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Revisa la evidencia de confirmación."); }
    finally { setSaving(false); }
  }

  return <div className="space-y-6">
    <PageHeader title="Conciliación de IVA de compras" subtitle="Vincula cada línea de una factura fiscal recibida con su orden o recepción. La confirmación conserva el hecho histórico y nunca recalcula sus impuestos." />
    <div className="rounded-xl border border-border-light bg-surface-1 p-5 text-sm text-[var(--text-secondary)]">
      Selecciona una factura fiscal recibida y el proveedor correspondiente. Los importes de asignación usan unidades menores de la moneda (por ejemplo, céntimos). No se infiere deducibilidad: usa `pending_review` hasta tener respaldo suficiente.
    </div>
    <form onSubmit={saveDraft} className="space-y-4 rounded-xl border border-border-light bg-surface-1 p-5">
      <h2 className="font-semibold">Nuevo borrador</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <Field name="fiscalDocumentId" label="ID del documento fiscal recibido" required />
        <Field name="supplierId" label="ID del proveedor" required />
        <Field name="currency" label="Moneda (ISO 4217)" defaultValue="VES" required />
        <Field name="minorUnit" label="Decimales de moneda" defaultValue="2" required />
        <Field name="allocatedNetAmount" label="Neto total en unidades menores" required />
      </div>
      <label className="block text-sm font-medium">Asignaciones por línea (JSON)
        <textarea name="allocations" defaultValue={allocationExample} rows={5} required className="mt-1 w-full rounded-lg border border-border-light bg-surface-1 p-3 font-mono text-xs" />
      </label>
      <p className="text-xs text-[var(--text-tertiary)]">Cada línea fiscal debe quedar cubierta exactamente en cantidad y neto. Incluye `orderLineId` o `receiptLineId` para cada asignación.</p>
      <button disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar borrador"}</button>
    </form>
    <form onSubmit={confirm} className="space-y-4 rounded-xl border border-border-light bg-surface-1 p-5">
      <h2 className="font-semibold">Confirmar borrador revisado</h2>
      <Field name="matchId" label="ID de conciliación" defaultValue={matchId} required />
      <label className="block text-sm font-medium">Evidencia de reconocimiento y crédito fiscal (JSON)
        <textarea name="factMetadata" defaultValue={evidenceExample} rows={6} required className="mt-1 w-full rounded-lg border border-border-light bg-surface-1 p-3 font-mono text-xs" />
      </label>
      <p className="text-xs text-[var(--text-tertiary)]">Ajusta fechas, linaje, moneda y montos a la evidencia real. La clasificación fiscal del proveedor se lee de la configuración versionada de la empresa.</p>
      <button disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Procesando…" : "Confirmar y reconocer IVA"}</button>
    </form>
    {message && <p role="status" className="rounded-lg bg-success-50 p-3 text-sm text-success-700">{message}</p>}
    {error && <p role="alert" className="rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
    <Link href="/purchases/iva-ledger" className="text-sm font-semibold text-primary-500 hover:underline">Volver al libro IVA de compras</Link>
  </div>;
}

function Field(props: { readonly name: string; readonly label: string; readonly required?: boolean; readonly defaultValue?: string }): React.JSX.Element {
  return <label className="block text-sm font-medium">{props.label}<input name={props.name} required={props.required} defaultValue={props.defaultValue} className="mt-1 w-full rounded-lg border border-border-light bg-surface-1 px-3 py-2" /></label>;
}
function text(data: FormData, key: string): string {
  const value = data.get(key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`Completa ${key}.`);
  return value.trim();
}
