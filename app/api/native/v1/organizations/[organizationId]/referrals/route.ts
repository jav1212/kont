import { createReferralActions } from "@/src/native-api/v1/referrals/referral-actions";
import { executeReferralRequest } from "@/src/native-api/v1/referrals/execute-referral-request";
import { toReferralOverviewDto } from "@/src/native-api/v1/referrals/referral-dto";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await context.params;
  return executeReferralRequest(request, organizationId, async (organization) =>
    toReferralOverviewDto(await createReferralActions().overview.execute(organization)),
  );
}
