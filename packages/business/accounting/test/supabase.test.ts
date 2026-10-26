import assert from "node:assert/strict";
import test from "node:test";
import { AccountingFailure } from "../src/domain";
import {
  SupabaseAccountingRepository,
  type AccountingSupabaseClient,
} from "../src/adapters/supabase";

const scope = {
  tenantId: "tenant",
  organizationId: "organization",
  companyId: "company",
  actorId: "actor",
};
const command = {
  ...scope,
  kind: "create_chart" as const,
  chartId: "chart",
  name: "Chart",
  structure: { segments: [{ length: 1, separator: null }] },
  idempotencyKey: "idempotency",
  correlationId: "correlation",
};

test("supabase repository sends the shared RPC scope and command unchanged", async () => {
  let name = "";
  let argumentsValue: Record<string, unknown> | undefined;
  const repository = new SupabaseAccountingRepository({
    async rpc(nextName, nextArguments) {
      name = nextName;
      argumentsValue = nextArguments as Record<string, unknown>;
      return {
        data: {
          commandId: "receipt",
          replayed: false,
          affectedIds: ["chart"],
          versions: { chart: 1 },
        },
        error: null,
      };
    },
  });
  assert.deepEqual(await repository.execute(scope, command), {
    commandId: "receipt",
    replayed: false,
    affectedIds: ["chart"],
    versions: { chart: 1 },
  });
  assert.equal(name, "shared_accounting_execute_command");
  assert.deepEqual(argumentsValue, { p_scope: scope, p_command: command });
});

test("supabase repository maps SQL failures one to one and wraps transport failures", async () => {
  for (const code of [
    "FORBIDDEN",
    "VERSION_CONFLICT",
    "HAS_POSTINGS",
    "ACTIVE_CHART_CONFLICT",
  ] as const) {
    const repository = new SupabaseAccountingRepository({
      async rpc() {
        return { data: null, error: { message: `ACCOUNTING_${code}` } };
      },
    });
    await assert.rejects(
      () => repository.execute(scope, command),
      (error: unknown) =>
        error instanceof AccountingFailure && error.code === code,
    );
  }
  const unavailable = new SupabaseAccountingRepository({
    async rpc() {
      throw new Error("connection lost");
    },
  });
  await assert.rejects(() => unavailable.execute(scope, command), {
    code: "UNAVAILABLE",
  });
});

test("supabase repository rejects malformed results and preserves query tenant scope", async () => {
  const invalid = new SupabaseAccountingRepository({
    async rpc() {
      return {
        data: {
          commandId: "receipt",
          replayed: "no",
          affectedIds: [],
          versions: {},
        },
        error: null,
      };
    },
  });
  await assert.rejects(() => invalid.execute(scope, command), {
    code: "UNAVAILABLE",
  });
  let argumentsValue: Record<string, unknown> | undefined;
  const legacy = new SupabaseAccountingRepository({
    async rpc(_name, nextArguments) {
      argumentsValue = nextArguments as Record<string, unknown>;
      return {
        data: [
          {
            id: "legacy",
            chartId: "chart",
            code: "1.1",
            name: "Legacy orphan",
            parentCode: null,
            level: 2,
            kind: "detail",
            type: "asset",
            isMemorandum: false,
            normalBalance: "debit",
            monetaryClass: null,
            isActive: true,
            version: 1,
          },
        ],
        error: null,
      };
    },
  });
  const accounts = await legacy.findAccounts({
    ...scope,
    chartId: "chart",
    includeInactive: true,
  });
  assert.equal(accounts[0]?.code, "1.1");
  assert.deepEqual(argumentsValue, {
    p_scope: scope,
    p_query: {
      kind: "find_accounts",
      chartId: "chart",
      search: null,
      includeInactive: true,
    },
  });
});

