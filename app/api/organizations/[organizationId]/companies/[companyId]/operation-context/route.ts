import { decodeUpdateOperationalDefaults } from "@kontave/client-contracts";
import { createWebOperationContextActions } from "@/src/modules/operation-context/backend/web-operation-context-actions";
import { webOperationContextErrorResponse } from "@/src/modules/operation-context/backend/web-operation-context-http";
import { requireTenant } from "@/src/shared/backend/utils/require-tenant";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ organizationId: string; companyId: string }>;
};

/**
 * Restores the cookie-authenticated user's company-scoped operational defaults.
 *
 * @param request - Cookie-authenticated Web request with its selected tenant header.
 * @param context - Organization and company route parameters.
 * @returns Operational defaults or a safe authentication, authorization, or persistence error.
 * @throws No expected failures; they are converted to HTTP responses.
 */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const tenant = await requireTenant(request);
    const params = await context.params;
    const data = await createWebOperationContextActions(request, tenant).get(
      params.organizationId,
      params.companyId,
    );
    return Response.json(
      { data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    return webOperationContextErrorResponse(cause);
  }
}

/**
 * Updates cookie-authenticated operational defaults using optimistic concurrency.
 *
 * @param request - JSON command and cookie-authenticated selected tenant.
 * @param context - Organization and company route parameters.
 * @returns Authoritative operational defaults or a safe validation, conflict, or access error.
 * @throws No expected failures; they are converted to HTTP responses.
 */
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const update = decodeUpdateOperationalDefaults(await request.json());
    const tenant = await requireTenant(request);
    const params = await context.params;
    const data = await createWebOperationContextActions(request, tenant).update(
      params.organizationId,
      params.companyId,
      update,
    );
    return Response.json(
      { data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    return webOperationContextErrorResponse(cause);
  }
}
