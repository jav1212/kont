"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { BaseSelect } from "@/src/shared/frontend/components/base-select";
import { ContextLink } from "@/src/shared/frontend/components/context-link";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";
import { notify } from "@/src/shared/frontend/notify";
import { ApiRequestFailure } from "@/src/shared/frontend/feedback/api-request-failure";

type Treatment = "taxed" | "zero_rated" | "exempt" | "exonerated" | "not_subject";
type Category = "general" | "reduced" | "zero_rated" | "luxury_surcharge" | "payment_surcharge" | "other";
type Component = "base" | "luxury" | "payment";
type RateSlot = "a1" | "a2" | "a3" | "a4" | "a5";
type ContributorStatus = "ordinary" | "formal" | "occasional" | "unverified";
type ResidenceStatus = "domestic" | "import_goods" | "foreign_service" | "unverified";
type Periodicity = "monthly" | "fortnightly";
type ConfigurationTab = "rates" | "counterparties" | "company";
interface VatRule { readonly id: string; readonly taxCode: string; readonly jurisdiction: string; readonly treatment: Treatment; readonly rate: string; readonly calculationMode: "tax_exclusive" | "tax_inclusive"; readonly effectiveFrom: string; readonly effectiveTo: string | null; readonly legalBasis: string; readonly version: string; readonly category: Category; readonly legacyRateSlot: RateSlot | null; readonly component: Component; }
interface Catalog { readonly companyId: string; readonly version: number; readonly rules: readonly VatRule[]; }
interface CounterpartyProfile { readonly companyId: string; readonly counterpartyId: string; readonly contributorStatus: ContributorStatus; readonly residenceStatus: ResidenceStatus; readonly effectiveFrom: string; readonly effectiveTo: string | null; readonly legalBasis: string; readonly evidenceReference: string; readonly version: number; }
interface RuleDraft { taxCode: string; jurisdiction: string; treatment: Treatment; rate: string; calculationMode: "tax_exclusive" | "tax_inclusive"; effectiveFrom: string; effectiveTo: string; legalBasis: string; version: string; category: Category; legacyRateSlot: RateSlot | ""; component: Component; }
interface CounterpartyOption { readonly id: string; readonly name: string; readonly taxIdentifier: string | null; readonly kind: "proveedor" | "cliente"; }
interface PeriodicityChange { readonly from: Periodicity | null; readonly to: Periodicity; readonly actorId: string; readonly reason: string | null; readonly occurredAt: string; }
interface PeriodicitySetting { readonly periodicity: Periodicity | null; readonly persistedPeriods: number; readonly changes: readonly PeriodicityChange[]; }
interface ProductAssignmentSummary { readonly on: string; readonly activeProducts: number; readonly unassigned: number; readonly legacyMismatch: number; readonly groups: readonly { readonly treatment: Treatment; readonly category: Category | null; readonly products: number }[]; }

const emptyDraft = (): RuleDraft => ({ taxCode: "IVA", jurisdiction: "VE", treatment: "taxed", rate: "", calculationMode: "tax_exclusive", effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: "", legalBasis: "", version: "", category: "general", legacyRateSlot: "", component: "base" });
const TREATMENT_OPTIONS = [{ id: "taxed", name: "Gravado" }, { id: "zero_rated", name: "Tasa cero" }, { id: "exempt", name: "Exento" }, { id: "exonerated", name: "Exonerado" }, { id: "not_subject", name: "No sujeto" }];
const CATEGORY_OPTIONS = [{ id: "general", name: "General" }, { id: "reduced", name: "Reducida" }, { id: "zero_rated", name: "Tasa cero" }, { id: "luxury_surcharge", name: "Recargo suntuario" }, { id: "payment_surcharge", name: "Recargo por pago" }, { id: "other", name: "Otra" }];
const COMPONENT_OPTIONS = [{ id: "base", name: "Base" }, { id: "luxury", name: "Suntuario" }, { id: "payment", name: "Pago" }];
const SLOT_OPTIONS = [{ id: "none", name: "Sin casilla" }, ...(["a1", "a2", "a3", "a4", "a5"] as const).map((slot) => ({ id: slot, name: slot.toUpperCase() }))];
const PRICE_OPTIONS = [{ id: "tax_exclusive", name: "Impuesto excluido" }, { id: "tax_inclusive", name: "Impuesto incluido" }];
const CONTRIBUTOR_OPTIONS = [{ id: "unverified", name: "No verificado" }, { id: "ordinary", name: "Ordinario" }, { id: "formal", name: "Formal" }, { id: "occasional", name: "Ocasional" }];
const RESIDENCE_OPTIONS = [{ id: "unverified", name: "No verificado" }, { id: "domestic", name: "Nacional" }, { id: "import_goods", name: "Importación de bienes" }, { id: "foreign_service", name: "Servicio del exterior" }];
const PERIODICITY_OPTIONS = [{ id: "monthly", name: "Mensual" }, { id: "fortnightly", name: "Quincenal" }];
const TABS: readonly (readonly [ConfigurationTab, string])[] = [["rates", "Alícuotas"], ["counterparties", "Contrapartes"], ["company", "Empresa"]];

