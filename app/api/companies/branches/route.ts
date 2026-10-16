import { z } from "zod";
import { companyId } from "@kontave/companies/domain";
import { createCompanyBranchActions } from "@kontave/companies/supabase";
import { organizationId, userId } from "@kontave/organizations/domain";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";

const companySchema = z.string().trim().min(1).max(128);
const selectionSchema = z.object({
  companyId: companySchema,
  branchId: z.string().uuid().nullable(),
  expectedVersion: z.number().int().nonnegative(),
}).strict();
const createSchema = z.object({
  companyId: companySchema,
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(120),
  idempotencyKey: z.string().trim().min(1).max(128),
}).strict();

/** Lists branches and this authenticated user's active selection for one company.
 * @param request - Authenticated request containing the company identifier.
 * @returns Branch directory and versioned branch selection.
 * @throws Expected scope and repository errors are translated to HTTP responses.
 */
export const GET = withTenantPermission("branches.read", async (request, tenant) => {
  const parsedCompanyId = companySchema.safeParse(new URL(request.url).searchParams.get("companyId"));
  if (!parsedCompanyId.success) return Response.json({ error: "Empresa inválida." }, { status: 400 });
  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  try {
    const actions = createCompanyBranchActions({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    });
    const scope = {
      actorUserId: userId(tenant.userId),
      organizationId: organizationId(authorization.organizationId),
      companyId: companyId(parsedCompanyId.data),
    };
    const [branches, selection] = await Promise.all([
      actions.list.execute(scope),
      actions.getSelection.execute(scope),
    ]);
    return Response.json({ data: { branches, selection } });
  } catch (cause) {
    return branchFailure(cause);
  }
});

/** Persists an explicit branch choice with optimistic concurrency.
 * @param request - Authenticated selection command.
 * @returns The server-validated branch selection.
 * @throws Expected scope and repository errors are translated to HTTP responses.
 */
export const PATCH = withTenantPermission("branches.select", async (request, tenant) => {
  const input = selectionSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "La selección de sucursal no es válida." }, { status: 400 });
  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  try {
    const actions = createCompanyBranchActions({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    });
    const selection = await actions.select.execute({
      actorUserId: userId(tenant.userId),
      organizationId: organizationId(authorization.organizationId),
      companyId: companyId(input.data.companyId),
      branchId: input.data.branchId,
      expectedVersion: input.data.expectedVersion,
    });
    return Response.json({ data: selection });
  } catch (cause) {
    return branchFailure(cause);
  }
});

/** Registers a company branch using the package's idempotent server command.
 * @param request - Authenticated branch details and stable retry key.
 * @returns The registered branch.
 * @throws Expected scope and repository errors are translated to HTTP responses.
 */
export const POST = withTenantPermission("branches.create", async (request, tenant) => {
  const input = createSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Los datos de la sucursal no son válidos." }, { status: 400 });
  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  try {
    const actions = createCompanyBranchActions({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    });
    const branch = await actions.create.execute({
      actorUserId: userId(tenant.userId),
      organizationId: organizationId(authorization.organizationId),
      companyId: companyId(input.data.companyId),
      code: input.data.code,
      name: input.data.name,
      idempotencyKey: input.data.idempotencyKey,
    });
    return Response.json({ data: branch }, { status: 201 });
  } catch (cause) {
    return branchFailure(cause);
  }
});

function branchFailure(cause: unknown): Response {
  const code = typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string" ? cause.code : undefined;
  const message = code?.includes("VERSION_CONFLICT")
    ? "La sucursal cambió desde la última consulta. Actualiza la lista y vuelve a intentarlo."
    : code?.includes("ALREADY_EXISTS") ? "Ya existe una sucursal con ese código."
      : code?.includes("NOT_FOUND") ? "La empresa o sucursal solicitada no existe."
        : code?.includes("ACCESS_DENIED") ? "No tienes permiso para esta operación de sucursales."
          : "No fue posible completar la operación de sucursales.";
  const status = code?.includes("VERSION_CONFLICT") || code?.includes("ALREADY_EXISTS") || code?.includes("IDEMPOTENCY_CONFLICT") || code?.includes("NOT_OPERATIONAL") ? 409
    : code?.includes("ACCESS_DENIED") ? 403
      : code?.includes("NOT_FOUND") ? 404
        : code?.includes("UNAVAILABLE") ? 503 : 422;
  console.error("companies.branches.request_failed", { code, cause });
  return Response.json({ error: message, ...(code ? { code } : {}) }, { status });
}
