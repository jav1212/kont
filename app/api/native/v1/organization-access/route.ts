import { userId } from "@kontave/organizations-domain";
import { authenticateNativeRequest } from "@/src/native-api/v1/auth/native-auth-context";
import { nativeError, nativeSuccess } from "@/src/native-api/v1/http/native-response";
import { createOrganizationAccessActions } from "@/src/native-api/v1/organization-access/organization-access-actions";
import { toAccessibleOrganizationDto } from "@/src/native-api/v1/organization-access/organization-access-dto";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateNativeRequest(request);
    if (!identity) return nativeError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);
    const result = await createOrganizationAccessActions().portfolio.execute(userId(identity.userId), new Date().toISOString());
    return nativeSuccess(result.map(toAccessibleOrganizationDto), requestId);
  } catch (cause: unknown) {
    console.error("native.organization_access.failed", { requestId, cause });
    return nativeError("INTERNAL_ERROR", "No se pudo obtener el portafolio organizacional.", requestId, 500);
  }
}
