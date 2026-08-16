import type { NativeResendMemberInvitationDto } from "@kontave/native-api-contracts";
import { executeMemberRequest, membersInvite } from "@/src/native-api/v1/members/member-http";

type Context = { params: Promise<{ organizationId: string; invitationId: string }> };

export async function POST(request: Request, context: Context) {
  const { organizationId, invitationId } = await context.params;
  const body = await request.json() as NativeResendMemberInvitationDto;
  const days = Math.min(Math.max(body.expiresInDays ?? 7, 1), 30);
  return executeMemberRequest(request, organizationId, membersInvite, async (actions, actor, organization, identity) => {
    const access = await actions.directory.findAccess(actor, organization);
    if (!access) throw new Error("Organization access disappeared after authorization.");
    return actions.resendInvitation.execute({
      organizationId: organization, actorUserId: actor, invitationId,
      expectedVersion: body.expectedVersion,
      expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(),
      organizationName: access.organization.name,
      inviterDisplayName: identity.email ?? actor,
    });
  });
}
