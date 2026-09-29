import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allowsWebCompany,
  allowsWebTarget,
  webOperationTargets,
  type WebSecurityScope,
} from "./web-operation-policy";
import { webAuditHeaders, withWebAuditContext } from "./web-audit-context";

const scope: WebSecurityScope = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000002",
  allowedCompanyIds: null,
  policies: [],
  grants: [],
};
const target = { kind: "module", permission: "modules.access", id: "sales" };

test("legacy company access is preserved but configured empty access denies every company", () => {
  assert.equal(allowsWebCompany(scope, "company-a"), true);
  assert.equal(
    allowsWebCompany({ ...scope, allowedCompanyIds: [] }, "company-a"),
    false,
  );
  assert.equal(
    allowsWebCompany(
      { ...scope, allowedCompanyIds: ["company-a"] },
      "company-b",
    ),
    false,
  );
});

test("removing the final exact grant cannot reopen a configured category", () => {
  const restricted = { ...scope, policies: [{ ...target, companyId: "" }] };
  assert.equal(allowsWebTarget(scope, [], target, "company-a"), true);
  assert.equal(
    allowsWebTarget(restricted, ["modules.access"], target, "company-a"),
    false,
  );
  const granted = {
    ...restricted,
    grants: [{ ...target, targetId: "sales", companyId: "company-a" }],
  };
  assert.equal(
    allowsWebTarget(granted, ["modules.access"], target, "company-a"),
    true,
  );
  assert.equal(
    allowsWebTarget(granted, ["modules.access"], target, "company-b"),
    false,
  );
  assert.equal(allowsWebTarget(granted, [], target, "company-a"), false);
});

test("report reads and mutation actions receive distinct stable targets", () => {
  assert.ok(
    webOperationTargets("inventory.read", "/api/inventory/kardex", "GET").some(
      (value) => value.kind === "report",
    ),
  );
  assert.ok(
    !webOperationTargets("sales.read", "/api/sales", "GET").some(
      (value) => value.kind === "process",
    ),
  );
  assert.ok(
    webOperationTargets("sales.confirm", "/api/sales/one/confirm", "POST").some(
      (value) => value.kind === "process" && value.id === "sales.confirm",
    ),
  );
});

test("audit identity is isolated across concurrent requests and spoofed headers are removed", async () => {
  const seen = await Promise.all(
    ["actor-a", "actor-b"].map((actorId) =>
      withWebAuditContext(
        { actorId, tenantId: scope.tenantId, permission: "sales.confirm" },
        async () => {
          await new Promise<void>((resolve) => setImmediate(resolve));
          return webAuditHeaders({
            "x-kontave-audit-actor": "forged",
            "x-kontave-audit-device": "forged",
          });
        },
      ),
    ),
  );
  assert.equal(seen[0]!.get("x-kontave-audit-actor"), "actor-a");
  assert.equal(seen[1]!.get("x-kontave-audit-actor"), "actor-b");
  assert.equal(seen[0]!.get("x-kontave-audit-device"), null);
  assert.equal(
    webAuditHeaders({ "x-kontave-audit-actor": "forged" }).get(
      "x-kontave-audit-actor",
    ),
    null,
  );
});
