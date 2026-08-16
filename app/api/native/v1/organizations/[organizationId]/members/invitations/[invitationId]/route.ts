import { executeMemberRequest, membersRevoke } from "@/src/native-api/v1/members/member-http";

type Context = { params: Promise<{ organizationId: string; invitationId: string }> };

export async function DELETE(request: Request, context: Context) {
  const { organizationId, invitationId } = await context.params;
  const body = await request.json() as { expectedVersion: number };
  return executeMemberRequest(request, organizationId, membersRevoke, async (actions, actor, organization) => {
    await actions.revokeInvitation.execute({ organizationId: organization, actorUserId: actor, invitationId, expectedVersion: body.expectedVersion });
    return { revoked: true };
  });
}
