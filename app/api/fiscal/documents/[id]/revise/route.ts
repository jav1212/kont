import { encodeFiscalDocument } from "@kontave/fiscal/supabase";
import { FiscalFailure } from "@kontave/fiscal/domain";
import { SalesFailure } from "@kontave/sales/domain";
import { TaxationFailure } from "@kontave/taxation/domain";
import { createSalesFiscalActions } from "@/src/modules/sales/backend/infra/fiscal/sales-fiscal-factory";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";

/**
 * Rebuilds a fiscal draft from its authorized commercial source and records a revision.
 * @param request - JSON command with company, expected revision, reason, and retry key.
 * @param tenant - Authenticated tenant with the sales.update capability.
 * @returns The durable revision or a scoped validation/conflict response.
 * @throws Infrastructure failures in the shared authentication boundary may propagate.
 */
export const POST = withTenantPermission("sales.update", async (request, tenant) => {
  let documentId: string;
  try {
    documentId = decodeURIComponent(new URL(request.url).pathname.split("/").filter(Boolean).at(-2) ?? "");
  } catch {
    return Response.json({ error: "Identificador de documento inválido." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo de revisión inválido." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Cuerpo de revisión inválido." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const company = typeof input.companyId === "string" ? input.companyId.trim() : "";
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  const expectedRevision = input.expectedRevision;
  if (
    !documentId || documentId.length > 256 || !company || company.length > 256
    || typeof expectedRevision !== "number" || !Number.isInteger(expectedRevision)
    || expectedRevision < 1 || expectedRevision > 2_147_483_647
    || reason.length < 1 || reason.length > 500
    || idempotencyKey.length < 1 || idempotencyKey.length > 128
  ) {
    return Response.json({ error: "Datos de revisión fiscal inválidos." }, { status: 400 });
  }

  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  const client = new ServerSupabaseSource().instance;
  const { data, error } = await client.from("shared_companies")
    .select("id")
    .eq("tenant_id", tenant.tenantId)
    .eq("organization_id", authorization.organizationId)
    .eq("id", company)
    .maybeSingle();
  if (error) return Response.json({ error: "No fue posible validar la empresa." }, { status: 500 });
  if (!data) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });

  try {
    const actions = createSalesFiscalActions({
      tenantId: tenant.tenantId,
      actorId: tenant.userId,
      organizationId: authorization.organizationId,
      companyId: company,
    });
    const result = await actions.reviseFiscalDocument.execute({
      scope: actions.scope,
      documentId,
      expectedRevision,
      reason,
      idempotencyKey,
      actorId: tenant.userId,
      occurredAt: new Date().toISOString(),
    });
    return Response.json({
      data: {
        document: JSON.parse(encodeFiscalDocument(result.document)),
        revision: result.revision,
        replayed: result.replayed,
      },
    });
  } catch (cause) {
    if (cause instanceof SalesFailure) {
      return Response.json({ error: cause.message, code: cause.code }, { status: cause.code === "SALES_NOT_FOUND" ? 404 : 422 });
    }
    if (cause instanceof TaxationFailure) {
      return Response.json({ error: cause.message, code: cause.code }, { status: 422 });
    }
    if (cause instanceof FiscalFailure) {
      let status = 500;
      if (cause.code === "FISCAL_DOCUMENT_NOT_FOUND" || cause.code === "FISCAL_DOCUMENT_OUTSIDE_COMPANY") status = 404;
      else if (cause.code === "FISCAL_DOCUMENT_ACTOR_OUTSIDE_ORGANIZATION") status = 403;
      else if (cause.code.includes("CONFLICT") || cause.code.includes("TRANSITION") || cause.code.includes("IDEMPOTENCY")) status = 409;
      else if (cause.code.includes("INVALID")) status = 422;
      return Response.json({ error: cause.message, code: cause.code }, { status });
    }
    console.error("fiscal.document.revise_failed", { documentId, cause });
    return Response.json({ error: "No fue posible revisar el borrador fiscal." }, { status: 500 });
  }
});
