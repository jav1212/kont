import { z } from "zod";
import {
  listScopedGrants,
  mutateScopedGrant,
  requireSecurityWebScope,
  securityErrorResponse,
  securityJson,
} from "@/src/modules/security/backend/web-security";
const schema = z
  .object({
    membershipId: z.string().uuid(),
    permissionCode: z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/),
    target: z
      .object({
        kind: z.string().min(1).max(80),
        id: z.string().min(1).max(160),
      })
      .strict(),
    companyId: z.string().min(1).max(128).optional(),
  })
  .strict();
const listSchema = z.object({ membershipId: z.string().uuid() });
export async function GET(request: Request): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request);
    const query = listSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success)
      return Response.json(
        { error: "La membresía no es válida." },
        { status: 400 },
      );
    return Response.json({
      data: await listScopedGrants(scope, query.data.membershipId),
    });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
export async function POST(request: Request): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request);
    await mutateScopedGrant(scope, await securityJson(request, schema));
    return new Response(null, { status: 204 });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
export async function DELETE(request: Request): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request);
    await mutateScopedGrant(scope, {
      ...(await securityJson(request, schema)),
      revoke: true,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
