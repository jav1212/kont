"use client";

import { useState } from "react";
import { notify } from "@/src/shared/frontend/notify";
import { executePayablesCommand } from "./payables-client";
import { usePayablesReport, usePayablesScope } from "./use-payables-report";

interface Policy { readonly separationRequired: boolean; readonly negativeAdjustmentThresholdVes: string | null; readonly vatWithholdingAgent: boolean; readonly islrWithholdingAgent: boolean; readonly version: number }

/** Edits the company payables policy: withholding agent status (decision 6) and D8 controls.
 * @returns A form bound to the current versioned policy.
 */
export function PayablesPolicyPanel(): React.JSX.Element {
  const scope = usePayablesScope();
  const [revision, setRevision] = useState(0);
  const report = usePayablesReport<Policy>({ kind: "policy" }, revision);
  const policy = report.data?.rows[0];
  return <section aria-label="Política de cuentas por pagar" className="rounded-xl border border-border-light bg-surface-1 p-4">
    <h2 className="font-semibold">Política de la empresa</h2>
    {!policy || !scope ? <p className="mt-2 text-sm" role="status">Cargando…</p> : <PolicyForm key={policy.version} policy={policy} onSave={async (next) => {
      try {
        await executePayablesCommand(scope, { kind: "configure_policy", expectedVersion: policy.version, ...next });
        notify.success("Política actualizada.");
        setRevision((value) => value + 1);
      } catch (cause: unknown) { notify.error(cause instanceof Error ? cause.message : "No se pudo guardar la política."); }
    }} />}
  </section>;
}

function PolicyForm({ policy, onSave }: { readonly policy: Policy; readonly onSave: (next: Omit<Policy, "version">) => Promise<void> }): React.JSX.Element {
  const [form, setForm] = useState({ ...policy, negativeAdjustmentThresholdVes: policy.negativeAdjustmentThresholdVes ?? "" });
  const [saving, setSaving] = useState(false);
  const threshold = form.negativeAdjustmentThresholdVes.trim();
  return <form className="mt-3 grid gap-3 text-sm sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); setSaving(true); void onSave({ separationRequired: form.separationRequired, vatWithholdingAgent: form.vatWithholdingAgent, islrWithholdingAgent: form.islrWithholdingAgent, negativeAdjustmentThresholdVes: threshold === "" ? null : threshold }).finally(() => setSaving(false)); }}>
    <label className="flex items-center gap-2"><input type="checkbox" checked={form.vatWithholdingAgent} onChange={(event) => setForm({ ...form, vatWithholdingAgent: event.target.checked })} />Agente de retención de IVA</label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={form.islrWithholdingAgent} onChange={(event) => setForm({ ...form, islrWithholdingAgent: event.target.checked })} />Agente de retención de ISLR</label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={form.separationRequired} onChange={(event) => setForm({ ...form, separationRequired: event.target.checked })} />Quien prepara un lote no puede autorizarlo</label>
    <label className="grid gap-1">Ajustes negativos mayores a (Bs) requieren aprobación<input inputMode="decimal" pattern="\d+(\.\d{1,2})?" placeholder="Sin umbral" value={form.negativeAdjustmentThresholdVes} onChange={(event) => setForm({ ...form, negativeAdjustmentThresholdVes: event.target.value })} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label>
    <div className="sm:col-span-2"><button type="submit" disabled={saving} className="rounded-lg bg-primary px-3 py-2 font-medium text-white disabled:opacity-60">{saving ? "Guardando…" : "Guardar política"}</button></div>
  </form>;
}
