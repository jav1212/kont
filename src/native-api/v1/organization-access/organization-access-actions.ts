import {
  AcceptOrganizationDelegation,
  AssignDelegationMember,
  ChangeOrganizationDelegationStatus,
  CreateOrganizationDelegation,
} from "@kontave/organization-delegations-application";
import { createOrganizationAccessInfrastructure } from "@kontave/organization-delegations-supabase";
import {
  ListWorkspacePortfolio,
  ResolveWorkspaceAccessPath,
  type DirectOrganizationAccessDirectory,
} from "@kontave/workspace-context-application";
import { createOrganizationsDirectory } from "@kontave/organizations-supabase";

export function createOrganizationAccessActions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Native organization access infrastructure is not configured.");
  const organizations = createOrganizationsDirectory({ url, serviceRoleKey });
  const directAccess: DirectOrganizationAccessDirectory = {
    async listForUser(userId) {
      return (await organizations.listAccessForUser(userId)).map((access) => ({
        organizationId: access.organization.id,
        name: access.organization.name,
      }));
    },
    async findForUser(userId, organizationId) {
      const access = await organizations.findAccess(userId, organizationId);
      return access ? { organizationId: access.organization.id, name: access.organization.name } : null;
    },
  };
  const repository = createOrganizationAccessInfrastructure({ url, serviceRoleKey }).delegations;
  return {
    portfolio: new ListWorkspacePortfolio(directAccess, repository, organizations),
    resolvePath: new ResolveWorkspaceAccessPath(directAccess, repository),
    create: new CreateOrganizationDelegation(repository),
    accept: new AcceptOrganizationDelegation(repository),
    assign: new AssignDelegationMember(repository),
    changeStatus: new ChangeOrganizationDelegationStatus(repository),
  };
}
