import { organizationId, userId } from "@kontave/organizations-domain";
import { authenticateNativeRequest } from "../auth/native-auth-context";
import { nativeError, nativeSuccess } from "../http/native-response";
import { billingErrorResponse } from "./billing-http";
import type { BillingAuthorizationContext } from "@kontave/billing-application";
import { AuthorizationSource } from "@kontave/access-control-domain";

export async function executeBillingRequest<T>(
  request: Request,
  rawOrganizationId: string,
  operation: (actorId: ReturnType<typeof userId>, organization: ReturnType<typeof organizationId>, context: BillingAuthorizationContext) => Promise<T>,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateNativeRequest(request);
    if (!identity) return nativeError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);
    return nativeSuccess(await operation(userId(identity.userId), organizationId(rawOrganizationId), { requestId, source: nativeSource(request.headers.get("x-kontave-client")), occurredAt: new Date().toISOString() }), requestId);
  } catch (cause: unknown) {
    return billingErrorResponse(cause, requestId);
  }
}
const NATIVE_SOURCE = new Map<string, AuthorizationSource>([
  [AuthorizationSource.Mobile, AuthorizationSource.Mobile], [AuthorizationSource.Web, AuthorizationSource.Web],
  [AuthorizationSource.System, AuthorizationSource.System], [AuthorizationSource.Desktop, AuthorizationSource.Desktop],
]);
function nativeSource(value: string | null): BillingAuthorizationContext["source"] { return value ? NATIVE_SOURCE.get(value) ?? AuthorizationSource.Desktop : AuthorizationSource.Desktop; }
