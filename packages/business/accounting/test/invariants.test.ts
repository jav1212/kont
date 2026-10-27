import assert from "node:assert/strict";
import test from "node:test";
import {
  AccountingCommandEngine,
  ExecuteAccountingCommand,
  inspectAccountStructure,
  type AccountingWriteCommand,
  type AccountingCommandEnvelope,
} from "../src/application";
import { chartOfAccounts, codeStructure } from "../src/domain";
import {
  AllowAccountingAuthorization,
  DenyAccountingAuthorization,
  InMemoryAccountingRepository,
} from "../src/testing";

const scope = {
  tenantId: "tenant",
  organizationId: "org",
  companyId: "company",
  actorId: "actor",
};

test("assign_account_to_chart preserves a legacy account id, code and orphan parent reference", async () => {
  const structure = codeStructure({
    segments: [
      { length: 1, separator: null },
      { length: 2, separator: "." },
      { length: 2, separator: "." },
    ],
  });
  const chart = chartOfAccounts({
    id: "target",
    companyId: scope.companyId,
    name: "Target",
    status: "draft",
    structure,
    version: 1,
  });
  const engine = new AccountingCommandEngine([chart], [], scope, [
    {
      id: "legacy-account",
      chartId: null,
      code: "1.01",
      name: "Historical account",
      parentCode: "1",
      level: 2,
      kind: "detail",
      type: "revenue",
      isMemorandum: false,
      normalBalance: "credit",
      monetaryClass: null,
      isActive: true,
      version: 1,
    },
  ]);
  const result = await engine.execute(scope, {
    ...scope,
    kind: "assign_account_to_chart",
    accountId: "legacy-account",
    chartId: "target",
    expectedVersion: 1,
    idempotencyKey: "assign-legacy-account",
    correlationId: "test-assign-legacy-account",
  });
  assert.deepEqual(result.affectedIds, ["legacy-account"]);
  assert.equal(result.versions["legacy-account"], 2);
  const account = await engine.getAccount({ ...scope, accountId: "legacy-account" });
  assert.equal(account?.account.id, "legacy-account");
  assert.equal(account?.account.chartId, "target");
  assert.equal(account?.account.code, "1.01");
  assert.equal(account?.account.parentCode, "1");
  assert.equal(account?.account.type, "revenue");
});
type Input<T = AccountingWriteCommand> = T extends AccountingWriteCommand
  ? Omit<T, keyof AccountingCommandEnvelope>
  : never;
async function fixture(separator = ".") {
  const repository = new InMemoryAccountingRepository();
  const useCase = new ExecuteAccountingCommand(
    new AllowAccountingAuthorization(),
    repository,
  );
  let serial = 0;
  const send = (command: Input) =>
    useCase.execute({
      ...scope,
      idempotencyKey: `key-${++serial}`,
      correlationId: "test",
      ...command,
    });
  const structure = {
    segments: [
      { length: 1, separator: null },
      { length: 2, separator },
      { length: 2, separator },
    ],
  } as const;
  await send({
    kind: "create_chart",
    chartId: "chart",
    name: "Chart",
    structure,
  });
  const add = (
    id: string,
    code: string,
    kind: "summary" | "detail" = "detail",
  ) =>
    send({
      kind: "create_account",
      accountId: id,
      chartId: "chart",
      code,
      name: id,
      accountKind: kind,
      accountType: "asset",
      isMemorandum: false,
      monetaryClass: null,
    });
  const get = (id: string) =>
    repository.getAccount({ ...scope, accountId: id });
  return { repository, useCase, send, add, get, structure };
}

for (const separator of [".", "-", "/"]) {
  test(`recoding a subtree with ${separator} preserves every identity and reports all revisions`, async () => {
    const f = await fixture(separator);
    await f.add("root", "1", "summary");
    await f.add("branch", `1${separator}01`, "summary");
    await f.add("leaf", `1${separator}01${separator}01`);
    f.repository.setReferences("leaf", { postings: 2 });
    const result = await f.send({
      kind: "recode_account",
      accountId: "branch",
      expectedVersion: 1,
      code: `1${separator}02`,
    });
    assert.deepEqual(new Set(result.affectedIds), new Set(["branch", "leaf"]));
    assert.deepEqual(result.versions, { branch: 2, leaf: 2 });
    assert.equal(
      (await f.get("leaf"))?.account.code,
      `1${separator}02${separator}01`,
    );
    assert.equal((await f.get("leaf"))?.references.postings, 2);
    assert.equal(
      f.repository.auditEvents.find((event) => event.kind === "recode_account")
        ?.previousCode,
      `1${separator}01`,
    );
  });
}

