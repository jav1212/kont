import { z } from "zod";
import {
  hasScopedGrant,
  requireSecurityWebScope,
  securityErrorResponse,
  securityJson,
} from "@/src/modules/security/backend/web-security";
const schema = z
  .object({
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
export async function POST(request: Request): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request);
    return Response.json({
      data: {
        granted: await hasScopedGrant(
          scope,
          await securityJson(request, schema),
        ),
      },
    });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