/** Presents and edits the selected company's versioned IVA rules without selecting statutory rates for the operator.
 * @returns Company fiscal-rule administration, counterparty profiles, and the audited VAT periodicity.
 */
export default function IvaConfigurationPage(): React.JSX.Element {
  const { companyId } = useCompany();
  const [activeTab, setActiveTab] = useState<ConfigurationTab>("rates");
  const { can } = useOrganizationModuleAccess("/settings/iva");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft);
  const [rules, setRules] = useState<VatRule[]>([]);
  const [historicalVersion, setHistoricalVersion] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ readonly fingerprint: string; readonly key: string } | null>(null);
  const profilePending = useRef<{ readonly fingerprint: string; readonly key: string } | null>(null);
  const periodicityPending = useRef<{ readonly fingerprint: string; readonly key: string } | null>(null);
  const [counterpartyId, setCounterpartyId] = useState("");
  const [counterpartySearch, setCounterpartySearch] = useState("");
  const [counterparties, setCounterparties] = useState<readonly CounterpartyOption[]>([]);
  const [counterpartiesLoading, setCounterpartiesLoading] = useState(false);
  const [profileDate, setProfileDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [profile, setProfile] = useState<CounterpartyProfile | null>(null);
  const [profileQueryKey, setProfileQueryKey] = useState<string | null>(null);
  const [profileContributorStatus, setProfileContributorStatus] = useState<ContributorStatus>("unverified");
  const [profileResidenceStatus, setProfileResidenceStatus] = useState<ResidenceStatus>("unverified");
  const [profileEffectiveFrom, setProfileEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [profileEffectiveTo, setProfileEffectiveTo] = useState("");
  const [profileLegalBasis, setProfileLegalBasis] = useState("");
  const [profileEvidence, setProfileEvidence] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [periodicity, setPeriodicity] = useState<PeriodicitySetting | null>(null);
  const [periodicityCompany, setPeriodicityCompany] = useState<string | null>(null);
  const [periodicityTarget, setPeriodicityTarget] = useState<Periodicity | "">("");
  const [periodicityReason, setPeriodicityReason] = useState("");
  const [periodicitySaving, setPeriodicitySaving] = useState(false);
  const [periodicityError, setPeriodicityError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<ProductAssignmentSummary | null>(null);
  const [assignmentsCompany, setAssignmentsCompany] = useState<string | null>(null);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const canUpdate = can("companies.update");
  const catalogIsCurrent = Boolean(companyId && catalog?.companyId === companyId);
  const profileQueryIsCurrent = profileQueryKey === `${companyId ?? ""}::${counterpartyId.trim()}::${profileDate}`;
  const periodicityIsCurrent = Boolean(companyId && periodicityCompany === companyId && periodicity);
  const assignmentsAreCurrent = Boolean(companyId && assignmentsCompany === companyId && assignments);

  const load = useCallback(async (revision?: number): Promise<void> => {
    if (!companyId) { setCatalog(null); setRules([]); setCurrentVersion(null); return; }
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ companyId });
      if (revision !== undefined) params.set("version", String(revision));
      const response = await apiFetch(`/api/fiscal/iva/configuration?${params}`, { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new ApiRequestFailure(response, message(payload, "No fue posible cargar el catálogo fiscal."));
      const next = object(object(payload).data) as unknown as Catalog;
      setCatalog(next); setRules([...next.rules]);
      if (revision === undefined) { setHistoricalVersion(""); setCurrentVersion(next.version); }
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "No fue posible consultar la configuración fiscal.";
      setCatalog(null); setRules([]); setError(text);
    } finally { setLoading(false); }
  }, [companyId]);

  const loadPeriodicity = useCallback(async (): Promise<void> => {
    if (!companyId) { setPeriodicity(null); setPeriodicityCompany(null); return; }
    setPeriodicityError(null);
    try {
      const response = await apiFetch(`/api/fiscal/iva/periodicity?${new URLSearchParams({ companyId })}`, { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new ApiRequestFailure(response, message(payload, "No fue posible consultar la periodicidad IVA."));
      const next = object(object(payload).data) as unknown as PeriodicitySetting;
      setPeriodicity(next); setPeriodicityCompany(companyId); setPeriodicityTarget(next.periodicity ?? ""); setPeriodicityReason("");
    } catch (cause) {
      setPeriodicity(null); setPeriodicityCompany(null);
      setPeriodicityError(cause instanceof Error ? cause.message : "No fue posible consultar la periodicidad IVA.");
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadPeriodicity(); }, [loadPeriodicity]);

  useEffect(() => {
    let active = true;
    if (!companyId) { setAssignments(null); setAssignmentsCompany(null); return () => { active = false; }; }
    setAssignmentsError(null);
    void apiFetch(`/api/fiscal/iva/product-tax-assignments?${new URLSearchParams({ companyId })}`, { cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new ApiRequestFailure(response, message(payload, "No fue posible consultar las alícuotas por producto."));
        if (active) { setAssignments(object(object(payload).data) as unknown as ProductAssignmentSummary); setAssignmentsCompany(companyId); }
      })
      .catch((cause: unknown) => { if (active) { setAssignments(null); setAssignmentsCompany(null); setAssignmentsError(cause instanceof Error ? cause.message : "No fue posible consultar las alícuotas por producto."); } });
    return () => { active = false; };
  }, [companyId]);

  useEffect(() => {
    let active = true;
    if (!companyId) { setCounterparties([]); return () => { active = false; }; }
    setCounterpartiesLoading(true);
    void Promise.all(["/api/purchases/suppliers", "/api/sales/customers"].map(async (endpoint) => {
      const response = await apiFetch(`${endpoint}?companyId=${encodeURIComponent(companyId)}`, { cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok) throw new ApiRequestFailure(response, message(payload, "No fue posible cargar las contrapartes."));
      const rows = object(payload).data;
      if (!Array.isArray(rows)) return [];
      return rows.flatMap((row): CounterpartyOption[] => {
        const item = object(row); if (typeof item.id !== "string") return [];
        const name = [item.name, item.razonSocial, item.nombre].find((value): value is string => typeof value === "string") ?? item.id;
        const taxIdentifier = [item.rif, item.taxIdentifier, item.taxId].find((value): value is string => typeof value === "string") ?? null;
        return [{ id: item.id, name, taxIdentifier, kind: endpoint.includes("suppliers") ? "proveedor" : "cliente" }];
      });
    })).then((lists) => { if (active) setCounterparties(lists.flat()); })
      .catch((cause: unknown) => { if (active) setProfileError(cause instanceof Error ? cause.message : "No fue posible cargar las contrapartes."); })
      .finally(() => { if (active) setCounterpartiesLoading(false); });
    return () => { active = false; };
  }, [companyId]);

  const isHistorical = historicalVersion !== "";
  const groups = useMemo(() => groupRules(rules), [rules]);
  const versionOptions = useMemo(() => currentVersion === null ? [] : [{ id: "current", name: `Versión actual (${currentVersion})` }, ...Array.from({ length: currentVersion }, (_, index) => currentVersion - index - 1).filter((value) => value >= 1).map((value) => ({ id: String(value), name: `Versión ${value}` }))], [currentVersion]);
  const counterpartyOptions = useMemo(() => {
    const needle = counterpartySearch.toLocaleLowerCase("es-VE");
    return counterparties.filter((item) => !needle || `${item.name} ${item.taxIdentifier ?? ""}`.toLocaleLowerCase("es-VE").includes(needle))
      .map((item) => ({ id: item.id, name: `${item.name} · ${item.taxIdentifier ?? "Sin RIF"}`, subtitle: item.kind }));
  }, [counterparties, counterpartySearch]);

  function addRule(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setRules((current) => [...current, { ...draft, id: crypto.randomUUID(), effectiveTo: draft.effectiveTo || null, legacyRateSlot: draft.legacyRateSlot || null }]);
    setDraft(emptyDraft());
  }

  function selectVersion(value: string): void {
    const historical = value && value !== "current" ? value : "";
    setHistoricalVersion(historical);
    void load(historical ? Number(historical) : undefined);
  }

  async function save(): Promise<void> {
    if (!companyId || !catalog || catalog.companyId !== companyId || !canUpdate || isHistorical) return;
    setSaving(true); setError(null);
    const body = JSON.stringify({ companyId, expectedVersion: catalog.version, rules });
    if (pending.current?.fingerprint !== body) pending.current = { fingerprint: body, key: crypto.randomUUID() };
    try {
      const response = await apiFetch("/api/fiscal/iva/configuration", { method: "PUT", headers: { "Content-Type": "application/json", "Idempotency-Key": pending.current.key }, body });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new ApiRequestFailure(response, message(payload, "No fue posible guardar las reglas."));
      pending.current = null;
      notify.success("Nueva versión del catálogo IVA guardada.");
      await load();
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "No fue posible guardar el catálogo IVA.";
      setError(text); notify.failure(cause, "No fue posible guardar el catálogo IVA.");
    } finally { setSaving(false); }
  }

  function resetProfileForm(effectiveFrom: string): void {
    setProfile(null); setProfileQueryKey(null); setProfileContributorStatus("unverified"); setProfileResidenceStatus("unverified");
    setProfileEffectiveFrom(effectiveFrom); setProfileEffectiveTo(""); setProfileLegalBasis(""); setProfileEvidence(""); profilePending.current = null;
  }

  async function loadCounterpartyProfile(): Promise<void> {
    if (!companyId || !counterpartyId.trim() || !profileDate) return;
    setProfileLoading(true); setProfileError(null);
    try {
      const params = new URLSearchParams({ companyId, counterpartyId: counterpartyId.trim(), effectiveDate: profileDate });
      const response = await apiFetch(`/api/fiscal/iva/counterparty-profile?${params}`, { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new ApiRequestFailure(response, message(payload, "No fue posible consultar el perfil fiscal."));
      const value = object(payload).data as CounterpartyProfile | null;
      setProfile(value);
      setProfileQueryKey(`${companyId}::${counterpartyId.trim()}::${profileDate}`);
      setProfileContributorStatus(value?.contributorStatus ?? "unverified");
      setProfileResidenceStatus(value?.residenceStatus ?? "unverified");
      setProfileEffectiveFrom(value?.effectiveFrom ?? profileDate);
      setProfileEffectiveTo(value?.effectiveTo ?? "");
      setProfileLegalBasis(value?.legalBasis ?? "");
      setProfileEvidence(value?.evidenceReference ?? "");
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : "No fue posible consultar el perfil fiscal.");
      setProfile(null); setProfileQueryKey(null);
    } finally { setProfileLoading(false); }
  }

  async function saveCounterpartyProfile(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!companyId || !canUpdate || !counterpartyId.trim() || !profileQueryIsCurrent) return;
    setProfileSaving(true); setProfileError(null);
    const expectedVersion = profile?.effectiveFrom === profileEffectiveFrom ? profile.version : 0;
    const body = JSON.stringify({ companyId, counterpartyId: counterpartyId.trim(), contributorStatus: profileContributorStatus, residenceStatus: profileResidenceStatus, effectiveFrom: profileEffectiveFrom, effectiveTo: profileEffectiveTo || null, legalBasis: profileLegalBasis, evidenceReference: profileEvidence, expectedVersion });
    if (profilePending.current?.fingerprint !== body) profilePending.current = { fingerprint: body, key: crypto.randomUUID() };
    try {
      const response = await apiFetch("/api/fiscal/iva/counterparty-profile", { method: "PUT", headers: { "Content-Type": "application/json", "Idempotency-Key": profilePending.current.key }, body });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new ApiRequestFailure(response, message(payload, "No fue posible guardar el perfil fiscal."));
      profilePending.current = null;
      setProfile(object(object(payload).data) as unknown as CounterpartyProfile);
      notify.success("Perfil fiscal de contraparte guardado.");
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "No fue posible guardar el perfil fiscal.";
      setProfileError(text); notify.failure(cause, "No fue posible guardar el perfil fiscal.");
    } finally { setProfileSaving(false); }
  }

  async function savePeriodicity(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!companyId || !canUpdate || !periodicityIsCurrent || !periodicity || !periodicityTarget) return;
    setPeriodicitySaving(true); setPeriodicityError(null);
    const body = JSON.stringify({ companyId, periodicity: periodicityTarget, expectedPeriodicity: periodicity.periodicity, reason: periodicityReason.trim() || null });
    if (periodicityPending.current?.fingerprint !== body) periodicityPending.current = { fingerprint: body, key: crypto.randomUUID() };
    try {
      const response = await apiFetch("/api/fiscal/iva/periodicity", { method: "PUT", headers: { "Content-Type": "application/json", "Idempotency-Key": periodicityPending.current.key }, body });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new ApiRequestFailure(response, message(payload, "No fue posible guardar la periodicidad IVA."));
      periodicityPending.current = null;
      notify.success("Periodicidad IVA guardada.");
      await loadPeriodicity();
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "No fue posible guardar la periodicidad IVA.";
      setPeriodicityError(text); notify.failure(cause, "No fue posible guardar la periodicidad IVA.");
    } finally { setPeriodicitySaving(false); }
  }

  const periodicityLocked = Boolean(periodicity?.periodicity && periodicity.persistedPeriods > 0);
  const periodicityNeedsReason = Boolean(periodicity?.periodicity);
  const periodicityUnchanged = !periodicityTarget || periodicityTarget === periodicity?.periodicity;

  return <div className="space-y-6 pb-10">
    <PageHeader title="Configuración de IVA" subtitle="Reglas fiscales versionadas por empresa y vigencia. Las tasas deben configurarse con su soporte legal y nunca se completan automáticamente." />
    <nav aria-label="Secciones de configuración IVA" className="flex flex-wrap gap-2 border-b border-border-light pb-3">
      {TABS.map(([key, label]) => <BaseButton.Root key={key} size="sm" variant={activeTab === key ? "primary" : "secondary"} aria-current={activeTab === key ? "page" : undefined} onPress={() => setActiveTab(key)}>{label}</BaseButton.Root>)}
    </nav>

    <div hidden={activeTab !== "rates"} className="space-y-6">
      <SettingsSection title="Catálogo de la empresa" subtitle={catalogIsCurrent && catalog ? `Versión ${catalog.version} · ${catalog.rules.length} reglas · ${companyId ?? "sin empresa"}` : "La configuración depende del catálogo fiscal disponible para la empresa seleccionada."}>
        {error && <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}
        {versionOptions.length > 1 && <div className="mb-5 max-w-xs"><BaseSelect label="Versión del catálogo" selectionMode="single" items={versionOptions} value={historicalVersion || "current"} onValueChange={selectVersion} isDisabled={loading} /></div>}
        {catalogIsCurrent && isHistorical && <p className="mb-4 text-xs text-[var(--text-tertiary)]">Vista histórica, solo lectura.</p>}
        {!catalogIsCurrent && !error && <p className="text-sm text-[var(--text-tertiary)]">Selecciona una empresa para consultar su catálogo.</p>}
        {catalogIsCurrent && catalog && rules.length === 0 && <p className="rounded-lg bg-surface-2 px-4 py-3 text-sm text-[var(--text-tertiary)]">Esta versión no contiene reglas. Agrega únicamente reglas con soporte fiscal validado.</p>}
        {catalogIsCurrent && catalog && rules.length > 0 && <div className="overflow-x-auto rounded-lg border border-border-light">
          <table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-surface-2 text-xs uppercase text-[var(--text-tertiary)]"><tr><th className="px-3 py-2">Código / categoría</th><th className="px-3 py-2">Tratamiento</th><th className="px-3 py-2">Tasa</th><th className="px-3 py-2">Componente</th><th className="px-3 py-2">Vigencia</th><th className="px-3 py-2">Fundamento</th>{canUpdate && !isHistorical && <th className="px-3 py-2">Acción</th>}</tr></thead>
            <tbody>{rules.map((rule, index) => <tr key={rule.id} className="border-t border-border-light"><td className="px-3 py-3 font-medium">{rule.taxCode} · {categoryLabel(rule.category)}{rule.legacyRateSlot ? ` · ${rule.legacyRateSlot.toUpperCase()}` : ""}</td><td className="px-3 py-3">{treatmentLabel(rule.treatment)}</td><td className="px-3 py-3">{rule.rate}% · {rule.calculationMode === "tax_inclusive" ? "incluido" : "excluido"}</td><td className="px-3 py-3">{componentLabel(rule.component)}</td><td className="px-3 py-3">{rule.effectiveFrom} – {rule.effectiveTo ?? "sin cierre"}</td><td className="max-w-56 truncate px-3 py-3" title={rule.legalBasis}>{rule.legalBasis}</td>{canUpdate && !isHistorical && <td className="px-3 py-3"><BaseButton.Root size="sm" variant="dangerOutline" onPress={() => setRules((current) => current.filter((_, row) => row !== index))}>Quitar de próxima versión</BaseButton.Root></td>}</tr>)}</tbody>
          </table>
        </div>}
        {catalogIsCurrent && catalog && canUpdate && !isHistorical && <div className="mt-5 flex justify-end"><BaseButton.Root variant="primary" loading={saving} isDisabled={loading} onPress={() => void save()}>{`Guardar versión ${catalog.version + 1}`}</BaseButton.Root></div>}
      </SettingsSection>

      {catalogIsCurrent && catalog && canUpdate && !isHistorical && <SettingsSection title="Agregar regla" subtitle="Cada regla necesita categoría, componente, período y fundamento explícitos. A1–A5 son referencias heredadas y no fijan una tasa legal.">
        <form onSubmit={addRule} className="grid gap-4 md:grid-cols-3">
          <BaseInput.Field label="Código tributario" isRequired maxLength={64} value={draft.taxCode} onValueChange={(taxCode) => setDraft({ ...draft, taxCode })} />
          <BaseInput.Field label="Jurisdicción" isRequired maxLength={16} value={draft.jurisdiction} onValueChange={(value) => setDraft({ ...draft, jurisdiction: value.toUpperCase() })} />
          <BaseInput.Field label="Tasa" isRequired type="number" min="0" step="0.0001" suffix="%" inputClassName="text-right" value={draft.rate} onValueChange={(rate) => setDraft({ ...draft, rate })} />
          <BaseSelect label="Categoría" selectionMode="single" items={CATEGORY_OPTIONS} value={draft.category} onValueChange={(value) => value && setDraft({ ...draft, category: value as Category })} />
          <BaseSelect label="Tratamiento" selectionMode="single" items={TREATMENT_OPTIONS} value={draft.treatment} onValueChange={(value) => value && setDraft({ ...draft, treatment: value as Treatment })} />
          <BaseSelect label="Componente" selectionMode="single" items={COMPONENT_OPTIONS} value={draft.component} onValueChange={(value) => value && setDraft({ ...draft, component: value as Component })} />
          <BaseSelect label="Casilla Profit Plus (opcional)" selectionMode="single" items={SLOT_OPTIONS} value={draft.legacyRateSlot || "none"} onValueChange={(value) => setDraft({ ...draft, legacyRateSlot: value && value !== "none" ? value as RateSlot : "" })} />
          <BaseSelect label="Precio" selectionMode="single" items={PRICE_OPTIONS} value={draft.calculationMode} onValueChange={(value) => value && setDraft({ ...draft, calculationMode: value as RuleDraft["calculationMode"] })} />
          <BaseInput.Field label="Identificador de versión" isRequired maxLength={128} value={draft.version} onValueChange={(version) => setDraft({ ...draft, version })} />
          <BaseInput.Field label="Vigente desde" isRequired type="date" value={draft.effectiveFrom} onValueChange={(effectiveFrom) => setDraft({ ...draft, effectiveFrom })} />
          <BaseInput.Field label="Vigente hasta (opcional)" type="date" value={draft.effectiveTo} onValueChange={(effectiveTo) => setDraft({ ...draft, effectiveTo })} />
          <BaseInput.Field label="Fundamento legal / soporte" isRequired maxLength={500} value={draft.legalBasis} onValueChange={(legalBasis) => setDraft({ ...draft, legalBasis })} />
          <div className="flex justify-end md:col-span-3"><BaseButton.Root type="submit" variant="secondary">Agregar a la próxima versión</BaseButton.Root></div>
        </form>
        {groups.length > 0 && <p className="mt-3 text-xs text-[var(--text-tertiary)]">El catálogo valida que no haya reglas ambiguas con selectores y vigencias superpuestas antes de persistirlo.</p>}
      </SettingsSection>}

      <SettingsSection title="Alícuotas por producto" subtitle="Productos activos según la asignación IVA vigente hoy. La asignación de cada artículo se edita en su ficha de Inventario.">
        {assignmentsError && <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{assignmentsError}</div>}
        {!assignmentsAreCurrent && !assignmentsError && <p className="text-sm text-[var(--text-tertiary)]">{companyId ? "Consultando asignaciones…" : "Selecciona una empresa para consultar sus productos."}</p>}
        {assignmentsAreCurrent && assignments && <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-border-light">
            <table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-surface-2 text-xs uppercase text-[var(--text-tertiary)]"><tr><th className="px-3 py-2">Tratamiento</th><th className="px-3 py-2">Categoría</th><th className="px-3 py-2 text-right">Productos</th><th className="px-3 py-2">Ver</th></tr></thead>
              <tbody>
                {assignments.groups.map((group) => <tr key={`${group.treatment}:${group.category ?? "none"}`} className="border-t border-border-light"><td className="px-3 py-3 font-medium">{treatmentLabel(group.treatment)}</td><td className="px-3 py-3">{group.category ? categoryLabel(group.category) : "Sin categoría"}</td><td className="px-3 py-3 text-right tabular-nums">{group.products.toLocaleString("es-VE")}</td><td className="px-3 py-3">{productFilter(group.treatment) ? <ContextLink href={`/inventory/products?iva=${productFilter(group.treatment)}`} className="font-semibold text-primary-500 hover:underline">Productos →</ContextLink> : <span className="text-[var(--text-tertiary)]">—</span>}</td></tr>)}
                <tr className="border-t border-border-light"><td className="px-3 py-3 font-medium" colSpan={2}>Sin asignación vigente</td><td className={`px-3 py-3 text-right tabular-nums ${assignments.unassigned > 0 ? "font-semibold text-warning" : ""}`}>{assignments.unassigned.toLocaleString("es-VE")}</td><td className="px-3 py-3"><span className="text-[var(--text-tertiary)]">—</span></td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">{assignments.activeProducts.toLocaleString("es-VE")} productos activos al {assignments.on}. Los productos sin asignación no se clasifican por defecto.</p>
          {assignments.legacyMismatch > 0 && <p role="status" className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm">{assignments.legacyMismatch.toLocaleString("es-VE")} productos tienen en el catálogo un tipo de IVA distinto a su asignación fiscal vigente. Revísalos en su ficha antes de declarar.</p>}
        </div>}
        <ContextLink href="/inventory/products" className="mt-3 inline-flex text-sm font-semibold text-primary-500 hover:underline">Ir a productos de Inventario →</ContextLink>
      </SettingsSection>
    </div>

    <div hidden={activeTab !== "counterparties"}>
      <SettingsSection title="Perfiles fiscales de contrapartes" subtitle="Clasifica proveedores o clientes solo con evidencia verificable. Este perfil conserva estatus y residencia por vigencia; no declara por sí solo que el IVA sea deducible ni determina si una operación constituye importación.">
        {profileError && <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{profileError}</div>}
        <div className="mb-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto_auto] md:items-end">
          <BaseInput.Field label="Buscar proveedor o cliente" placeholder="Nombre o RIF" value={counterpartySearch} onValueChange={setCounterpartySearch} />
          <BaseSelect label={counterpartiesLoading ? "Contraparte · cargando" : "Contraparte"} placeholder="Selecciona una contraparte" selectionMode="single" items={counterpartyOptions} value={counterpartyId} onValueChange={(value) => { setCounterpartyId(value); resetProfileForm(profileDate); setProfileError(null); }} />
          <BaseInput.Field label="Consultar a fecha" type="date" value={profileDate} onValueChange={(value) => { setProfileDate(value); resetProfileForm(value); }} />
          <BaseButton.Root variant="secondary" loading={profileLoading} isDisabled={!companyId || !counterpartyId.trim()} onPress={() => void loadCounterpartyProfile()}>Consultar perfil</BaseButton.Root>
        </div>
        {profile && profileQueryIsCurrent && <p className="mb-4 text-xs text-[var(--text-tertiary)]">Versión {profile.version} · desde {profile.effectiveFrom}</p>}
        {(profile || canUpdate) && <form onSubmit={(event) => void saveCounterpartyProfile(event)} className="grid gap-4 md:grid-cols-3">
          <BaseSelect label="Estatus del contribuyente" selectionMode="single" isDisabled={!canUpdate} items={CONTRIBUTOR_OPTIONS} value={profileContributorStatus} onValueChange={(value) => value && setProfileContributorStatus(value as ContributorStatus)} />
          <BaseSelect label="Residencia / tipo de operación" selectionMode="single" isDisabled={!canUpdate} items={RESIDENCE_OPTIONS} value={profileResidenceStatus} onValueChange={(value) => value && setProfileResidenceStatus(value as ResidenceStatus)} />
          <BaseInput.Field label="Vigente desde" isDisabled={!canUpdate} isRequired type="date" value={profileEffectiveFrom} onValueChange={setProfileEffectiveFrom} />
          <BaseInput.Field label="Vigente hasta (opcional)" isDisabled={!canUpdate} type="date" value={profileEffectiveTo} onValueChange={setProfileEffectiveTo} />
          <BaseInput.Field label="Fundamento de la clasificación" isDisabled={!canUpdate} isRequired maxLength={500} value={profileLegalBasis} onValueChange={setProfileLegalBasis} />
          <BaseInput.Field label="Referencia de evidencia" isDisabled={!canUpdate} isRequired maxLength={500} value={profileEvidence} onValueChange={setProfileEvidence} />
          {canUpdate && <div className="flex justify-end md:col-span-3"><BaseButton.Root type="submit" variant="primary" loading={profileSaving} isDisabled={profileLoading || !counterpartyId.trim() || !profileQueryIsCurrent}>{`Guardar versión ${(profile?.effectiveFrom === profileEffectiveFrom ? profile.version : 0) + 1}`}</BaseButton.Root></div>}
        </form>}
      </SettingsSection>
    </div>

    <div hidden={activeTab !== "company"}>
      <SettingsSection title="Periodicidad IVA" subtitle="Define si la empresa declara IVA por mes o por quincena. Nunca se asume: mientras no se configure, los períodos quedan con el pendiente «Periodicidad no configurada» y no pueden avanzar.">
        {periodicityError && <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{periodicityError}</div>}
        {!periodicityIsCurrent && !periodicityError && <p className="text-sm text-[var(--text-tertiary)]">{companyId ? "Consultando periodicidad…" : "Selecciona una empresa para consultar su periodicidad."}</p>}
        {periodicityIsCurrent && periodicity && <div className="space-y-5">
          <p className="text-sm">Periodicidad actual: <strong>{periodicity.periodicity ? periodicityLabel(periodicity.periodicity) : "No configurada"}</strong>{periodicity.persistedPeriods > 0 && <span className="text-[var(--text-tertiary)]"> · {periodicity.persistedPeriods} períodos registrados</span>}</p>
          {periodicityLocked && <p role="status" className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm">La periodicidad ya no puede cambiarse: existen períodos fiscales registrados con la actual.</p>}
          {canUpdate && !periodicityLocked && <form onSubmit={(event) => void savePeriodicity(event)} className="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] md:items-end">
            <BaseSelect label="Nueva periodicidad" placeholder="Selecciona" selectionMode="single" isRequired items={PERIODICITY_OPTIONS} value={periodicityTarget} onValueChange={(value) => setPeriodicityTarget(value as Periodicity | "")} />
            <BaseInput.Field label={periodicityNeedsReason ? "Motivo del cambio" : "Motivo o soporte (opcional)"} isRequired={periodicityNeedsReason} maxLength={500} value={periodicityReason} onValueChange={setPeriodicityReason} helperText={periodicityNeedsReason ? "Indica la providencia o soporte que justifica el cambio." : undefined} />
            <BaseButton.Root type="submit" variant="primary" loading={periodicitySaving} isDisabled={periodicityUnchanged || (periodicityNeedsReason && !periodicityReason.trim())}>Guardar periodicidad</BaseButton.Root>
          </form>}
          {!canUpdate && <p className="text-sm text-[var(--text-tertiary)]">Solo usuarios con permiso para actualizar la empresa pueden configurar la periodicidad.</p>}
          {periodicity.changes.length > 0 && <div>
            <h3 className="mb-2 text-sm font-semibold">Historial</h3>
            <ul className="divide-y divide-border-light rounded-lg border border-border-light text-sm">
              {periodicity.changes.map((change) => <li key={`${change.occurredAt}:${change.to}`} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"><span>{change.from ? `${periodicityLabel(change.from)} → ` : "Configurada como "}{periodicityLabel(change.to)}{change.reason ? ` · ${change.reason}` : ""}</span><time className="text-xs text-[var(--text-tertiary)]" dateTime={change.occurredAt}>{new Date(change.occurredAt).toLocaleString("es-VE")}</time></li>)}
            </ul>
          </div>}
        </div>}
      </SettingsSection>
      <SettingsSection title="Otros datos fiscales" subtitle="Tipo de contribuyente y dirección fiscal se editan en los ajustes de la empresa.">
        <ContextLink href="/settings/company" className="inline-flex text-sm font-semibold text-primary-500 hover:underline">Abrir ajustes de empresa →</ContextLink>
      </SettingsSection>
    </div>
  </div>;
}

function object(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function message(value: unknown, fallback: string): string { const candidate = object(value).error; return typeof candidate === "string" ? candidate : fallback; }
function groupRules(value: readonly VatRule[]): string[] { return [...new Set(value.map((rule) => `${rule.category}:${rule.component}`))]; }
function treatmentLabel(value: Treatment): string { return ({ taxed: "Gravado", zero_rated: "Tasa cero", exempt: "Exento", exonerated: "Exonerado", not_subject: "No sujeto" })[value]; }
function categoryLabel(value: Category): string { return ({ general: "General", reduced: "Reducida", zero_rated: "Tasa cero", luxury_surcharge: "Adicional suntuario", payment_surcharge: "Adicional por pago", other: "Otra" })[value]; }
function componentLabel(value: Component): string { return ({ base: "Alícuota base", luxury: "Adicional suntuario", payment: "Adicional por pago" })[value]; }
function periodicityLabel(value: Periodicity): string { return value === "monthly" ? "Mensual" : "Quincenal"; }
/** Maps an assignment treatment to the product catalogue's legacy IVA filter; other treatments have no catalogue equivalent. */
function productFilter(value: Treatment): "general" | "exento" | null { return value === "taxed" ? "general" : value === "exempt" ? "exento" : null; }
