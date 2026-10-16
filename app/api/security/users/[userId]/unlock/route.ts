import {
  accountSecurity,
  requireSecurityWebScope,
  securityErrorResponse,
  securityRouteId,
} from "@/src/modules/security/backend/web-security";
export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request);
    await accountSecurity(scope).unlock(
      securityRouteId((await context.params).userId),
    );
    return Response.json({ data: { unlocked: true } });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
