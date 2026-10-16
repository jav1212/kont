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
    id: z.string().min(1).max(128),
    beneficiary: z.string().min(1).max(240),
    concept: z.string().min(1).max(1000),
    amount: z.string().regex(/^(?:0|[1-9]\d{0,19})(?:\.\d{1,8})?$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
    dueDate: z.string().date().nullable(),
    branchId: z.string().min(1).max(128).nullable().optional(),
    deviceId: z.string().min(1).max(128).nullable().optional(),
  })
  .strict();
export async function POST(request: Request): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request);
    return Response.json(
      {
        data: await paymentOrders(scope).create(
          await securityJson(request, schema),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return securityErrorResponse(error);
  }
}
export async function GET(request: Request): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request);
    const url = new URL(request.url);
    const companyId = z
      .string()
      .min(1)
      .max(128)
      .parse(url.searchParams.get("companyId"));
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(100_000)
      .parse(url.searchParams.get("offset") ?? "0");
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .parse(url.searchParams.get("limit") ?? "50");
    return Response.json({
      data: await paymentOrders(scope).list({ companyId, offset, limit }),
    });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
