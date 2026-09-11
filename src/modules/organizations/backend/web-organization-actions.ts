import { AuthorizationSource, permissionCode, type PermissionCode } from "@kontave/access-control/domain";
import { MembershipStatus, OrganizationStatus, organizationId, userId } from "@kontave/organizations/domain";
import { z } from "zod";
import { createOrganizationActions } from "@/src/client-api/v1/organizations/organization-actions";
import { createAccessControlActions } from "@/src/client-api/v1/access-control/access-control-actions";
import { createMemberActions } from "@/src/client-api/v1/members/member-actions";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { requireTenant, TenantForbiddenError, type TenantContext } from "@/src/shared/backend/utils/require-tenant";
import { organizationCompanySchema, organizationMemberSchema, organizationRoleSchema, workspaceSchema, type OrganizationWorkspace } from "../contracts";
import { accessibleWebOrganizationLinks, matchesSelectedOrganizationTenant } from "./web-organization-scope";
import { parseOrganizationInput, webOrganizationErrorResponse } from "./web-organization-http";

const linkSchema = z.object({ id: z.uuid(), legacy_tenant_id: z.uuid().nullable() });
const tenantSchema = z.object({ id: z.uuid() });
const membershipSchema = z.object({ tenant_id: z.uuid() });

/**
 * Composes existing organization use cases with cookie-authenticated Web compatibility.
 * @param request Incoming request, including the selected legacy tenant header.
 * @param tenant Cookie and terminal access already validated by requireTenant.
 * @returns Scoped actions; construction itself performs no reads or writes.
 * @throws Error when Supabase infrastructure is not configured.
 */
