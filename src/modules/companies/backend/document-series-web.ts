import {
  companyDocumentSeriesConfigurationActions,
  CompanyDocumentNumberingOperation,
  type CompanyDocumentNumberingAuthorization,
  type CompanyDocumentNumberingScope,
} from "@kontave/companies/application";
import { CompanyFailure, companyId } from "@kontave/companies/domain";
import { createSupabaseCompanyDocumentSeriesConfigurationRepository } from "@kontave/companies/supabase";
import { AuthorizationSource, permissionCode, PERMISSIONS } from "@kontave/access-control/domain";
import type { RequireAuthorization } from "@kontave/access-control/application";
import { organizationId, userId } from "@kontave/organizations/domain";
import { resolveCanonicalTenantAuthorization, type TenantContext } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";

/**
 * Resolves a company inside the authenticated tenant and composes only the company's IVA series actions.
 * @param tenant - Authenticated tenant context supplied by the API route wrapper.
 * @param rawCompanyId - Company identifier from the request.
 * @returns Authorized company identity and series configuration actions, or `null` when out of scope.
 * @throws {Error} When company scope or server persistence cannot be verified.
 */
export async function getCompanyDocumentSeriesWebContext(tenant: TenantContext, rawCompanyId: string) {
  const canonical = await resolveCanonicalTenantAuthorization(tenant);
  if (!canonical) return null;
  const { data, error } = await new ServerSupabaseSource().instance.from("shared_companies")
    .select("id").eq("tenant_id", tenant.tenantId)
    .eq("organization_id", canonical.organizationId).eq("id", rawCompanyId).maybeSingle();
  if (error) throw new Error("Company scope could not be verified.");
  if (!data) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Company document-series persistence is not configured.");
  const actor: CompanyDocumentNumberingScope = {
    actorUserId: userId(tenant.userId),
    organizationId: organizationId(canonical.organizationId),
    companyId: companyId(data.id),
  };
  const authorization = new WebCompanyDocumentNumberingAuthorization(canonical.actions.require);
  const repository = createSupabaseCompanyDocumentSeriesConfigurationRepository({ url, serviceRoleKey });

  return {
    company: data,
    actions: {
      ...companyDocumentSeriesConfigurationActions(authorization, repository),
      scope: () => ({ actorUserId: actor.actorUserId, organizationId: actor.organizationId }),
    },
  };
}

class WebCompanyDocumentNumberingAuthorization implements CompanyDocumentNumberingAuthorization {
  /** @param authorization - Shared authorization evaluator bound to the canonical tenant organization. @returns Authorization adapter. */
  constructor(private readonly authorization: RequireAuthorization) {}

  /** {@inheritDoc CompanyDocumentNumberingAuthorization.assertCanManageDocumentNumbering} */
  async assertCanManageDocumentNumbering(scope: CompanyDocumentNumberingScope, operation: CompanyDocumentNumberingOperation): Promise<void> {
    try {
      await this.authorization.execute({
        actor: { userId: scope.actorUserId, organizationId: scope.organizationId },
        permission: permissionCode(operation === CompanyDocumentNumberingOperation.Read ? PERMISSIONS.COMPANIES_READ : PERMISSIONS.COMPANIES_UPDATE),
        resource: { type: "organization", id: scope.organizationId, organizationId: scope.organizationId },
        context: { requestId: crypto.randomUUID(), source: AuthorizationSource.Web, occurredAt: new Date().toISOString() },
      });
    } catch (cause) {
      throw new CompanyFailure("COMPANY_ACCESS_DENIED", "Company document-series access was denied.", { cause });
    }
  }
}
