import {
  KontaveRemoteClient,
  RemoteBillingPort,
} from "@kontave/client-remote";
import type { SubscriptionDto } from "@kontave/client-contracts";
import type { DesktopBillingPlanState } from "../../shared/desktop-api";
import type { DesktopAuthenticatedRequest } from "../auth/desktop-authenticated-request";

/** Desktop composition adapter for portable organization billing reads. */
export class DesktopBillingPlanSource {
  private readonly billing: RemoteBillingPort;

  /**
   * Creates the source using Desktop's authenticated request mechanism.
   * @param baseUrl - Kontave API origin.
   * @param request - Desktop session-aware request adapter.
   */
  constructor(baseUrl: string, request: DesktopAuthenticatedRequest) {
    this.billing = new RemoteBillingPort(
      new KontaveRemoteClient({
        baseUrl,
        platform: "desktop",
        authenticatedRequest: (input, init) => request.fetch(input, init),
      }),
    );
  }

  /**
   * Loads the selected organization plan.
   * @param organizationId - Billing owner organization.
   * @returns Desktop billing-plan state.
   */
  async getForOrganization(
    organizationId: string,
  ): Promise<DesktopBillingPlanState> {
    const overview = await this.billing.overview(organizationId);
    return {
      status: "ready",
      organizationId,
      planName: selectPlanName(overview.subscriptions),
    };
  }
}

function selectPlanName(
  subscriptions: readonly SubscriptionDto[],
): string | null {
  return (
    subscriptions.find((item) => item.status === "active" && item.planName)
      ?.planName ??
    subscriptions.find((item) => item.status === "trial" && item.planName)
      ?.planName ??
    subscriptions.find((item) => item.planName)?.planName ??
    null
  );
}
