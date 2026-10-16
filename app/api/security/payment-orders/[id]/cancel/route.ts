import { z } from "zod";
import {
  paymentOrders,
  requireSecurityWebScope,
  securityErrorResponse,
  securityJson,
} from "@/src/modules/security/backend/web-security";
const schema = z
  .object({
    companyId: z.string().min(1).max(128),
    expectedVersion: z.number().int().positive(),
    branchId: z.string().min(1).max(128).nullable().optional(),
    deviceId: z.string().min(1).max(128).nullable().optional(),
  })
  .strict();
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request);
    const body = await securityJson(request, schema);
    const id = (await context.params).id;
    if (!id.trim() || id.length > 128)
      return Response.json(
        { error: "El identificador no es válido." },
        { status: 400 },
      );
    return Response.json({
      data: await paymentOrders(scope).cancel({ ...body, id }),
    });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
