import { companyId } from "@kontave/companies/domain";
import { SupabaseFiscalDocumentRepository, encodeFiscalDocument } from "@kontave/fiscal/supabase";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";

/** Reads one fiscal snapshot after checking the caller's organization and company scope. */
export const GET = withTenantPermission("sales.read", async (request, tenant) => {
  const rawDocumentId = new URL(request.url).pathname.split("/").pop() ?? "";
  let documentId = "";
  try { documentId = decodeURIComponent(rawDocumentId); } catch { return Response.json({ error: "Identificador de documento inválido." }, { status: 400 }); }
  const requestedCompanyId = new URL(request.url).searchParams.get("companyId")?.trim() ?? "";
  if (!documentId || documentId.length > 256 || !requestedCompanyId || requestedCompanyId.length > 256) {
    return Response.json({ error: "Identificador de documento o empresa inválido." }, { status: 400 });
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
  if (companyError) return Response.json({ error: "No fue posible consultar el documento fiscal." }, { status: 500 });
  if (!company) return Response.json({ error: "Documento fiscal no encontrado." }, { status: 404 });

  try {
    const repository = new SupabaseFiscalDocumentRepository(client);
    const document = await repository.find({
      tenantId: tenant.tenantId,
      organizationId: authorization.organizationId,
      companyId: companyId(requestedCompanyId),
    }, documentId);
    if (!document) return Response.json({ error: "Documento fiscal no encontrado." }, { status: 404 });
    const metadata = await repository.findMetadata({
      tenantId: tenant.tenantId, organizationId: authorization.organizationId, companyId: companyId(requestedCompanyId),
    }, documentId);
    if (!metadata) return Response.json({ error: "Documento fiscal no encontrado." }, { status: 404 });
    return Response.json({ data: JSON.parse(encodeFiscalDocument(document)), metadata: {
      revision: metadata.revision, source: metadata.source, canRevise: metadata.canRevise,
    } });
  } catch {
    return Response.json({ error: "No fue posible consultar el documento fiscal." }, { status: 500 });
  }
});
