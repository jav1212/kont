import assert from "node:assert/strict";
import test from "node:test";
import { MembershipStatus, OrganizationStatus } from "@kontave/organizations/domain";
import { ArchiveOrganizationRole, UpdateOrganizationRole, type AccessControlAdministration } from "../../src/application";
import {
  AccessControlFailure, Role, RoleKind, RoleStatus, membershipId, permissionCode, roleId,
  type AuthorizationSnapshot,
} from "../../src/domain";

/**
 * Creates an independent organization role for isolation and privilege tests.
 * @param organizationId - Organization owning this role.
 * @param kind - System or mutable custom role kind.
 * @param code - Optional stable system code or custom-role identifier.
 * @returns An active, versioned role with only sales-read authority.
 */
function role(organizationId: string | null, kind = RoleKind.Custom, code?: string): Role {
  return new Role({
    id: roleId(`role-${organizationId}`), organizationId, kind,
    code: code ?? (kind === RoleKind.System ? "cashier" : "custom_reader"),
    name: "Reader", description: "", status: RoleStatus.Active, version: 7,
    permissions: [permissionCode("sales.read")],
  });
}

const actor: AuthorizationSnapshot = {
  membershipId: membershipId("actor-membership"), membershipStatus: MembershipStatus.Active,
  authorizationVersion: 1, organizationStatus: OrganizationStatus.Active, role: role("organization-a"),
};

/**
 * Builds the two administrative operations consumed by the update use case.
 * Any unexpected operation fails instead of simulating a successful write.
 * @param target - Persisted role returned to the use case.
 * @returns Use case and a record of attempted versioned writes.
 */
function fixture(target: Role) {
  const writes: Parameters<AccessControlAdministration["updateRole"]>[0][] = [];
  const archives: number[] = [];
  const unexpected = async (): Promise<never> => { throw new Error("Unexpected administrative operation"); };
  const administration: AccessControlAdministration = {
    listPermissions: unexpected,
    listRoles: unexpected,
    countActiveMemberships: async () => 0,
    assignRole: unexpected,
    replacePermissions: unexpected,
    archiveRole: unexpected,
    createRole: unexpected,
    archiveRoleVersioned: async (_roleId, expectedVersion) => {
      archives.push(expectedVersion);
      return target;
    },
    findRole: async () => target,
    updateRole: async (input: Parameters<AccessControlAdministration["updateRole"]>[0]) => {
      writes.push(input);
      if (input.expectedVersion !== target.version) {
        throw new AccessControlFailure("ROLE_VERSION_CONFLICT", "Concurrent change");
      }
      return new Role({ ...target, permissions: input.permissions ?? target.permissions, version: target.version + 1 });
    },
  };
  return { update: new UpdateOrganizationRole(administration), archive: new ArchiveOrganizationRole(administration), writes, archives };
}

test("a role in a different organization cannot be changed", async () => {
  const target = role("organization-b");
  const { update, writes } = fixture(target);
  await assert.rejects(() => update.execute({
    actor, organizationId: "organization-a", roleId: target.id,
    permissions: [], expectedVersion: target.version,
  }), (cause: unknown) => cause instanceof AccessControlFailure && cause.code === "ROLE_OUTSIDE_ORGANIZATION");
  assert.equal(writes.length, 0);
});

test("every non-owner system role permits organization-local permission updates", async () => {
  for (const code of ["admin", "accountant", "seller", "cashier"]) {
    const target = role("organization-a", RoleKind.System, code);
    const { update, writes } = fixture(target);
    const updated = await update.execute({
      actor, organizationId: "organization-a", roleId: target.id,
      permissions: target.permissions, expectedVersion: target.version,
    });
    assert.equal(updated.version, target.version + 1);
    assert.deepEqual(writes.map((write) => write.permissions), [target.permissions]);
  }
});

test("owner, system metadata, templates, and grants the actor does not own are rejected before writing", async () => {
  for (const [target, permissions, expected] of [
    [role("organization-a", RoleKind.System, "owner"), [], "SYSTEM_ROLE_IMMUTABLE"],
    [role(null, RoleKind.System), [], "ROLE_OUTSIDE_ORGANIZATION"],
    [role("organization-a"), [permissionCode("payroll.read")], "CANNOT_GRANT_UNOWNED_PERMISSION"],
    [role("organization-a", RoleKind.System), [permissionCode("payroll.read")], "CANNOT_GRANT_UNOWNED_PERMISSION"],
  ] as const) {
    const { update, writes } = fixture(target);
    await assert.rejects(() => update.execute({
      actor, organizationId: "organization-a", roleId: target.id,
      permissions, expectedVersion: target.version,
    }), (cause: unknown) => cause instanceof AccessControlFailure && cause.code === expected);
    assert.equal(writes.length, 0);
  }
  const systemRole = role("organization-a", RoleKind.System);
  const { update, writes } = fixture(systemRole);
  await assert.rejects(() => update.execute({
    actor, organizationId: "organization-a", roleId: systemRole.id,
    name: "Caja", expectedVersion: 7,
  }), (cause: unknown) => cause instanceof AccessControlFailure && cause.code === "SYSTEM_ROLE_IMMUTABLE");
  assert.equal(writes.length, 0);
});

test("system roles remain non-archivable", async () => {
  const target = role("organization-a", RoleKind.System);
  const { archive, archives } = fixture(target);
  await assert.rejects(() => archive.execute({ organizationId: "organization-a", roleId: target.id, expectedVersion: target.version }),
    (cause: unknown) => cause instanceof AccessControlFailure && cause.code === "SYSTEM_ROLE_IMMUTABLE");
  assert.deepEqual(archives, []);
});

test("an empty owner update is rejected before persistence", async () => {
  const target = role("organization-a", RoleKind.System, "owner");
  const { update, writes } = fixture(target);
  await assert.rejects(() => update.execute({
    actor, organizationId: "organization-a", roleId: target.id, expectedVersion: target.version,
  }), (cause: unknown) => cause instanceof AccessControlFailure && cause.code === "SYSTEM_ROLE_IMMUTABLE");
  assert.deepEqual(writes, []);
});

test("custom permission updates preserve optimistic version checking", async () => {
  const target = role("organization-a");
  const { update, writes } = fixture(target);
  const input = { actor, organizationId: "organization-a", roleId: target.id, permissions: target.permissions };
  await assert.rejects(() => update.execute({ ...input, expectedVersion: 6 }),
    (cause: unknown) => cause instanceof AccessControlFailure && cause.code === "ROLE_VERSION_CONFLICT");
  const updated = await update.execute({ ...input, expectedVersion: 7 });
  assert.equal(updated.version, 8);
  assert.deepEqual(writes.map((write) => write.expectedVersion), [6, 7]);
  assert.ok(writes.every((write) => write.roleId === target.id));
});
