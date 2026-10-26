import assert from "node:assert/strict";
import test from "node:test";
import {
  accountCodePosition,
  accountKindConversion,
  codeStructure,
  ledgerAccount,
} from "../src/domain";
import {
  detectChartImportRoots,
  ExecuteAccountingCommand,
  parseChartImport,
} from "../src/application";
import {
  AllowAccountingAuthorization,
  DenyAccountingAuthorization,
  InMemoryAccountingRepository,
} from "../src/testing";

const scope = {
  tenantId: "tenant",
  organizationId: "organization",
  companyId: "company",
  actorId: "actor",
};
const structure = {
  segments: [
    { length: 1, separator: null },
    { length: 2, separator: "." },
    { length: 2, separator: "." },
  ],
} as const;
const envelope = {
  ...scope,
  idempotencyKey: "key",
  correlationId: "correlation",
};
async function createChart(
  repository: InMemoryAccountingRepository,
  id = "chart",
) {
  return new ExecuteAccountingCommand(
    new AllowAccountingAuthorization(),
    repository,
  ).execute({
    ...envelope,
    idempotencyKey: `chart-${id}`,
    kind: "create_chart",
    chartId: id,
    name: "Main chart",
    structure,
  });
}
async function createAccount(
  repository: InMemoryAccountingRepository,
  values: Partial<{
    readonly id: string;
    readonly code: string;
    readonly kind: "detail" | "summary";
    readonly type: "asset" | "liability" | "equity" | "revenue" | "expense";
  }> = {},
) {
  return new ExecuteAccountingCommand(
    new AllowAccountingAuthorization(),
    repository,
  ).execute({
    ...envelope,
    idempotencyKey: `account-${values.id ?? "account"}`,
    kind: "create_account",
    accountId: values.id ?? "account",
    chartId: "chart",
    code: values.code ?? "1",
    name: "Cash",
    accountKind: values.kind ?? "detail",
    accountType: values.type ?? "asset",
    isMemorandum: false,
    monetaryClass: "monetary",
  });
}

