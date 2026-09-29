import { z } from "zod";
import {
  organizationalUsers,
  requireSecurityWebScope,
  securityErrorResponse,
  securityJson,
  securityRouteId,
} from "@/src/modules/security/backend/web-security";

const patchSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    displayName: z.string().max(160).nullable().optional(),
    administrativePriority: z.number().int().min(0).max(1000).optional(),
    allowedCompanyIds: z.array(z.string().min(1).max(128)).max(500).optional(),
  })
  .strict();
const deleteSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();
export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request);
    const body = await securityJson(request, patchSchema);
    const target = securityRouteId((await context.params).userId);
    return Response.json({
      data: await organizationalUsers(scope).update(target, {
        expectedVersion: body.expectedVersion,
        changes: {
          displayName: body.displayName,
          administrativePriority: body.administrativePriority,
          allowedCompanyIds: body.allowedCompanyIds,
        },
      }),
    });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string }> },
): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request);
    const body = await securityJson(request, deleteSchema);
    await organizationalUsers(scope).revoke(
      securityRouteId((await context.params).userId),
      body.expectedVersion,
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
