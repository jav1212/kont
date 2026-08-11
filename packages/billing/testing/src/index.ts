import type { OrganizationBillingAccess, OrganizationBillingRepository } from "@kontave/billing-application";
import { limit, type BillingAccount, type Invoice, type OrganizationEntitlements, type OrganizationUsage, type PaymentMethod, type Subscription } from "@kontave/billing-domain";
import type { OrganizationId, OrganizationRole, UserId } from "@kontave/organizations-domain";

export class FixedBillingAccess implements OrganizationBillingAccess {
  constructor(private readonly role: OrganizationRole | null) {}
  async findActiveRole(_userId: UserId, _organizationId: OrganizationId) { return this.role; }
}
export class InMemoryOrganizationBillingRepository implements OrganizationBillingRepository {
  constructor(
    readonly account: BillingAccount | null,
    readonly subscriptions: readonly Subscription[] = [],
    readonly entitlements: OrganizationEntitlements = { maxCompanies: null, maxMembers: null, maxDevices: null, enabledModules: [] },
    readonly invoices: readonly Invoice[] = [],
    readonly paymentMethods: readonly PaymentMethod[] = [],
  ) {}
  async findAccount() { return this.account; }
  async listSubscriptions() { return this.subscriptions; }
  async getEntitlements() { return this.entitlements; }
  async getUsage(_organizationId: OrganizationId, entitlements: OrganizationEntitlements): Promise<OrganizationUsage> {
    return { companies: limit(0, entitlements.maxCompanies), members: limit(0, entitlements.maxMembers), devices: limit(0, entitlements.maxDevices) };
  }
  async listInvoices() { return this.invoices; }
  async listPaymentMethods() { return this.paymentMethods; }
}
