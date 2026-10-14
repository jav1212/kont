import { companyId } from "@kontave/companies/domain";
import { ManageTaxationConfiguration } from "@kontave/taxation/application";
import { SupabaseTaxationConfigurationRepository } from "@kontave/taxation/supabase";
import {
  legacyRateSlot,
  taxCode,
  taxRule,
  taxRuleCategory,
  taxRuleComponent,
  taxRuleId,
  taxationDate,
  TaxationFailure,
} from "@kontave/taxation/domain";
import { exactDecimal } from "@kontave/monetary/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { z } from "zod";

const ruleSchema = z.object({
  id: z.string().trim().min(1).max(128),
  taxCode: z.string().trim().min(1).max(64),
  jurisdiction: z.string().trim().min(2).max(16),
  treatment: z.enum(["taxed", "zero_rated", "exempt", "exonerated", "not_subject"]),
  rate: z.string().regex(/^\d+(\.\d+)?$/),
  calculationMode: z.enum(["tax_exclusive", "tax_inclusive"]),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  legalBasis: z.string().trim().min(1).max(500),
  version: z.string().trim().min(1).max(128),
  category: z.enum(["general", "reduced", "zero_rated", "luxury_surcharge", "payment_surcharge", "other"]),
  legacyRateSlot: z.enum(["a1", "a2", "a3", "a4", "a5"]).nullable(),
  component: z.enum(["base", "luxury", "payment"]),
});

const saveSchema = z.object({
  companyId: z.string().trim().min(1).max(256),
  expectedVersion: z.number().int().nonnegative(),
  rules: z.array(ruleSchema).max(500),
});

/**
 * Reads the authorized company's current or historical VAT rule catalog.
 * @param request - Query with company ID and optional catalog version.
 * @param tenant - Authenticated tenant with company-settings read permission.
 * @returns Versioned, effective-dated legal rules, or an access/persistence error.
 */
export const GET = withTenantPermission("companies.read", async (request, tenant) => {
  const query = new URL(request.url).searchParams;
  const companyValue = query.get("companyId")?.trim() ?? "";
  const rawVersion = query.get("version");
  const version = rawVersion === null ? undefined : Number(rawVersion);
  if (!companyValue || companyValue.length > 256 || (rawVersion !== null && (!Number.isSafeInteger(version) || version! < 0))) {
    return Response.json({ error: "Empresa o versión del catálogo inválida." }, { status: 400 });
  }

  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  const client = new ServerSupabaseSource().instance;
  const { data: company, error } = await client.from("shared_companies").select("id")
    .eq("tenant_id", tenant.tenantId).eq("organization_id", authorization.organizationId)
    .eq("id", companyValue).maybeSingle();
  if (error) return Response.json({ error: "No fue posible validar la empresa." }, { status: 503 });
  if (!company) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });

  try {
    const manager = new ManageTaxationConfiguration(new SupabaseTaxationConfigurationRepository(client));
    const catalog = await manager.getCompanyTaxRuleCatalog({
      actorUserId: userId(tenant.userId),
      organizationId: organizationId(authorization.organizationId),
      companyId: companyId(companyValue),
    }, version);
    return Response.json({ data: catalog });
  } catch (cause) {
    return taxationError(cause, "fiscal.iva.configuration.read_failed", companyValue);
  }
});

/**
 * Replaces an authorized company's VAT rule catalog with optimistic concurrency.
 * @param request - Company, expected version, validated rule snapshots, and idempotency header.
 * @param tenant - Authenticated tenant with company-settings write permission.
 * @returns The persisted catalog revision or a typed validation/concurrency/persistence error.
 */
export const PUT = withTenantPermission("companies.update", async (request, tenant) => {
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (!parsed.success || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    return Response.json({ error: "Catálogo o Idempotency-Key inválido." }, { status: 400 });
  }

  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  const client = new ServerSupabaseSource().instance;
  const { data: company, error } = await client.from("shared_companies").select("id")
    .eq("tenant_id", tenant.tenantId).eq("organization_id", authorization.organizationId)
    .eq("id", parsed.data.companyId).maybeSingle();
  if (error) return Response.json({ error: "No fue posible validar la empresa." }, { status: 503 });
  if (!company) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });

  try {
    const rules = parsed.data.rules.map((rule) => taxRule({
      id: taxRuleId(rule.id),
      taxCode: taxCode(rule.taxCode),
      jurisdiction: rule.jurisdiction,
      treatment: rule.treatment,
      rate: exactDecimal(rule.rate),
      calculationMode: rule.calculationMode,
      effectiveFrom: taxationDate(rule.effectiveFrom),
      effectiveTo: rule.effectiveTo === null ? null : taxationDate(rule.effectiveTo),
      legalBasis: rule.legalBasis,
      version: rule.version,
      category: taxRuleCategory(rule.category),
      legacyRateSlot: rule.legacyRateSlot === null ? null : legacyRateSlot(rule.legacyRateSlot),
      component: taxRuleComponent(rule.component),
    }));
    const manager = new ManageTaxationConfiguration(new SupabaseTaxationConfigurationRepository(client));
    const catalog = await manager.saveCompanyTaxRuleCatalog({
      actorUserId: userId(tenant.userId),
      organizationId: organizationId(authorization.organizationId),
      companyId: companyId(parsed.data.companyId),
      expectedVersion: parsed.data.expectedVersion,
      idempotencyKey,
      rules,
    });
    return Response.json({ data: catalog });
  } catch (cause) {
    return taxationError(cause, "fiscal.iva.configuration.write_failed", parsed.data.companyId);
  }
});

function taxationError(cause: unknown, event: string, companyIdValue: string): Response {
  if (cause instanceof TaxationFailure) return Response.json({ error: cause.message, code: cause.code }, {
    status: cause.code === "TAXATION_VERSION_CONFLICT" || cause.code === "TAXATION_IDEMPOTENCY_CONFLICT" ? 409
      : cause.code === "TAXATION_REPOSITORY_UNAVAILABLE" ? 503 : 422,
  });
  console.error(event, { companyId: companyIdValue, cause });
  return Response.json({ error: "No fue posible procesar el catálogo de IVA." }, { status: 500 });
}