test("CON-002 derives valid levels and parents from the chart structure", () => {
  assert.deepEqual(accountCodePosition(codeStructure(structure), "1.01.02"), {
    level: 3,
    parentCode: "1.01",
  });
  assert.throws(() => accountCodePosition(codeStructure(structure), "1.1"), {
    code: "CODE_OUT_OF_STRUCTURE",
  });
});
test("CON-001 creates draft charts, imports accounts, and activates one chart", async () => {
  const repository = new InMemoryAccountingRepository();
  const execute = new ExecuteAccountingCommand(
    new AllowAccountingAuthorization(),
    repository,
  );
  await execute.execute({
    ...envelope,
    kind: "create_chart",
    chartId: "one",
    name: "One",
    structure,
    initialAccounts: [
      {
        id: "root",
        code: "1",
        name: "Assets",
        accountKind: "summary",
        accountType: "asset",
      },
    ],
  });
  await execute.execute({
    ...envelope,
    idempotencyKey: "two",
    kind: "create_chart",
    chartId: "two",
    name: "Two",
    structure,
  });
  await execute.execute({
    ...envelope,
    idempotencyKey: "active-one",
    kind: "activate_chart",
    chartId: "one",
    expectedVersion: 1,
  });
  await execute.execute({
    ...envelope,
    idempotencyKey: "active-two",
    kind: "activate_chart",
    chartId: "two",
    expectedVersion: 1,
  });
  assert.equal(
    (await repository.listCharts({ ...scope })).find(
      (chart) => chart.id === "one",
    )?.status,
    "archived",
  );
});
test("CON-001 copies a scoped chart with explicitly new account identifiers", async () => {
  const repository = new InMemoryAccountingRepository();
  const execute = new ExecuteAccountingCommand(
    new AllowAccountingAuthorization(),
    repository,
  );
  await execute.execute({
    ...envelope,
    kind: "create_chart",
    chartId: "source",
    name: "Source",
    structure,
    initialAccounts: [
      {
        id: "source-root",
        code: "1",
        name: "Assets",
        accountKind: "summary",
        accountType: "asset",
      },
    ],
  });
  await execute.execute({
    ...envelope,
    idempotencyKey: "copy",
    kind: "create_chart",
    chartId: "copy",
    name: "Copy",
    structure,
    source: {
      kind: "copy",
      sourceChartId: "source",
      accountIds: { "source-root": "copy-root" },
    },
  });
  assert.equal(
    (await repository.getAccount({ ...scope, accountId: "copy-root" }))?.account
      .chartId,
    "copy",
  );
});
test("CON-003 inherits parent classification and rejects incompatible children", async () => {
  const repository = new InMemoryAccountingRepository();
  await createChart(repository);
  await createAccount(repository, { id: "root", code: "1", kind: "summary" });
  await createAccount(repository, { id: "child", code: "1.01" });
  await assert.rejects(
    () =>
      createAccount(repository, { id: "bad", code: "1.02", type: "liability" }),
    { code: "TYPE_MISMATCH" },
  );
});
test("CON-004 searches accounts by code and name", async () => {
  const repository = new InMemoryAccountingRepository();
  await createChart(repository);
  await createAccount(repository);
  const results = await repository.findAccounts({
    ...scope,
    chartId: "chart",
    search: "cas",
  });
  assert.equal(results.length, 1);
});
test("CON-005 rejects structural changes after postings and supports audited subtree recoding", async () => {
  const repository = new InMemoryAccountingRepository();
  await createChart(repository);
  await createAccount(repository, { id: "root", code: "1", kind: "summary" });
  await createAccount(repository, {
    id: "child",
    code: "1.01",
    kind: "summary",
  });
  await createAccount(repository, { id: "leaf", code: "1.01.01" });
  repository.setReferences("child", { postings: 1 });
  const execute = new ExecuteAccountingCommand(
    new AllowAccountingAuthorization(),
    repository,
  );
  await assert.rejects(
    () =>
      execute.execute({
        ...envelope,
        idempotencyKey: "type",
        kind: "update_account",
        accountId: "child",
        expectedVersion: 1,
        name: "Child",
        accountType: "liability",
      }),
    { code: "HAS_POSTINGS" },
  );
  await execute.execute({
    ...envelope,
    idempotencyKey: "recode",
    kind: "recode_account",
    accountId: "child",
    expectedVersion: 1,
    code: "1.02",
  });
  assert.equal(
    (await repository.getAccount({ ...scope, accountId: "child" }))?.account
      .code,
    "1.02",
  );
  assert.equal(
    (await repository.getAccount({ ...scope, accountId: "leaf" }))?.account
      .code,
    "1.02.01",
  );
  assert.deepEqual(
    repository.auditEvents.find((event) => event.previousCode !== undefined),
    {
      kind: "recode_account",
      accountId: "child",
      previousCode: "1.01",
      nextCode: "1.02",
    },
  );
});
test("CON-006 and CON-007 protect active children, postings, and references", async () => {
  const repository = new InMemoryAccountingRepository();
  await createChart(repository);
  await createAccount(repository, { id: "root", code: "1", kind: "summary" });
  await createAccount(repository, { id: "child", code: "1.01" });
  const execute = new ExecuteAccountingCommand(
    new AllowAccountingAuthorization(),
    repository,
  );
  await assert.rejects(
    () =>
      execute.execute({
        ...envelope,
        idempotencyKey: "inactive",
        kind: "set_account_active",
        accountId: "root",
        expectedVersion: 1,
        isActive: false,
      }),
    { code: "HAS_CHILDREN" },
  );
  repository.setReferences("child", { integrationRules: 1 });
  await assert.rejects(
    () =>
      execute.execute({
        ...envelope,
        idempotencyKey: "delete",
        kind: "delete_account",
        accountId: "child",
        expectedVersion: 1,
      }),
    { code: "IN_USE" },
  );
});
test("CON-008 and CON-009 protect account-kind conversion", () => {
  const account = ledgerAccount(structure, {
    id: "account",
    chartId: "chart",
    code: "1",
    name: "Cash",
    kind: "detail",
    type: "asset",
    isMemorandum: false,
    monetaryClass: null,
    isActive: true,
    version: 1,
  });
  assert.throws(() => accountKindConversion(account, "summary", 1, 0), {
    code: "HAS_POSTINGS",
  });
});
test("CON-010 through CON-017 validate classifications and balance defaults", () => {
  const account = ledgerAccount(structure, {
    id: "expense",
    chartId: "chart",
    code: "5",
    name: "Expense",
    kind: "detail",
    type: "expense",
    isMemorandum: true,
    monetaryClass: "non_monetary",
    isActive: true,
    version: 1,
  });
  assert.equal(account.normalBalance, "debit");
  assert.equal(account.isMemorandum, true);
});
test("commands are idempotent, versioned, tenant scoped, and permission checked", async () => {
  const repository = new InMemoryAccountingRepository();
  await createChart(repository);
  const execute = new ExecuteAccountingCommand(
    new AllowAccountingAuthorization(),
    repository,
  );
  const command = {
    ...envelope,
    idempotencyKey: "same",
    kind: "create_account" as const,
    accountId: "a",
    chartId: "chart",
    code: "1",
    name: "Cash",
    accountKind: "detail" as const,
    accountType: "asset" as const,
    isMemorandum: false,
    monetaryClass: null,
  };
  assert.equal((await execute.execute(command)).replayed, false);
  assert.equal((await execute.execute(command)).replayed, true);
  await assert.rejects(
    () => execute.execute({ ...command, name: "Different" }),
    { code: "IDEMPOTENCY_CONFLICT" },
  );
  await assert.rejects(
    () =>
      new ExecuteAccountingCommand(
        new DenyAccountingAuthorization(),
        repository,
      ).execute({
        ...command,
        idempotencyKey: "denied",
        accountId: "b",
        code: "2",
      }),
    { code: "FORBIDDEN" },
  );
});
test("queries cannot read a chart from another tenant with the same company identifier", async () => {
  const repository = new InMemoryAccountingRepository();
  await createChart(repository);
  assert.equal(
    await repository.getAccount({
      ...scope,
      tenantId: "other",
      accountId: "missing",
    }),
    null,
  );
  assert.equal(
    (await repository.listCharts({ ...scope, tenantId: "other" })).length,
    0,
  );
});
test("imports preserve parser compatibility without claiming a certified template", () => {
  const content = '1,"Assets",G,1\n1.01,"Cash",M,2\nmalformed';
  assert.deepEqual(
    detectChartImportRoots(content).map((root) => root.root),
    ["1"],
  );
  const result = parseChartImport(content, ["root", "cash"]);
  assert.equal(result.accounts.length, 2);
  assert.equal(result.skipped, 1);
});
