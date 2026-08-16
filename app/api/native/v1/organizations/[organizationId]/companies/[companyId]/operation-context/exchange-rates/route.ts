import type { NativeExchangeRateSetDto } from "@kontave/native-api-contracts";
import { currency } from "@kontave/monetary-domain";
import { companyId, organizationId, userId } from "@kontave/organizations-domain";
import { localDate } from "@kontave/operation-context-domain";
import { authenticateNativeRequest } from "@/src/native-api/v1/auth/native-auth-context";
import { nativeError, nativeSuccess } from "@/src/native-api/v1/http/native-response";
import { createNativeExchangeRateResolver, createNativeOperationContextCoordinator } from "@/src/native-api/v1/operation-context/operation-context-actions";
import { operationContextErrorResponse } from "@/src/native-api/v1/operation-context/operation-context-http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ organizationId: string; companyId: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateNativeRequest(request);
    if (!identity) return nativeError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);
    const params = await context.params;
    const key = { userId: userId(identity.userId), organizationId: organizationId(params.organizationId), companyId: companyId(params.companyId) };
    const coordinator = createNativeOperationContextCoordinator();
    await coordinator.initialize(key);
    const state = coordinator.getState();
    if (state.status !== "ready") throw state.status === "failed" ? state.failure : new Error("Operation context did not initialize.");
    const rawDate = new URL(request.url).searchParams.get("date") ?? state.value.effectiveDate;
    const date = localDate(rawDate);
    const set = await createNativeExchangeRateResolver().historical(currency("VES", 2), date);
    const data: NativeExchangeRateSetDto = {
      requestedDate: set.requestedDate,
      effectiveDate: set.effectiveDate,
      resolution: set.resolution,
      observedAt: set.observedAt,
      rates: set.rates.map((snapshot) => ({
        baseCurrency: snapshot.rate.baseCurrency.code,
        quoteCurrency: snapshot.rate.quoteCurrency.code,
        value: snapshot.rate.value,
        effectiveDate: snapshot.effectiveDate,
        capturedAt: snapshot.capturedAt,
        source: snapshot.source,
      })),
    };
    return nativeSuccess(data, requestId);
  } catch (cause: unknown) { return operationContextErrorResponse(cause, requestId); }
}