test("failed recoding rolls back all descendants and emits no audit", async () => {
  const f = await fixture();
  await f.add("root", "1", "summary");
  await f.add("branch", "1.01", "summary");
  await f.add("leaf", "1.01.01");
  await f.add("occupied", "1.02", "summary");
  const before = f.repository.auditEvents;
  await assert.rejects(
    () =>
      f.send({
        kind: "recode_account",
        accountId: "branch",
        expectedVersion: 1,
        code: "1.02",
      }),
    { code: "DUPLICATE_CODE" },
  );
  assert.equal((await f.get("leaf"))?.account.code, "1.01.01");
  assert.deepEqual(f.repository.auditEvents, before);
});

test("classification cascades atomically and derives nature; posted descendants block it", async () => {
  const f = await fixture();
  await f.add("root", "1", "summary");
  await f.add("leaf", "1.01");
  f.repository.setReferences("leaf", { postings: 1 });
  await assert.rejects(
    () =>
      f.send({
        kind: "set_account_classification",
        accountId: "root",
        expectedVersion: 1,
        accountType: "liability",
        isMemorandum: false,
        monetaryClass: null,
      }),
    { code: "HAS_POSTINGS" },
  );
  assert.equal((await f.get("root"))?.account.type, "asset");
  f.repository.setReferences("leaf", { postings: 0 });
  await f.send({
    kind: "set_account_classification",
    accountId: "root",
    expectedVersion: 1,
    accountType: "liability",
    isMemorandum: false,
    monetaryClass: "monetary",
  });
  assert.equal((await f.get("leaf"))?.account.type, "liability");
  assert.equal((await f.get("leaf"))?.account.normalBalance, "credit");
});

test("name-only update preserves classification and cannot bypass conversion checks", async () => {
  const f = await fixture();
  await f.add("root", "1", "summary");
  await f.add("leaf", "1.01");
  await f.send({
    kind: "update_account",
    accountId: "root",
    expectedVersion: 1,
    name: "Renamed",
  });
  await assert.rejects(
    () =>
      f.send({
        kind: "update_account",
        accountId: "root",
        expectedVersion: 2,
        name: "Renamed",
        accountKind: "detail",
      }),
    { code: "HAS_CHILDREN" },
  );
  assert.equal((await f.get("root"))?.account.kind, "summary");
});

test("imports are atomic and a failed intent can be retried without a receipt", async () => {
  const f = await fixture();
  const command = {
    ...scope,
    idempotencyKey: "import",
    correlationId: "test",
    kind: "create_chart" as const,
    chartId: "imported",
    name: "Import",
    structure: f.structure,
    initialAccounts: [
      {
        id: "first",
        code: "1",
        name: "Root",
        accountKind: "summary" as const,
        accountType: "asset" as const,
      },
      {
        id: "bad",
        code: "2.01",
        name: "Orphan",
        accountKind: "detail" as const,
        accountType: "asset" as const,
      },
    ],
  };
  await assert.rejects(() => f.useCase.execute(command), {
    code: "PARENT_INVALID",
  });
  assert.equal((await f.repository.listCharts(scope)).length, 1);
  assert.equal(await f.get("first"), null);
  const result = await f.useCase.execute({
    ...command,
    initialAccounts: command.initialAccounts.slice(0, 1),
  });
  assert.equal(result.replayed, false);
});

test("activation never archives another tenant or an active chart with postings", async () => {
  const f = await fixture();
  await f.add("root", "1");
  await f.send({
    kind: "activate_chart",
    chartId: "chart",
    expectedVersion: 1,
  });
  const other = {
    ...scope,
    tenantId: "other",
    idempotencyKey: "other",
    correlationId: "test",
  };
  await f.useCase.execute({
    ...other,
    kind: "create_chart",
    chartId: "other-chart",
    name: "Other",
    structure: f.structure,
  });
  await f.useCase.execute({
    ...other,
    idempotencyKey: "activate",
    kind: "activate_chart",
    chartId: "other-chart",
    expectedVersion: 1,
  });
  assert.equal((await f.repository.listCharts(scope))[0]?.status, "active");
  f.repository.setReferences("root", { postings: 1 });
  await f.send({
    kind: "create_chart",
    chartId: "replacement",
    name: "Replacement",
    structure: f.structure,
  });
  await assert.rejects(
    () =>
      f.send({
        kind: "activate_chart",
        chartId: "replacement",
        expectedVersion: 1,
      }),
    { code: "HAS_POSTINGS" },
  );
  assert.equal(
    (await f.repository.listCharts({ ...scope, status: "active" }))[0]?.id,
    "chart",
  );
});

