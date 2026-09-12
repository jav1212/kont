import { localDate } from "@kontave/operation-context/domain";
import { createWebOperationContextActions } from "@/src/modules/operation-context/backend/web-operation-context-actions";
import { webOperationContextErrorResponse } from "@/src/modules/operation-context/backend/web-operation-context-http";
import { requireTenant } from "@/src/shared/backend/utils/require-tenant";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ organizationId: string; companyId: string }>;
};

/**
 * Resolves official company-scoped exchange rates for a requested local date.
 *
 * @param request - Cookie-authenticated request whose query includes `date=YYYY-MM-DD`.
 * @param context - Organization and company route parameters.
 * @returns The existing exchange-rate DTO or a safe validation, authorization, or availability error.
 * @throws No expected failures; they are converted to HTTP responses.
 */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const rawDate = new URL(request.url).searchParams.get("date");
    if (!rawDate) throw new TypeError("A local date is required.");
    const tenant = await requireTenant(request);
    const params = await context.params;
    const data = await createWebOperationContextActions(
      request,
      tenant,
    ).exchangeRates(
      params.organizationId,
      params.companyId,
      localDate(rawDate),
    );
    return Response.json(
      { data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    return webOperationContextErrorResponse(cause);
  }
}
