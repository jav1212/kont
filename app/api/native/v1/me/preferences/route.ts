import { PreferencesFailure } from "@kontave/preferences-domain";
import type { NativeUpdateUserPreferencesDto } from "@kontave/native-api-contracts";
import { userId } from "@kontave/organizations-domain";
import { authenticateNativeRequest, readBearerToken } from "@/src/native-api/v1/auth/native-auth-context";
import { nativeError, nativeSuccess } from "@/src/native-api/v1/http/native-response";
import { createNativePreferencesActions } from "@/src/native-api/v1/preferences/native-preferences-actions";
import { toNativeUserPreferencesDto } from "@/src/native-api/v1/preferences/native-preferences-mapper";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> { return execute(request); }
export async function PATCH(request: Request): Promise<Response> {
  let body: NativeUpdateUserPreferencesDto;
  try { body = await request.json() as NativeUpdateUserPreferencesDto; }
  catch { return nativeError("INVALID_REQUEST", "La solicitud no es válida.", crypto.randomUUID(), 400); }
  return execute(request, body);
}

async function execute(request: Request, update?: NativeUpdateUserPreferencesDto): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const accessToken = readBearerToken(request.headers.get("authorization"));
    const identity = accessToken ? await authenticateNativeRequest(request) : null;
    if (!accessToken || !identity) return nativeError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);
    const actions = createNativePreferencesActions(accessToken);
    const value = update
      ? await actions.update.execute({ userId: userId(identity.userId), expectedVersion: update.expectedVersion, appearance: update.appearance, regional: update.regional })
      : await actions.get.execute(userId(identity.userId));
    return nativeSuccess(toNativeUserPreferencesDto(value), requestId);
  } catch (cause: unknown) {
    if (cause instanceof PreferencesFailure) {
      const status = cause.code === "PREFERENCES_VERSION_CONFLICT" ? 409 : cause.code === "PREFERENCES_INVALID" ? 400 : 503;
      return nativeError(cause.code, cause.message, requestId, status);
    }
    console.error("native.preferences.failed", { requestId, cause });
    return nativeError("INTERNAL_ERROR", "No se pudieron procesar las preferencias.", requestId, 500);
  }
}
