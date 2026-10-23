"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { ivaRequest } from "@/src/modules/iva/frontend/iva-client";
import { formatIvaMoney } from "@/src/modules/iva/frontend/money-format";
import type { VatPeriodSummary } from "@kontave/tax-reporting/application";
import { PeriodSelector } from "@/src/modules/iva/frontend/components/period-selector";
import { PeriodStatusBadge, type IvaPeriodStatus } from "@/src/modules/iva/frontend/components/period-status-badge";

/** Shows fiscal-month totals and permission-filtered IVA workflows.
 * @returns Period overview with amounts from saved facts when reporting is installed.
 */
export default function IvaWorkspacePage(): React.JSX.Element {
  const { can } = useOrganizationModuleAccess("/fiscal");
  const { companyId } = useCompany();
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = new Date();
  const defaultPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const periodParam = searchParams.get("periodo");
  const period = periodParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodParam) ? periodParam : defaultPeriod;
  const includePurchases = can("purchases.read");
  const includeSales = can("sales.read");
  const canSeeFiscal = includePurchases || includeSales;
  const requestKey = `${companyId ?? ""}:${period}:${includePurchases}:${includeSales}`;
  const [report, setReport] = useState<{
    readonly key: string;
    readonly summary: VatPeriodSummary | null;
    readonly periodStatus: { readonly status: IvaPeriodStatus; readonly pending: readonly string[] } | null;
    readonly error: string | null;
  } | null>(null);
  const currentReport = report?.key === requestKey ? report : null;
  const summary = currentReport?.summary ?? null;
  const periodStatus = currentReport?.periodStatus ?? null;
  const error = currentReport?.error ?? null;
  const loading = Boolean(companyId && canSeeFiscal && !currentReport);

  useEffect(() => {
    let active = true;
    if (!companyId || !canSeeFiscal) return () => { active = false; };
    const query = new URLSearchParams({ companyId, period });
    const periodQuery = new URLSearchParams({ companyId, periodKey: period });
    void Promise.all([
      ivaRequest<VatPeriodSummary>(`/api/fiscal/iva/period-summary?${query}`)
        .then((value) => ({ summary: value, error: null as string | null }))
        .catch((cause: unknown) => ({ summary: null, error: cause instanceof Error ? cause.message : "No fue posible consultar el período." })),
      ivaRequest<{ readonly status: IvaPeriodStatus; readonly pending?: readonly string[] }>(`/api/fiscal/iva/periods?${periodQuery}`)
        .then((value) => ({ status: value.status, pending: value.pending ?? [] }))
        .catch(() => null),
    ]).then(([summaryResult, statusResult]) => {
      if (active) setReport({ key: requestKey, summary: summaryResult.summary, error: summaryResult.error, periodStatus: statusResult });
    });
    return () => { active = false; };
  }, [canSeeFiscal, companyId, includePurchases, includeSales, period, requestKey]);
  const links = [
    ...(includePurchases ? [{ href: "/fiscal/compras", title: "Libro de compras", description: "Consulta los documentos incluidos en el libro de compras." }] : []),
    ...(includeSales ? [{ href: "/fiscal/ventas", title: "Libro de ventas", description: "Consulta los documentos incluidos en el libro de ventas." }] : []),
    ...(canSeeFiscal ? [{ href: "/fiscal/pendientes", title: "Pendientes", description: "Revisa documentos por incorporar y datos fiscales faltantes." }] : []),
    ...(includePurchases ? [{ href: "/fiscal/importaciones", title: "Importaciones", description: "Registra evidencia de importaciones para su revisión fiscal." }] : []),
    ...(canSeeFiscal ? [{ href: "/fiscal/declaraciones", title: "Declaraciones", description: "Consulta borradores internos e historial de revisiones." }] : []),
    ...(can("companies.read") ? [{ href: "/fiscal/configuracion", title: "Configuración", description: "Consulta reglas de IVA y perfiles fiscales con su evidencia." }] : []),
  ];
  const pending = (summary?.reconciliationCounts.issue ?? 0) + (summary?.legacyUnincorporated.purchases ?? 0) + (summary?.legacyUnincorporated.sales ?? 0);
  const moneyItems = useMemo(() => {
    if (!summary) return [];
    const find = (kind: string) => summary.totals.filter((entry) => entry.kind === kind);
    return [
      { label: "Débito fiscal", entries: find("tax") },
      { label: "Crédito fiscal admitido", entries: find("credit") },
      { label: "Retenciones practicadas", entries: find("withholding_practiced") },
      { label: "Crédito por revisar", entries: find("credit_pending") },
    ];
  }, [summary]);
  const setPeriod = useCallback((nextPeriod: string) => {
    const query = new URLSearchParams(searchParams.toString());
    query.set("periodo", nextPeriod);
    router.replace(`/fiscal?${query.toString()}`);
  }, [router, searchParams]);
  const periodLabel = new Intl.DateTimeFormat("es-VE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period}-01T12:00:00Z`));
  return <main className="min-h-full bg-surface-2">
    <PageHeader title="IVA" subtitle="Período fiscal y documentos incluidos en los libros" />
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-light bg-surface-1 p-5">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Período fiscal</p><h2 className="mt-1 text-xl font-semibold capitalize">{periodLabel}</h2></div>
        <PeriodSelector value={period} onChange={setPeriod} />
        {periodStatus && periodStatus.pending.length === 0 && <PeriodStatusBadge status={periodStatus.status} />}
        {periodStatus && periodStatus.pending.length > 0 && <span className="rounded-full border border-warning/30 bg-warning/5 px-3 py-1.5 text-xs font-medium text-warning">Periodicidad no configurada</span>}
      </header>
      {error && <p role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-[var(--text-secondary)]">{error} Los importes no están disponibles hasta completar la instalación de reportes.</p>}
      {loading && <p role="status" className="text-sm text-[var(--text-secondary)]">Consultando documentos del período…</p>}
      {summary && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{moneyItems.map(({ label, entries }) => <article key={label} className="rounded-xl border border-border-light bg-surface-1 p-4"><p className="text-xs text-[var(--text-tertiary)]">{label}</p>{entries.length ? entries.map((entry, index) => <p key={`${entry.amount.currency.code}-${index}`} className="mt-2 text-lg font-semibold tabular-nums">{formatIvaMoney(entry.amount)}</p>) : <p className="mt-2 text-lg font-semibold tabular-nums">—</p>}</article>)}</div>}
      {summary && pending > 0 && <div className="rounded-xl border border-warning/30 bg-surface-1 p-4"><p className="font-semibold">{pending} pendiente{pending === 1 ? "" : "s"} antes de preparar</p><p className="mt-1 text-sm text-[var(--text-secondary)]">{summary.legacyUnincorporated.purchases + summary.legacyUnincorporated.sales} documento{summary.legacyUnincorporated.purchases + summary.legacyUnincorporated.sales === 1 ? "" : "s"} heredado{summary.legacyUnincorporated.purchases + summary.legacyUnincorporated.sales === 1 ? "" : "s"} sin incorporar.</p><Link href={`/fiscal/pendientes?periodo=${period}`} className="mt-3 inline-block text-sm font-semibold text-primary-500">Resolver pendientes →</Link></div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{links.map((item) => <Link key={item.href} href={`${item.href}?periodo=${period}`} className="rounded-xl border border-border-light bg-surface-1 p-5 transition-colors hover:border-primary-500/50 hover:bg-surface-2"><h3 className="font-semibold text-foreground">{item.title}</h3><p className="mt-2 text-sm text-[var(--text-secondary)]">{item.description}</p><span className="mt-4 inline-block text-sm font-semibold text-primary-500">Abrir →</span></Link>)}
        {links.length === 0 && <p className="rounded-xl border border-border-light bg-surface-1 p-5 text-sm">Tu organización no tiene permisos para consultar libros fiscales.</p>}
      </div>
      <p className="rounded-lg border border-border-light bg-surface-1 p-4 text-xs text-[var(--text-secondary)]">La periodicidad y fecha de vencimiento dependen del perfil fiscal y de una fuente verificable. Las tasas, deducibilidad y exoneraciones desconocidas permanecen pendientes; este resumen interno no es la Forma IVA 30.</p>
    </div>
  </main>;
}
