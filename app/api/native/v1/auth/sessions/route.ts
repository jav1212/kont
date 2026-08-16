import { executeSecurityRequest } from "@/src/native-api/v1/auth/native-security-http";

export async function GET(request: Request) {
  return executeSecurityRequest(request, ({ actions, userId, sessionId }) => (
    actions.list.execute(userId, sessionId)
  ));
}

export async function DELETE(request: Request) {
  return executeSecurityRequest(request, async ({ actions, userId, sessionId }) => {
    await actions.revokeOthers.execute({ userId, currentSessionId: sessionId });
    return { revoked: true };
  });
}
