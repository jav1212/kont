import { AuthorizationDenied, PERMISSIONS, permissionCode } from "@kontave/access-control-domain";
import { createSupabaseAuthorization } from "@kontave/access-control-supabase";
import { ReferralFailure } from "@kontave/referrals-domain";
import { organizationId } from "@kontave/organizations-domain";
import { authenticateNativeRequest } from "../auth/native-auth-context";
import { nativeClientSource } from "../http/native-client-source";
import { nativeError, nativeSuccess } from "../http/native-response";

export async function executeReferralRequest<T>(
  request: Request,
  rawOrganizationId: string,
  operation: (organization: ReturnType<typeof organizationId>) => Promise<T>,
  manage = false,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateNativeRequest(request);
    if (!identity) return nativeError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);

    const organization = organizationId(rawOrganizationId);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) throw new Error("Access control is not configured.");

    await createSupabaseAuthorization({ url, serviceRoleKey }).require.execute({
      actor: { userId: identity.userId, organizationId: organization },
      permission: permissionCode(manage ? PERMISSIONS.REFERRALS_MANAGE : PERMISSIONS.REFERRALS_READ),
      resource: { type: "referrals", organizationId: organization },
      context: {
        requestId,
        source: nativeClientSource(request.headers.get("x-kontave-client")),
        occurredAt: new Date().toISOString(),
      },
    });
    return nativeSuccess(await operation(organization), requestId);
  } catch (cause: unknown) {
    if (cause instanceof AuthorizationDenied) {
      return nativeError("REFERRAL_ACCESS_DENIED", "No tienes acceso a referidos.", requestId, 403);
    }
    if (cause instanceof ReferralFailure) {
      const status = cause.code === "REFERRAL_NOT_FOUND" ? 404 : 409;
      return nativeError(cause.code, cause.message, requestId, status);
    }
    console.error("native.referrals.failed", { requestId, cause });
    return nativeError("INTERNAL_ERROR", "No se pudo procesar referidos.", requestId, 500);
  }
}
