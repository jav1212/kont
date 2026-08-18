import type { CreateMemberInvitationDto } from "@kontave/client-contracts";
import {
  executeMemberRequest,
  membersInvite,
} from "@/src/client-api/v1/members/member-http";
type C = { params: Promise<{ organizationId: string }> };
export async function POST(request: Request, c: C) {
  const p = await c.params,
    b = (await request.json()) as CreateMemberInvitationDto,
    key = request.headers.get("idempotency-key") ?? "";
  const days = Math.min(Math.max(b.expiresInDays ?? 7, 1), 30);
  return executeMemberRequest(
    request,
    p.organizationId,
    membersInvite,
    async (a, actor, organization, identity) => {
      const access = await a.directory.findAccess(actor, organization);
      if (!access)
        throw new Error("Organization access disappeared after authorization.");
      return a.invite.execute({
        organizationId: organization,
        actorUserId: actor,
        email: b.email,
        roleId: b.roleId,
        idempotencyKey: key,
        expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
        organizationName: access.organization.name,
        inviterDisplayName: identity.email ?? actor,
      });
    },
  );
}
