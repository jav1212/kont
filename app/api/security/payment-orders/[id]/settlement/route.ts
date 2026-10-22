import { z } from "zod";
import {
  paymentOrders,
  requireSecurityWebScope,
  securityErrorResponse,
  SecurityWebHttpError,
} from "@/src/modules/security/backend/web-security";

const query = z.object({ companyId: z.string().min(1).max(128) });

/** Reads administrative order state together with immutable Treasury execution evidence.
 * @param request - Authenticated same-origin request carrying the company scope.
 * @param context - Route parameters containing the payment-order identity.
 * @returns A serialized order settlement projection or an authorization/validation error.
 * @throws Returns an HTTP error response when either owning context rejects the read.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request);
    const companyId = query.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    ).companyId;
    const id = z.string().min(1).max(128).safeParse((await context.params).id);
    if (!id.success)
      throw new SecurityWebHttpError(400, "El identificador no es válido.");
    return Response.json({
      data: await paymentOrders(scope).settlement({ companyId, id: id.data }),
    });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
