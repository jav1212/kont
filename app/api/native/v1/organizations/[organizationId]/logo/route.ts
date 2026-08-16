import { OrganizationFailure, organizationId, userId } from "@kontave/organizations-domain";
import { authenticateNativeRequest } from "@/src/native-api/v1/auth/native-auth-context";
import { nativeError, nativeSuccess } from "@/src/native-api/v1/http/native-response";
import { createOrganizationActions } from "@/src/native-api/v1/organizations/organization-actions";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ organizationId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  return execute(request, context, async (actions, actorUserId, targetOrganizationId) => {
    const form = await request.formData(); const logo = form.get("logo"); const expectedVersion = Number(form.get("expectedVersion"));
    if (!(logo instanceof File) || !Number.isSafeInteger(expectedVersion)) throw new OrganizationFailure("ORGANIZATION_LOGO_INVALID", "logo y expectedVersion son requeridos.");
    return actions.uploadLogo.execute({ actorUserId, organizationId: targetOrganizationId, expectedVersion, logo: { bytes: new Uint8Array(await logo.arrayBuffer()), contentType: logo.type } });
  });
}
export async function DELETE(request: Request, context: Context): Promise<Response> {
  return execute(request, context, async (actions, actorUserId, targetOrganizationId) => {
    const body = await request.json() as { expectedVersion?: number };
    if (!Number.isSafeInteger(body.expectedVersion)) throw new OrganizationFailure("ORGANIZATION_DATA_INVALID", "expectedVersion es requerido.");
    return actions.deleteLogo.execute({ actorUserId, organizationId: targetOrganizationId, expectedVersion: body.expectedVersion! });
  });
}
async function execute(request: Request, context: Context, operation: (actions: ReturnType<typeof createOrganizationActions>, actor: ReturnType<typeof userId>, organization: ReturnType<typeof organizationId>) => Promise<unknown>) {
  const requestId = crypto.randomUUID();
  try { const identity = await authenticateNativeRequest(request); if (!identity) return nativeError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401); const params = await context.params; return nativeSuccess(await operation(createOrganizationActions(), userId(identity.userId), organizationId(params.organizationId)), requestId); }
  catch (cause: unknown) { if (cause instanceof OrganizationFailure) return nativeError(cause.code, cause.message, requestId, cause.code === "ORGANIZATION_VERSION_CONFLICT" ? 409 : cause.code.includes("INVALID") ? 400 : cause.code === "ORGANIZATION_ACCESS_DENIED" ? 403 : 503); console.error("native.organization.logo.failed", { requestId, cause }); return nativeError("INTERNAL_ERROR", "No se pudo procesar el logo.", requestId, 500); }
}
