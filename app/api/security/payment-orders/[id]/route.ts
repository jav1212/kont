import { z } from "zod";
import {
  paymentOrders,
  requireSecurityWebScope,
  securityErrorResponse,
  securityJson,
  SecurityWebHttpError,
} from "@/src/modules/security/backend/web-security";
const query = z.object({ companyId: z.string().min(1).max(128) });
const patch = z
  .object({
    companyId: z.string().min(1).max(128),
    expectedVersion: z.number().int().positive(),
    beneficiary: z.string().min(1).max(240).optional(),
    concept: z.string().min(1).max(1000).optional(),
    amount: z
      .string()
      .regex(/^(?:0|[1-9]\d{0,19})(?:\.\d{1,8})?$/)
      .optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    dueDate: z.string().date().nullable().optional(),
    branchId: z.string().min(1).max(128).nullable().optional(),
    deviceId: z.string().min(1).max(128).nullable().optional(),
  })
  .strict();
const remove = z
  .object({
    companyId: z.string().min(1).max(128),
    expectedVersion: z.number().int().positive(),
    branchId: z.string().min(1).max(128).nullable().optional(),
    deviceId: z.string().min(1).max(128).nullable().optional(),
  })
  .strict();
const id = (value: string) => {
  const parsed = z.string().min(1).max(128).safeParse(value);
  if (!parsed.success)
    throw new SecurityWebHttpError(400, "El identificador no es válido.");
  return parsed.data;
};
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request);
    const companyId = query.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    ).companyId;
    return Response.json({
      data: await paymentOrders(scope).get({
        companyId,
        id: id((await context.params).id),
      }),
    });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request);
    const body = await securityJson(request, patch);
    return Response.json({
      data: await paymentOrders(scope).update({
        ...body,
        id: id((await context.params).id),
      }),
    });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request);
    const body = await securityJson(request, remove);
    await paymentOrders(scope).delete({
      ...body,
      id: id((await context.params).id),
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
