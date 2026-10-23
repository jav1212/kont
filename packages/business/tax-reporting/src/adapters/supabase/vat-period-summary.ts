import type { SupabaseClient } from "@supabase/supabase-js";
import { TaxReportingFailure } from "../../domain/tax-reporting-failure";
import type { TaxReportingScope } from "../../domain/tax-reporting-fact";
import { GetVatPeriodSummary, type VatPeriodSummary, type VatPeriodSummaryReader } from "../../application/get-vat-period-summary";

/** Service-role adapter for company-scoped VAT period totals. */
export class SupabaseVatPeriodSummaryReader implements VatPeriodSummaryReader {
  /**
   * Creates the reader over a server Supabase client.
   * @param client - Service-role client that calls restricted reporting RPCs.
   * @throws {TaxReportingFailure} When the client is absent.
   */
  constructor(private readonly client: SupabaseClient) { if (!client) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Tax reporting needs a server database client."); }
  /** {@inheritDoc VatPeriodSummaryReader.read} */
  async read(input: { readonly scope: TaxReportingScope; readonly actorId: string; readonly period: string; readonly includePurchases: boolean; readonly includeSales: boolean }): Promise<VatPeriodSummary> {
    const { data, error } = await this.client.rpc("shared_tax_reporting_period_summary", {
      p_tenant_id: input.scope.tenantId, p_organization_id: input.scope.organizationId,
      p_company_id: input.scope.companyId, p_actor_id: input.actorId, p_period: input.period,
      p_include_purchases: input.includePurchases, p_include_sales: input.includeSales,
    });
    if (error) throw new TaxReportingFailure(error.code === "PGRST202" ? "TAX_REPORTING_UNAVAILABLE" : "TAX_REPORTING_INVALID", error.message);
    if (!isSummary(data) || data.period !== input.period) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "VAT period summary response is malformed.");
    return data;
  }
}

/** Creates the period-summary query action with its Supabase persistence adapter.
 * @param client - Server-side Supabase client.
 * @returns Period summary use case.
 */
export function createSupabaseVatPeriodSummary(client: SupabaseClient): GetVatPeriodSummary {
  // Kept in this adapter module so callers cannot pair the use case with an unscoped transport.
  const reader = new SupabaseVatPeriodSummaryReader(client);
  return new GetVatPeriodSummary(reader);
}
function isSummary(value: unknown): value is VatPeriodSummary {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && "period" in value && typeof value.period === "string" && "totals" in value && Array.isArray(value.totals)
    && "rateTotals" in value && Array.isArray(value.rateTotals) && "reconciliationCounts" in value && typeof value.reconciliationCounts === "object" && value.reconciliationCounts !== null
    && "legacyUnincorporated" in value && typeof value.legacyUnincorporated === "object" && value.legacyUnincorporated !== null;
}
