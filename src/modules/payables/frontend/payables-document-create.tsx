"use client";

import { useState } from "react";
import { ResponsiveDrawer } from "@/src/shared/frontend/components/responsive-drawer";
import { notify } from "@/src/shared/frontend/notify";
import { executePayablesCommand, newPayablesId, payablesToday, type PayablesRequestScope } from "./payables-client";
import { usePayablesReport } from "./use-payables-report";

type CreateKind = "create_manual_document" | "import_opening_document" | "positive" | "negative";
const KIND_OPTIONS: readonly (readonly [CreateKind, string, string])[] = [
  ["create_manual_document", "Documento manual", "Obligación sin efecto fiscal (CXP-002)."],
  ["positive", "Ajuste positivo", "Aumenta lo adeudado al proveedor (CXP-009)."],
  ["negative", "Ajuste negativo", "Crédito a favor que luego se aplica a documentos (CXP-010)."],
  ["import_opening_document", "Saldo inicial", "Deuda anterior a la puesta en marcha; no entra en libros (apertura)."],
];
const CONTROL = "rounded-lg border border-default-300 bg-background px-3 py-2";

/** Side panel that records a manual document, adjustment or opening balance.
 * The rate is resolved by the server from the issue date; the form never sends one.
 * @param props - Request scope, open state, close handler and a callback after a successful save.
 * @returns The creation drawer.
 */
export function PayablesDocumentCreate({ scope, isOpen, onClose, onCreated }: {
  readonly scope: PayablesRequestScope | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onCreated: () => void;
}): React.JSX.Element {
  const [kind, setKind] = useState<CreateKind>("create_manual_document");
  // Suppliers come from the payables read model, so creating a document needs only payables permissions.
  const supplierReport = usePayablesReport<{ readonly id: string; readonly name: string; readonly rif: string }>(isOpen ? { kind: "suppliers", limit: 200 } : null);
  const suppliers = supplierReport.data?.rows ?? [];
  const [form, setForm] = useState({ supplierId: "", documentNumber: "", concept: "", reason: "", evidence: "", issuedAt: payablesToday(), dueAt: payablesToday(), currency: "VES", principal: "" });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const adjustment = kind === "positive" || kind === "negative";

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!scope) return;
    setSaving(true);
    try {
      const base = { documentId: newPayablesId(), supplierId: form.supplierId, documentNumber: form.documentNumber.trim(), concept: form.concept.trim(), issuedAt: form.issuedAt, currency: form.currency, principal: form.principal.trim() };
      if (adjustment) await executePayablesCommand(scope, { kind: "create_adjustment", ...base, direction: kind, reason: form.reason.trim(), ...(kind === "positive" ? { dueAt: form.dueAt } : {}) });
      else if (kind === "import_opening_document") await executePayablesCommand(scope, { kind, ...base, dueAt: form.dueAt, evidence: form.evidence.trim() });
      else await executePayablesCommand(scope, { kind, ...base, dueAt: form.dueAt });
      notify.success("Documento registrado.");
      setForm((current) => ({ ...current, documentNumber: "", concept: "", reason: "", evidence: "", principal: "" }));
      onCreated();
      onClose();
    } catch (cause: unknown) {
      notify.failure(cause, "No se pudo registrar el documento.");
    } finally { setSaving(false); }
  }

  return <ResponsiveDrawer isOpen={isOpen} onClose={onClose} title="Nuevo documento de CxP" subtitle="La tasa BCV se toma en el servidor según la fecha de emisión." footer={<div className="flex justify-end gap-2 p-4"><button type="button" className="rounded-lg border border-border-light px-3 py-2 text-sm" onClick={onClose}>Cancelar</button><button form="payables-create" type="submit" disabled={saving} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Guardando…" : "Registrar"}</button></div>}>
    <form id="payables-create" onSubmit={(event) => void submit(event)} className="grid gap-4 p-5 text-sm">
      <fieldset className="grid gap-2"><legend className="mb-1 font-medium">Tipo</legend>
        {KIND_OPTIONS.map(([value, label, help]) => <label key={value} className="flex items-start gap-2"><input type="radio" name="kind" checked={kind === value} onChange={() => setKind(value)} className="mt-1" /><span><span className="font-medium">{label}</span><span className="block text-xs text-[var(--text-secondary)]">{help}</span></span></label>)}
      </fieldset>
      <label className="grid gap-1">Proveedor<select required value={form.supplierId} onChange={(event) => set("supplierId")(event.target.value)} className={CONTROL}><option value="">Selecciona un proveedor</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.rif}</option>)}</select></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1">Número{kind === "import_opening_document" ? "" : " (opcional)"}<input required={kind === "import_opening_document"} value={form.documentNumber} onChange={(event) => set("documentNumber")(event.target.value)} className={CONTROL} /></label>
        <label className="grid gap-1">Moneda<select value={form.currency} onChange={(event) => set("currency")(event.target.value)} className={CONTROL}><option value="VES">VES</option><option value="USD">USD</option><option value="EUR">EUR</option></select></label>
        <label className="grid gap-1">Emisión<input required type="date" value={form.issuedAt} onChange={(event) => set("issuedAt")(event.target.value)} className={CONTROL} /></label>
        {kind !== "negative" && <label className="grid gap-1">Vencimiento<input required type="date" min={form.issuedAt} value={form.dueAt} onChange={(event) => set("dueAt")(event.target.value)} className={CONTROL} /></label>}
        <label className="grid gap-1">Importe<input required inputMode="decimal" pattern="\d+(\.\d{1,2})?" placeholder="0.00" value={form.principal} onChange={(event) => set("principal")(event.target.value)} className={CONTROL} /></label>
      </div>
      <label className="grid gap-1">Concepto<input required value={form.concept} onChange={(event) => set("concept")(event.target.value)} className={CONTROL} /></label>
      {adjustment && <label className="grid gap-1">Motivo<textarea required value={form.reason} onChange={(event) => set("reason")(event.target.value)} className={CONTROL} /></label>}
      {kind === "import_opening_document" && <label className="grid gap-1">Evidencia<input required placeholder="Ej.: estado de cuenta del proveedor al 30/09" value={form.evidence} onChange={(event) => set("evidence")(event.target.value)} className={CONTROL} /></label>}
      <p className="text-xs text-[var(--text-secondary)]">Usa punto como separador decimal. Para USD o EUR se requiere una tasa BCV publicada para la fecha de emisión.</p>
    </form>
  </ResponsiveDrawer>;
}
