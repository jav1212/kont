import { GetBillingEntitlements, GetBillingOverview, GetBillingUsage, ListBillingInvoices, ListBillingPaymentMethods, ListBillingSubscriptions, type OrganizationBillingAuthorization } from "@kontave/billing-application";
import { createSupabaseAuthorization } from "@kontave/access-control-supabase";
import { createOrganizationBillingRepository } from "@kontave/billing-supabase";

export function createBillingActions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Native billing infrastructure is not configured.");
  const repository = createOrganizationBillingRepository({ url, serviceRoleKey });
  const authorizationService = createSupabaseAuthorization({ url, serviceRoleKey });
  const authorization: OrganizationBillingAuthorization = {
    async require(input) {
      await authorizationService.require.execute({ actor: { userId: input.userId, organizationId: input.organizationId }, permission: input.permission, resource: { type: input.resourceType, organizationId: input.organizationId }, context: input.context });
    },
  };
  return {
    overview: new GetBillingOverview(repository, authorization),
    subscriptions: new ListBillingSubscriptions(repository, authorization),
    entitlements: new GetBillingEntitlements(repository, authorization),
    usage: new GetBillingUsage(repository, authorization),
    invoices: new ListBillingInvoices(repository, authorization),
    paymentMethods: new ListBillingPaymentMethods(repository, authorization),
  };
}
