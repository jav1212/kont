"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";
import { notify } from "@/src/shared/frontend/notify";

type Treatment = "taxed" | "zero_rated" | "exempt" | "exonerated" | "not_subject";
type Category = "general" | "reduced" | "zero_rated" | "luxury_surcharge" | "payment_surcharge" | "other";
type Component = "base" | "luxury" | "payment";
type RateSlot = "a1" | "a2" | "a3" | "a4" | "a5";
type ContributorStatus = "ordinary" | "formal" | "occasional" | "unverified";
type ResidenceStatus = "domestic" | "import_goods" | "foreign_service" | "unverified";
interface VatRule { readonly id: string; readonly taxCode: string; readonly jurisdiction: string; readonly treatment: Treatment; readonly rate: string; readonly calculationMode: "tax_exclusive" | "tax_inclusive"; readonly effectiveFrom: string; readonly effectiveTo: string | null; readonly legalBasis: string; readonly version: string; readonly category: Category; readonly legacyRateSlot: RateSlot | null; readonly component: Component; }
interface Catalog { readonly companyId: string; readonly version: number; readonly rules: readonly VatRule[]; }
interface CounterpartyProfile { readonly companyId: string; readonly counterpartyId: string; readonly contributorStatus: ContributorStatus; readonly residenceStatus: ResidenceStatus; readonly effectiveFrom: string; readonly effectiveTo: string | null; readonly legalBasis: string; readonly evidenceReference: string; readonly version: number; }
interface RuleDraft { taxCode: string; jurisdiction: string; treatment: Treatment; rate: string; calculationMode: "tax_exclusive" | "tax_inclusive"; effectiveFrom: string; effectiveTo: string; legalBasis: string; version: string; category: Category; legacyRateSlot: RateSlot | ""; component: Component; }
interface InvoiceSeries { readonly id: string; readonly code: string; readonly prefix: string | null; readonly nextNumber: number; readonly maximumNumber: number; readonly active?: boolean; }

const emptyDraft = (): RuleDraft => ({ taxCode: "IVA", jurisdiction: "VE", treatment: "taxed", rate: "", calculationMode: "tax_exclusive", effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: "", legalBasis: "", version: "", category: "general", legacyRateSlot: "", component: "base" });

/** Presents and edits the selected company's versioned IVA rules without selecting statutory rates for the operator.
 * @returns Company fiscal-rule administration and effective-date history controls.
 */
