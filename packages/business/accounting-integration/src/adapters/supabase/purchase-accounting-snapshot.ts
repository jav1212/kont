import {
  parsePurchaseAccountingVes,
  type ConfirmedPurchaseAccountingSnapshot,
  type PurchaseAccountingSnapshotQuery,
  type PurchaseAccountingSnapshotReader,
} from "../../application";
import { AccountingIntegrationFailure } from "../../domain";

/** Minimal RPC transport implemented by a service-role Supabase client. */
export interface PurchaseAccountingSupabaseSource {
  /**
   * Calls a native purchase-accounting RPC.
   * @param name - Authorized RPC name.
   * @param values - RPC arguments.
   * @returns The RPC data or an error returned by Supabase.
   */
  rpc(name: string, values: Record<string, unknown>): PromiseLike<{ data: unknown; error: { readonly message?: string; readonly code?: string } | null }>;
}

/** Supabase-backed reader for a PII-free confirmed purchase accounting snapshot. */
export class SupabasePurchaseAccountingSnapshotReader implements PurchaseAccountingSnapshotReader {
  /**
   * Creates the source adapter.
   * @param source - Service-only Supabase RPC transport. SQL performs authorization and confirmation checks.
   * @returns A reader for the native purchase-accounting snapshot contract.
   */
  public constructor(private readonly source: PurchaseAccountingSupabaseSource) {}

  /** {@inheritDoc PurchaseAccountingSnapshotReader.readConfirmed} */
  public async readConfirmed(query: PurchaseAccountingSnapshotQuery): Promise<ConfirmedPurchaseAccountingSnapshot> {
    let result: { data: unknown; error: { readonly message?: string; readonly code?: string } | null };
    try {
      result = await this.source.rpc("get_native_purchase_accounting_snapshot", {
        p_actor_id: query.actorId,
        p_organization_id: query.organizationId,
        p_company_id: query.companyId,
        p_invoice_id: query.purchaseInvoiceId,
      });
    } catch (cause) {
      throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", "Purchase accounting source is unavailable.", { cause });
    }
    if (result.error) throw mapRpcFailure(result.error);
    return decode(result.data);
  }
}

function decode(value: unknown): ConfirmedPurchaseAccountingSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", "Purchase accounting RPC returned malformed evidence.");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.tenantId !== "string" || typeof row.organizationId !== "string" ||
    typeof row.companyId !== "string" || typeof row.invoiceId !== "string" ||
    typeof row.sourceVersion !== "number" || !Number.isSafeInteger(row.sourceVersion) || row.sourceVersion < 1 ||
    typeof row.effectiveDate !== "string" || typeof row.confirmedAt !== "string" ||
    typeof row.movementCount !== "number" || !Number.isSafeInteger(row.movementCount) ||
    (row.documentCurrency !== "VES" && row.documentCurrency !== "USD")
  ) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", "Purchase accounting RPC returned malformed evidence.");
  }
  return Object.freeze({
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    companyId: row.companyId,
    invoiceId: row.invoiceId,
    sourceVersion: row.sourceVersion,
    effectiveDate: row.effectiveDate,
    confirmedAt: row.confirmedAt,
    movementCount: row.movementCount,
    recognizedInventoryCost: parsePurchaseAccountingVes(row.recognizedInventoryCost, "Recognized inventory cost"),
    documentCurrency: row.documentCurrency,
  });
}

function mapRpcFailure(error: { readonly message?: string; readonly code?: string }): AccountingIntegrationFailure {
  const text = error.message ?? "Purchase accounting source is unavailable.";
  if (/ACCESS_DENIED|permission denied/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_ACCESS_DENIED", "Purchase accounting source access was denied.", { cause: error });
  if (/NOT_CONFIRMED|NOT_FOUND|PURCHASE_ACCOUNTING_SNAPSHOT_NOT_CONFIRMED/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_NOT_CONFIRMED", "Purchase invoice is not confirmed or does not exist in the requested scope.", { cause: error });
  if (/FRACTIONAL_CENT/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_AMOUNT_INVALID", "Purchase inventory cost has fractions below one cent and cannot be posted without an explicit source remediation.", { cause: error });
  if (/INVALID|UNSUPPORTED|EMPTY/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", "Purchase accounting source rejected the requested scope or contents.", { cause: error });
  return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", "Purchase accounting source is unavailable.", { cause: error });
}
