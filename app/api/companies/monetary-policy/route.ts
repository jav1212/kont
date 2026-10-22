import { CompanyFailure, companyId, companyMonetaryPolicySettings, COMPANY_MONETARY_RATE_SOURCE, COMPANY_MONETARY_ROUNDING_PROFILE } from "@kontave/companies/domain";
import type { CompanyMonetaryPolicy } from "@kontave/companies/domain";
import { currencyCode } from "@kontave/monetary/domain";
import { getCompanyAdministrationWebContext } from "@/src/modules/companies/backend/administration-web";
import { withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { z } from "zod";

const companyIdSchema = z.string().trim().min(1).max(128);
const updateSchema = z.object({
  companyId: companyIdSchema,
  expectedPolicyVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(1).max(500),
  referenceCurrencyCodes: z.array(z.enum(["USD", "EUR"])).min(1).max(2).refine((values) => new Set(values).size === values.length),
});

/**
 * Reads the current immutable monetary policy without creating a default.
 * @param request - Authenticated request with a company identifier.
 * @returns Current policy or null when it has not been configured.
 * @throws Tenant authorization and persistence failures are translated to HTTP responses.
 */
export const GET = withTenantPermission("companies.read", async (request, tenant) => {
  const parsed = companyIdSchema.safeParse(new URL(request.url).searchParams.get("companyId"));
  if (!parsed.success) return Response.json({ error: "Empresa inválida." }, { status: 400 });
  try {
    const context = await getCompanyAdministrationWebContext(tenant, parsed.data);
    if (!context) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
    const policy = await context.actions.getMonetaryPolicy.execute({ ...context.actions.scope(), companyId: companyId(context.company.id) });
    return Response.json({ data: policy ? serializePolicy(policy) : null });
  } catch (cause) { return failure(cause); }
});

/**
 * Appends a company monetary-policy revision with an audit reason and replay key.
 * @param request - Authenticated policy update with the expected revision.
 * @returns The persisted immutable policy revision.
 * @throws Tenant authorization, validation and concurrency failures are translated to HTTP responses.
 */
export const PATCH = withTenantPermission("companies.update", async (request, tenant) => {
  const input = updateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "La política monetaria no es válida." }, { status: 400 });
  try {
    const context = await getCompanyAdministrationWebContext(tenant, input.data.companyId);
    if (!context) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
    const settings = companyMonetaryPolicySettings({
      operatingCurrencyCode: currencyCode("VES"), operatingCurrencyMinorUnit: 2,
      referenceCurrencyCodes: input.data.referenceCurrencyCodes.map((code) => currencyCode(code)).sort(),
      rateSource: COMPANY_MONETARY_RATE_SOURCE, roundingProfile: COMPANY_MONETARY_ROUNDING_PROFILE,
      allowPreviousAvailableDate: false, maxPreviousDays: 0,
    });
    const policy = await context.actions.configureMonetaryPolicy.execute({
      ...context.actions.scope(), companyId: companyId(context.company.id),
      expectedPolicyVersion: input.data.expectedPolicyVersion,
      idempotencyKey: input.data.idempotencyKey, reason: input.data.reason, settings,
    });
    return Response.json({ data: serializePolicy(policy) });
  } catch (cause) { return failure(cause); }
});

function serializePolicy(policy: CompanyMonetaryPolicy) {
  return {
    version: policy.version,
    operatingCurrency: policy.operatingCurrency,
    referenceCurrencyCodes: policy.referenceCurrencies.map(({ code }) => code),
    rateSource: policy.rateSource,
    roundingProfile: policy.roundingProfile,
    allowPreviousAvailableDate: policy.allowPreviousAvailableDate,
    configuredAt: policy.configuredAt,
  };
}

function failure(cause: unknown): Response {
  if (cause instanceof CompanyFailure) return Response.json({ error: cause.message, code: cause.code }, {
    status: cause.code === "COMPANY_MONETARY_POLICY_VERSION_CONFLICT" || cause.code === "COMPANY_MONETARY_POLICY_IDEMPOTENCY_CONFLICT" ? 409
      : cause.code === "COMPANY_ACCESS_DENIED" ? 403
      : cause.code === "COMPANY_NOT_FOUND" ? 404
      : cause.code === "COMPANY_REPOSITORY_UNAVAILABLE" ? 503 : 422,
  });
  console.error("companies.monetary_policy.failed", { cause });
  return Response.json({ error: "No fue posible consultar o guardar la política monetaria." }, { status: 500 });
}
