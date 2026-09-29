import { z } from "zod";
import { permissionCode } from "@kontave/access-control/domain";
import {
  accountSecurity,
  requireSecurityWebScope,
  securityErrorResponse,
  securityJson,
} from "@/src/modules/security/backend/web-security";
const policy = z
  .object({
    passwordMaximumAgeDays: z.number().int().positive().nullable(),
    inactivityMaximumDays: z.number().int().positive().nullable(),
    failedAttemptLimit: z.number().int().positive(),
    failedAttemptWindowMinutes: z.number().int().positive(),
    lockoutMinutes: z.number().int().positive(),
  })
  .strict();
const update = z
  .object({ expectedVersion: z.number().int().positive(), policy })
  .strict();
export async function GET(request: Request): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request, {
      permission: permissionCode("roles.manage"),
    });
    return Response.json({ data: await accountSecurity(scope).getPolicy() });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
export async function PUT(request: Request): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request, {
      permission: permissionCode("roles.manage"),
    });
    const body = await securityJson(request, update);
    return Response.json({
      data: await accountSecurity(scope).updatePolicy(body),
    });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
