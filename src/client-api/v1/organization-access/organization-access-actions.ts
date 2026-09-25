import {
  AcceptDelegatedAccess,
  AssignDelegatedAccessMember,
  ChangeDelegatedAccessStatus,
  CreateDelegatedAccess,
} from "@kontave/delegated-access/application";
import { createDelegatedAccessInfrastructure } from "@kontave/delegated-access/supabase";
import {
  ListWorkspacePortfolio,
  ResolveWorkspaceAccessPath,
  type DirectOrganizationAccessDirectory,
} from "@kontave/workspace-context-application";
import { createOrganizationsDirectory } from "@kontave/organizations/supabase";
import { createSupabaseAuthorization } from "@kontave/access-control/supabase";
import { OrganizationAccessPermissions } from "./organization-access-capabilities";

export function createOrganizationAccessActions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey)
    throw new Error(
      "Native organization access infrastructure is not configured.",
    );
  const organizations = createOrganizationsDirectory({ url, serviceRoleKey });
  const directAccess: DirectOrganizationAccessDirectory = {
    async listForUser(userId) {
      return (await organizations.listAccessForUser(userId)).map((access) => ({
        organizationId: access.organization.id,
        name: access.organization.name,
        relationship: access.relationship,
      }));
    },
    async findForUser(userId, organizationId) {
      const access = await organizations.findAccess(userId, organizationId);
      return access
        ? {
            organizationId: access.organization.id,
            name: access.organization.name,
            relationship: access.relationship,
          }
        : null;
    },
  };
  const repository = createDelegatedAccessInfrastructure({
    url,
    serviceRoleKey,
  }).delegatedAccess;
  const capabilities = new OrganizationAccessPermissions(
    createSupabaseAuthorization({ url, serviceRoleKey }).repository,
  );
  return {
    portfolio: new ListWorkspacePortfolio(
      directAccess,
      repository,
      organizations,
      capabilities,
    ),
    resolvePath: new ResolveWorkspaceAccessPath(directAccess, repository),
    create: new CreateDelegatedAccess(repository),
    accept: new AcceptDelegatedAccess(repository),
    assign: new AssignDelegatedAccessMember(repository),
    changeStatus: new ChangeDelegatedAccessStatus(repository),
  };
}
