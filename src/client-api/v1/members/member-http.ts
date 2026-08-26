import {
  AccessControlFailure,
  AuthorizationDenied,
  PERMISSIONS,
  permissionCode,
  type PermissionCode,
} from "@kontave/access-control/domain";
import { createSupabaseAuthorization } from "@kontave/access-control/supabase";
import {
  OrganizationFailure,
  organizationId,
  userId,
} from "@kontave/organizations/domain";
import { authenticateClientRequest } from "../auth/auth-context";
import { clientSource } from "../http/client-source";
import { apiError, apiSuccess } from "../http/response";
import { createMemberActions } from "./member-actions";
export async function executeMemberRequest<T>(
  request: Request,
  rawOrganizationId: string,
  permission: PermissionCode,
  operation: (
    actions: ReturnType<typeof createMemberActions>,
    actor: ReturnType<typeof userId>,
    organization: ReturnType<typeof organizationId>,
    identity: { readonly email: string | null },
  ) => Promise<T>,
) {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateClientRequest(request);
    if (!identity)
      return apiError(
        "INVALID_ACCESS_TOKEN",
        "La sesión no es válida o expiró.",
        requestId,
        401,
      );
    const organization = organizationId(rawOrganizationId),
      url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Native members are not configured.");
    await createSupabaseAuthorization({
      url,
      serviceRoleKey: key,
    }).require.execute({
      actor: { userId: identity.userId, organizationId: organization },
      permission,
      resource: { type: "members", organizationId: organization },
      context: {
        requestId,
        source: clientSource(request.headers.get("x-kontave-client")),
        occurredAt: new Date().toISOString(),
      },
    });
    return apiSuccess(
      await operation(
        createMemberActions(new URL(request.url).origin),
        userId(identity.userId),
        organization,
        identity,
      ),
      requestId,
    );
  } catch (cause) {
    if (cause instanceof AuthorizationDenied)
      return apiError(
        "ORGANIZATION_ACCESS_DENIED",
        "No tienes acceso a miembros.",
        requestId,
        403,
      );
    if (cause instanceof OrganizationFailure) {
      const status =
        cause.code === "ORGANIZATION_ACCESS_DENIED"
          ? 403
          : cause.code.includes("VERSION_CONFLICT") ||
              cause.code === "INVITATION_ALREADY_PENDING"
            ? 409
            : cause.code.includes("NOT_FOUND")
              ? 404
              : cause.code.includes("INVALID")
                ? 400
                : 503;
      return apiError(cause.code, cause.message, requestId, status);
    }
    if (cause instanceof AccessControlFailure)
      return apiError(
        "ORGANIZATION_ACCESS_DENIED",
        cause.message,
        requestId,
        403,
      );
    console.error("client.members.failed", { requestId, cause });
    return apiError(
      "INTERNAL_ERROR",
      "No se pudieron procesar los miembros.",
      requestId,
      500,
    );
  }
}
export const membersRead = permissionCode(PERMISSIONS.MEMBERS_READ),
  membersInvite = permissionCode(PERMISSIONS.MEMBERS_INVITE),
  membersUpdate = permissionCode(PERMISSIONS.MEMBERS_UPDATE),
  membersRevoke = permissionCode(PERMISSIONS.MEMBERS_REVOKE);
