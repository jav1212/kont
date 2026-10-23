"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { formatIvaMoney } from "@/src/modules/iva/frontend/money-format";
import type { VatLedgerPage } from "@kontave/tax-reporting/application";
import type { TaxReportingFact } from "@kontave/tax-reporting/domain";
type Row = Omit<TaxReportingFact, "signed"> & { readonly signed: { readonly total: { readonly minorAmount: string; readonly currency: { readonly code: string; readonly minorUnit: number } } } };
type Page = Omit<VatLedgerPage, "facts"> & { readonly facts: readonly Row[] };

/** Lists import facts for the selected fiscal month.
 * @returns Fiscal import list and a clear action to register new evidence.
 */
export default function FiscalImportsPage(): React.JSX.Element {
  const { companyId } = useCompany();
  const { can } = useOrganizationModuleAccess("/fiscal/importaciones");
  const search = useSearchParams();
  const rawPeriod = search.get("periodo");
  const period = rawPeriod && /^\d{4}-(0[1-9]|1[0-2])$/.test(rawPeriod) ? rawPeriod : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const requestKey = `${companyId ?? ""}:${period}:${can("purchases.read")}`;
  const [result, setResult] = useState<{ readonly key: string; readonly rows: readonly Row[]; readonly error: string | null } | null>(null);
  const rows = result?.key === requestKey ? result.rows : [];
  const error = result?.key === requestKey ? result.error : null;
  const loading = Boolean(companyId && can("purchases.read") && result?.key !== requestKey);
  useEffect(() => {
    let active = true;
    if (!companyId || !can("purchases.read")) return () => { active = false; };
    const query = new URLSearchParams({ companyId, period, limit: "100" });
    void fetch(`/api/fiscal/iva/purchase-ledger?${query}`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as { data?: Page; error?: string };
      if (!response.ok) throw new Error(body.error ?? "No fue posible consultar las importaciones.");
      return body.data?.facts.filter((fact) => fact.direction === "import") ?? [];
    }).then((items) => { if (active) setResult({ key: requestKey, rows: items, error: null }); }).catch((cause: unknown) => { if (active) setResult({ key: requestKey, rows: [], error: cause instanceof Error ? cause.message : "No fue posible consultar las importaciones." }); });
    return () => { active = false; };
  }, [can, companyId, period, requestKey]);
  return <main className="min-h-full bg-surface-2"><PageHeader title="Importaciones" subtitle={`Documentos del período ${period}`}><Link href={`/fiscal/importaciones/nueva?periodo=${period}`} className="inline-flex h-10 items-center rounded-lg bg-primary-500 px-4 text-sm font-semibold text-white">Nueva importación</Link></PageHeader><section className="mx-auto max-w-6xl space-y-4 px-4 py-6 md:px-8">{!companyId && <p className="rounded-xl border border-border-light bg-surface-1 p-5">Selecciona una empresa.</p>}{loading && <p role="status">Consultando importaciones…</p>}{error && <p role="alert" className="rounded-xl border border-warning/30 bg-surface-1 p-4 text-sm">{error}</p>}{!loading && !error && companyId && <div className="overflow-x-auto rounded-xl border border-border-light bg-surface-1"><table className="w-full text-left text-sm"><thead><tr className="bg-surface-2/60 text-xs uppercase text-[var(--text-tertiary)]"><th className="p-3">Fecha</th><th className="p-3">Documento</th><th className="p-3">Contraparte</th><th className="p-3">Estado</th><th className="p-3 text-right">Total documentado</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-border-light/70"><td className="p-3">{row.documentDate}</td><td className="p-3">{row.documentKind === "import_declaration" ? "Declaración de importación" : "Servicio del exterior"}</td><td className="p-3">{row.counterparty.name ?? row.counterparty.taxIdentifier ?? "—"}</td><td className="p-3">{row.reconciliation.state === "reconciled" ? "Incluido" : "Por revisar"}</td><td className="p-3 text-right">{formatIvaMoney(row.signed.total)}</td></tr>)}{rows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-[var(--text-secondary)]">No hay importaciones incluidas en este período.</td></tr>}</tbody></table></div>}</section></main>;
}
