import type { RefreshOperationalExchangeRateDto } from "@kontave/client-contracts";
import {
  companyId,
  organizationId,
  userId,
} from "@kontave/organizations/domain";
import { authenticateClientRequest } from "@/src/client-api/v1/auth/auth-context";
import { apiError, apiSuccess } from "@/src/client-api/v1/http/response";
import { createNativeOperationContextCoordinator } from "@/src/client-api/v1/operation-context/operation-context-actions";
import { operationContextErrorResponse } from "@/src/client-api/v1/operation-context/operation-context-http";
import { toOperationalDefaultsDto } from "@/src/client-api/v1/operation-context/operation-context-mapper";

export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string; companyId: string }> },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    let body: RefreshOperationalExchangeRateDto;
    try {
      body = (await request.json()) as RefreshOperationalExchangeRateDto;
    } catch {
      return apiError(
        "INVALID_REQUEST",
        "La solicitud no es válida.",
        requestId,
        400,
      );
    }
    const identity = await authenticateClientRequest(request);
    if (!identity)
      return apiError(
        "INVALID_ACCESS_TOKEN",
        "La sesión no es válida o expiró.",
        requestId,
        401,
      );
    const params = await context.params;
    const coordinator = createNativeOperationContextCoordinator();
    await coordinator.initialize({
      userId: userId(identity.userId),
      organizationId: organizationId(params.organizationId),
      companyId: companyId(params.companyId),
    });
    const initial = coordinator.getState();
    if (initial.status !== "ready")
      throw initial.status === "failed"
        ? initial.failure
        : new Error("Operation context did not initialize.");
    if (body.expectedVersion !== initial.value.version)
      return apiError(
        "OPERATION_CONTEXT_VERSION_CONFLICT",
        "El contexto operativo cambió en otro cliente.",
        requestId,
        409,
      );
    await coordinator.refreshExchangeRate();
    const state = coordinator.getState();
    if (state.status !== "ready")
      throw state.status === "failed"
        ? state.failure
        : new Error("Operation context did not become ready.");
    return apiSuccess(toOperationalDefaultsDto(state.value), requestId);
  } catch (cause: unknown) {
    return operationContextErrorResponse(cause, requestId);
  }
}
