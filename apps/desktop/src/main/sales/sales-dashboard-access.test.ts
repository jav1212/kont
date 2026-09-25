import assert from "node:assert/strict";
import test from "node:test";
import { hasSalesDashboardAccess } from "./sales-dashboard-access";

const ready = (scopes: readonly string[]) => ({
  status: "ready" as const,
  activeWorkspaceId: "organization-1",
  activeModuleId: "sales",
  activeCompanyId: "company-1",
  modules: [],
  companies: [],
  workspaces: [{ id: "organization-1", name: "Ventas", access: "direct" as const, relationship: "member" as const, scopes }],
});

test("sales dashboard IPC access requires the active organization exact grant", () => {
  assert.equal(hasSalesDashboardAccess(ready(["sales.read"]), "organization-1"), false);
  assert.equal(hasSalesDashboardAccess(ready(["sales.read.dashboard"]), "organization-1"), false);
  assert.equal(hasSalesDashboardAccess(ready(["sales.read.dashboard"]), "another-organization"), false);
  assert.equal(hasSalesDashboardAccess(ready(["sales.read", "sales.read.dashboard"]), "organization-1"), true);
});
