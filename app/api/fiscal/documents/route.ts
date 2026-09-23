import { companyId } from "@kontave/companies/domain";
import { SupabaseFiscalDocumentRepository, encodeFiscalDocument } from "@kontave/fiscal/supabase";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";

/** Lists fiscal snapshots for an authorized company using a stable keyset cursor. */
export const GET = withTenantPermission("sales.read", async (request, tenant) => {
  const query = new URL(request.url).searchParams;
  const requestedCompanyId = query.get("companyId")?.trim() ?? "";
  const rawLimit = query.get("limit");
  const limit = rawLimit === null ? 25 : Number(rawLimit);
  const cursorCreatedAt = query.get("cursorCreatedAt");
  const cursorId = query.get("cursorId");
  if (!requestedCompanyId || requestedCompanyId.length > 256 || !Number.isInteger(limit) || limit < 1 || limit > 100
      || ((cursorCreatedAt === null) !== (cursorId === null))
      || (cursorCreatedAt !== null && (cursorCreatedAt.length > 64 || !cursorId || cursorId.length > 256))) {
    return Response.json({ error: "Parámetros de consulta fiscal inválidos." }, { status: 400 });
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
  if (companyError) return Response.json({ error: "No fue posible consultar los documentos fiscales." }, { status: 500 });
  if (!company) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });

  try {
    const repository = new SupabaseFiscalDocumentRepository(client);
    const page = await repository.list({
      tenantId: tenant.tenantId,
      organizationId: authorization.organizationId,
      companyId: companyId(requestedCompanyId),
    }, {
      limit,
      cursor: cursorCreatedAt === null || cursorId === null ? null : { createdAt: cursorCreatedAt, id: cursorId },
    });
    return Response.json({
      data: page.items.map((item) => ({ ...item, document: JSON.parse(encodeFiscalDocument(item.document)) })),
      nextCursor: page.nextCursor,
    });
  } catch {
    return Response.json({ error: "No fue posible consultar los documentos fiscales." }, { status: 500 });
  }
});
