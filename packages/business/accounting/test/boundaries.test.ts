import assert from "node:assert/strict";
import test from "node:test";
import { ledgerAccount } from "../src/domain";
import { AccountingQueries, parseChartImport } from "../src/application";
import {
  AllowAccountingAuthorization,
  InMemoryAccountingRepository,
} from "../src/testing";

const scope = {
  tenantId: "tenant",
  organizationId: "organization",
  companyId: "company",
  actorId: "actor",
};
const structure = { segments: [{ length: 1, separator: null }] } as const;

test("normal balance deviations require an audit reason", () => {
  assert.throws(
    () =>
      ledgerAccount(structure, {
        id: "a",
        chartId: "c",
        code: "1",
        name: "Regulatory",
        kind: "detail",
        type: "asset",
        isMemorandum: false,
        normalBalance: "credit",
        monetaryClass: null,
        isActive: true,
        version: 1,
      }),
    { code: "INVALID" },
  );
  assert.equal(
    ledgerAccount(structure, {
      id: "a",
      chartId: "c",
      code: "1",
      name: "Regulatory",
      kind: "detail",
      type: "asset",
      isMemorandum: false,
      normalBalance: "credit",
      normalBalanceOverrideReason: "Accumulated depreciation",
      monetaryClass: null,
      isActive: true,
      version: 1,
    }).normalBalance,
    "credit",
  );
});
test("chart import uses typed failures for missing or repeated identifiers", () => {
  assert.throws(() => parseChartImport('1,"Assets",G,1', []), {
    code: "INVALID",
  });
  assert.throws(
    () =>
      parseChartImport('1,"Assets",G,1\n2,"Liabilities",G,1', ["same", "same"]),
    { code: "INVALID" },
  );
});
test("queries reject malformed runtime filters before calling their repository", async () => {
  const queries = new AccountingQueries(
    new AllowAccountingAuthorization(),
    new InMemoryAccountingRepository(),
  );
  await assert.rejects(
    () => queries.findAccounts({ ...scope, chartId: "", search: "ok" }),
    { code: "INVALID" },
  );
  await assert.rejects(
    () =>
      queries.findAccounts({
        ...scope,
        chartId: "chart",
        includeInactive: "yes" as never,
      }),
    { code: "INVALID" },
  );
  await assert.rejects(() => queries.getAccount({ ...scope, accountId: "" }), {
    code: "INVALID",
  });
});