test("memorandum details require an opposite reciprocal pair before activation", async () => {
  const f = await fixture();
  for (const [id, code, normalBalance] of [
    ["debit", "8", "debit"],
    ["credit", "9", "credit"],
  ] as const)
    await f.send({
      kind: "create_account",
      accountId: id,
      chartId: "chart",
      code,
      name: id,
      accountKind: "detail",
      accountType: "asset",
      isMemorandum: true,
      normalBalance,
      monetaryClass: null,
    });
  await assert.rejects(
    () =>
      f.send({ kind: "activate_chart", chartId: "chart", expectedVersion: 1 }),
    { code: "INVALID" },
  );
  await f.send({
    kind: "pair_memorandum_accounts",
    debitAccountId: "debit",
    debitExpectedVersion: 1,
    creditAccountId: "credit",
    creditExpectedVersion: 1,
  });
  await f.send({
    kind: "activate_chart",
    chartId: "chart",
    expectedVersion: 1,
  });
  assert.equal(
    (await f.get("debit"))?.account.memorandumCounterpartId,
    "credit",
  );
});

test("structure preview reports existing orphan accounts without hiding them", async () => {
  const f = await fixture();
  await f.add("root", "1", "summary");
  await f.add("leaf", "1.01");
  const accounts = await f.repository.findAccounts({
    ...scope,
    chartId: "chart",
  });
  const leaf = accounts.find((item) => item.id === "leaf");
  assert.ok(leaf);
  assert.deepEqual(inspectAccountStructure(f.structure, [leaf]), [
    { accountId: "leaf", code: "1.01", reason: "PARENT_INVALID" },
  ]);
});

test("receipts replay semantic payloads regardless of property insertion order", async () => {
  const f = await fixture();
  const command = {
    ...scope,
    idempotencyKey: "stable",
    correlationId: "test",
    kind: "create_account" as const,
    accountId: "id",
    chartId: "chart",
    code: "1",
    name: "Asset",
    accountKind: "detail" as const,
    accountType: "asset" as const,
    isMemorandum: false,
    monetaryClass: null,
  };
  await f.useCase.execute(command);
  assert.equal(
    (await f.useCase.execute({ ...command, correlationId: "retry" })).replayed,
    true,
  );
  const reordered = Object.fromEntries(
    Object.entries(command).reverse(),
  ) as unknown as typeof command;
  assert.equal((await f.useCase.execute(reordered)).replayed, true);
  await assert.rejects(
    () =>
      new ExecuteAccountingCommand(
        new DenyAccountingAuthorization(),
        f.repository,
      ).execute(command),
    { code: "FORBIDDEN" },
  );
});

test("stale writes, inactive parents, special roles and postings reject destructive changes", async () => {
  const f = await fixture();
  await f.add("root", "1", "summary");
  await f.add("leaf", "1.01");
  await assert.rejects(
    () =>
      f.send({
        kind: "update_account",
        accountId: "leaf",
        expectedVersion: 0,
        name: "Stale",
      }),
    { code: "VERSION_CONFLICT" },
  );
  f.repository.setReferences("leaf", { specialRoles: 1 });
  await assert.rejects(
    () =>
      f.send({
        kind: "set_account_active",
        accountId: "leaf",
        expectedVersion: 1,
        isActive: false,
      }),
    { code: "IN_USE" },
  );
  f.repository.setReferences("leaf", { postings: 1 });
  await assert.rejects(
    () =>
      f.send({ kind: "delete_account", accountId: "leaf", expectedVersion: 1 }),
    { code: "HAS_POSTINGS" },
  );
  f.repository.setReferences("leaf", {});
  await f.send({
    kind: "set_account_active",
    accountId: "leaf",
    expectedVersion: 1,
    isActive: false,
  });
  await f.send({
    kind: "set_account_active",
    accountId: "root",
    expectedVersion: 1,
    isActive: false,
  });
  await assert.rejects(() => f.add("new", "1.02"), { code: "PARENT_INVALID" });
  await assert.rejects(
    () =>
      f.send({
        kind: "set_account_active",
        accountId: "leaf",
        expectedVersion: 2,
        isActive: true,
      }),
    { code: "PARENT_INVALID" },
  );
});

