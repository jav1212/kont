import { PERMISSIONS, permissionCode, type AuthorizationSource, type PermissionCode } from "@kontave/access-control-domain";
import { BillingCreditEntryType, BillingFailure, type BillingAccount, type BillingCreditApplication, type BillingCreditBalance, type BillingOverview, type Invoice, type Money, type OrganizationEntitlements, type OrganizationUsage, type PaymentMethod, type Subscription } from "@kontave/billing-domain";
import type { OrganizationId, UserId } from "@kontave/organizations-domain";

export interface BillingAuthorizationContext { readonly requestId: string; readonly source: AuthorizationSource; readonly occurredAt: string }
export interface OrganizationBillingAuthorization {
  require(input: { readonly userId: UserId; readonly organizationId: OrganizationId; readonly permission: PermissionCode; readonly resourceType: "billing"; readonly context: BillingAuthorizationContext }): Promise<void>;
}
export interface OrganizationBillingRepository {
  findAccount(organizationId: OrganizationId): Promise<BillingAccount | null>;
  listSubscriptions(organizationId: OrganizationId): Promise<readonly Subscription[]>;
  getEntitlements(organizationId: OrganizationId): Promise<OrganizationEntitlements>;
  getUsage(organizationId: OrganizationId, entitlements: OrganizationEntitlements): Promise<OrganizationUsage>;
  listInvoices(organizationId: OrganizationId): Promise<readonly Invoice[]>;
  listPaymentMethods(organizationId: OrganizationId): Promise<readonly PaymentMethod[]>;
}
export interface BillingCreditLedgerRepository {
  getBalance(organizationId: OrganizationId): Promise<BillingCreditBalance>;
  issue(input: { organizationId: OrganizationId; type: BillingCreditEntryType; amount: Money; sourceType: string; sourceId: string; idempotencyKey: string; occurredAt: string }): Promise<void>;
  apply(input: { organizationId: OrganizationId; invoiceId: string; amount: Money; idempotencyKey: string; occurredAt: string }): Promise<BillingCreditApplication>;
}

export class GetBillingCreditBalance {
  constructor(private readonly ledger: BillingCreditLedgerRepository) {}
  execute(organizationId: OrganizationId) { return this.ledger.getBalance(organizationId); }
}

export class ApplyBillingCredit {
  constructor(private readonly ledger: BillingCreditLedgerRepository) {}
  execute(input: { organizationId: OrganizationId; invoiceId: string; amount: Money; idempotencyKey: string; occurredAt: string }) {
    if (input.amount.minorAmount <= BigInt(0)) {
      throw new BillingFailure("BILLING_CREDIT_INSUFFICIENT", "El crédito aplicado debe ser mayor que cero.");
    }
    return this.ledger.apply(input);
  }
}
abstract class AuthorizedBillingUseCase {
  constructor(protected readonly repository: OrganizationBillingRepository, private readonly authorization: OrganizationBillingAuthorization) {}
  protected authorize(userId: UserId, organizationId: OrganizationId, permission: PermissionCode, context: BillingAuthorizationContext) {
    return this.authorization.require({ userId, organizationId, permission, resourceType: "billing", context });
  }
}
export class GetBillingOverview extends AuthorizedBillingUseCase {
  async execute(userId: UserId, organizationId: OrganizationId, context: BillingAuthorizationContext): Promise<BillingOverview> {
    await this.authorize(userId, organizationId, permissionCode(PERMISSIONS.BILLING_READ), context);
    const account = await this.repository.findAccount(organizationId);
    if (!account) throw new BillingFailure("BILLING_ACCOUNT_NOT_FOUND", "La organización no tiene una cuenta de facturación.");
    const [subscriptions, entitlements] = await Promise.all([this.repository.listSubscriptions(organizationId), this.repository.getEntitlements(organizationId)]);
    return { account, subscriptions, entitlements, usage: await this.repository.getUsage(organizationId, entitlements) };
  }
}
export class ListBillingInvoices extends AuthorizedBillingUseCase {
  async execute(userId: UserId, organizationId: OrganizationId, context: BillingAuthorizationContext) { await this.authorize(userId, organizationId, permissionCode(PERMISSIONS.BILLING_INVOICES_READ), context); return this.repository.listInvoices(organizationId); }
}
export class ListBillingSubscriptions extends AuthorizedBillingUseCase {
  async execute(userId: UserId, organizationId: OrganizationId, context: BillingAuthorizationContext) { await this.authorize(userId, organizationId, permissionCode(PERMISSIONS.BILLING_READ), context); return this.repository.listSubscriptions(organizationId); }
}
export class GetBillingEntitlements extends AuthorizedBillingUseCase {
  async execute(userId: UserId, organizationId: OrganizationId, context: BillingAuthorizationContext) { await this.authorize(userId, organizationId, permissionCode(PERMISSIONS.BILLING_READ), context); return this.repository.getEntitlements(organizationId); }
}
export class GetBillingUsage extends AuthorizedBillingUseCase {
  async execute(userId: UserId, organizationId: OrganizationId, context: BillingAuthorizationContext) { await this.authorize(userId, organizationId, permissionCode(PERMISSIONS.BILLING_READ), context); const entitlements = await this.repository.getEntitlements(organizationId); return this.repository.getUsage(organizationId, entitlements); }
}
export class ListBillingPaymentMethods extends AuthorizedBillingUseCase {
  async execute(userId: UserId, organizationId: OrganizationId, context: BillingAuthorizationContext) { await this.authorize(userId, organizationId, permissionCode(PERMISSIONS.BILLING_PAYMENT_METHODS_READ), context); return this.repository.listPaymentMethods(organizationId); }
}
