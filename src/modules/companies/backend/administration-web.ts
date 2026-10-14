import {
  CompanyAdministrationOperation,
  CompanyAdministrationPermission,
  GetCompanyDocumentNumberingSettings,
  GetCompanyDateFormat,
  GetCompanySecondaryTaxIdentifiers,
  RemoveCompanySecondaryTaxIdentifier,
  SetCompanyLogo,
  SetCompanyPersonNature,
  SetCompanySecondaryTaxIdentifier,
  UpdateCompanyDocumentNumberingSettings,
  ConfigureCompanyDateFormat,
  companyDocumentSeriesConfigurationActions,
  CompanyDocumentNumberingOperation,
} from "@kontave/companies/application";
import type { CompanyAdministrationAuthorization, CompanyAdministrationScope, CompanyDocumentNumberingAuthorization, CompanyDocumentNumberingScope } from "@kontave/companies/application";
import { CompanyFailure } from "@kontave/companies/domain";
import { createCompanyAdministrationRepository, createCompanyDateFormatRepository, createCompanyDocumentSeriesConfigurationRepository, createCompanyLogoStorage, createCompanyRepository, createCompanySecondaryTaxIdentifierRepository } from "@kontave/companies/supabase";
import { AuthorizationSource, permissionCode, PERMISSIONS } from "@kontave/access-control/domain";
import type { RequireAuthorization } from "@kontave/access-control/application";
import { organizationId, userId } from "@kontave/organizations/domain";
import { resolveCanonicalTenantAuthorization, type TenantContext } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";

/**
 * Composes the existing company package use cases for authenticated Web routes.
 * @param input - Tenant identity, canonical organization and authorization service.
 * @returns Scoped identity, versioned person-nature mutation and secondary identifier actions.
 * @throws {Error} When server Supabase credentials are unavailable.
 */
export function createCompanyAdministrationWebActions(input: {
  readonly tenant: TenantContext;
  readonly canonicalOrganizationId: string;
  readonly authorization: RequireAuthorization;
}) {
  const config = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };
  const access = new WebCompanyAdministrationAuthorization(input.authorization);
  const personNatureRepository = createCompanyAdministrationRepository(config);
  const companyReaderRepository = createCompanyRepository(config);
  const secondaryIdentifiersRepository = createCompanySecondaryTaxIdentifierRepository(config);
  const dateFormatRepository = createCompanyDateFormatRepository(config);
  const logoStorage = createCompanyLogoStorage(config);
  const documentSeriesRepository = createCompanyDocumentSeriesConfigurationRepository(config);

  return {
    getSecondaryTaxIdentifiers: new GetCompanySecondaryTaxIdentifiers(access, secondaryIdentifiersRepository),
    setSecondaryTaxIdentifier: new SetCompanySecondaryTaxIdentifier(access, secondaryIdentifiersRepository),
    removeSecondaryTaxIdentifier: new RemoveCompanySecondaryTaxIdentifier(access, secondaryIdentifiersRepository),
    setPersonNature: new SetCompanyPersonNature(access, personNatureRepository),
    setLogo: new SetCompanyLogo(access, companyReaderRepository, personNatureRepository, logoStorage),
    getDocumentNumbering: new GetCompanyDocumentNumberingSettings(access, personNatureRepository),
    updateDocumentNumbering: new UpdateCompanyDocumentNumberingSettings(access, personNatureRepository),
    documentSeries: companyDocumentSeriesConfigurationActions(access, documentSeriesRepository),
    getDateFormat: new GetCompanyDateFormat(access, dateFormatRepository),
    configureDateFormat: new ConfigureCompanyDateFormat(access, dateFormatRepository),
    /**
     * Creates the immutable authenticated actor and organization scope used by package commands.
     * @returns Canonical user and organization identifiers.
     */
    scope(): CompanyAdministrationScope {
      return {
        actorUserId: userId(input.tenant.userId),
        organizationId: organizationId(input.canonicalOrganizationId),
      };
    },
  };
}

class WebCompanyAdministrationAuthorization implements CompanyAdministrationAuthorization, CompanyDocumentNumberingAuthorization {
  /**
   * @param authorization - Shared authorization evaluator backed by the current organization snapshot.
   * @returns A policy adapter that evaluates company permissions in the canonical organization.
   */
  constructor(private readonly authorization: RequireAuthorization) {}

  /**
   * @param scope - Authenticated user and canonical organization.
   * @param _operation - Company operation being authorized for auditing/context.
   * @param permission - Required company permission.
   * @returns A promise resolved when access is allowed.
   * @throws {CompanyFailure} When the actor is not authorized.
   */
  async assertCanManageCompanies(scope: CompanyAdministrationScope, _operation: CompanyAdministrationOperation, permission: CompanyAdministrationPermission): Promise<void> {
    const permissionValue = permission === CompanyAdministrationPermission.Read
      ? PERMISSIONS.COMPANIES_READ
      : permission === CompanyAdministrationPermission.Create
        ? PERMISSIONS.COMPANIES_CREATE
        : PERMISSIONS.COMPANIES_UPDATE;
    try {
      await this.authorization.execute({
        actor: { userId: scope.actorUserId, organizationId: scope.organizationId },
        permission: permissionCode(permissionValue),
        resource: { type: "organization", id: scope.organizationId, organizationId: scope.organizationId },
        context: { requestId: crypto.randomUUID(), source: AuthorizationSource.Web, occurredAt: new Date().toISOString() },
      });
    } catch (cause) {
      throw new CompanyFailure("COMPANY_ACCESS_DENIED", "Company administration access was denied.", { cause });
    }
  }

  /** Authorizes series reads and changes with the matching canonical company capability.
   * @param scope - Authenticated actor and company boundary.
   * @param operation - Read or configuration operation.
   * @returns Completion only when the organization grants access.
   * @throws {CompanyFailure} When the actor lacks the required permission.
   */
  async assertCanManageDocumentNumbering(scope: CompanyDocumentNumberingScope, operation: CompanyDocumentNumberingOperation): Promise<void> {
    const permission = operation === CompanyDocumentNumberingOperation.Read
      ? CompanyAdministrationPermission.Read
      : CompanyAdministrationPermission.Update;
    await this.assertCanManageCompanies({ actorUserId: scope.actorUserId, organizationId: scope.organizationId }, CompanyAdministrationOperation.ReadDocumentNumbering, permission);
  }
}

/**
 * Resolves a legacy company ID to an active canonical organization before composing package actions.
 * @param tenant - Authenticated tenant context supplied by the API route wrapper.
 * @param rawCompanyId - Company identifier from the request.
 * @returns Company row and package actions, or null when the company is outside this tenant.
 * @throws {Error} When canonical organization or company persistence cannot be verified.
 */
export async function getCompanyAdministrationWebContext(tenant: TenantContext, rawCompanyId: string) {
  const canonical = await resolveCanonicalTenantAuthorization(tenant);
  if (!canonical) return null;
  const { data, error } = await new ServerSupabaseSource().instance.from("shared_companies")
    .select("id, version, person_nature, logo_url").eq("tenant_id", tenant.tenantId)
    .eq("organization_id", canonical.organizationId).eq("id", rawCompanyId).maybeSingle();
  if (error) throw new Error("Company scope could not be verified.");
  if (!data) return null;
  return {
    company: data,
    actions: createCompanyAdministrationWebActions({
      tenant,
      canonicalOrganizationId: canonical.organizationId,
      authorization: canonical.actions.require,
    }),
  };
}
