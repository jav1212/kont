"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { useTreasuryContext } from "@/src/modules/treasury/frontend/context/treasury-context";
import { useTreasuryCommand } from "@/src/modules/treasury/frontend/hooks/use-treasury-command";
import type { TreasuryQueryRequest, TreasuryReadRow } from "@kontave/client-contracts";
import type { TreasuryBankDebitTaxAssessmentRow, TreasuryBankDebitTaxPolicyRow } from "@/src/modules/treasury/frontend/treasury-rows";

type PageData<T> = { items: T[]; total: number };
type TaxPolicy = TreasuryBankDebitTaxPolicyRow;
type TaxAssessment = TreasuryBankDebitTaxAssessmentRow;

/** Manages company-approved tax rules and auditable operation exclusions.
 * @returns The Treasury bank-debit tax workspace.
 */
export default function TreasuryTaxPolicyPage(): React.JSX.Element {
  const { companyId, query: treasuryQuery, revision } = useTreasuryContext();
  const { can } = useOrganizationModuleAccess("/treasury");
  const runCommand = useTreasuryCommand();
  const [policies, setPolicies] = useState<TaxPolicy[]>([]);
  const [assessments, setAssessments] = useState<TaxAssessment[]>([]);
  const [policyId, setPolicyId] = useState("");
  const [expectedVersion, setExpectedVersion] = useState(0);
  const [effectiveFrom, setEffectiveFrom] = useState(() => todayCaracas());
  const [effectiveTo, setEffectiveTo] = useState("");
  const [ratePercent, setRatePercent] = useState("");
  const [legalBasis, setLegalBasis] = useState("");
  const [approvalReference, setApprovalReference] = useState("");
  const [subjectTypes, setSubjectTypes] = useState<string[]>(["bank_debit", "check_issue"]);
  const [exclusion, setExclusion] = useState<TaxAssessment | null>(null);
  const [reason, setReason] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId || !can("treasury.read")) return;
    setLoading(true); setError(null);
    try {
      const queryPage = async <T extends TreasuryReadRow,>(kind: string): Promise<PageData<T>> => {
        const page = await treasuryQuery<T>({ kind, page: 1, pageSize: 500 } as TreasuryQueryRequest);
        return { items: [...page.items], total: page.total };
      };
      const [policyPage, assessmentPage] = await Promise.all([queryPage<TaxPolicy>("list_bank_debit_tax_policies"), queryPage<TaxAssessment>("list_bank_debit_tax_assessments")]);
      setPolicies(policyPage.items); setAssessments(assessmentPage.items);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cargar Tesorería."); }
    finally { setLoading(false); }
  }, [can, companyId, treasuryQuery]);

  useEffect(() => { void load(); }, [load, revision]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!can("treasury.tax.configure") || !policyId || !legalBasis.trim() || !approvalReference.trim() || subjectTypes.length === 0) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      await runCommand.execute((identity) => ({ ...identity, kind: "configure_bank_debit_tax_policy", policyId, expectedVersion, effectiveFrom, ...(effectiveTo ? { effectiveTo } : {}), ratePercent, baseCurrency: "VES", rounding: "half_up", legalBasis: legalBasis.trim(), approvalReference: approvalReference.trim(), subjectTypes }), `policy:${policyId}`);
      setNotice("La política aprobada quedó registrada. Las nuevas operaciones usarán la vigencia configurada.");
      setExpectedVersion(expectedVersion + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar la política."); }
    finally { setSaving(false); }
  };

  const editPolicy = (policy: TaxPolicy) => {
    setPolicyId(policy.id); setExpectedVersion(policy.version); setEffectiveFrom(policy.effectiveFrom); setEffectiveTo(policy.effectiveTo ?? ""); setRatePercent(policy.ratePercent); setLegalBasis(policy.legalBasis); setApprovalReference(policy.approvalReference); setSubjectTypes([...policy.subjectTypes]); setNotice(null);
  };

  const submitExclusion = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!exclusion || !can("treasury.tax.configure") || !reason.trim() || !evidenceReference.trim()) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      await runCommand.execute((identity, exclusionId) => ({ ...identity, kind: "exclude_bank_debit_tax_operation", exclusionId, ledgerEntryId: exclusion.ledgerEntryId, reason: reason.trim(), evidenceReference: evidenceReference.trim(), expectedEntryVersion: exclusion.entryVersion }), `exclusion:${exclusion.ledgerEntryId}`);
      setExclusion(null); setReason(""); setEvidenceReference(""); setNotice("La exclusión quedó auditada; se generó la compensación tributaria correspondiente.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo registrar la exclusión."); }
    finally { setSaving(false); }
  };

  return <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <PageHeader title="Política de impuesto al débito bancario" subtitle="Configura vigencias con fundamento y referencia de aprobación; consulta cálculos y registra exclusiones con evidencia." />
    {error && <p className="rounded-lg border border-danger-300 bg-danger-50 p-3 text-sm text-danger-700" role="alert">{error}</p>}
    {notice && <p className="rounded-lg border border-success-300 bg-success-50 p-3 text-sm text-success-700" role="status">{notice}</p>}
    {!can("treasury.tax.configure") && <p className="rounded-lg border border-warning-300 bg-warning-50 p-3 text-sm">Necesitas el permiso de configuración tributaria para cambiar reglas o excluir operaciones.</p>}
    <section className="space-y-4 rounded-xl border border-default-200 bg-content1 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Vigencias y aprobaciones</h2><p className="text-sm text-default-500">Cada nueva versión conserva el historial. Registra solo tasas aprobadas por la empresa.</p></div><button type="button" onClick={() => { const current = policies.filter(policy => policy.active).sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0]; if (current) editPolicy(current); else { setPolicyId(crypto.randomUUID()); setExpectedVersion(0); setEffectiveFrom(todayCaracas()); setEffectiveTo(""); setRatePercent(""); setLegalBasis(""); setApprovalReference(""); setSubjectTypes(["bank_debit", "check_issue"]); } }} className="rounded-lg border border-default-300 px-3 py-2 text-sm">{policies.some(policy => policy.active) ? "Nueva versión" : "Nueva política"}</button></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-default-100"><tr><th className="p-2">Vigencia</th><th className="p-2">Tasa</th><th className="p-2">Operaciones</th><th className="p-2">Aprobación</th><th className="p-2">Estado</th><th className="p-2">Versión</th><th className="p-2">Acción</th></tr></thead><tbody>{policies.map(policy => <tr key={`${policy.id}:${policy.version}`} className="border-t border-default-100"><td className="p-2">{policy.effectiveFrom} – {policy.effectiveTo ?? "sin cierre"}</td><td className="p-2">{policy.ratePercent}% {policy.baseCurrency}</td><td className="p-2">{policy.subjectTypes.join(", ")}</td><td className="p-2">{policy.approvalReference}<br /><span className="text-xs text-default-500">{policy.legalBasis}</span></td><td className="p-2">{policy.active ? "Activa" : "Histórica"}</td><td className="p-2">{policy.version}</td><td className="p-2"><button type="button" onClick={() => editPolicy(policy)} className="text-primary underline">Nueva versión</button></td></tr>)}{policies.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-default-500">{loading ? "Cargando…" : "No hay políticas registradas."}</td></tr>}</tbody></table></div>
      {policyId && <form onSubmit={submit} className="grid gap-3 border-t border-default-200 pt-4 sm:grid-cols-2 lg:grid-cols-4"><label className="grid gap-1 text-sm">Vigente desde<input type="date" required value={effectiveFrom} onChange={event => setEffectiveFrom(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Vigente hasta (opcional)<input type="date" value={effectiveTo} onChange={event => setEffectiveTo(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Tasa aprobada (%)<input type="number" min="0" step="0.00000001" required value={ratePercent} onChange={event => setRatePercent(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><fieldset className="grid gap-1 text-sm"><legend>Operaciones gravadas</legend>{[["bank_debit", "Débitos bancarios"], ["check_issue", "Emisión de cheques"]].map(([value, label]) => <label key={value} className="flex items-center gap-2"><input type="checkbox" checked={subjectTypes.includes(value)} onChange={event => setSubjectTypes(current => event.target.checked ? [...current, value] : current.filter(item => item !== value))} />{label}</label>)}</fieldset><label className="grid gap-1 text-sm sm:col-span-2">Fundamento legal<input required maxLength={240} value={legalBasis} onChange={event => setLegalBasis(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm sm:col-span-2">Referencia de aprobación<input required maxLength={120} value={approvalReference} onChange={event => setApprovalReference(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><button type="submit" disabled={saving || !can("treasury.tax.configure") || !subjectTypes.length} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Guardando…" : expectedVersion ? "Guardar versión" : "Registrar política"}</button></form>}
    </section>
    <section className="space-y-4 rounded-xl border border-default-200 bg-content1 p-5"><div><h2 className="font-semibold">Operaciones calculadas y exclusiones</h2><p className="text-sm text-default-500">El cálculo se origina al publicar un débito elegible. Una exclusión exige motivo y referencia probatoria, y deja un asiento compensatorio si ya se causó el impuesto.</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-default-100"><tr><th className="p-2">Fecha / operación</th><th className="p-2">Base imponible</th><th className="p-2">Impuesto</th><th className="p-2">Política</th><th className="p-2">Exclusión</th><th className="p-2">Acción</th></tr></thead><tbody>{assessments.map(item => <tr key={item.id} className="border-t border-default-100"><td className="p-2">{item.operationalDate}<br />{item.concept} · {item.movementType}</td><td className="p-2">{item.taxableAmount} {item.currency}</td><td className="p-2">{item.taxAmount} {item.currency} ({item.ratePercent}%)</td><td className="p-2">{item.policyId} · v{item.policyVersion}</td><td className="p-2">{item.exclusionId ? <>{item.exclusionReason}<br /><span className="text-xs">{item.evidenceReference}</span></> : "Sin exclusión"}</td><td className="p-2">{!item.exclusionId && <button type="button" disabled={!can("treasury.tax.configure")} onClick={() => { setExclusion(item); setReason(""); setEvidenceReference(""); }} className="text-primary underline disabled:opacity-50">Excluir con evidencia</button>}</td></tr>)}{assessments.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-default-500">{loading ? "Cargando…" : "No hay débitos tributarios registrados."}</td></tr>}</tbody></table></div></section>
    {exclusion && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><form onSubmit={submitExclusion} className="w-full max-w-lg space-y-3 rounded-xl bg-content1 p-5 shadow-xl"><h2 className="font-semibold">Excluir operación y compensar impuesto</h2><p className="text-sm text-default-500">{exclusion.concept} · {exclusion.taxAmount} {exclusion.currency}. La acción deja historial auditable y no borra el cálculo original.</p><label className="grid gap-1 text-sm">Motivo<input required maxLength={240} value={reason} onChange={event => setReason(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Referencia de evidencia<input required maxLength={240} value={evidenceReference} onChange={event => setEvidenceReference(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setExclusion(null)} className="rounded-lg border border-default-300 px-3 py-2">Cancelar</button><button type="submit" disabled={saving || !can("treasury.tax.configure")} className="rounded-lg bg-danger px-3 py-2 text-white disabled:opacity-50">Confirmar exclusión</button></div></form></div>}
  </main>;
}

function todayCaracas(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
