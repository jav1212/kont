"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";
import { ApiRequestFailure } from "@/src/shared/frontend/feedback/api-request-failure";

interface InvoiceSeries { readonly id: string; readonly code: string; readonly prefix: string | null; readonly nextNumber: number; readonly maximumNumber: number }

/** Manages sales invoice numbering series from company settings.
 * @returns A company scoped series list and creation form.
 */
export function InvoiceSeriesSettings(): React.JSX.Element {
  const { companyId } = useCompany();
  const { can } = useOrganizationModuleAccess("/settings/company");
  const [series, setSeries] = useState<readonly InvoiceSeries[]>([]);
  const [draft, setDraft] = useState({ code: "", prefix: "", nextNumber: "1", maximumNumber: "99999999" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canUpdate = can("companies.update");

  const load = useCallback(async (): Promise<void> => {
    if (!companyId) { setSeries([]); return; }
    try {
      const response = await apiFetch(`/api/companies/document-series?companyId=${encodeURIComponent(companyId)}`, { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new ApiRequestFailure(response, apiError(body, "No fue posible cargar las series."));
      const data = object(body).data;
      setSeries(Array.isArray(data) ? data as InvoiceSeries[] : []);
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible cargar las series."); }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!companyId || !canUpdate) return;
    setSaving(true); setError(null);
    try {
      const response = await apiFetch("/api/companies/document-series", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ operation: "create", companyId, documentType: "sales_invoice", code: draft.code.trim(), prefix: draft.prefix.trim() || null, nextNumber: Number(draft.nextNumber), maximumNumber: Number(draft.maximumNumber) }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new ApiRequestFailure(response, apiError(body, "No fue posible crear la serie."));
      setDraft({ code: "", prefix: "", nextNumber: "1", maximumNumber: "99999999" });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible crear la serie."); }
    finally { setSaving(false); }
  }

  return <SettingsSection title="Series para facturas de venta" subtitle="Los correlativos se configuran para la empresa y se reservan al emitir el documento.">
    {error && <p role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}
    {series.length > 0 ? <div className="mb-4 overflow-x-auto rounded-lg border border-border-light"><table className="w-full text-left text-sm"><thead className="bg-surface-2 text-xs uppercase text-[var(--text-tertiary)]"><tr><th className="px-3 py-2">Código</th><th className="px-3 py-2">Prefijo</th><th className="px-3 py-2">Próximo número</th><th className="px-3 py-2">Límite</th></tr></thead><tbody>{series.map((item) => <tr key={item.id} className="border-t border-border-light"><td className="px-3 py-2">{item.code}</td><td className="px-3 py-2">{item.prefix || "—"}</td><td className="px-3 py-2">{item.nextNumber}</td><td className="px-3 py-2">{item.maximumNumber}</td></tr>)}</tbody></table></div> : <p className="mb-4 text-sm text-[var(--text-tertiary)]">No hay series de factura configuradas.</p>}
    {canUpdate && <form onSubmit={(event) => void create(event)} className="grid gap-3 md:grid-cols-5">
      <BaseInput.Field label="Código" isRequired maxLength={32} value={draft.code} onValueChange={(code) => setDraft({ ...draft, code })} />
      <BaseInput.Field label="Prefijo (opcional)" maxLength={32} value={draft.prefix} onValueChange={(prefix) => setDraft({ ...draft, prefix })} />
      <BaseInput.Field label="Próximo número" isRequired type="number" min="1" max="99999999" inputClassName="text-right" value={draft.nextNumber} onValueChange={(nextNumber) => setDraft({ ...draft, nextNumber })} />
      <BaseInput.Field label="Número máximo" isRequired type="number" min="1" max="99999999" inputClassName="text-right" value={draft.maximumNumber} onValueChange={(maximumNumber) => setDraft({ ...draft, maximumNumber })} />
      <div className="flex items-end"><BaseButton.Root type="submit" variant="primary" fullWidth loading={saving} isDisabled={!companyId}>Crear serie</BaseButton.Root></div>
    </form>}
  </SettingsSection>;
}

function object(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function apiError(value: unknown, fallback: string): string { const error = object(value).error; return typeof error === "string" ? error : fallback; }