export default function IvaConfigurationPage(): React.JSX.Element {
  const { companyId } = useCompany();
  const { can } = useOrganizationModuleAccess("/settings/iva");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft);
  const [rules, setRules] = useState<VatRule[]>([]);
  const [version, setVersion] = useState(0);
  const [historicalVersion, setHistoricalVersion] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ readonly fingerprint: string; readonly key: string } | null>(null);
  const profilePending = useRef<{ readonly fingerprint: string; readonly key: string } | null>(null);
  const [counterpartyId, setCounterpartyId] = useState("");
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
  const [series, setSeries] = useState<InvoiceSeries[]>([]);
  const [seriesCode, setSeriesCode] = useState("");
  const [seriesPrefix, setSeriesPrefix] = useState("");
  const [seriesNext, setSeriesNext] = useState("1");
  const [seriesMaximum, setSeriesMaximum] = useState("99999999");
  const [seriesSaving, setSeriesSaving] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const canUpdate = can("companies.update");
  const catalogIsCurrent = Boolean(companyId && catalog?.companyId === companyId);
  const profileQueryIsCurrent = profileQueryKey === `${companyId ?? ""}::${counterpartyId.trim()}::${profileDate}`;

  const load = useCallback(async (revision?: number): Promise<void> => {
    if (!companyId) { setCatalog(null); setRules([]); return; }
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ companyId });
      if (revision !== undefined) params.set("version", String(revision));
      const response = await apiFetch(`/api/fiscal/iva/configuration?${params}`, { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(payload, "No fue posible cargar el catálogo fiscal."));
      const next = object(object(payload).data) as unknown as Catalog;
      setCatalog(next); setRules([...next.rules]); setVersion(next.version);
      if (revision === undefined) setHistoricalVersion("");
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "No fue posible consultar la configuración fiscal.";
      setCatalog(null); setRules([]); setError(text);
    } finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const loadSeries = useCallback(async (): Promise<void> => {
    if (!companyId) { setSeries([]); return; }
    try {
      const response = await apiFetch(`/api/companies/document-series?companyId=${encodeURIComponent(companyId)}`, { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(payload, "No fue posible cargar las series de facturación."));
      const rows = object(payload).data;
      setSeries(Array.isArray(rows) ? rows as InvoiceSeries[] : []);
      setSeriesError(null);
    } catch (cause) {
      setSeriesError(cause instanceof Error ? cause.message : "No fue posible cargar las series de facturación.");
    }
  }, [companyId]);

  useEffect(() => { void loadSeries(); }, [loadSeries]);

  async function createInvoiceSeries(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!companyId || !canUpdate) return;
    setSeriesSaving(true); setSeriesError(null);
    try {
      const response = await apiFetch("/api/companies/document-series", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ operation: "create", companyId, documentType: "sales_invoice", code: seriesCode.trim(), prefix: seriesPrefix.trim() || null, nextNumber: Number(seriesNext), maximumNumber: Number(seriesMaximum) }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(payload, "No fue posible crear la serie."));
      setSeriesCode(""); setSeriesPrefix(""); setSeriesNext("1");
      notify.success("Serie de facturación creada.");
      await loadSeries();
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "No fue posible crear la serie.";
      setSeriesError(text); notify.error(text);
    } finally { setSeriesSaving(false); }
  }

  const isHistorical = historicalVersion !== "";
  const groups = useMemo(() => groupRules(rules), [rules]);

  function addRule(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const id = crypto.randomUUID();
    setRules((current) => [...current, {
      ...draft,
      id,
      effectiveTo: draft.effectiveTo || null,
      legacyRateSlot: draft.legacyRateSlot || null,
    }]);
    setDraft(emptyDraft());
  }

  async function save(): Promise<void> {
    if (!companyId || !catalog || catalog.companyId !== companyId || !canUpdate || isHistorical) return;
    setSaving(true); setError(null);
    const body = JSON.stringify({ companyId, expectedVersion: catalog.version, rules });
    if (pending.current?.fingerprint !== body) pending.current = { fingerprint: body, key: crypto.randomUUID() };
    try {
      const response = await apiFetch("/api/fiscal/iva/configuration", {
        method: "PUT", headers: { "Content-Type": "application/json", "Idempotency-Key": pending.current.key }, body,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(payload, "No fue posible guardar las reglas."));
      pending.current = null;
      notify.success("Nueva versión del catálogo IVA guardada.");
      await load();
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "No fue posible guardar el catálogo IVA.";
      setError(text); notify.error(text);
    } finally { setSaving(false); }
  }

  async function loadCounterpartyProfile(): Promise<void> {
    if (!companyId || !counterpartyId.trim() || !profileDate) return;
    setProfileLoading(true); setProfileError(null);
    try {
      const params = new URLSearchParams({ companyId, counterpartyId: counterpartyId.trim(), effectiveDate: profileDate });
      const response = await apiFetch(`/api/fiscal/iva/counterparty-profile?${params}`, { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(payload, "No fue posible consultar el perfil fiscal."));
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
      const text = cause instanceof Error ? cause.message : "No fue posible consultar el perfil fiscal.";
      setProfileError(text); setProfile(null);
      setProfileQueryKey(null);
    } finally { setProfileLoading(false); }
  }

  async function saveCounterpartyProfile(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!companyId || !canUpdate || !counterpartyId.trim() || !profileQueryIsCurrent) return;
    setProfileSaving(true); setProfileError(null);
    const expectedVersion = profile?.effectiveFrom === profileEffectiveFrom ? profile.version : 0;
    const body = JSON.stringify({ companyId, counterpartyId: counterpartyId.trim(), contributorStatus: profileContributorStatus,
      residenceStatus: profileResidenceStatus, effectiveFrom: profileEffectiveFrom, effectiveTo: profileEffectiveTo || null,
      legalBasis: profileLegalBasis, evidenceReference: profileEvidence, expectedVersion });
    if (profilePending.current?.fingerprint !== body) profilePending.current = { fingerprint: body, key: crypto.randomUUID() };
    try {
      const response = await apiFetch("/api/fiscal/iva/counterparty-profile", { method: "PUT",
        headers: { "Content-Type": "application/json", "Idempotency-Key": profilePending.current.key }, body });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(payload, "No fue posible guardar el perfil fiscal."));
      const saved = object(object(payload).data) as unknown as CounterpartyProfile;
      profilePending.current = null;
      setProfile(saved);
      notify.success("Perfil fiscal de contraparte guardado.");
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "No fue posible guardar el perfil fiscal.";
      setProfileError(text); notify.error(text);
    } finally { setProfileSaving(false); }
  }

  return <div className="space-y-6 pb-10">
    <PageHeader title="Configuración de IVA" subtitle="Reglas fiscales versionadas por empresa y vigencia. Las tasas deben configurarse con su soporte legal y nunca se completan automáticamente." />
    <SettingsSection title="Catálogo de la empresa" subtitle={catalogIsCurrent && catalog ? `Versión ${catalog.version} · ${catalog.rules.length} reglas · ${companyId ?? "sin empresa"}` : "La configuración depende del catálogo fiscal disponible para la empresa seleccionada."}>
      {error && <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-medium text-foreground">Consultar versión histórica
          <input aria-label="Versión histórica" inputMode="numeric" min="0" type="number" value={historicalVersion} onChange={(event) => setHistoricalVersion(event.target.value)} className="h-10 w-44 rounded-lg border border-border-light bg-surface-1 px-3 text-sm" />
        </label>
        <button type="button" disabled={loading || !companyId} onClick={() => void load(historicalVersion ? Number(historicalVersion) : undefined)} className="h-10 rounded-lg border border-border-light px-4 text-sm font-semibold disabled:opacity-50">{loading ? "Consultando…" : "Consultar"}</button>
        {catalogIsCurrent && catalog && <span className="text-xs text-[var(--text-tertiary)]">{isHistorical ? "Vista histórica, solo lectura" : `Versión actual ${version}`}</span>}
      </div>
      {!catalogIsCurrent && !error && <p className="text-sm text-[var(--text-tertiary)]">Selecciona una empresa para consultar su catálogo.</p>}
      {catalogIsCurrent && catalog && rules.length === 0 && <p className="rounded-lg bg-surface-2 px-4 py-3 text-sm text-[var(--text-tertiary)]">Esta versión no contiene reglas. Agrega únicamente reglas con soporte fiscal validado.</p>}
      {catalogIsCurrent && catalog && rules.length > 0 && <div className="overflow-x-auto rounded-lg border border-border-light">
        <table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-surface-2 text-xs uppercase text-[var(--text-tertiary)]"><tr><th className="px-3 py-2">Código / categoría</th><th className="px-3 py-2">Tratamiento</th><th className="px-3 py-2">Tasa</th><th className="px-3 py-2">Componente</th><th className="px-3 py-2">Vigencia</th><th className="px-3 py-2">Fundamento</th>{canUpdate && !isHistorical && <th className="px-3 py-2">Acción</th>}</tr></thead><tbody>{rules.map((rule, index) => <tr key={rule.id} className="border-t border-border-light"><td className="px-3 py-3 font-medium">{rule.taxCode} · {rule.category}{rule.legacyRateSlot ? ` · ${rule.legacyRateSlot.toUpperCase()}` : ""}</td><td className="px-3 py-3">{rule.treatment}</td><td className="px-3 py-3">{rule.rate}% · {rule.calculationMode === "tax_inclusive" ? "incluido" : "excluido"}</td><td className="px-3 py-3">{rule.component}</td><td className="px-3 py-3">{rule.effectiveFrom} – {rule.effectiveTo ?? "sin cierre"}</td><td className="max-w-56 truncate px-3 py-3" title={rule.legalBasis}>{rule.legalBasis}</td>{canUpdate && !isHistorical && <td className="px-3 py-3"><button type="button" onClick={() => setRules((current) => current.filter((_, row) => row !== index))} className="font-semibold text-danger">Quitar de próxima versión</button></td>}</tr>)}</tbody></table>
      </div>}
      {catalogIsCurrent && catalog && canUpdate && !isHistorical && <div className="mt-5 flex justify-end"><button type="button" disabled={saving || loading} onClick={() => void save()} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Guardando…" : `Guardar versión ${catalog.version + 1}`}</button></div>}
    </SettingsSection>
    {catalogIsCurrent && catalog && canUpdate && !isHistorical && <SettingsSection title="Agregar regla" subtitle="Cada regla necesita categoría, componente, período y fundamento explícitos. A1–A5 son referencias heredadas y no fijan una tasa legal.">
      <form onSubmit={addRule} className="grid gap-4 md:grid-cols-3">
        <Field label="Código tributario"><input required maxLength={64} value={draft.taxCode} onChange={(event) => setDraft({ ...draft, taxCode: event.target.value })} className={inputClass} /></Field>
        <Field label="Jurisdicción"><input required maxLength={16} value={draft.jurisdiction} onChange={(event) => setDraft({ ...draft, jurisdiction: event.target.value.toUpperCase() })} className={inputClass} /></Field>
        <Field label="Tasa (%)"><input required type="number" min="0" step="0.0001" value={draft.rate} onChange={(event) => setDraft({ ...draft, rate: event.target.value })} className={inputClass} /></Field>
        <Field label="Categoría"><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as Category })} className={inputClass}><option value="general">General</option><option value="reduced">Reducida</option><option value="zero_rated">Tasa cero</option><option value="luxury_surcharge">Recargo suntuario</option><option value="payment_surcharge">Recargo por pago</option><option value="other">Otra</option></select></Field>
        <Field label="Tratamiento"><select value={draft.treatment} onChange={(event) => setDraft({ ...draft, treatment: event.target.value as Treatment })} className={inputClass}><option value="taxed">Gravado</option><option value="zero_rated">Tasa cero</option><option value="exempt">Exento</option><option value="exonerated">Exonerado</option><option value="not_subject">No sujeto</option></select></Field>
        <Field label="Componente"><select value={draft.component} onChange={(event) => setDraft({ ...draft, component: event.target.value as Component })} className={inputClass}><option value="base">Base</option><option value="luxury">Suntuario</option><option value="payment">Pago</option></select></Field>
        <Field label="Casilla Profit Plus (opcional)"><select value={draft.legacyRateSlot} onChange={(event) => setDraft({ ...draft, legacyRateSlot: event.target.value as RateSlot | "" })} className={inputClass}><option value="">Sin casilla</option>{(["a1", "a2", "a3", "a4", "a5"] as const).map((slot) => <option key={slot} value={slot}>{slot.toUpperCase()}</option>)}</select></Field>
        <Field label="Precio"><select value={draft.calculationMode} onChange={(event) => setDraft({ ...draft, calculationMode: event.target.value as RuleDraft["calculationMode"] })} className={inputClass}><option value="tax_exclusive">Impuesto excluido</option><option value="tax_inclusive">Impuesto incluido</option></select></Field>
        <Field label="Identificador de versión"><input required maxLength={128} value={draft.version} onChange={(event) => setDraft({ ...draft, version: event.target.value })} className={inputClass} /></Field>
        <Field label="Vigente desde"><input required type="date" value={draft.effectiveFrom} onChange={(event) => setDraft({ ...draft, effectiveFrom: event.target.value })} className={inputClass} /></Field>
        <Field label="Vigente hasta (opcional)"><input type="date" value={draft.effectiveTo} onChange={(event) => setDraft({ ...draft, effectiveTo: event.target.value })} className={inputClass} /></Field>
        <Field label="Fundamento legal / soporte"><input required maxLength={500} value={draft.legalBasis} onChange={(event) => setDraft({ ...draft, legalBasis: event.target.value })} className={inputClass} /></Field>
        <div className="md:col-span-3 flex justify-end"><button type="submit" className="rounded-lg border border-border-light px-4 py-2.5 text-sm font-semibold">Agregar a la próxima versión</button></div>
      </form>
      {groups.length > 0 && <p className="mt-3 text-xs text-[var(--text-tertiary)]">El catálogo valida que no haya reglas ambiguas con selectores y vigencias superpuestas antes de persistirlo.</p>}
    </SettingsSection>}
    <SettingsSection title="Perfiles fiscales de contrapartes" subtitle="Clasifica proveedores o clientes solo con evidencia verificable. Este perfil conserva estatus y residencia por vigencia; no declara por sí solo que el IVA sea deducible ni determina si una operación constituye importación.">
      {profileError && <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{profileError}</div>}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-medium text-foreground">ID proveedor/cliente<input value={counterpartyId} onChange={(event) => { setCounterpartyId(event.target.value); setProfile(null); setProfileQueryKey(null); setProfileContributorStatus("unverified"); setProfileResidenceStatus("unverified"); setProfileEffectiveFrom(profileDate); setProfileEffectiveTo(""); setProfileLegalBasis(""); setProfileEvidence(""); setProfileError(null); profilePending.current = null; }} maxLength={128} className="h-10 w-64 rounded-lg border border-border-light bg-surface-1 px-3 text-sm" /></label>
        <label className="grid gap-1 text-xs font-medium text-foreground">Consultar a fecha<input type="date" value={profileDate} onChange={(event) => { setProfileDate(event.target.value); setProfile(null); setProfileQueryKey(null); setProfileContributorStatus("unverified"); setProfileResidenceStatus("unverified"); setProfileEffectiveFrom(event.target.value); setProfileEffectiveTo(""); setProfileLegalBasis(""); setProfileEvidence(""); profilePending.current = null; }} className="h-10 rounded-lg border border-border-light bg-surface-1 px-3 text-sm" /></label>
        <button type="button" disabled={profileLoading || !companyId || !counterpartyId.trim()} onClick={() => void loadCounterpartyProfile()} className="h-10 rounded-lg border border-border-light px-4 text-sm font-semibold disabled:opacity-50">{profileLoading ? "Consultando…" : "Consultar perfil"}</button>
        {profile && profileQueryIsCurrent && <span className="text-xs text-[var(--text-tertiary)]">Versión {profile.version} · desde {profile.effectiveFrom}</span>}
      </div>
      {(profile || canUpdate) && <form onSubmit={(event) => void saveCounterpartyProfile(event)} className="grid gap-4 md:grid-cols-3">
        <Field label="Estatus del contribuyente"><select disabled={!canUpdate} value={profileContributorStatus} onChange={(event) => setProfileContributorStatus(event.target.value as ContributorStatus)} className={inputClass}><option value="unverified">No verificado</option><option value="ordinary">Ordinario</option><option value="formal">Formal</option><option value="occasional">Ocasional</option></select></Field>
        <Field label="Residencia / tipo de operación"><select disabled={!canUpdate} value={profileResidenceStatus} onChange={(event) => setProfileResidenceStatus(event.target.value as ResidenceStatus)} className={inputClass}><option value="unverified">No verificado</option><option value="domestic">Nacional</option><option value="import_goods">Importación de bienes</option><option value="foreign_service">Servicio del exterior</option></select></Field>
        <Field label="Vigente desde"><input disabled={!canUpdate} required type="date" value={profileEffectiveFrom} onChange={(event) => setProfileEffectiveFrom(event.target.value)} className={inputClass} /></Field>
        <Field label="Vigente hasta (opcional)"><input disabled={!canUpdate} type="date" value={profileEffectiveTo} onChange={(event) => setProfileEffectiveTo(event.target.value)} className={inputClass} /></Field>
        <Field label="Fundamento de la clasificación"><input disabled={!canUpdate} required maxLength={500} value={profileLegalBasis} onChange={(event) => setProfileLegalBasis(event.target.value)} className={inputClass} /></Field>
        <Field label="Referencia de evidencia"><input disabled={!canUpdate} required maxLength={500} value={profileEvidence} onChange={(event) => setProfileEvidence(event.target.value)} className={inputClass} /></Field>
        {canUpdate && <div className="md:col-span-3 flex justify-end"><button type="submit" disabled={profileSaving || profileLoading || !counterpartyId.trim() || !profileQueryIsCurrent} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{profileSaving ? "Guardando…" : `Guardar versión ${(profile?.effectiveFrom === profileEffectiveFrom ? profile.version : 0) + 1}`}</button></div>}
      </form>}
    </SettingsSection>
    <SettingsSection title="Series para facturas de venta" subtitle="Los correlativos se asignan al emitir. Configura aquí series de empresa; la emisión debe seleccionar una serie disponible y conserva su número de forma atómica.">
      {seriesError && <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{seriesError}</div>}
      {series.length > 0 ? <div className="mb-4 overflow-x-auto rounded-lg border border-border-light"><table className="w-full text-left text-sm"><thead className="bg-surface-2 text-xs uppercase text-[var(--text-tertiary)]"><tr><th className="px-3 py-2">Código</th><th className="px-3 py-2">Prefijo</th><th className="px-3 py-2">Próximo número</th><th className="px-3 py-2">Límite</th></tr></thead><tbody>{series.map((item) => <tr key={item.id} className="border-t border-border-light"><td className="px-3 py-2">{item.code}</td><td className="px-3 py-2">{item.prefix || "—"}</td><td className="px-3 py-2">{item.nextNumber}</td><td className="px-3 py-2">{item.maximumNumber}</td></tr>)}</tbody></table></div> : <p className="mb-4 text-sm text-[var(--text-tertiary)]">No hay series de factura configuradas.</p>}
      {canUpdate && <form onSubmit={(event) => void createInvoiceSeries(event)} className="grid gap-3 md:grid-cols-5">
        <Field label="Código"><input required maxLength={32} value={seriesCode} onChange={(event) => setSeriesCode(event.target.value)} className={inputClass} /></Field>
        <Field label="Prefijo (opcional)"><input maxLength={32} value={seriesPrefix} onChange={(event) => setSeriesPrefix(event.target.value)} className={inputClass} /></Field>
        <Field label="Próximo número"><input required type="number" min="1" max="99999999" value={seriesNext} onChange={(event) => setSeriesNext(event.target.value)} className={inputClass} /></Field>
        <Field label="Número máximo"><input required type="number" min="1" max="99999999" value={seriesMaximum} onChange={(event) => setSeriesMaximum(event.target.value)} className={inputClass} /></Field>
        <div className="flex items-end"><button type="submit" disabled={seriesSaving || !companyId} className="h-10 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{seriesSaving ? "Guardando…" : "Crear serie"}</button></div>
      </form>}
    </SettingsSection>
  </div>;
}

function Field({ label, children }: { readonly label: string; readonly children: React.ReactNode }): React.JSX.Element { return <label className="grid gap-1.5 text-xs font-medium text-foreground">{label}{children}</label>; }
const inputClass = "h-10 rounded-lg border border-border-light bg-surface-1 px-3 text-sm";
function object(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function message(value: unknown, fallback: string): string { const candidate = object(value).error; return typeof candidate === "string" ? candidate : fallback; }
function groupRules(value: readonly VatRule[]): string[] { return [...new Set(value.map((rule) => `${rule.category}:${rule.component}`))]; }
