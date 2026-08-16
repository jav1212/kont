import { authenticatedSessionId } from "@kontave/auth-domain";
import { executeSecurityRequest } from "@/src/native-api/v1/auth/native-security-http";

interface RouteContext {
  readonly params: Promise<{ readonly sessionId: string }>;
}

export async function DELETE(request: Request, context: RouteContext) {
  const parameters = await context.params;
  return executeSecurityRequest(request, async ({ actions, userId, sessionId }) => {
    await actions.revoke.execute({
      userId,
      currentSessionId: sessionId,
      sessionId: authenticatedSessionId(parameters.sessionId),
    });
    return { revoked: true };
  });
}
