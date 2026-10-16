import { z } from "zod";
import {
  auditTrail,
  requireSecurityWebScope,
  securityErrorResponse,
  SecurityWebHttpError,
} from "@/src/modules/security/backend/web-security";
const entity = z.enum([
  "invoice",
  "payment_order",
  "receivable_payment_reversal",
  "customer",
  "product",
  "employee",
  "payroll_receipt",
  "accounting_entry",
]);
const action = z.enum(["create", "update", "delete", "cancel"]);
export async function GET(request: Request): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request);
    const url = new URL(request.url);
    const companyId = z
      .string()
      .min(1)
      .max(128)
      .safeParse(url.searchParams.get("companyId"));
    if (!companyId.success)
      throw new SecurityWebHttpError(400, "La empresa es obligatoria.");
    const entityType =
      url.searchParams.get("entityType") === null
        ? undefined
        : entity.parse(url.searchParams.get("entityType"));
    const actionsText = url.searchParams.get("actions");
    const actions = actionsText
      ? z.array(action).min(1).parse(actionsText.split(","))
      : undefined;
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
    const entityId = url.searchParams.get("entityId") ?? undefined;
    return Response.json({
      data: await auditTrail(scope).query({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          companyId: companyId.data,
        },
        entityType,
        entityId,
        actions,
        offset,
        limit,
      }),
    });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
