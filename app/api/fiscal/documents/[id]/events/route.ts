import { companyId } from "@kontave/companies/domain";
import { SupabaseFiscalDocumentRepository } from "@kontave/fiscal/supabase";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";

/** Lists the immutable audit events for a fiscal document in an authorized company. */
export const GET = withTenantPermission("sales.read", async (request, tenant) => {
  const query = new URL(request.url).searchParams;
  const documentId = new URL(request.url).pathname.split("/").at(-2) ?? "";
  const requestedCompanyId = query.get("companyId")?.trim() ?? "";
  const rawLimit = query.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  const cursorRecordedAt = query.get("cursorRecordedAt");
  const cursorId = query.get("cursorId");
  if (!documentId || documentId.length > 256 || !requestedCompanyId || requestedCompanyId.length > 256
      || !Number.isInteger(limit) || limit < 1 || limit > 100
      || ((cursorRecordedAt === null) !== (cursorId === null))
      || (cursorRecordedAt !== null && (cursorRecordedAt.length > 64 || !cursorId || !/^[0-9a-f-]{36}$/i.test(cursorId)))) {
    return Response.json({ error: "Parámetros de bitácora fiscal inválidos." }, { status: 400 });
  }

  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });

  const client = new ServerSupabaseSource().instance;
  const { data: company, error: companyError } = await client.from("shared_companies")
    .select("id")
    .eq("tenant_id", tenant.tenantId)
    .eq("organization_id", authorization.organizationId)
    .eq("id", requestedCompanyId)
    .maybeSingle();
  if (companyError) return Response.json({ error: "No fue posible consultar la bitácora fiscal." }, { status: 500 });
  if (!company) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });

  try {
    const repository = new SupabaseFiscalDocumentRepository(client);
    const page = await repository.listEvents({
      tenantId: tenant.tenantId,
      organizationId: authorization.organizationId,
      companyId: companyId(requestedCompanyId),
    }, documentId, {
      limit,
      cursor: cursorRecordedAt === null || cursorId === null ? null : { createdAt: cursorRecordedAt, id: cursorId },
    });
    return Response.json({ data: page.items, nextCursor: page.nextCursor });
  } catch {
    return Response.json({ error: "No fue posible consultar la bitácora fiscal." }, { status: 500 });
  }
});
