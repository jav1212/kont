import { companyId } from "@kontave/companies/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ManageTaxationConfiguration } from "@kontave/taxation/application";
import { SupabaseTaxationConfigurationRepository } from "@kontave/taxation/supabase";
import { TaxationFailure, taxationDate } from "@kontave/taxation/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { resolveCanonicalTenantAuthorization, withTenantPermission, type TenantContext } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { z } from "zod";

const profileSchema = z.object({
  companyId: z.string().trim().min(1).max(256),
  counterpartyId: z.string().trim().min(1).max(128),
  contributorStatus: z.enum(["ordinary", "formal", "occasional", "unverified"]),
  residenceStatus: z.enum(["domestic", "import_goods", "foreign_service", "unverified"]),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  legalBasis: z.string().trim().min(1).max(500),
  evidenceReference: z.string().trim().min(1).max(500),
  expectedVersion: z.number().int().nonnegative(),
});

/**
 * Reads the explicit counterparty classification effective on a date.
 * @param request - Query containing company, counterparty and effective date.
 * @param tenant - Authenticated tenant with company-read permission.
 * @returns Effective profile, null when unclassified, or an access/persistence error.
 */
export const GET = withTenantPermission("companies.read", async (request, tenant) => {
  const query = new URL(request.url).searchParams;
  const companyValue = query.get("companyId")?.trim() ?? "";
  const counterpartyId = query.get("counterpartyId")?.trim() ?? "";
  const effectiveDate = query.get("effectiveDate")?.trim() ?? "";
  if (!companyValue || companyValue.length > 256 || !counterpartyId || counterpartyId.length > 128 || !isDate(effectiveDate)) {
    return Response.json({ error: "Empresa, contraparte o fecha efectiva inválida." }, { status: 400 });
  }
  const access = await authorizedCompany(tenant, companyValue);
  if (access instanceof Response) return access;
  const exists = await counterpartyExists(access.client, tenant.tenantId, companyValue, counterpartyId);
  if (exists === null) return Response.json({ error: "No fue posible validar la contraparte." }, { status: 503 });
  if (!exists) return Response.json({ error: "Proveedor o cliente no encontrado en la empresa." }, { status: 404 });
  try {
    const manager = new ManageTaxationConfiguration(new SupabaseTaxationConfigurationRepository(access.client));
    const profile = await manager.getCounterpartyFiscalProfile(access.scope, counterpartyId, effectiveDate);
    return Response.json({ data: profile });
  } catch (cause) {
    return errorResponse(cause, "fiscal.iva.counterparty_profile.read_failed", companyValue);
  }
});

/**
 * Saves an effective-dated counterparty classification with optimistic concurrency.
 * @param request - Profile evidence and expected revision with a stable idempotency header.
 * @param tenant - Authenticated tenant with company-update permission.
 * @returns Persisted profile or a typed validation/concurrency/persistence error.
 */
export const PUT = withTenantPermission("companies.update", async (request, tenant) => {
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (!parsed.success || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    return Response.json({ error: "Perfil fiscal o Idempotency-Key inválido." }, { status: 400 });
  }
  const access = await authorizedCompany(tenant, parsed.data.companyId);
  if (access instanceof Response) return access;
  const exists = await counterpartyExists(access.client, tenant.tenantId, parsed.data.companyId, parsed.data.counterpartyId);
  if (exists === null) return Response.json({ error: "No fue posible validar la contraparte." }, { status: 503 });
  if (!exists) return Response.json({ error: "Proveedor o cliente no encontrado en la empresa." }, { status: 404 });
  try {
    const manager = new ManageTaxationConfiguration(new SupabaseTaxationConfigurationRepository(access.client));
    const profile = await manager.saveCounterpartyFiscalProfile({
      ...access.scope,
      counterpartyId: parsed.data.counterpartyId,
      contributorStatus: parsed.data.contributorStatus,
      residenceStatus: parsed.data.residenceStatus,
      effectiveFrom: taxationDate(parsed.data.effectiveFrom),
      effectiveTo: parsed.data.effectiveTo === null ? null : taxationDate(parsed.data.effectiveTo),
      legalBasis: parsed.data.legalBasis,
      evidenceReference: parsed.data.evidenceReference,
      expectedVersion: parsed.data.expectedVersion,
      idempotencyKey,
    });
    return Response.json({ data: profile });
  } catch (cause) {
    return errorResponse(cause, "fiscal.iva.counterparty_profile.write_failed", parsed.data.companyId);
  }
});

async function authorizedCompany(tenant: TenantContext, companyValue: string): Promise<{
  readonly client: SupabaseClient;
  readonly scope: { readonly actorUserId: ReturnType<typeof userId>; readonly organizationId: ReturnType<typeof organizationId>; readonly companyId: ReturnType<typeof companyId> };
} | Response> {
  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  const client = new ServerSupabaseSource().instance;
  const { data: company, error } = await client.from("shared_companies").select("id")
    .eq("tenant_id", tenant.tenantId).eq("organization_id", authorization.organizationId)
    .eq("id", companyValue).maybeSingle();
  if (error) return Response.json({ error: "No fue posible validar la empresa." }, { status: 503 });
  if (!company) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
  return {
    client,
    scope: { actorUserId: userId(tenant.userId), organizationId: organizationId(authorization.organizationId), companyId: companyId(companyValue) },
  };
}

async function counterpartyExists(client: SupabaseClient, tenantId: string, companyValue: string, counterpartyId: string): Promise<boolean | null> {
  const [supplier, customer] = await Promise.all([
    client.from("shared_inventory_suppliers").select("id").eq("tenant_id", tenantId).eq("company_id", companyValue).eq("id", counterpartyId).maybeSingle(),
    client.from("shared_inventory_customers").select("id").eq("tenant_id", tenantId).eq("company_id", companyValue).eq("id", counterpartyId).maybeSingle(),
  ]);
  if (supplier.error || customer.error) return null;
  return supplier.data !== null || customer.data !== null;
}

function errorResponse(cause: unknown, event: string, companyValue: string): Response {
  if (cause instanceof TaxationFailure) return Response.json({ error: cause.message, code: cause.code }, {
    status: cause.code === "TAXATION_VERSION_CONFLICT" || cause.code === "TAXATION_IDEMPOTENCY_CONFLICT" ? 409
      : cause.code === "TAXATION_REPOSITORY_UNAVAILABLE" ? 503 : 422,
  });
  console.error(event, { companyId: companyValue, cause });
  return Response.json({ error: "No fue posible procesar el perfil fiscal de la contraparte." }, { status: 500 });
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
