import { organizationId, userId } from "@kontave/organizations/domain";
import { authenticateClientRequest } from "../auth/auth-context";
import { apiError, apiSuccess } from "../http/response";
import { billingErrorResponse } from "./billing-http";
import type { BillingAuthorizationContext } from "@kontave/billing/application";
import { clientSource } from "../http/client-source";

export async function executeBillingRequest<T>(
  request: Request,
  rawOrganizationId: string,
  operation: (
    actorId: ReturnType<typeof userId>,
    organization: ReturnType<typeof organizationId>,
    context: BillingAuthorizationContext,
  ) => Promise<T>,
): Promise<Response> {
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
    return apiSuccess(
      await operation(
        userId(identity.userId),
        organizationId(rawOrganizationId),
        {
          requestId,
          source: clientSource(request.headers.get("x-kontave-client")),
          occurredAt: new Date().toISOString(),
        },
      ),
      requestId,
    );
  } catch (cause: unknown) {
    return billingErrorResponse(cause, requestId);
  }
}
