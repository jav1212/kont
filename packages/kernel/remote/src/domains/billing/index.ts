import { billingOverview, billingPlan, paymentRequest } from "./decoding";
import { decodeRemote, array } from "../../decoding";
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
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  overview(organizationId: string): Promise<BillingOverviewDto> {
    return decodeRemote(
      this.transport,
      `${root(organizationId)}/overview`,
      { method: "GET" },
      billingOverview,
    );
  }

  /**
   * Lists plans available to an organization.
   * @param organizationId - Billing owner organization.
   * @returns Available billing plans.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  plans(organizationId: string): Promise<readonly BillingPlanDto[]> {
    return decodeRemote(
      this.transport,
      `${root(organizationId)}/plans`,
      { method: "GET" },
      (value) => array(value, billingPlan),
    );
  }

  /**
   * Lists manual payment requests for an organization.
   * @param organizationId - Billing owner organization.
   * @returns Existing manual payment requests.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  paymentRequests(
    organizationId: string,
  ): Promise<readonly ManualPaymentRequestDto[]> {
    return decodeRemote(
      this.transport,
      `${root(organizationId)}/payment-requests`,
      { method: "GET" },
      (value) => array(value, paymentRequest),
    );
  }
}

function root(organizationId: string): string {
  if (!organizationId.trim()) throw new Error("La organización no es válida.");
  return `/api/client/v1/organizations/${encodeURIComponent(organizationId)}/billing`;
}
