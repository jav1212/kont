"use client";

import { useEffect, useMemo, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";
import { queryPayables, type PayablesRequestScope } from "./payables-client";

/** Report page with its optional same-snapshot totals. */
export interface PayablesReportData<TRow> {
  readonly rows: readonly TRow[];
  readonly total: number;
  readonly totals?: readonly Readonly<Record<string, string>>[];
  readonly rulesActive?: boolean;
}

/** Resolves the selected organization and company as a payables request scope.
 * @returns The scope, or null while no company is selected.
 * @throws Error when used outside the company and organization providers.
 */
export function usePayablesScope(): PayablesRequestScope | null {
  const { companyId } = useCompany();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  return useMemo(() => companyId && organizationId ? { organizationId, companyId } : null, [companyId, organizationId]);
}

/** Loads one payables report and reloads it when the query or revision changes.
 * Loading is derived from the request key, so effects never set state synchronously.
 * @param query - Report kind and filters; `null` skips the request.
 * @param revision - Increment to force a reload after a command.
 * @returns The last loaded data for this query, its error and whether a request is in flight.
 * @throws Error when used outside the company and organization providers.
 */
export function usePayablesReport<TRow>(query: (Readonly<Record<string, unknown>> & { readonly kind: string }) | null, revision = 0): {
  readonly data: PayablesReportData<TRow> | null;
  readonly error: string | null;
  readonly loading: boolean;
} {
  const scope = usePayablesScope();
  const key = scope && query ? JSON.stringify([scope, query, revision]) : null;
  const [state, setState] = useState<{ readonly key: string | null; readonly data: PayablesReportData<TRow> | null; readonly error: string | null }>({ key: null, data: null, error: null });
  useEffect(() => {
    if (!key) return;
    const [requestScope, requestQuery] = JSON.parse(key) as [PayablesRequestScope, Record<string, unknown> & { kind: string }];
    let active = true;
    void queryPayables<TRow>(requestScope, requestQuery)
      .then((result) => { if (active) setState({ key, data: result as PayablesReportData<TRow>, error: null }); })
      .catch((cause: unknown) => { if (active) setState({ key, data: null, error: cause instanceof Error ? cause.message : "No se pudo cargar la información de CxP." }); });
    return () => { active = false; };
  }, [key]);
  const current = state.key === key;
  return { data: current ? state.data : null, error: current ? state.error : null, loading: key !== null && !current };
}
