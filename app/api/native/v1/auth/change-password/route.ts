import type { NativeChangePasswordDto } from "@kontave/native-api-contracts";
import { AuthenticationFailure } from "@kontave/auth-domain";
import { executeSecurityRequest } from "@/src/native-api/v1/auth/native-security-http";

export async function POST(request: Request) {
  return executeSecurityRequest(request, async ({ actions, userId, sessionId, accessToken }) => {
    const body = await readChangePasswordBody(request);
    await actions.changePassword.execute({
      userId,
      currentSessionId: sessionId,
      accessToken,
      newPassword: body.newPassword,
      revokeOtherSessions: body.revokeOtherSessions ?? true,
    });
    return { changed: true };
  });
}

async function readChangePasswordBody(request: Request): Promise<NativeChangePasswordDto> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new AuthenticationFailure("INVALID_INPUT", "El cuerpo de la solicitud no es JSON válido.");
  }
  if (
    typeof value !== "object"
    || value === null
    || typeof (value as { newPassword?: unknown }).newPassword !== "string"
    || (
      (value as { revokeOtherSessions?: unknown }).revokeOtherSessions !== undefined
      && typeof (value as { revokeOtherSessions?: unknown }).revokeOtherSessions !== "boolean"
    )
  ) {
    throw new AuthenticationFailure("INVALID_INPUT", "La solicitud para cambiar la contraseña no es válida.");
  }
  return value as NativeChangePasswordDto;
}
