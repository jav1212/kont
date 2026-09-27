import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { TaxationFailure, taxCode } from "@kontave/taxation/domain";
import { withTenantPermission, resolveCanonicalTenantAuthorization } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { createServiceTaxationActions } from "@/src/modules/sales/backend/infra/fiscal/sales-fiscal-factory";
import { z } from "zod";

const inputSchema = z.object({
  companyId: z.string().trim().min(1).max(256),
  serviceCode: z.string().trim().min(1).max(128),
  unitCode: z.string().trim().min(1).max(32),
  jurisdiction: z.string().trim().min(2).max(16),
  taxCode: z.string().trim().min(1).max(64),
  treatment: z.enum(["taxed", "exempt", "exonerated", "not_subject"]),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  legalBasis: z.string().trim().min(1).max(500),
  expectedVersion: z.number().int().nonnegative(),
});

/**
 * Reads one service tax profile within the caller's authorized company.
 * @param request - Query containing companyId and serviceCode.
 * @returns The versioned profile, or 404 when it has not been configured.
 * @throws Expected authentication and permission failures are translated by the tenant wrapper.
 */
export const GET = withTenantPermission("sales.read", async (request, tenant) => {
  const query = new URL(request.url).searchParams;
  const companyValue = query.get("companyId")?.trim() ?? "";
  const serviceCode = query.get("serviceCode")?.trim() ?? "";
  if (!companyValue || companyValue.length > 256 || !serviceCode || serviceCode.length > 128) {
    return Response.json({ error: "Empresa o código de servicio inválido." }, { status: 400 });
  }
  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  const client = new ServerSupabaseSource().instance;
  const { data: company, error } = await client.from("shared_companies").select("id")
    .eq("tenant_id", tenant.tenantId).eq("organization_id", authorization.organizationId)
    .eq("id", companyValue).maybeSingle();
  if (error) return Response.json({ error: "No fue posible validar la empresa." }, { status: 500 });
  if (!company) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
  try {
    const profile = await createServiceTaxationActions().getProfile.execute({
      actorUserId: userId(tenant.userId),
      organizationId: organizationId(authorization.organizationId),
      companyId: companyId(companyValue),
    }, serviceCode);
    return profile
      ? Response.json({ data: profile })
      : Response.json({ error: "La clasificación fiscal del servicio no existe." }, { status: 404 });
  } catch (cause) {
    if (cause instanceof TaxationFailure) {
      return Response.json({ error: cause.message, code: cause.code }, {
        status: cause.code === "TAXATION_REPOSITORY_UNAVAILABLE" ? 503 : 422,
      });
    }
    console.error("fiscal.service_taxonomy.read_failed", { companyId: companyValue, serviceCode, cause });
    return Response.json({ error: "No fue posible consultar la clasificación fiscal del servicio." }, { status: 500 });
  }
});

/**
 * Sets an effective service tax classification for one authorized company.
 * @param request - Request body with company, service code, treatment, effective date, and legal basis.
 * @returns The persisted service tax profile and its new version.
 * @throws Expected authentication and permission failures are translated by the tenant wrapper.
 */
export const POST = withTenantPermission("sales.update", async (request, tenant) => {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Datos de clasificación fiscal inválidos." }, { status: 400 });
  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });

  const client = new ServerSupabaseSource().instance;
  const { data: company, error } = await client.from("shared_companies").select("id")
    .eq("tenant_id", tenant.tenantId).eq("organization_id", authorization.organizationId)
    .eq("id", parsed.data.companyId).maybeSingle();
  if (error) return Response.json({ error: "No fue posible validar la empresa." }, { status: 500 });
  if (!company) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });

  try {
    const profile = await createServiceTaxationActions().setTreatment.execute({
      actorUserId: userId(tenant.userId),
      organizationId: organizationId(authorization.organizationId),
      companyId: companyId(parsed.data.companyId),
      serviceCode: parsed.data.serviceCode,
      unitCode: parsed.data.unitCode,
      jurisdiction: parsed.data.jurisdiction,
      taxCode: taxCode(parsed.data.taxCode),
      treatment: parsed.data.treatment,
      effectiveFrom: parsed.data.effectiveFrom,
      legalBasis: parsed.data.legalBasis,
      expectedVersion: parsed.data.expectedVersion,
    });
    return Response.json({ data: profile });
  } catch (cause) {
    if (cause instanceof TaxationFailure) {
      return Response.json({ error: cause.message, code: cause.code }, {
        status: cause.code === "TAXATION_VERSION_CONFLICT" ? 409
          : cause.code === "TAXATION_REPOSITORY_UNAVAILABLE" ? 503 : 422,
      });
    }
    console.error("fiscal.service_taxonomy.update_failed", { cause });
    return Response.json({ error: "No fue posible actualizar la clasificación fiscal del servicio." }, { status: 500 });
  }
});
