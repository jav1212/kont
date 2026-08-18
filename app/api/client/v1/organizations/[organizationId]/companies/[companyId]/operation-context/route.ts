import type { UpdateOperationalDefaultsDto } from "@kontave/client-contracts";
import { currency } from "@kontave/monetary-domain";
import {
  companyId,
  organizationId,
  userId,
} from "@kontave/organizations-domain";
import { localDate } from "@kontave/operation-context-domain";
import { authenticateClientRequest } from "@/src/client-api/v1/auth/auth-context";
import { apiError, apiSuccess } from "@/src/client-api/v1/http/response";
import { createNativeOperationContextCoordinator } from "@/src/client-api/v1/operation-context/operation-context-actions";
import { operationContextErrorResponse } from "@/src/client-api/v1/operation-context/operation-context-http";
import { toOperationalDefaultsDto } from "@/src/client-api/v1/operation-context/operation-context-mapper";

export const dynamic = "force-dynamic";
type RouteContext = {
  params: Promise<{ organizationId: string; companyId: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return execute(request, context);
}
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  let body: UpdateOperationalDefaultsDto;
  try {
    body = (await request.json()) as UpdateOperationalDefaultsDto;
  } catch {
    return apiError(
      "INVALID_REQUEST",
      "La solicitud no es válida.",
      crypto.randomUUID(),
      400,
    );
  }
  return execute(request, context, body);
}

async function execute(
  request: Request,
  context: RouteContext,
  update?: UpdateOperationalDefaultsDto,
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
    const params = await context.params;
    const coordinator = createNativeOperationContextCoordinator();
    await coordinator.initialize({
      userId: userId(identity.userId),
      organizationId: organizationId(params.organizationId),
      companyId: companyId(params.companyId),
    });
    const initialized = coordinator.getState();
    if (initialized.status !== "ready")
      throw initialized.status === "failed"
        ? initialized.failure
        : new Error("Operation context did not initialize.");
    if (update) {
      if (
        !Number.isSafeInteger(update.expectedVersion) ||
        update.expectedVersion !== initialized.value.version
      ) {
        return apiError(
          "OPERATION_CONTEXT_VERSION_CONFLICT",
          "El contexto operativo cambió en otro cliente.",
          requestId,
          409,
        );
      }
      if (
        !update.effectiveDate &&
        !update.presentationCurrency &&
        !update.manualExchangeRate
      ) {
        return apiError(
          "INVALID_REQUEST",
          "No se indicaron cambios.",
          requestId,
          400,
        );
      }
      if (
        update.presentationCurrency &&
        update.presentationCurrency.toUpperCase() !== "VES" &&
        !update.manualExchangeRate
      ) {
        return apiError(
          "INVALID_REQUEST",
          "Las tasas oficiales BCV deben expresarse en VES.",
          requestId,
          400,
        );
      }
      await coordinator.update({
        effectiveDate: update.effectiveDate
          ? localDate(update.effectiveDate)
          : undefined,
        presentationCurrency: update.presentationCurrency
          ? currency(update.presentationCurrency, 2)
          : undefined,
        manualExchangeRate: update.manualExchangeRate
          ? {
              baseCurrency: currency(update.manualExchangeRate.baseCurrency, 2),
              value: update.manualExchangeRate.value,
              reason: update.manualExchangeRate.reason,
            }
          : undefined,
      });
    }
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
