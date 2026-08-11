import { createReferralActions } from "@/src/native-api/v1/referrals/referral-actions";
import { executeReferralRequest } from "@/src/native-api/v1/referrals/execute-referral-request";
import { toReferralAttributionDto } from "@/src/native-api/v1/referrals/referral-dto";
import { z } from "zod";

export const dynamic = "force-dynamic";

const attachReferralRequestSchema = z.object({ code: z.string().trim().min(1).max(64) });

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await context.params;
  let payload: z.infer<typeof attachReferralRequestSchema>;
  try {
    payload = attachReferralRequestSchema.parse(await request.json());
  } catch {
    return Response.json(
      { error: { code: "INVALID_REQUEST", message: "El código de referido es inválido." } },
      { status: 400 },
    );
  }

  return executeReferralRequest(
    request,
    organizationId,
    async (organization) => toReferralAttributionDto(
      await createReferralActions().attach.execute(organization, payload.code),
    ),
    true,
  );
}
