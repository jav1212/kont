"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LedgerAccountReadModel } from "@kontave/accounting/domain";
import { createWebAccountingClient } from "../accounting-client";
import { notify } from "@/src/shared/frontend/notify";

/** Loads selectable detail accounts from the company's currently active chart.
 * @param organizationId - Selected organization that scopes the delegated read.
 * @param companyId - Selected operating company.
 * @returns Active detail accounts, loading state, and a reload command.
 * @throws Never; expected transport errors clear the selector data.
 */
export function usePostingAccounts(
  organizationId: string | null,
  companyId: string | null,
): {
  readonly data: readonly LedgerAccountReadModel[];
  readonly loading: boolean;
  readonly reload: () => Promise<void>;
} {
  const client = useMemo(() => createWebAccountingClient(), []);
  const [data, setData] = useState<readonly LedgerAccountReadModel[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!organizationId || !companyId) { setData([]); return; }
    setLoading(true);
    try {
      const charts = await client.query(organizationId, companyId, { kind: "list_charts", status: "active" });
      const activeChart = records(charts).find((chart) => chart.status === "active");
      if (!activeChart || typeof activeChart.id !== "string") { setData([]); return; }
      const accounts = await client.query(organizationId, companyId, { kind: "find_accounts", chartId: activeChart.id });
      setData(records(accounts).filter((account) => account.kind === "detail" && account.isActive === true) as unknown as LedgerAccountReadModel[]);
    } catch {
      setData([]);
      notify.error("No se pudieron cargar las cuentas activas del plan de cuentas.");
    } finally {
      setLoading(false);
    }
  }, [client, companyId, organizationId]);

  useEffect(() => { void reload(); }, [reload]);
  return { data, loading, reload };
}

function records(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
