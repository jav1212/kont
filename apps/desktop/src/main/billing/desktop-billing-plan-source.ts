import type {
  BillingPort,
  ClientPortFeature,
  SubscriptionDto,
} from "@kontave/client-contracts";
import type { DesktopBillingPlanState } from "../../renderer-bridge";
import { requireClientValue } from "../client/client-operation";

/** Desktop composition adapter for portable organization billing reads. */
export class DesktopBillingPlanSource {
  /**
   * Creates the source over the portable billing feature.
   * @param billing - Runtime-managed billing feature.
   */
  constructor(private readonly billing: ClientPortFeature<BillingPort>) {}

  /**
   * Loads the selected organization plan.
   * @param organizationId - Billing owner organization.
   * @returns Desktop billing-plan state.
   */
  async getForOrganization(
    organizationId: string,
  ): Promise<DesktopBillingPlanState> {
    const overview = requireClientValue(
      await this.billing.overview(organizationId),
    );
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
