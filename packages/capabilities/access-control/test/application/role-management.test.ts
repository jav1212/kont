import assert from "node:assert/strict";
import test from "node:test";
import { MembershipStatus, OrganizationStatus } from "@kontave/organizations/domain";
import { UpdateOrganizationRole, type AccessControlAdministration } from "../../src/application";
import {
  AccessControlFailure, Role, RoleKind, RoleStatus, membershipId, permissionCode, roleId,
  type AuthorizationSnapshot,
} from "../../src/domain";

/**
 * Creates an independent organization role for isolation and privilege tests.
 * @param organizationId - Organization owning this role.
 * @param kind - System or mutable custom role kind.
 * @returns An active, versioned role with only sales-read authority.
 */
function role(organizationId: string, kind = RoleKind.Custom): Role {
  return new Role({
    id: roleId(`role-${organizationId}`), organizationId, kind,
    code: kind === RoleKind.System ? "cashier" : "custom_reader",
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
  const unexpected = async (): Promise<never> => { throw new Error("Unexpected administrative operation"); };
  const administration: AccessControlAdministration = {
    listPermissions: unexpected,
    listRoles: unexpected,
    countActiveMemberships: unexpected,
    assignRole: unexpected,
    replacePermissions: unexpected,
    archiveRole: unexpected,
    createRole: unexpected,
    archiveRoleVersioned: unexpected,
    findRole: async () => target,
    updateRole: async (input: Parameters<AccessControlAdministration["updateRole"]>[0]) => {
      writes.push(input);
      if (input.expectedVersion !== target.version) {
        throw new AccessControlFailure("ROLE_VERSION_CONFLICT", "Concurrent change");
      }
      return new Role({ ...target, permissions: input.permissions ?? target.permissions, version: target.version + 1 });
    },
  };
  return { update: new UpdateOrganizationRole(administration), writes };
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

test("system roles and grants the actor does not own are rejected before writing", async () => {
  for (const [target, permissions, expected] of [
    [role("organization-a", RoleKind.System), [], "SYSTEM_ROLE_IMMUTABLE"],
    [role("organization-a"), [permissionCode("payroll.read")], "CANNOT_GRANT_UNOWNED_PERMISSION"],
  ] as const) {
    const { update, writes } = fixture(target);
    await assert.rejects(() => update.execute({
      actor, organizationId: "organization-a", roleId: target.id,
      permissions, expectedVersion: target.version,
    }), (cause: unknown) => cause instanceof AccessControlFailure && cause.code === expected);
    assert.equal(writes.length, 0);
  }
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
