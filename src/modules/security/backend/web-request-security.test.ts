import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { allowsWebRequest } from "./web-request-security";
import type { WebSecurityScope } from "./web-operation-policy";

const tenantId = "00000000-0000-4000-8000-000000000001";

function configured(companies: string[]): WebSecurityScope {
  return {
    tenantId,
    organizationId: "00000000-0000-4000-8000-000000000002",
    allowedCompanyIds: companies,
    policies: [],
    grants: [],
  };
}

function unconfigured(): WebSecurityScope {
  return { ...configured([]), allowedCompanyIds: null };
}

function ownershipClient(result: { companyId?: string; error?: Error }) {
  const calls: Array<{ table: string; filters: Array<[string, string]> }> = [];
  const client = {
    from(table: string) {
      const filters: Array<[string, string]> = [];
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: string) {
          filters.push([key, value]);
          return query;
        },
        limit() {
          return query;
        },
        async maybeSingle() {
          calls.push({ table, filters });
          return {
            data: result.companyId ? { company_id: result.companyId } : null,
            error: result.error ?? null,
          };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

test("rejects a forged allowed company when the invoice belongs to another company", async () => {
  const { client, calls } = ownershipClient({ companyId: "company-other" });
  const allowed = await allowsWebRequest(
    new Request(
      "https://kontave.test/api/sales/invoice-other?companyId=company-allowed",
    ),
    configured(["company-allowed"]),
    ["sales.read"],
    "sales.read",
    client,
  );
  assert.equal(allowed, false);
  assert.deepEqual(calls, [
    {
      table: "shared_inventory_sales_invoices",
      filters: [
        ["tenant_id", tenantId],
        ["id", "invoice-other"],
      ],
    },
  ]);
});

test("rejects an intentionally empty configured company list", async () => {
  const { client, calls } = ownershipClient({ companyId: "company-allowed" });
  const allowed = await allowsWebRequest(
    new Request("https://kontave.test/api/sales?companyId=company-allowed"),
    configured([]),
    ["sales.read"],
    "sales.read",
    client,
  );
  assert.equal(allowed, false);
  assert.deepEqual(calls, []);
});

test("keeps legacy unconfigured company access permissive without an ownership lookup", async () => {
  const { client, calls } = ownershipClient({
    error: new Error("must not query"),
  });
  const allowed = await allowsWebRequest(
    new Request("https://kontave.test/api/sales/invoice-any"),
    unconfigured(),
    ["sales.read"],
    "sales.read",
    client,
  );
  assert.equal(allowed, true);
  assert.deepEqual(calls, []);
});

test("fails closed when a configured payroll run belongs to another company", async () => {
  const { client, calls } = ownershipClient({ companyId: "company-other" });
  const allowed = await allowsWebRequest(
    new Request("https://kontave.test/api/payroll/runs/unconfirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: "run-other",
        companyId: "company-allowed",
      }),
    }),
    configured(["company-allowed"]),
    ["payroll.confirm"],
    "payroll.confirm",
    client,
  );
  assert.equal(allowed, false);
  assert.deepEqual(calls, [
    {
      table: "shared_payroll_runs",
      filters: [
        ["tenant_id", tenantId],
        ["id", "run-other"],
      ],
    },
  ]);
});

test("propagates ownership storage errors so the caller denies the request", async () => {
  const failure = new Error("database unavailable");
  const { client } = ownershipClient({ error: failure });
  await assert.rejects(
    () =>
      allowsWebRequest(
        new Request("https://kontave.test/api/sales/invoice"),
        configured(["company-allowed"]),
        ["sales.read"],
        "sales.read",
        client,
      ),
    failure,
  );
});
