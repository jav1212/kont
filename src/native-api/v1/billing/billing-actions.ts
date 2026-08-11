import { GetBillingEntitlements, GetBillingOverview, GetBillingUsage, ListBillingInvoices, ListBillingPaymentMethods, ListBillingSubscriptions, type OrganizationBillingAccess } from "@kontave/billing-application";
import { createOrganizationBillingRepository } from "@kontave/billing-supabase";
import { createOrganizationsDirectory } from "@kontave/organizations-supabase";
import type { OrganizationId, UserId } from "@kontave/organizations-domain";

export function createBillingActions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Native billing infrastructure is not configured.");
  const repository = createOrganizationBillingRepository({ url, serviceRoleKey });
  const organizations = createOrganizationsDirectory({ url, serviceRoleKey });
  const access: OrganizationBillingAccess = {
    async findActiveRole(userId: UserId, organizationId: OrganizationId) {
      const result = await organizations.findAccess(userId, organizationId);
      if (!result || result.organization.status !== "active" || result.membership.status !== "active") return null;
      return result.membership.role;
    },
  };
  return {
    overview: new GetBillingOverview(repository, access),
    subscriptions: new ListBillingSubscriptions(repository, access),
    entitlements: new GetBillingEntitlements(repository, access),
    usage: new GetBillingUsage(repository, access),
    invoices: new ListBillingInvoices(repository, access),
    paymentMethods: new ListBillingPaymentMethods(repository, access),
  };
}
