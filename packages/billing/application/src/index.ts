import { BillingFailure, type BillingAccount, type BillingOverview, type Invoice, type OrganizationEntitlements, type OrganizationUsage, type PaymentMethod, type Subscription } from "@kontave/billing-domain";
import type { OrganizationId, OrganizationRole, UserId } from "@kontave/organizations-domain";

export interface OrganizationBillingAccess {
  findActiveRole(userId: UserId, organizationId: OrganizationId): Promise<OrganizationRole | null>;
}
export interface OrganizationBillingRepository {
  findAccount(organizationId: OrganizationId): Promise<BillingAccount | null>;
  listSubscriptions(organizationId: OrganizationId): Promise<readonly Subscription[]>;
  getEntitlements(organizationId: OrganizationId): Promise<OrganizationEntitlements>;
  getUsage(organizationId: OrganizationId, entitlements: OrganizationEntitlements): Promise<OrganizationUsage>;
  listInvoices(organizationId: OrganizationId): Promise<readonly Invoice[]>;
  listPaymentMethods(organizationId: OrganizationId): Promise<readonly PaymentMethod[]>;
}

export class GetBillingOverview {
  constructor(private readonly repository: OrganizationBillingRepository, private readonly access: OrganizationBillingAccess) {}
  async execute(userId: UserId, organizationId: OrganizationId): Promise<BillingOverview> {
    await requireRole(this.access, userId, organizationId);
    const account = await this.repository.findAccount(organizationId);
    if (!account) throw new BillingFailure("BILLING_ACCOUNT_NOT_FOUND", "La organización no tiene una cuenta de facturación.");
    const [subscriptions, entitlements] = await Promise.all([
      this.repository.listSubscriptions(organizationId),
      this.repository.getEntitlements(organizationId),
    ]);
    const usage = await this.repository.getUsage(organizationId, entitlements);
    return { account, subscriptions, entitlements, usage };
  }
}
export class ListBillingInvoices {
  constructor(private readonly repository: OrganizationBillingRepository, private readonly access: OrganizationBillingAccess) {}
  async execute(userId: UserId, organizationId: OrganizationId): Promise<readonly Invoice[]> {
    const role = await requireRole(this.access, userId, organizationId);
    if (!(["owner", "admin", "accountant"] as OrganizationRole[]).includes(role)) deny();
    return this.repository.listInvoices(organizationId);
  }
}
export class ListBillingSubscriptions {
  constructor(private readonly repository: OrganizationBillingRepository, private readonly access: OrganizationBillingAccess) {}
  async execute(userId: UserId, organizationId: OrganizationId): Promise<readonly Subscription[]> {
    await requireRole(this.access, userId, organizationId);
    return this.repository.listSubscriptions(organizationId);
  }
}
export class GetBillingEntitlements {
  constructor(private readonly repository: OrganizationBillingRepository, private readonly access: OrganizationBillingAccess) {}
  async execute(userId: UserId, organizationId: OrganizationId): Promise<OrganizationEntitlements> {
    await requireRole(this.access, userId, organizationId);
    return this.repository.getEntitlements(organizationId);
  }
}
export class GetBillingUsage {
  constructor(private readonly repository: OrganizationBillingRepository, private readonly access: OrganizationBillingAccess) {}
  async execute(userId: UserId, organizationId: OrganizationId): Promise<OrganizationUsage> {
    await requireRole(this.access, userId, organizationId);
    const entitlements = await this.repository.getEntitlements(organizationId);
    return this.repository.getUsage(organizationId, entitlements);
  }
}
export class ListBillingPaymentMethods {
  constructor(private readonly repository: OrganizationBillingRepository, private readonly access: OrganizationBillingAccess) {}
  async execute(userId: UserId, organizationId: OrganizationId): Promise<readonly PaymentMethod[]> {
    const role = await requireRole(this.access, userId, organizationId);
    if (role !== "owner" && role !== "admin") deny();
    return this.repository.listPaymentMethods(organizationId);
  }
}

async function requireRole(access: OrganizationBillingAccess, userId: UserId, organizationId: OrganizationId): Promise<OrganizationRole> {
  const role = await access.findActiveRole(userId, organizationId);
  if (!role) deny();
  return role;
}
function deny(): never {
  throw new BillingFailure("BILLING_ACCESS_DENIED", "No tienes acceso a la facturación de esta organización.");
}
