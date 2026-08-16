import {
  AccessControlFailure, AuthorizationDenied, PERMISSIONS, permissionCode, type PermissionCode,
} from "@kontave/access-control-domain";
import { createSupabaseAuthorization } from "@kontave/access-control-supabase";
import { DocumentsFailure } from "@kontave/documents-domain";
import { RequireModuleCapability } from "@kontave/modules-application";
import { ModuleCapability, ModuleFailure } from "@kontave/modules-domain";
import { createModulesInfrastructure } from "@kontave/modules-supabase";
import { organizationId, userId } from "@kontave/organizations-domain";
import { authenticateNativeRequest } from "../auth/native-auth-context";
import { nativeClientSource } from "../http/native-client-source";
import { nativeError, nativeSuccess } from "../http/native-response";
import { createDocumentActions } from "./document-actions";

export async function executeDocumentRequest<T>(
  request: Request,
  rawOrganizationId: string,
  permission: PermissionCode,
  operation: (
    actions: ReturnType<typeof createDocumentActions>,
    organization: ReturnType<typeof organizationId>,
    actor: ReturnType<typeof userId>,
  ) => Promise<T>,
) {
  const requestId = crypto.randomUUID();
  let authenticatedUserId: string | null = null;
  try {
    const identity = await authenticateNativeRequest(request);
    if (!identity) return nativeError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);
    authenticatedUserId = identity.userId;
    const organization = organizationId(rawOrganizationId);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Native documents are not configured.");
    await createSupabaseAuthorization({ url, serviceRoleKey: key }).require.execute({
      actor: { userId: identity.userId, organizationId: organization },
      permission,
      resource: { type: "documents", organizationId: organization },
      context: {
        requestId,
        source: nativeClientSource(request.headers.get("x-kontave-client")),
        occurredAt: new Date().toISOString(),
      },
    });
    const modules = createModulesInfrastructure({ url, serviceRoleKey: key });
    await new RequireModuleCapability(modules.catalog, modules.installations).execute(
      organization,
      ModuleCapability.DocumentsFiles,
    );
    return nativeSuccess(
      await operation(createDocumentActions(), organization, userId(identity.userId)),
      requestId,
    );
  } catch (cause: unknown) {
    if (cause instanceof AuthorizationDenied || cause instanceof AccessControlFailure) {
      return nativeError("ORGANIZATION_ACCESS_DENIED", "No tienes acceso a Documentos.", requestId, 403);
    }
    if (cause instanceof ModuleFailure) return nativeError(cause.code, cause.message, requestId, 409);
    if (cause instanceof DocumentsFailure) {
      console.error("native.documents.operation.failed", {
        requestId,
        code: cause.code,
        organizationId: rawOrganizationId,
        userId: authenticatedUserId,
        client: nativeClientSource(request.headers.get("x-kontave-client")),
      });
      const status = cause.code.includes("VERSION_CONFLICT") ? 409
        : cause.code.includes("NOT_FOUND") ? 404
        : cause.code === "DOCUMENT_FOLDER_NOT_EMPTY" ? 409
        : cause.code.includes("INVALID") || cause.code.includes("OUTSIDE") ? 400
        : 503;
      return nativeError(cause.code, cause.message, requestId, status);
    }
    console.error("native.documents.failed", {
      requestId,
      organizationId: rawOrganizationId,
      userId: authenticatedUserId,
      client: nativeClientSource(request.headers.get("x-kontave-client")),
      cause,
    });
    return nativeError("INTERNAL_ERROR", "No se pudieron procesar los documentos.", requestId, 500);
  }
}

export const documentsRead = permissionCode(PERMISSIONS.DOCUMENTS_READ);
export const documentsCreate = permissionCode(PERMISSIONS.DOCUMENTS_CREATE);
export const documentsUpdate = permissionCode(PERMISSIONS.DOCUMENTS_UPDATE);
export const documentsDelete = permissionCode(PERMISSIONS.DOCUMENTS_DELETE);
