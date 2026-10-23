import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ProductTaxAssignmentSummary, ProductTaxAssignmentSummaryReader, TaxationContext } from "../../application";
import { taxationDate, TaxationFailure, type TaxationDate } from "../../domain";

const count = z.number().int().nonnegative();
const summary = z.object({
  on: z.string(),
  activeProducts: count,
  unassigned: count,
  legacyMismatch: count,
  groups: z.array(z.object({
    treatment: z.enum(["taxed", "zero_rated", "exempt", "exonerated", "not_subject"]),
    category: z.enum(["general", "reduced", "zero_rated", "luxury_surcharge", "payment_surcharge", "other"]).nullable(),
    products: count,
  })),
});

/** Service-role RPC adapter for product IVA assignment counts. */
export class SupabaseProductTaxAssignmentSummaryReader implements ProductTaxAssignmentSummaryReader {
  /**
   * Creates the reader.
   * @param client - Server-only Supabase client.
   * @param tenantId - Tenant that owns the company, resolved by the server composition root.
   * @throws {TaxationFailure} When the client or tenant is missing.
   */
  constructor(private readonly client: SupabaseClient, private readonly tenantId: string) {
    if (!client || !tenantId.trim()) throw new TaxationFailure("TAXATION_REPOSITORY_UNAVAILABLE", "Product tax assignment summary needs a server client and tenant.");
  }
  /** {@inheritDoc ProductTaxAssignmentSummaryReader.summarize} */
  async summarize(context: TaxationContext, on: TaxationDate): Promise<ProductTaxAssignmentSummary> {
    const { data, error } = await this.client.rpc("shared_product_tax_assignment_summary", { p_tenant_id: this.tenantId, p_organization_id: context.organizationId, p_company_id: context.companyId, p_actor_id: context.actorUserId, p_on: on });
    if (error) {
      // Organization security assertions report missing permission or a company outside the actor's scope.
      if (/ORGANIZATIONAL_USER_|TAXATION_COMPANY_OUTSIDE_ORGANIZATION/.test(error.message)) throw new TaxationFailure("TAXATION_ACCESS_DENIED", "The actor cannot read this company's product taxation.");
      throw new TaxationFailure("TAXATION_REPOSITORY_UNAVAILABLE", "Product tax assignment summary is unavailable.", { cause: error });
    }
    const parsed = summary.safeParse(data);
    if (!parsed.success) throw new TaxationFailure("TAXATION_REPOSITORY_UNAVAILABLE", "Product tax assignment summary returned invalid data.", { cause: parsed.error });
    return Object.freeze({ ...parsed.data, on: taxationDate(parsed.data.on), groups: Object.freeze(parsed.data.groups.map((group) => Object.freeze({ ...group }))) });
  }
}