test("conversion rejects posted detail and a structure change reports incompatible data", async () => {
  const f = await fixture();
  await f.add("root", "1", "summary");
  await f.add("leaf", "1.01");
  f.repository.setReferences("leaf", { postings: 1 });
  await assert.rejects(
    () =>
      f.send({
        kind: "convert_account_kind",
        accountId: "leaf",
        expectedVersion: 1,
        accountKind: "summary",
      }),
    { code: "HAS_POSTINGS" },
  );
  const next = { segments: [{ length: 2, separator: null }] } as const;
  assert.equal(
    inspectAccountStructure(
      next,
      await f.repository.findAccounts({ ...scope, chartId: "chart" }),
    ).length,
    2,
  );
  await assert.rejects(
    () =>
      f.send({
        kind: "change_chart_structure",
        chartId: "chart",
        expectedVersion: 1,
        structure: next,
      }),
    { code: "CODE_OUT_OF_STRUCTURE" },
  );
  assert.equal((await f.repository.listCharts(scope))[0]?.version, 1);
});

test("unavailable templates and foreign copy sources reject without creating charts", async () => {
  const f = await fixture();
  await assert.rejects(
    () =>
      f.send({
        kind: "create_chart",
        chartId: "template",
        name: "Template",
        structure: f.structure,
        source: { kind: "template", templateId: "VEN-NIF" },
      }),
    { code: "INVALID" },
  );
  await assert.rejects(
    () =>
      f.send({
        kind: "create_chart",
        chartId: "copy",
        name: "Copy",
        structure: f.structure,
        source: { kind: "copy", sourceChartId: "foreign", accountIds: {} },
      }),
    { code: "NOT_FOUND" },
  );
  assert.equal((await f.repository.listCharts(scope)).length, 1);
});

test("regulatory nature overrides retain their reason in the audit", async () => {
  const f = await fixture();
  await f.add("root", "1");
  await assert.rejects(
    () =>
      f.send({
        kind: "update_account",
        accountId: "root",
        expectedVersion: 1,
        name: "Contra",
        normalBalance: "credit",
      }),
    { code: "INVALID" },
  );
  await f.send({
    kind: "update_account",
    accountId: "root",
    expectedVersion: 1,
    name: "Contra",
    normalBalance: "credit",
    normalBalanceOverrideReason: "Accumulated depreciation",
  });
  assert.equal(
    f.repository.auditEvents.find(
      (event) => event.kind === "normal_balance_override",
    )?.reason,
    "Accumulated depreciation",
  );
});

test("memorandum unlink is reciprocal, versioned and required before reclassification", async () => {
  const f = await fixture();
  for (const [id, code, normalBalance] of [
    ["debit", "8", "debit"],
    ["credit", "9", "credit"],
  ] as const)
    await f.send({
      kind: "create_account",
      accountId: id,
      chartId: "chart",
      code,
      name: id,
      accountKind: "detail",
      accountType: "asset",
      isMemorandum: true,
      normalBalance,
      monetaryClass: null,
    });
  await f.send({
    kind: "pair_memorandum_accounts",
    debitAccountId: "debit",
    debitExpectedVersion: 1,
    creditAccountId: "credit",
    creditExpectedVersion: 1,
  });
  await assert.rejects(
    () =>
      f.send({
        kind: "update_account",
        accountId: "debit",
        expectedVersion: 2,
        name: "Ordinary",
        isMemorandum: false,
      }),
    { code: "IN_USE" },
  );
  await assert.rejects(
    () =>
      f.send({
        kind: "unpair_memorandum_accounts",
        accountId: "debit",
        expectedVersion: 2,
        counterpartExpectedVersion: 1,
      }),
    { code: "VERSION_CONFLICT" },
  );
  assert.equal(
    (await f.get("debit"))?.account.memorandumCounterpartId,
    "credit",
  );
  await f.send({
    kind: "unpair_memorandum_accounts",
    accountId: "debit",
    expectedVersion: 2,
    counterpartExpectedVersion: 2,
  });
  assert.equal(
    (await f.get("debit"))?.account.memorandumCounterpartId,
    undefined,
  );
  assert.equal(
    (await f.get("credit"))?.account.memorandumCounterpartId,
    undefined,
  );
  await f.send({
    kind: "update_account",
    accountId: "debit",
    expectedVersion: 3,
    name: "Ordinary",
    isMemorandum: false,
  });
  await f.send({
    kind: "delete_account",
    accountId: "debit",
    expectedVersion: 4,
  });
  assert.equal(await f.get("debit"), null);
});
