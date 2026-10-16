import { companyId } from "@kontave/companies/domain";
import {
  GetProductCustomFieldCatalog,
  GetProductCustomFieldValues,
  GetProductCustomFieldValuesByProductIds,
  ReplaceProductCustomFieldCatalog,
  UpdateProductCustomFieldValues,
} from "@kontave/products/application";
import { AuthorizedProductCustomFieldsAccess, SupabaseProductsRepository } from "@kontave/products/supabase";
import { organizationId, userId } from "@kontave/organizations/domain";
import { AuthorizationSource } from "@kontave/access-control/domain";
import type { RequireAuthorization } from "@kontave/access-control/application";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import type { TenantContext } from "@/src/shared/backend/utils/require-tenant";

/**
 * Creates server-only use cases for typed product custom fields within one authorized organization.
 * @param input - Authenticated tenant identity, canonical organization, and permission service.
 * @returns Scoped catalog and value use cases plus a factory for their company context.
 * @throws {Error} When the server Supabase configuration is unavailable.
 * @remarks This composition root never exposes its service-role client to browser code.
 */
export function createWebProductCustomFieldsActions(input: {
  readonly tenant: TenantContext;
  readonly canonicalOrganizationId: string;
  readonly authorization: RequireAuthorization;
}) {
  const repository = new SupabaseProductsRepository(new ServerSupabaseSource().instance);
  const access = new AuthorizedProductCustomFieldsAccess(input.authorization, () => ({
    requestId: crypto.randomUUID(), source: AuthorizationSource.Web, occurredAt: new Date().toISOString(),
  }));

  return {
    getCatalog: new GetProductCustomFieldCatalog(repository, access),
    replaceCatalog: new ReplaceProductCustomFieldCatalog(repository, access),
    getValues: new GetProductCustomFieldValues(repository, access),
    getValuesByProductIds: new GetProductCustomFieldValuesByProductIds(repository, access),
    updateValues: new UpdateProductCustomFieldValues(repository, access),
    context(companyValue: string) {
      return {
      actorUserId: userId(input.tenant.userId),
      organizationId: organizationId(input.canonicalOrganizationId),
      companyId: companyId(companyValue),
      };
    },
  };
}
