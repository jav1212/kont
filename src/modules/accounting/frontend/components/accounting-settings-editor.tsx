"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { notify } from "@/src/shared/frontend/notify";
import { createWebAccountingClient } from "../accounting-client";

interface SettingsSnapshot {
  readonly version: number;
  readonly functionalCurrency: string;
  readonly reportingCurrencies: readonly string[];
  readonly profile: Readonly<Record<string, unknown>>;
  readonly specialAccounts: Readonly<Record<string, string>>;
}

/** Edits versioned company profile and currency settings through the audited command API.
 * @param props - The settings section displayed on this route.
 * @returns A company scoped editor with optimistic revision checking.
 * @throws Never; request failures are announced through `notify.error`.
 */
export function AccountingSettingsEditor(props: { readonly section: "profile" | "currencies" }): React.JSX.Element {
  const { organization } = useOrganization();
  const { company } = useCompany();
  const client = useMemo(() => createWebAccountingClient(), []);
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [profile, setProfile] = useState({ accountantName: "", cpc: "", commercialRegistry: "", fiscalYearStartMonth: "1", fiscalYearStartDay: "1" });
  const [currencies, setCurrencies] = useState("USD");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!organization || !company) { setSnapshot(null); return; }
    setBusy(true);
    try {
      const value = await client.query(organization.id, company.id, { kind: "get_accounting_settings" }) as unknown as SettingsSnapshot;
      setSnapshot(value);
      setProfile({
        accountantName: String(value.profile?.accountantName ?? ""),
        cpc: String(value.profile?.cpc ?? ""),
        commercialRegistry: String(value.profile?.commercialRegistry ?? ""),
        fiscalYearStartMonth: String(value.profile?.fiscalYearStartMonth ?? 1),
        fiscalYearStartDay: String(value.profile?.fiscalYearStartDay ?? 1),
      });
      setCurrencies((value.reportingCurrencies ?? []).join(", "));
    } catch (cause) { notifySettingsFailure("No se pudo cargar la configuración contable.", cause, "accounting-settings-load"); }
    finally { setBusy(false); }
  }, [client, company, organization]);
  useEffect(() => { void load(); }, [load]);
  async function save(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!organization || !company || !snapshot) return;
    setBusy(true);
    const requestId = crypto.randomUUID();
    try {
      await client.command(organization.id, company.id, {
        kind: "save_accounting_settings",
        expectedVersion: snapshot.version,
        functionalCurrency: "VES",
        reportingCurrencies: currencies.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean),
        profile: {
          accountantName: profile.accountantName.trim(),
          cpc: profile.cpc.trim(),
          commercialRegistry: profile.commercialRegistry.trim(),
          fiscalYearStartMonth: Number(profile.fiscalYearStartMonth),
          fiscalYearStartDay: Number(profile.fiscalYearStartDay),
        },
        specialAccounts: snapshot.specialAccounts ?? {},
        idempotencyKey: requestId,
        correlationId: requestId,
      });
      notify.success("Configuración guardada en una nueva revisión.");
      await load();
    } catch (cause) { notifySettingsFailure("No se pudo guardar la configuración contable.", cause); }
    finally { setBusy(false); }
  }
  const profileSection = props.section === "profile";
  return <div className="flex min-h-full flex-col">
    <PageHeader title={profileSection ? "Perfil contable de la empresa" : "Monedas contables"} subtitle={profileSection ? "Datos del contador, registro mercantil e inicio del ejercicio." : "La moneda funcional del libro es VES; configura monedas adicionales de reporte."} />
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-8 py-8">
    {!company && <p className="rounded-xl bg-warning-50 p-4 text-sm text-warning-800">Selecciona una empresa para consultar su configuración contable.</p>}
    <form onSubmit={(event) => void save(event)} className="grid gap-4 rounded-2xl border border-default-200 bg-content1 p-5 sm:grid-cols-2">
      <p className="text-sm text-default-500 sm:col-span-2">Revisión {snapshot?.version ?? 0} · Moneda funcional VES</p>
      {profileSection ? <>
        <label className="grid gap-1 text-sm">Contador<input value={profile.accountantName} onChange={(event) => setProfile((current) => ({ ...current, accountantName: event.target.value }))} className="rounded-lg border border-default-300 bg-content1 px-3 py-2" /></label>
        <label className="grid gap-1 text-sm">CPC<input value={profile.cpc} onChange={(event) => setProfile((current) => ({ ...current, cpc: event.target.value }))} className="rounded-lg border border-default-300 bg-content1 px-3 py-2" /></label>
        <label className="grid gap-1 text-sm sm:col-span-2">Registro mercantil<input value={profile.commercialRegistry} onChange={(event) => setProfile((current) => ({ ...current, commercialRegistry: event.target.value }))} className="rounded-lg border border-default-300 bg-content1 px-3 py-2" /></label>
        <label className="grid gap-1 text-sm">Mes de inicio del ejercicio<input type="number" min="1" max="12" required value={profile.fiscalYearStartMonth} onChange={(event) => setProfile((current) => ({ ...current, fiscalYearStartMonth: event.target.value }))} className="rounded-lg border border-default-300 bg-content1 px-3 py-2" /></label>
        <label className="grid gap-1 text-sm">Día de inicio<input type="number" min="1" max="31" required value={profile.fiscalYearStartDay} onChange={(event) => setProfile((current) => ({ ...current, fiscalYearStartDay: event.target.value }))} className="rounded-lg border border-default-300 bg-content1 px-3 py-2" /></label>
      </> : <>
        <label className="grid gap-1 text-sm">Moneda funcional<input readOnly value="VES" className="rounded-lg border border-default-300 bg-default-50 px-3 py-2" /></label>
        <label className="grid gap-1 text-sm sm:col-span-2">Monedas de reporte<input value={currencies} onChange={(event) => setCurrencies(event.target.value)} placeholder="USD, EUR" className="rounded-lg border border-default-300 bg-content1 px-3 py-2" /><span className="text-xs text-default-500">Escribe códigos ISO de tres letras separados por comas.</span></label>
      </>}
      <div className="sm:col-span-2"><BaseButton.Root type="submit" loading={busy} disabled={!company || !organization || !snapshot}>Guardar configuración</BaseButton.Root></div>
    </form>
    </div>
  </div>;
}

/** Toasts a Spanish, operation-specific failure; the backend's diagnostic text travels only as incident metadata. */
function notifySettingsFailure(message: string, cause: unknown, deduplicationKey?: string): void {
  notify.error(message, {
    deduplicationKey,
    errorMetadata: {
      cause: cause instanceof Error ? cause.message : String(cause),
      ...(cause && typeof cause === "object" && "code" in cause ? { code: String(cause.code) } : {}),
      ...(cause && typeof cause === "object" && "requestId" in cause ? { requestId: String(cause.requestId) } : {}),
    },
  });
}
