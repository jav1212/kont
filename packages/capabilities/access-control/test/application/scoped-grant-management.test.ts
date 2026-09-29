import assert from "node:assert/strict";
import test from "node:test";
import { ManageScopedAccessGrant, type ScopedAccessGrantWriter } from "../../src/application";
import { AuthorizationDenied, AuthorizationReason, permissionCode, type ScopedAccessTarget } from "../../src/domain";

class MemoryGrants implements ScopedAccessGrantWriter {
  readonly calls: string[] = [];
  last: Parameters<ScopedAccessGrantWriter["grant"]>[0] | null = null;
  error: unknown;
  async hasGrant() { return false; }
  async grant(input: Parameters<ScopedAccessGrantWriter["grant"]>[0]) { this.calls.push("grant"); this.last = input; if (this.error) throw this.error; }
  async revoke(input: Parameters<ScopedAccessGrantWriter["revoke"]>[0]) { this.calls.push("revoke"); this.last = input; if (this.error) throw this.error; }
}

const command = {
  administrator: { userId: "admin-user", organizationId: "org-1" },
  membershipId: "membership-2",
  permission: "reports.run",
  target: { kind: "report", id: "sales.monthly" } satisfies ScopedAccessTarget,
  resource: { type: "company", id: "rif-1", organizationId: "org-1", companyId: "rif-1" },
};

test("scoped grant management sends exact company-scoped grants to the trusted adapter", async () => {
  const grants = new MemoryGrants();
  const manage = new ManageScopedAccessGrant(grants);
  await manage.execute({ ...command, action: "grant" });
  assert.deepEqual(grants.calls, ["grant"]);
  assert.equal(grants.last?.permission, permissionCode("reports.run"));
  assert.deepEqual(grants.last?.target, { kind: "report", id: "sales.monthly" });
  assert.equal(grants.last?.resource?.companyId, "rif-1");
  await manage.execute({ ...command, action: "revoke" });
  assert.deepEqual(grants.calls, ["grant", "revoke"]);
});

test("scoped grant management rejects malformed or cross-organization scope before persistence", async () => {
  const grants = new MemoryGrants();
  const manage = new ManageScopedAccessGrant(grants);
  await assert.rejects(() => manage.execute({ ...command, action: "grant", target: { kind: "report", id: "bad target" } }), { code: "SCOPED_GRANT_INVALID" });
  await assert.rejects(() => manage.execute({ ...command, action: "grant", resource: { ...command.resource, organizationId: "org-2" } }), { code: "SCOPED_GRANT_INVALID" });
  await assert.rejects(() => manage.execute({ ...command, action: "grant", permission: "unknown.permission" }), { code: "SCOPED_GRANT_INVALID" });
  assert.deepEqual(grants.calls, []);
});

test("scoped grant management preserves authorization denial from the database authority check", async () => {
  const grants = new MemoryGrants();
  grants.error = new AuthorizationDenied({ allowed: false, reason: AuthorizationReason.PermissionMissing });
  await assert.rejects(() => new ManageScopedAccessGrant(grants).execute({ ...command, action: "grant" }), AuthorizationDenied);
});

test("scoped grant management wraps unexpected adapter failures", async () => {
  const grants = new MemoryGrants();
  grants.error = new Error("connection detail");
  await assert.rejects(() => new ManageScopedAccessGrant(grants).execute({ ...command, action: "grant" }), { code: "ACCESS_CONTROL_REPOSITORY_UNAVAILABLE" });
});
