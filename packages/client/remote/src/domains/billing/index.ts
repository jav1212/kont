import type {
  BillingOverviewDto,
  BillingPort,
  BillingPlanDto,
  ManualPaymentRequestDto,
} from "@kontave/client-contracts";
import type { RemoteTransport } from "../../transport";

/** Remote adapter for organization-owned billing reads. */
export class RemoteBillingPort implements BillingPort {
  /**
   * Creates the adapter.
   * @param transport - Authenticated Client API transport.
   */
  constructor(private readonly transport: RemoteTransport) {}

  /**
   * Loads an organization's billing overview.
   * @param organizationId - Billing owner organization.
   * @returns Account, subscriptions, entitlements and usage.
   */
  overview(organizationId: string): Promise<BillingOverviewDto> {
    return this.transport.get(`${root(organizationId)}/overview`);
  }

  /**
   * Lists plans available to an organization.
   * @param organizationId - Billing owner organization.
   * @returns Available billing plans.
   */
  plans(organizationId: string): Promise<readonly BillingPlanDto[]> {
    return this.transport.get(`${root(organizationId)}/plans`);
  }

  /**
   * Lists manual payment requests for an organization.
   * @param organizationId - Billing owner organization.
   * @returns Existing manual payment requests.
   */
  paymentRequests(
    organizationId: string,
  ): Promise<readonly ManualPaymentRequestDto[]> {
    return this.transport.get(`${root(organizationId)}/payment-requests`);
  }
}

function root(organizationId: string): string {
  if (!organizationId.trim()) throw new Error("La organización no es válida.");
  return `/api/client/v1/organizations/${encodeURIComponent(organizationId)}/billing`;
}
