import assert from "node:assert/strict";
import { mock, test } from "node:test";

const state: {
  accessPath: "direct" | "delegated";
  policyPermits: boolean;
  accountingCommands: unknown[];
  directAuthorizations: number;
} = { accessPath: "direct", policyPermits: true, accountingCommands: [], directAuthorizations: 0 };

mock.module("server-only", { namedExports: {} });
mock.module("@kontave/delegated-access/domain", { namedExports: {
  DelegatedAccessFailure: class DelegatedAccessFailure extends Error {},
  OrganizationAccessPathKind: { DirectMembership: "direct", DelegatedMembership: "delegated" },
} });
mock.module("@kontave/access-control/domain", { namedExports: {
  PERMISSIONS: { ACCOUNTING_READ: "accounting.read" },
  permissionCode: (value: string) => value,
  AuthorizationDenied: class AuthorizationDenied extends Error {},
  AuthorizationSource: { Web: "web" },
} });
mock.module("@kontave/access-control/supabase", { namedExports: {
  createSupabaseAuthorization: () => ({ require: { execute: async () => { state.directAuthorizations += 1; } } }),
} });
mock.module("@kontave/companies/domain", { namedExports: { companyId: (value: string) => value } });
mock.module("@kontave/organizations/domain", { namedExports: { organizationId: (value: string) => value, userId: (value: string) => value } });
mock.module("@kontave/workspace-context-application", { namedExports: {
  DelegatedPermissionScopePolicy: class { permits() { return state.policyPermits; } },
} });
mock.module("@kontave/accounting/domain", { namedExports: {
  AccountingFailure: class AccountingFailure extends Error { constructor(readonly code: string, message: string) { super(message); } },
} });
mock.module("@/src/shared/backend/source/infra/server-supabase", { namedExports: {
  ServerSupabaseSource: class {
    readonly instance = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { legacy_tenant_id: "tenant-1" }, error: null }) }) }) }),
      rpc: async () => ({ data: null, error: null }),
    };
  },
} });
mock.module("@/src/modules/accounting/backend/accounting-factory", { namedExports: {
  createAccountingActions: () => ({
    command: { execute: async (command: unknown) => {
      state.accountingCommands.push(command);
      return { commandId: "receipt-1", replayed: false, affectedIds: ["chart-1"], versions: { "chart-1": 1 } };
    } },
    queries: {},
  }),
} });
mock.module("@/src/modules/security/backend/web-audit-context", { namedExports: {
  withWebAuditContext: async (_context: unknown, execute: () => Promise<unknown>) => execute(),
} });
mock.module("@/src/client-api/v1/auth/auth-context", { namedExports: {
  authenticateClientRequest: async () => ({ userId: "member-1" }),
} });
mock.module("@/src/client-api/v1/companies/company-actions", { namedExports: {
  createCompanyActions: () => ({ getOperational: { execute: async () => ({ id: "J-12345678-9" }) } }),
} });
mock.module("@/src/client-api/v1/organization-access/organization-access-actions", { namedExports: {
  createOrganizationAccessActions: () => ({ portfolio: { execute: async () => [{
    organizationId: "org-1",
    accessPath: { kind: state.accessPath },
  }] } }),
} });

const { POST } = await import("../app/api/client/v1/organizations/[organizationId]/companies/[companyId]/accounting/commands/route");

function request(): Request {
  return new Request("https://kont.test/api/client/v1/organizations/org-1/companies/J-12345678-9/accounting/commands", {
    method: "POST",
    headers: { authorization: "Bearer token", "content-type": "application/json" },
    body: JSON.stringify({ kind: "create_chart", chartId: "chart-1", name: "Plan", idempotencyKey: "key-1", correlationId: "correlation-1" }),
  });
}

async function execute(accessPath: "direct" | "delegated", policyPermits: boolean): Promise<Response> {
  state.accessPath = accessPath;
  state.policyPermits = policyPermits;
  state.accountingCommands = [];
  state.directAuthorizations = 0;
  return POST(request(), { params: Promise.resolve({ organizationId: "org-1", companyId: "J-12345678-9" }) });
}

test("Route Handler permits an authorized direct member and dispatches to the accounting port", async () => {
  const response = await execute("direct", true);
  assert.equal(response.status, 200);
  assert.equal(state.accountingCommands.length, 1);
  assert.equal(state.directAuthorizations, 1);
  assert.equal((state.accountingCommands[0] as { authorizationMode: string }).authorizationMode, "direct");
});

test("Route Handler rejects a member without accounting permission before dispatch", async () => {
  const response = await execute("direct", false);
  assert.equal(response.status, 403);
  assert.equal(state.accountingCommands.length, 0);
  assert.equal(state.directAuthorizations, 0);
});

test("Route Handler dispatches for an authorized delegated member with delegated scope", async () => {
  const response = await execute("delegated", true);
  assert.equal(response.status, 200);
  assert.equal(state.accountingCommands.length, 1);
  assert.equal(state.directAuthorizations, 0);
  assert.equal((state.accountingCommands[0] as { authorizationMode: string }).authorizationMode, "delegated");
});
