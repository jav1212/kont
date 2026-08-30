import {
  PERMISSIONS,
  permissionCode,
  type AuthorizationSource,
  type PermissionCode,
} from "@kontave/access-control/domain";
import {
  BillingCreditEntryType,
  BillingCycle,
  BillingFailure,
  ManualPaymentMethod,
  type BillingAccount,
  type BillingCreditApplication,
  type BillingCreditBalance,
  type BillingOverview,
  type BillingPlan,
  type Invoice,
  type ManualPaymentRequest,
  type Money,
  type OrganizationEntitlements,
  type OrganizationUsage,
  type PaymentMethod,
  type PaymentReceiptUpload,
  type Subscription,
} from "@kontave/billing-domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";

/** Audit context attached to every billing authorization decision. */
export interface BillingAuthorizationContext {
  readonly requestId: string;
  readonly source: AuthorizationSource;
  readonly occurredAt: string;
}

/** Authorization port for organization-owned billing operations. */
export interface OrganizationBillingAuthorization {
  /** @returns A promise completed when the actor has the required permission. */
  require(input: {
    readonly userId: UserId;
    readonly organizationId: OrganizationId;
    readonly permission: PermissionCode;
    readonly resourceType: "billing";
    readonly context: BillingAuthorizationContext;
  }): Promise<void>;
}

/** Persistence and query port owned by the billing application layer. */
export interface OrganizationBillingRepository {
  /** @returns The organization's account, or `null` when it has not been provisioned. */
  findAccount(organizationId: OrganizationId): Promise<BillingAccount | null>;
  /** @returns Subscription snapshots owned by the organization. */
  listSubscriptions(organizationId: OrganizationId): Promise<readonly Subscription[]>;
  /** @returns Effective commercial entitlements for the organization. */
  getEntitlements(organizationId: OrganizationId): Promise<OrganizationEntitlements>;
  /** @returns Current usage calculated against effective entitlements. */
  getUsage(
    organizationId: OrganizationId,
    entitlements: OrganizationEntitlements,
  ): Promise<OrganizationUsage>;
  /** @returns Invoices owned by the organization. */
  listInvoices(organizationId: OrganizationId): Promise<readonly Invoice[]>;
  /** @returns Active payment methods owned by the organization. */
  listPaymentMethods(organizationId: OrganizationId): Promise<readonly PaymentMethod[]>;
  /** @returns Commercial plans available for self-service selection. */
  listPlans(): Promise<readonly BillingPlan[]>;
  /** @returns Manual payment requests owned by the organization. */
  listManualPaymentRequests(organizationId: OrganizationId): Promise<readonly ManualPaymentRequest[]>;
  /** @returns The authoritative manual payment request created by persistence. */
  createManualPaymentRequest(input: {
    readonly organizationId: OrganizationId;
    readonly planId: string;
    readonly billingCycle: BillingCycle;
    readonly paymentMethod: Exclude<ManualPaymentMethod, ManualPaymentMethod.Credit>;
    readonly receiptStorageKey: string | null;
  }): Promise<ManualPaymentRequest>;
}

/** Object-storage port for manual-payment receipts. */
export interface PaymentReceiptStorage {
  /** @returns A signed upload URL and its organization-scoped storage key. */
  createUpload(input: {
    readonly organizationId: OrganizationId;
    readonly fileName: string;
    readonly contentType: string;
  }): Promise<PaymentReceiptUpload>;
}