test("supabase repository decodes direct chart and account query contracts", async () => {
  let calls = 0;
  const repository = new SupabaseAccountingRepository({
    async rpc() {
      calls += 1;
      if (calls === 1)
        return {
          data: [
            {
              id: "chart",
              companyId: "company",
              name: "Plan",
              status: "active",
              structure: {
                segments: [
                  { length: 1, separator: null },
                  { length: 2, separator: "." },
                ],
              },
              version: 2,
            },
          ],
          error: null,
        };
      return {
        data: {
          account: {
            id: "legacy",
            chartId: "chart",
            code: "1.1",
            name: "Legacy",
            parentCode: null,
            level: 2,
            kind: "detail",
            type: "asset",
            isMemorandum: false,
            normalBalance: "debit",
            normalBalanceOverrideReason: null,
            memorandumCounterpartId: null,
            monetaryClass: null,
            isActive: true,
            version: 1,
          },
          references: {
            postings: 0,
            children: 0,
            integrationRules: 0,
            specialRoles: 0,
            associations: 0,
          },
        },
        error: null,
      };
    },
  });
  assert.equal(
    (await repository.listCharts(scope))[0]?.structure.segments[1]?.separator,
    ".",
  );
  assert.deepEqual(
    (await repository.getAccount({ ...scope, accountId: "legacy" }))
      ?.references,
    {
      postings: 0,
      children: 0,
      integrationRules: 0,
      specialRoles: 0,
      associations: 0,
    },
  );
});

test("supabase repository retains loose historical accounts and query fields", async () => {
  let argumentsValue: Record<string, unknown> | undefined;
  const repository = new SupabaseAccountingRepository({
    async rpc(_name, nextArguments) {
      argumentsValue = nextArguments as Record<string, unknown>;
      return {
        data: [
          {
            id: "loose",
            chartId: null,
            code: "legacy-001",
            name: "Saldo heredado",
            parentCode: null,
            level: 1,
            kind: "detail",
            type: "asset",
            isMemorandum: false,
            normalBalance: "debit",
            monetaryClass: null,
            isActive: true,
            version: 4,
            historicalOpeningBalance: "001250.3400",
            migrationState: "unassigned",
          },
        ],
        error: null,
      };
    },
  });
  const account = (
    await repository.findAccounts({ ...scope, chartId: null })
  )[0];
  assert.equal(account?.chartId, null);
  assert.equal(account?.historicalOpeningBalance, "001250.3400");
  assert.equal(
    (account as unknown as Record<string, unknown> | undefined)?.migrationState,
    "unassigned",
  );
  assert.deepEqual(argumentsValue, {
    p_scope: scope,
    p_query: {
      kind: "find_accounts",
      chartId: null,
      search: null,
      includeInactive: false,
    },
  });
});

test("supabase repository preserves extra get-account fields without decimal coercion", async () => {
  const repository = new SupabaseAccountingRepository({
    async rpc() {
      return {
        data: {
          account: {
            id: "loose",
            chartId: null,
            code: "legacy-001",
            name: "Saldo heredado",
            parentCode: null,
            level: 1,
            kind: "detail",
            type: "asset",
            isMemorandum: false,
            normalBalance: "debit",
            monetaryClass: null,
            isActive: true,
            version: 4,
            historicalOpeningBalance: "-0.0100",
            importSource: "legacy",
          },
          references: {
            postings: 0,
            children: 0,
            integrationRules: 0,
            specialRoles: 0,
            associations: 0,
          },
        },
        error: null,
      };
    },
  });
  const account = (
    await repository.getAccount({ ...scope, accountId: "loose" })
  )?.account;
  assert.equal(account?.historicalOpeningBalance, "-0.0100");
  assert.equal(
    (account as unknown as Record<string, unknown> | undefined)?.importSource,
    "legacy",
  );
});

test("supabase repository validates direct scopes and decodes replayed receipts", async () => {
  const client: AccountingSupabaseClient = {
    async rpc() {
      return {
        data: {
          commandId: "receipt",
          replayed: true,
          affectedIds: [],
          versions: {},
        },
        error: null,
      };
    },
  };
  const repository = new SupabaseAccountingRepository(client);
  assert.deepEqual(await repository.execute(scope, command), {
    commandId: "receipt",
    replayed: true,
    affectedIds: [],
    versions: {},
  });
  await assert.rejects(() => repository.listCharts({ ...scope, actorId: "" }), {
    code: "INVALID",
  });
});
