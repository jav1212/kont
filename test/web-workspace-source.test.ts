import assert from "node:assert/strict";
import test from "node:test";
import {
  createWebWorkspaceSource,
  webAvailableModules,
} from "../src/modules/workspace/frontend/web-workspace-source";
import type { OrganizationWorkspace } from "../src/modules/organizations/contracts";

const organization: OrganizationWorkspace = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Scope",
  slug: "scope",
  logoUrl: null,
  version: 1,
  role: "cajero",
  permissions: ["companies.read", "inventory.read", "sales.read"],
  legacyTenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

test("company fetch pins the candidate tenant and rejects a company from another tenant", async () => {
  let tenantHeader: string | null = null;
  const source = createWebWorkspaceSource(async (_input, init) => {
    tenantHeader = new Headers(init?.headers).get("X-Tenant-Id");
    return Response.json({
      data: [{ id: "J-SHARED-RIF", name: "Other", ownerId: "another-tenant" }],
    });
  });
  await assert.rejects(
    source.companies(organization, new AbortController().signal),
    /pertenencia/,
  );
  assert.equal(tenantHeader, organization.legacyTenantId);
});

test("ungranted company access resolves an empty projection without issuing a forbidden fetch", async () => {
  const source = createWebWorkspaceSource(async () => {
    throw new Error("must not fetch");
  });
  assert.deepEqual(
    await source.companies(
      { ...organization, permissions: [] },
      new AbortController().signal,
    ),
    [],
  );
});

test("available modules require both canonical permission and existing Web entitlement", () => {
  const active = [
    { id: "sub", status: "active", product: { slug: "inventory" } },
  ];
  const modules = webAvailableModules(organization, active).map(
    (entry) => entry.code,
  );
  assert.deepEqual(modules, ["sales", "inventory", "tools", "companies"]);
  assert.deepEqual(
    webAvailableModules(organization, []).map((entry) => entry.code),
    ["tools", "companies"],
  );
  assert.deepEqual(
    webAvailableModules(
      { ...organization, permissions: ["inventory.create"] },
      active,
    ).map((entry) => entry.code),
    ["tools"],
  );
});

test("source failures remain failures rather than authorizing an empty subscription response", async () => {
  const source = createWebWorkspaceSource(async () =>
    Response.json({ error: "internal diagnostic" }, { status: 503 }),
  );
  await assert.rejects(
    source.subscriptions(organization, new AbortController().signal),
    (cause: Error) => !cause.message.includes("internal diagnostic"),
  );
});