export function createWebOrganizationActions(request: Request, tenant: TenantContext) {
  const organizations = createOrganizationActions();
  const authorization = createAccessControlActions();
  const server = new ServerSupabaseSource();

  /**
   * Lists active organizations that retain operational access in the Web.
   * @returns Workspaces authorized by both organization and tenant membership.
   * @throws OrganizationFailure or persistence errors when access cannot be verified.
   */
  async function list(): Promise<OrganizationWorkspace[]> {
    const accesses = await organizations.listOrganizations.execute(userId(tenant.userId));
    if (accesses.length === 0) return [];
    const [linksResult, ownedResult, membershipsResult] = await Promise.all([
      server.instance.from("organizations").select("id,legacy_tenant_id").in("id", accesses.map((access) => access.organization.id)),
      server.instance.from("tenants").select("id").eq("id", tenant.userId),
      server.instance.from("tenant_memberships").select("tenant_id").eq("member_id", tenant.userId).not("accepted_at", "is", null).is("revoked_at", null),
    ]);
    for (const result of [linksResult, ownedResult, membershipsResult]) {
      if (result.error) throw result.error;
    }
    const allowedTenantIds = new Set([
      ...tenantSchema.array().parse(ownedResult.data).map((row) => row.id),
      ...membershipSchema.array().parse(membershipsResult.data).map((row) => row.tenant_id),
    ]);
    const links = accessibleWebOrganizationLinks(linkSchema.array().parse(linksResult.data), allowedTenantIds, tenant.barcodeSession ? tenant.tenantId : undefined);
    const byId = new Map(links.map((link) => [link.id, link]));
    const workspaces = await Promise.all(accesses.map(async (access) => {
      const link = byId.get(access.organization.id);
      if (!link?.legacy_tenant_id) return null;
      const snapshot = await authorization.repository.findSnapshot(tenant.userId, access.organization.id);
      if (!snapshot || snapshot.membershipStatus !== MembershipStatus.Active
        || snapshot.organizationStatus !== OrganizationStatus.Active || !snapshot.role.isActive()
        || snapshot.role.organizationId !== access.organization.id) return null;
      return workspaceSchema.parse({
        ...access.organization,
        role: snapshot.role.code,
        permissions: snapshot.role.permissions,
        legacyTenantId: link.legacy_tenant_id,
      });
    }));
    return workspaces.filter((workspace) => workspace !== null);
  }

  /**
   * Resolves one workspace and optionally requires an effective organization permission.
   * @param targetId Organization selected by the route.
   * @param permission Optional permission required by the operation.
   * @returns Authorized workspace matching the selected legacy tenant.
   * @throws TenantForbiddenError, AuthorizationDenied, or persistence errors on denied access.
   */
  async function workspace(targetId: string, permission?: PermissionCode): Promise<OrganizationWorkspace> {
    const id = parseOrganizationInput(z.uuid(), targetId);
    const accessible = await list();
    const selected = accessible.find((item) => item.id === id);
    if (!selected || !matchesSelectedOrganizationTenant({ id: selected.id, legacy_tenant_id: selected.legacyTenantId }, tenant.tenantId)) {
      throw new TenantForbiddenError();
    }
    if (permission) await authorization.require.execute({
      actor: { userId: tenant.userId, organizationId: id },
      permission,
      resource: { type: "organizations", organizationId: id },
      context: { requestId: crypto.randomUUID(), source: AuthorizationSource.Web, occurredAt: new Date().toISOString() },
    });
    return selected;
  }

  return {
    list,
    workspace,
    /**
     * Renames a scoped organization through its shared application service.
     * @param id Organization route identity.
     * @param input Validated name and optimistic version.
     * @returns Updated workspace after a single versioned write.
     * @throws AuthorizationDenied or OrganizationFailure for denied access or version conflicts.
     */
    async update(id: string, input: { name: string; expectedVersion: number }): Promise<OrganizationWorkspace> {
      const selected = await workspace(id, permissionCode("organizations.update"));
      const updated = await organizations.updateOrganization.execute({ actorUserId: userId(tenant.userId), organizationId: organizationId(id), ...input });
      return workspaceSchema.parse({ ...selected, ...updated });
    },
    /**
     * Uploads branding with the shared storage lifecycle and concurrency checks.
     * @param id Organization route identity.
     * @param file Validated image file.
     * @param expectedVersion Version observed by the caller.
     * @returns Workspace containing the new logo and incremented version.
     * @throws AuthorizationDenied or OrganizationFailure for access, storage, or concurrency failures.
     */
    async uploadLogo(id: string, file: File, expectedVersion: number): Promise<OrganizationWorkspace> {
      const selected = await workspace(id, permissionCode("organizations.update"));
      const updated = await organizations.uploadLogo.execute({ actorUserId: userId(tenant.userId), organizationId: organizationId(id), expectedVersion, logo: { bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type } });
      return workspaceSchema.parse({ ...selected, ...updated });
    },
    /**
     * Removes branding through the shared versioned organization use case.
     * @param id Organization route identity.
     * @param expectedVersion Version observed by the caller.
     * @returns Workspace with cleared branding and incremented version.
     * @throws AuthorizationDenied or OrganizationFailure for access or concurrency failures.
     */
    async deleteLogo(id: string, expectedVersion: number): Promise<OrganizationWorkspace> {
      const selected = await workspace(id, permissionCode("organizations.update"));
      const updated = await organizations.deleteLogo.execute({ actorUserId: userId(tenant.userId), organizationId: organizationId(id), expectedVersion });
      return workspaceSchema.parse({ ...selected, ...updated });
    },
    /**
     * Reads operational companies from the owning organization's shared projection.
     * @param id Organization route identity.
     * @returns Validated company projections scoped to the organization.
     * @throws AuthorizationDenied or OrganizationFailure if access or persistence fails.
     */
    async companies(id: string) {
      await workspace(id, permissionCode("companies.read"));
      return organizationCompanySchema.array().parse(await organizations.listCompanies.execute(userId(tenant.userId), organizationId(id)));
    },
    /**
     * Reads memberships and invitations without changing provisioning or membership state.
     * @param id Organization route identity.
     * @returns Actual organization member projections, including pending invitations.
     * @throws AuthorizationDenied, TenantForbiddenError, or persistence failures.
     */
    async members(id: string) {
      await workspace(id, permissionCode("members.read"));
      const members = organizationMemberSchema.array().parse(await createMemberActions(new URL(request.url).origin).list.execute(organizationId(id)));
      if (members.some((member) => member.organizationId !== id)) throw new TenantForbiddenError();
      return members;
    },
    /**
     * Reads effective organization roles for authorized administrators.
     * @param id Organization route identity.
     * @returns Active system and custom role projections.
     * @throws AuthorizationDenied, TenantForbiddenError, or persistence failures.
     */
    async roles(id: string) {
      await workspace(id, permissionCode("roles.read"));
      const roles = organizationRoleSchema.array().parse(await authorization.listRoles.execute(id));
      if (roles.some((role) => role.organizationId !== id)) throw new TenantForbiddenError();
      return roles;
    },
  };
}

/**
 * Runs a cookie-authenticated organization operation and converts expected failures.
 * @param request Incoming Web request; terminal sessions retain their enrolled tenant.
 * @param operation Operation over the composed, scoped organization actions.
 * @returns An uncached data envelope or a safe HTTP error.
 * @throws No expected domain failures; they become HTTP responses.
 */
export async function executeWebOrganizationRequest<T>(
  request: Request,
  operation: (actions: ReturnType<typeof createWebOrganizationActions>) => Promise<T>,
): Promise<Response> {
  try {
    const tenant = await requireTenant(request);
    const data = await operation(createWebOrganizationActions(request, tenant));
    return Response.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return webOrganizationErrorResponse(cause);
  }
}