/** Persistence port for the append-only billing-credit ledger. */
export interface BillingCreditLedgerRepository {
  /** @returns The current credit balance for an organization. */
  getBalance(organizationId: OrganizationId): Promise<BillingCreditBalance>;
  /** @returns A promise completed after issuing an idempotent credit entry. */
  issue(input: {
    organizationId: OrganizationId;
    type: BillingCreditEntryType;
    amount: Money;
    sourceType: string;
    sourceId: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<void>;
  /** @returns The authoritative application of credit to an invoice. */
  apply(input: {
    organizationId: OrganizationId;
    invoiceId: string;
    amount: Money;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<BillingCreditApplication>;
}

/** Retrieves an organization's billing-credit balance. */
export class GetBillingCreditBalance {
  /** @param ledger - Billing-credit persistence port. */
  constructor(private readonly ledger: BillingCreditLedgerRepository) {}

  /**
   * @param organizationId - Organization whose balance is requested.
   * @returns The current credit balance.
   * @throws {BillingFailure} When persistence is unavailable.
   */
  execute(organizationId: OrganizationId): Promise<BillingCreditBalance> {
    return billingCall(() => this.ledger.getBalance(organizationId));
  }
}

/** Applies a positive billing-credit amount to an invoice. */
export class ApplyBillingCredit {
  /** @param ledger - Billing-credit persistence port. */
  constructor(private readonly ledger: BillingCreditLedgerRepository) {}

  /**
   * @param input - Invoice, positive amount and idempotency information.
   * @returns The recorded credit application.
   * @throws {BillingFailure} When the amount is zero, insufficient or persistence fails.
   */
  execute(input: {
    organizationId: OrganizationId;
    invoiceId: string;
    amount: Money;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<BillingCreditApplication> {
    if (input.amount.minorAmount <= 0n) {
      throw new BillingFailure("BILLING_CREDIT_INSUFFICIENT", "El crédito aplicado debe ser mayor que cero.");
    }
    return billingCall(() => this.ledger.apply(input));
  }
}

abstract class AuthorizedBillingUseCase {
  constructor(
    protected readonly repository: OrganizationBillingRepository,
    private readonly authorization: OrganizationBillingAuthorization,
  ) {}

  protected authorize(
    userId: UserId,
    organizationId: OrganizationId,
    permission: PermissionCode,
    context: BillingAuthorizationContext,
  ): Promise<void> {
    return this.authorization.require({
      userId,
      organizationId,
      permission,
      resourceType: "billing",
      context,
    });
  }
}

/** Loads the account, subscriptions, entitlements and usage for billing presentation. */
export class GetBillingOverview extends AuthorizedBillingUseCase {
  /**
   * @param repository - Organization billing persistence port.
   * @param authorization - Billing authorization port.
   */
  constructor(repository: OrganizationBillingRepository, authorization: OrganizationBillingAuthorization) {
    super(repository, authorization);
  }

  /**
   * @param userId - Actor requesting billing data.
   * @param organizationId - Organization whose overview is requested.
   * @param context - Authorization audit context.
   * @returns The complete billing overview.
   * @throws {BillingFailure} When the account is absent or persistence fails.
   */
  async execute(
    userId: UserId,
    organizationId: OrganizationId,
    context: BillingAuthorizationContext,
  ): Promise<BillingOverview> {
    await this.authorize(userId, organizationId, permissionCode(PERMISSIONS.BILLING_READ), context);
    return billingCall(async () => {
      const account = await this.repository.findAccount(organizationId);
      if (!account) {
        throw new BillingFailure(
          "BILLING_ACCOUNT_NOT_FOUND",
          "La organización no tiene una cuenta de facturación.",
        );
      }
      const [subscriptions, entitlements] = await Promise.all([
        this.repository.listSubscriptions(organizationId),
        this.repository.getEntitlements(organizationId),
      ]);
      const usage = await this.repository.getUsage(organizationId, entitlements);
      return { account, subscriptions, entitlements, usage };
    });
  }
}

/** Lists invoices after enforcing the explicit invoice-read permission. */
export class ListBillingInvoices extends AuthorizedBillingUseCase {
  /**
   * @param repository - Organization billing persistence port.
   * @param authorization - Billing authorization port.
   */
  constructor(repository: OrganizationBillingRepository, authorization: OrganizationBillingAuthorization) {
    super(repository, authorization);
  }

  /**
   * @param userId - Actor requesting invoices.
   * @param organizationId - Owning organization.
   * @param context - Authorization audit context.
   * @returns Organization invoices.
   * @throws {BillingFailure} When persistence fails.
   */
  async execute(
    userId: UserId,
    organizationId: OrganizationId,
    context: BillingAuthorizationContext,
  ): Promise<readonly Invoice[]> {
    await this.authorize(
      userId,
      organizationId,
      permissionCode(PERMISSIONS.BILLING_INVOICES_READ),
      context,
    );
    return billingCall(() => this.repository.listInvoices(organizationId));
  }
}

/** Lists subscriptions after enforcing billing-read permission. */
export class ListBillingSubscriptions extends AuthorizedBillingUseCase {
  /**
   * @param repository - Organization billing persistence port.
   * @param authorization - Billing authorization port.
   */
  constructor(repository: OrganizationBillingRepository, authorization: OrganizationBillingAuthorization) {
    super(repository, authorization);
  }

  /**
   * @param userId - Actor requesting subscriptions.
   * @param organizationId - Owning organization.
   * @param context - Authorization audit context.
   * @returns Organization subscriptions.
   * @throws {BillingFailure} When persistence fails.
   */
  async execute(
    userId: UserId,
    organizationId: OrganizationId,
    context: BillingAuthorizationContext,
  ): Promise<readonly Subscription[]> {
    await this.authorize(userId, organizationId, permissionCode(PERMISSIONS.BILLING_READ), context);
    return billingCall(() => this.repository.listSubscriptions(organizationId));
  }
}

/** Retrieves effective organization billing entitlements. */
export class GetBillingEntitlements extends AuthorizedBillingUseCase {
  /**
   * @param repository - Organization billing persistence port.
   * @param authorization - Billing authorization port.
   */
  constructor(repository: OrganizationBillingRepository, authorization: OrganizationBillingAuthorization) {
    super(repository, authorization);
  }

  /**
   * @param userId - Actor requesting entitlements.
   * @param organizationId - Owning organization.
   * @param context - Authorization audit context.
   * @returns Effective billing entitlements.
   * @throws {BillingFailure} When persistence fails.
   */
  async execute(
    userId: UserId,
    organizationId: OrganizationId,
    context: BillingAuthorizationContext,
  ): Promise<OrganizationEntitlements> {
    await this.authorize(userId, organizationId, permissionCode(PERMISSIONS.BILLING_READ), context);
    return billingCall(() => this.repository.getEntitlements(organizationId));
  }
}

/** Calculates organization usage against its current entitlements. */
export class GetBillingUsage extends AuthorizedBillingUseCase {
  /**
   * @param repository - Organization billing persistence port.
   * @param authorization - Billing authorization port.
   */
  constructor(repository: OrganizationBillingRepository, authorization: OrganizationBillingAuthorization) {
    super(repository, authorization);
  }

  /**
   * @param userId - Actor requesting usage.
   * @param organizationId - Owning organization.
   * @param context - Authorization audit context.
   * @returns Current organization usage.
   * @throws {BillingFailure} When persistence fails.
   */
  async execute(
    userId: UserId,
    organizationId: OrganizationId,
    context: BillingAuthorizationContext,
  ): Promise<OrganizationUsage> {
    await this.authorize(userId, organizationId, permissionCode(PERMISSIONS.BILLING_READ), context);
    return billingCall(async () => {
      const entitlements = await this.repository.getEntitlements(organizationId);
      return this.repository.getUsage(organizationId, entitlements);
    });
  }
}

/** Lists active payment methods under their dedicated permission. */
export class ListBillingPaymentMethods extends AuthorizedBillingUseCase {
  /**
   * @param repository - Organization billing persistence port.
   * @param authorization - Billing authorization port.
   */
  constructor(repository: OrganizationBillingRepository, authorization: OrganizationBillingAuthorization) {
    super(repository, authorization);
  }

  /**
   * @param userId - Actor requesting payment methods.
   * @param organizationId - Owning organization.
   * @param context - Authorization audit context.
   * @returns Active payment methods.
   * @throws {BillingFailure} When persistence fails.
   */
  async execute(
    userId: UserId,
    organizationId: OrganizationId,
    context: BillingAuthorizationContext,
  ): Promise<readonly PaymentMethod[]> {
    await this.authorize(
      userId,
      organizationId,
      permissionCode(PERMISSIONS.BILLING_PAYMENT_METHODS_READ),
      context,
    );
    return billingCall(() => this.repository.listPaymentMethods(organizationId));
  }
}

/** Lists commercial plans available to an authorized organization actor. */
export class ListBillingPlans extends AuthorizedBillingUseCase {
  /**
   * @param repository - Organization billing persistence port.
   * @param authorization - Billing authorization port.
   */
  constructor(repository: OrganizationBillingRepository, authorization: OrganizationBillingAuthorization) {
    super(repository, authorization);
  }

  /**
   * @param userId - Actor requesting plans.
   * @param organizationId - Organization used for authorization.
   * @param context - Authorization audit context.
   * @returns Available commercial plans.
   * @throws {BillingFailure} When persistence fails.
   */
  async execute(
    userId: UserId,
    organizationId: OrganizationId,
    context: BillingAuthorizationContext,
  ): Promise<readonly BillingPlan[]> {
    await this.authorize(userId, organizationId, permissionCode(PERMISSIONS.BILLING_READ), context);
    return billingCall(() => this.repository.listPlans());
  }
}

/** Lists manual payment requests owned by an organization. */
export class ListManualPaymentRequests extends AuthorizedBillingUseCase {
  /**
   * @param repository - Organization billing persistence port.
   * @param authorization - Billing authorization port.
   */
  constructor(repository: OrganizationBillingRepository, authorization: OrganizationBillingAuthorization) {
    super(repository, authorization);
  }

  /**
   * @param userId - Actor requesting manual payments.
   * @param organizationId - Owning organization.
   * @param context - Authorization audit context.
   * @returns Manual payment requests.
   * @throws {BillingFailure} When persistence fails.
   */
  async execute(
    userId: UserId,
    organizationId: OrganizationId,
    context: BillingAuthorizationContext,
  ): Promise<readonly ManualPaymentRequest[]> {
    await this.authorize(
      userId,
      organizationId,
      permissionCode(PERMISSIONS.BILLING_INVOICES_READ),
      context,
    );
    return billingCall(() => this.repository.listManualPaymentRequests(organizationId));
  }
}

/** Submits self-service manual payment intent without calculating price client-side. */
export class SubmitManualPaymentRequest extends AuthorizedBillingUseCase {
  /**
   * @param repository - Organization billing persistence port.
   * @param authorization - Billing authorization port.
   */
  constructor(repository: OrganizationBillingRepository, authorization: OrganizationBillingAuthorization) {
    super(repository, authorization);
  }

  /**
   * @param userId - Actor submitting the request.
   * @param organizationId - Owning organization.
   * @param command - Plan, cycle, external payment method and optional receipt key.
   * @param context - Authorization audit context.
   * @returns The authoritative manual payment request.
   * @throws {BillingFailure} When validation or persistence fails.
   */
  async execute(
    userId: UserId,
    organizationId: OrganizationId,
    command: {
      readonly planId: string;
      readonly billingCycle: BillingCycle;
      readonly paymentMethod: string;
      readonly receiptStorageKey?: string | null;
    },
    context: BillingAuthorizationContext,
  ): Promise<ManualPaymentRequest> {
    await this.authorize(userId, organizationId, permissionCode(PERMISSIONS.BILLING_MANAGE), context);
    const planId = command.planId.trim();
    if (!planId || !Object.values(BillingCycle).includes(command.billingCycle)) {
      throw new BillingFailure(
        "BILLING_PAYMENT_REQUEST_INVALID",
        "El plan y ciclo de facturación son requeridos.",
      );
    }
    if (
      command.paymentMethod !== ManualPaymentMethod.Transfer
      && command.paymentMethod !== ManualPaymentMethod.Cash
    ) {
      throw new BillingFailure("BILLING_PAYMENT_REQUEST_INVALID", "El método de pago no es válido.");
    }
    const paymentMethod = command.paymentMethod;
    const receiptStorageKey = command.receiptStorageKey?.trim() || null;
    if (receiptStorageKey && !receiptStorageKey.startsWith(`${organizationId}/`)) {
      throw new BillingFailure(
        "BILLING_RECEIPT_INVALID",
        "El comprobante no pertenece a la organización.",
      );
    }
    return billingCall(() => this.repository.createManualPaymentRequest({
      organizationId,
      planId,
      billingCycle: command.billingCycle,
      paymentMethod,
      receiptStorageKey,
    }));
  }
}

/** Creates a signed upload location for a validated payment receipt. */
export class CreatePaymentReceiptUpload extends AuthorizedBillingUseCase {
  /**
   * @param repository - Organization billing persistence port.
   * @param authorization - Billing authorization port.
   * @param storage - Payment-receipt object-storage port.
   */
  constructor(
    repository: OrganizationBillingRepository,
    authorization: OrganizationBillingAuthorization,
    private readonly storage: PaymentReceiptStorage,
  ) {
    super(repository, authorization);
  }

  /**
   * @param userId - Actor requesting the upload.
   * @param organizationId - Organization that will own the receipt.
   * @param command - Original file name and accepted content type.
   * @param context - Authorization audit context.
   * @returns A signed upload URL and organization-scoped key.
   * @throws {BillingFailure} When validation, authorization or storage fails.
   */
  async execute(
    userId: UserId,
    organizationId: OrganizationId,
    command: { readonly fileName: string; readonly contentType: string },
    context: BillingAuthorizationContext,
  ): Promise<PaymentReceiptUpload> {
    await this.authorize(userId, organizationId, permissionCode(PERMISSIONS.BILLING_MANAGE), context);
    const fileName = command.fileName.trim();
    if (!fileName || fileName.length > 180 || !RECEIPT_CONTENT_TYPES.has(command.contentType)) {
      throw new BillingFailure(
        "BILLING_RECEIPT_INVALID",
        "El comprobante debe ser PDF, PNG, JPEG o WebP.",
      );
    }
    return billingReceiptCall(() => this.storage.createUpload({
      organizationId,
      fileName,
      contentType: command.contentType,
    }));
  }
}

const RECEIPT_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

async function billingCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause: unknown) {
    if (cause instanceof BillingFailure) throw cause;
    throw new BillingFailure(
      "BILLING_REPOSITORY_UNAVAILABLE",
      "No se pudo consultar la facturación.",
      { cause },
    );
  }
}

async function billingReceiptCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause: unknown) {
    if (cause instanceof BillingFailure) throw cause;
    throw new BillingFailure(
      "BILLING_RECEIPT_UNAVAILABLE",
      "No se pudo preparar la carga del comprobante.",
      { cause },
    );
  }
}
