import { createBillingActions } from "@/src/native-api/v1/billing/billing-actions";
import { executeBillingRequest } from "@/src/native-api/v1/billing/execute-billing-request";
import { toBillingOverviewDto } from "@/src/native-api/v1/billing/billing-mapper";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await context.params;
  return executeBillingRequest(request, organizationId, async (actor, organization) =>
    toBillingOverviewDto(await createBillingActions().overview.execute(actor, organization)));
}
