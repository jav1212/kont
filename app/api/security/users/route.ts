import { z } from "zod";
import {
  organizationalUsers,
  requireSecurityWebScope,
  securityErrorResponse,
  securityJson,
} from "@/src/modules/security/backend/web-security";

const createSchema = z
  .object({
    userId: z.string().uuid(),
    displayName: z.string().max(160).nullable().optional(),
    administrativePriority: z.number().int().min(0).max(1000),
    allowedCompanyIds: z.array(z.string().min(1).max(128)).max(500),
  })
  .strict();

export async function GET(request: Request): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request);
    return Response.json({ data: await organizationalUsers(scope).list() });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
export async function POST(request: Request): Promise<Response> {
  try {
    const scope = await requireSecurityWebScope(request);
    const body = await securityJson(request, createSchema);
    return Response.json(
      { data: await organizationalUsers(scope).create(body) },
      { status: 201 },
    );
  } catch (error) {
    return securityErrorResponse(error);
  }
}
