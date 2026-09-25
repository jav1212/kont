import assert from "node:assert/strict";
import test from "node:test";
import type { AccessControlRepository } from "@kontave/access-control/application";
import {
  PERMISSIONS,
  Role,
  RoleKind,
  RoleStatus,
  membershipId,
  permissionCode,
  roleId,
  type AuthorizationSnapshot,
} from "@kontave/access-control/domain";
import { OrganizationAccessPathKind } from "@kontave/delegated-access/domain";
import {
  MembershipStatus,
  OrganizationStatus,
  organizationId,
  userId,
} from "@kontave/organizations/domain";
import { WorkspaceRelationship, type WorkspacePortfolioEntry } from "@kontave/workspace-context-application";
import { OrganizationAccessPermissions } from "../organization-access-capabilities";

const actor = userId("actor");
const organization = organizationId("organization");

function entry(): WorkspacePortfolioEntry {
  return {
    organizationId: organization,
    name: "Organization",
    avatarUrl: null,
    relationship: WorkspaceRelationship.Member,
    accessPath: {
      kind: OrganizationAccessPathKind.DirectMembership,
      actorUserId: actor,
      actingOrganizationId: organization,
      targetOrganizationId: organization,
      delegationId: null,
      scopes: [],
    },
  };
}

function snapshot(permissions: readonly string[]): AuthorizationSnapshot {
  return {
    membershipId: membershipId("membership"),
    membershipStatus: MembershipStatus.Active,
    authorizationVersion: 1,
    organizationStatus: OrganizationStatus.Active,
    role: new Role({
      id: roleId("role"),
      organizationId: organization,
      code: "cashier",
      name: "Cashier",
      description: "",
      kind: RoleKind.System,
      status: RoleStatus.Active,
      version: 1,
      permissions: permissions.map(permissionCode),
    }),
  };
}

class Repository implements AccessControlRepository {
  constructor(private readonly snapshots: ReadonlyMap<string, AuthorizationSnapshot>) {}
  async findSnapshot(_userId: string, organizationId: string): Promise<AuthorizationSnapshot | null> {
    return this.snapshots.get(organizationId) ?? null;
  }
  async findSnapshots(_userId: string, organizationIds: readonly string[]): Promise<ReadonlyMap<string, AuthorizationSnapshot>> {
    return new Map(organizationIds
      .filter((organizationId) => this.snapshots.has(organizationId))
      .map((organizationId) => [organizationId, this.snapshots.get(organizationId)!]));
  }
}

test("workspace permissions derive from effective direct role grants", async () => {
  const resolver = new OrganizationAccessPermissions(new Repository(new Map([[organization, snapshot([
    PERMISSIONS.SALES_READ,
    PERMISSIONS.SALES_READ_DASHBOARD,
  ])]])));
  const capabilities = await resolver.resolve(actor, [entry()]);
  assert.deepEqual(capabilities.get(organization)?.permissions, [
    permissionCode(PERMISSIONS.SALES_READ),
    permissionCode(PERMISSIONS.SALES_READ_DASHBOARD),
  ]);
});

test("workspace permissions preserve a direct sales reader without inventing dashboard access", async () => {
  const resolver = new OrganizationAccessPermissions(new Repository(new Map([[organization, snapshot([
    PERMISSIONS.SALES_READ,
  ])]])));
  const capabilities = await resolver.resolve(actor, [entry()]);
  assert.deepEqual(capabilities.get(organization)?.permissions, [permissionCode(PERMISSIONS.SALES_READ)]);
});

test("delegated workspace permissions include only grants allowed by the scope policy", async () => {
  const delegated: WorkspacePortfolioEntry = {
    ...entry(),
    relationship: WorkspaceRelationship.Delegated,
    accessPath: {
      ...entry().accessPath,
      kind: OrganizationAccessPathKind.DelegatedOrganization,
    },
  };
  const resolver = new OrganizationAccessPermissions(new Repository(new Map()));
  const capabilities = await resolver.resolve(actor, [delegated]);
  assert.deepEqual(capabilities.get(organization)?.permissions, []);
});
