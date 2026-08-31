import type {
  OrganizationBillingAuthorization,
  OrganizationBillingRepository,
} from "../application";
import {
  limit,
  type BillingAccount,
  type BillingPlan,
  type Invoice,
  type ManualPaymentRequest,
  type OrganizationEntitlements,
  type OrganizationUsage,
  type PaymentMethod,
  type Subscription,
} from "../domain";
import type { OrganizationId } from "@kontave/organizations/domain";

type CreateManualPaymentRequestInput = Parameters<
  OrganizationBillingRepository["createManualPaymentRequest"]
>[0];

/** Authorization double for tests that do not exercise access denial. */
export class AllowAllBillingAuthorization implements OrganizationBillingAuthorization {
  /** {@inheritDoc OrganizationBillingAuthorization.require} */
  async require(): Promise<void> {}
}

/** In-memory billing port for application and collaborating-context tests. */
export class InMemoryOrganizationBillingRepository implements OrganizationBillingRepository {
  private readonly manualPaymentRequests: ManualPaymentRequest[];

  /**
   * Creates deterministic billing state without infrastructure dependencies.
   * @param account - Billing account returned by account queries.
   * @param subscriptions - Subscription snapshots returned by list queries.
   * @param entitlements - Effective organization entitlements.
   * @param invoices - Invoice snapshots returned by list queries.
   * @param paymentMethods - Payment methods returned by list queries.
   * @param plans - Available commercial plans.
   * @param manualPaymentRequests - Existing manual payment requests.
   * @param manualPaymentRequestFactory - Factory used when a test exercises request creation.
   * @returns A configurable in-memory repository.
   */
  constructor(
    readonly account: BillingAccount | null,
    readonly subscriptions: readonly Subscription[] = [],
    readonly entitlements: OrganizationEntitlements = {
      maxCompanies: null,
      maxMembers: null,
      maxDevices: null,
      enabledModules: [],
    },
    readonly invoices: readonly Invoice[] = [],
    readonly paymentMethods: readonly PaymentMethod[] = [],
    readonly plans: readonly BillingPlan[] = [],
    manualPaymentRequests: readonly ManualPaymentRequest[] = [],
    private readonly manualPaymentRequestFactory?: (
      input: CreateManualPaymentRequestInput,
    ) => ManualPaymentRequest,
  ) {
    this.manualPaymentRequests = [...manualPaymentRequests];
  }

  /** {@inheritDoc OrganizationBillingRepository.findAccount} */
  async findAccount(): Promise<BillingAccount | null> { return this.account; }
  /** {@inheritDoc OrganizationBillingRepository.listSubscriptions} */
  async listSubscriptions(): Promise<readonly Subscription[]> { return this.subscriptions; }
  /** {@inheritDoc OrganizationBillingRepository.getEntitlements} */
  async getEntitlements(): Promise<OrganizationEntitlements> { return this.entitlements; }
  /** {@inheritDoc OrganizationBillingRepository.getUsage} */
  async getUsage(
    _organizationId: OrganizationId,
    entitlements: OrganizationEntitlements,
  ): Promise<OrganizationUsage> {
    return {
      companies: limit(0, entitlements.maxCompanies),
      members: limit(0, entitlements.maxMembers),
      devices: limit(0, entitlements.maxDevices),
    };
  }
  /** {@inheritDoc OrganizationBillingRepository.listInvoices} */
  async listInvoices(): Promise<readonly Invoice[]> { return this.invoices; }
  /** {@inheritDoc OrganizationBillingRepository.listPaymentMethods} */
  async listPaymentMethods(): Promise<readonly PaymentMethod[]> { return this.paymentMethods; }
  /** {@inheritDoc OrganizationBillingRepository.listPlans} */
  async listPlans(): Promise<readonly BillingPlan[]> { return this.plans; }
  /** {@inheritDoc OrganizationBillingRepository.listManualPaymentRequests} */
  async listManualPaymentRequests(): Promise<readonly ManualPaymentRequest[]> {
    return [...this.manualPaymentRequests];
  }
  /** {@inheritDoc OrganizationBillingRepository.createManualPaymentRequest} */
  async createManualPaymentRequest(
    input: CreateManualPaymentRequestInput,
  ): Promise<ManualPaymentRequest> {
    if (!this.manualPaymentRequestFactory) {
      throw new Error("Manual payment request creation is not configured for this test.");
    }
    const request = this.manualPaymentRequestFactory(input);
    this.manualPaymentRequests.push(request);
    return request;
  }
}
