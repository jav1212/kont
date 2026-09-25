import {
  isAuthorizationSnapshotActive,
  PERMISSIONS,
  permissionCode,
  type PermissionCode,
} from "@kontave/access-control/domain";
import type { AccessControlRepository } from "@kontave/access-control/application";
import { OrganizationAccessPathKind } from "@kontave/delegated-access/domain";
import {
  DelegatedPermissionScopePolicy,
  type WorkspacePortfolioCapabilities,
  type WorkspacePortfolioCapabilityResolver,
  type WorkspacePortfolioEntry,
} from "@kontave/workspace-context-application";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";

/** Resolves effective workspace grants from direct memberships or delegated scopes. */
export class OrganizationAccessPermissions implements WorkspacePortfolioCapabilityResolver {
  /**
   * Creates the effective-permission resolver.
   * @param authorization - Batch-capable access-control repository for direct memberships.
   * @param delegatedScopes - Scope policy governing delegated organization paths.
   */
  constructor(
    private readonly authorization: AccessControlRepository,
    private readonly delegatedScopes = new DelegatedPermissionScopePolicy(),
  ) {}

  /**
   * Resolves grants without exposing delegation scopes as role permissions.
   * Direct paths use the persisted active membership snapshot. Delegated paths
   * receive only catalog permissions that the scope policy expressly permits.
   * @param actorUserId - User whose workspace portfolio has already been resolved.
   * @param entries - Effective direct and delegated portfolio entries.
   * @returns Effective permission sets keyed by organization identifier.
   */
  async resolve(
    actorUserId: UserId,
    entries: readonly WorkspacePortfolioEntry[],
  ): Promise<ReadonlyMap<OrganizationId, WorkspacePortfolioCapabilities>> {
    const directOrganizationIds = entries
      .filter((entry) => entry.accessPath.kind === OrganizationAccessPathKind.DirectMembership)
      .map((entry) => entry.organizationId);
    const snapshots = await this.authorization.findSnapshots(actorUserId, directOrganizationIds);
    return new Map(entries.map((entry) => {
      const permissions = entry.accessPath.kind === OrganizationAccessPathKind.DirectMembership
        ? this.directPermissions(snapshots.get(entry.organizationId))
        : this.delegatedPermissions(entry);
      return [entry.organizationId, { permissions }];
    }));
  }

  /**
   * Extracts effective grants from an active direct-membership snapshot.
   * @param snapshot - Snapshot returned by access control, if the user has a membership.
   * @returns Effective role grants, or no grants for an absent or inactive snapshot.
   */
  private directPermissions(
    snapshot: Awaited<ReturnType<AccessControlRepository["findSnapshot"]>>,
  ): readonly PermissionCode[] {
    return snapshot !== null && isAuthorizationSnapshotActive(snapshot)
      ? snapshot.role.permissions
      : [];
  }

  /**
   * Converts only scope-permitted catalog grants into an effective delegated set.
   * @param entry - Delegated workspace entry whose path was already validated.
   * @returns Catalog grants permitted by the delegation's scope policy.
   */
  private delegatedPermissions(
    entry: WorkspacePortfolioEntry,
  ): readonly PermissionCode[] {
    return Object.values(PERMISSIONS)
      .map(permissionCode)
      .filter((permission) => this.delegatedScopes.permits(entry.accessPath, permission));
  }
}
