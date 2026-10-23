"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { TreasuryCommandRequest, TreasuryPageDto, TreasuryQueryRequest, TreasuryReadRow } from "@kontave/client-contracts";
import type { RemoteTreasuryPort } from "@kontave/client-remote";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";
import { createWebTreasuryClient, recordWebCheckDeliveries, type WebCheckDeliveryBatchItem, type WebCheckDeliveryBatchOutcome } from "../treasury-client";

interface TreasuryContextValue {
  readonly client: RemoteTreasuryPort;
  readonly organizationId: string | null;
  readonly companyId: string | null;
  readonly revision: number;
  readonly catalogRevision: number;
  readonly query: <T extends TreasuryReadRow>(request: TreasuryQueryRequest) => Promise<Omit<TreasuryPageDto, "items"> & { readonly items: readonly T[] }>;
  readonly command: (request: TreasuryCommandRequest) => Promise<void>;
  readonly deliverChecks: (items: readonly WebCheckDeliveryBatchItem[]) => Promise<readonly WebCheckDeliveryBatchOutcome[]>;
  readonly invalidate: (catalogs?: boolean) => void;
}

const TreasuryContext = createContext<TreasuryContextValue | null>(null);
/** Commands that leave account, checkbook and beneficiary versions untouched; every other command can
 * write a ledger entry (whose trigger bumps the account version) or advance a checkbook folio. */
const CATALOG_NEUTRAL_COMMANDS: ReadonlySet<TreasuryCommandRequest["kind"]> = new Set([
  "import_bank_statement", "configure_reconciliation", "preview_reconciliation_rule", "activate_reconciliation_rule",
  "reconcile_manually", "undo_reconciliation_match", "run_automatic_reconciliation", "close_reconciliation",
  "configure_bank_debit_tax_policy", "record_check_delivery", "undo_check_delivery",
]);

/** Provides one authenticated Treasury client and invalidation clock per committed workspace.
 * @param props - Treasury route subtree.
 * @returns Children with access to the selected organization and company Treasury boundary.
 * @throws Error when the global company or organization providers are missing.
 */
export function TreasuryClientProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const { companyId } = useCompany();
  const { organization } = useOrganization();
  const [revision, setRevision] = useState(0);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const { port: client, batchTransport } = useMemo(() => createWebTreasuryClient(async () =>
    (await getSupabaseBrowser().auth.getSession()).data.session?.access_token ?? null,
  ), []);
  const invalidate = useCallback((catalogs = false) => {
    setRevision((current) => current + 1);
    if (catalogs) setCatalogRevision((current) => current + 1);
  }, []);
  const query = useCallback(async <T extends TreasuryReadRow>(request: TreasuryQueryRequest) => {
    if (!organization || !companyId) throw new Error("Selecciona una organización y empresa para consultar Tesorería.");
    const page = await client.query(organization.id, companyId, request);
    return { ...page, items: page.items as readonly T[] };
  }, [client, companyId, organization]);
  const command = useCallback(async (request: TreasuryCommandRequest) => {
    if (!organization || !companyId) throw new Error("Selecciona una organización y empresa para operar Tesorería.");
    await client.command(organization.id, companyId, request);
    invalidate(!CATALOG_NEUTRAL_COMMANDS.has(request.kind));
  }, [client, companyId, invalidate, organization]);
  const deliverChecks = useCallback(async (items: readonly WebCheckDeliveryBatchItem[]) => {
    if (!organization || !companyId) throw new Error("Selecciona una organización y empresa para operar Tesorería.");
    try {
      return await recordWebCheckDeliveries(batchTransport, organization.id, companyId, items);
    } finally {
      // Items commit independently, so views refresh even when the batch response is lost.
      invalidate();
    }
  }, [batchTransport, companyId, invalidate, organization]);
  const value = useMemo(() => ({ client, organizationId: organization?.id ?? null, companyId, revision, catalogRevision, query, command, deliverChecks, invalidate }), [client, organization, companyId, revision, catalogRevision, query, command, deliverChecks, invalidate]);
  return <TreasuryContext.Provider value={value}>{children}</TreasuryContext.Provider>;
}

/** Reads the active Treasury boundary from its route layout.
 * @returns The authenticated client, scope identifiers, read/write functions and invalidation revisions.
 * @throws Error when rendered outside TreasuryClientProvider.
 */
export function useTreasuryContext(): TreasuryContextValue {
  const value = useContext(TreasuryContext);
  if (!value) throw new Error("useTreasuryContext requiere TreasuryClientProvider.");
  return value;
}
