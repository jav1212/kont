import assert from "node:assert/strict";
import test from "node:test";
import { OrganizationFailure } from "@kontave/organizations/domain";
import { accessibleWebOrganizationLinks, matchesSelectedOrganizationTenant } from "../src/modules/organizations/backend/web-organization-scope";
import { parseOrganizationInput, webOrganizationErrorResponse } from "../src/modules/organizations/backend/web-organization-http";
import { organizationUpdateSchema } from "../src/modules/organizations/contracts";

const links = [
  { id: "org-a", legacy_tenant_id: "tenant-a" },
  { id: "org-b", legacy_tenant_id: "tenant-b" },
  { id: "org-c", legacy_tenant_id: "tenant-c" },
  { id: "native-only", legacy_tenant_id: null },
];

test("Web excludes organization access without an accepted legacy tenant bridge", () => {
  assert.deepEqual(accessibleWebOrganizationLinks(links, new Set(["tenant-a", "tenant-b"])), links.slice(0, 2));
});

test("terminal sessions cannot enumerate organizations in another accepted tenant", () => {
  assert.deepEqual(accessibleWebOrganizationLinks(links, new Set(["tenant-a", "tenant-b"]), "tenant-b"), [links[1]]);
  assert.deepEqual(accessibleWebOrganizationLinks(links, new Set(["tenant-a"]), "tenant-b"), []);
});

test("an authorized organization URL must still match the selected tenant header", () => {
  assert.equal(matchesSelectedOrganizationTenant(links[0], "tenant-a"), true);
  assert.equal(matchesSelectedOrganizationTenant(links[0], "tenant-b"), false);
  assert.equal(matchesSelectedOrganizationTenant(undefined, "tenant-a"), false);
});

test("organization writes require an explicit positive numeric version", () => {
  for (const expectedVersion of [undefined, null, "1", 0, -1, 1.5]) {
    assert.throws(() => parseOrganizationInput(organizationUpdateSchema, { name: "Portal", expectedVersion }));
  }
  assert.deepEqual(parseOrganizationInput(organizationUpdateSchema, { name: " Portal ", expectedVersion: 2 }), { name: "Portal", expectedVersion: 2 });
});

test("concurrent organization changes produce 409 and are never cached", async () => {
  const response = webOrganizationErrorResponse(new OrganizationFailure("ORGANIZATION_VERSION_CONFLICT", "La organización cambió en otro cliente."));
  assert.equal(response.status, 409);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await response.json()).code, "ORGANIZATION_VERSION_CONFLICT");
});

test("unexpected failures do not expose service diagnostics", async () => {
  const response = webOrganizationErrorResponse(new Error("private connection string"));
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /private connection/);
});
