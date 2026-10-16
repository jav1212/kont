import assert from "node:assert/strict";
import test from "node:test";
import {
  AccountingIntegrationFailure,
  ReadAccountingIntegrationRuleConfiguration,
  ReplaceAccountingIntegrationRuleConfiguration,
  type AccountingIntegrationRuleConfigurationRepository,
} from "../../src";
import {
  SupabaseAccountingIntegrationRuleConfigurationRepository,
  type AccountingIntegrationRuleConfigurationSupabaseSource,
} from "../../src/adapters/supabase";

const payrollScope = {
  actorId: "actor-1",
  tenantId: "tenant-1",
  organizationId: "organization-1",
  companyId: "company-1",
  source: "payroll.run_confirmed" as const,
};

const payrollRule = {
  id: "gross-payroll",
  amountField: "gross_earnings" as const,
  debitAccountId: "expense:wages",
  creditAccountId: "liability:payroll",
  description: "Nómina bruta",
  isActive: true,
};

const payrollRules = [payrollRule];

test("configuration reader permits an empty configuration and freezes its evidence", async () => {
  const repository: AccountingIntegrationRuleConfigurationRepository = {
    async read(scope) {
      return { source: scope.source, version: "1", rules: [] };
    },
    async replace() {
      throw new Error("not used");
    },
  };
  const result = await new ReadAccountingIntegrationRuleConfiguration(repository).execute(payrollScope);
  assert.deepEqual(result, { source: "payroll.run_confirmed", version: "1", rules: [] });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.rules), true);
});

test("configuration replacement validates source-owned amount fields, bounded list, unique rules, and distinct accounts before persistence", async () => {
  let calls = 0;
  const repository: AccountingIntegrationRuleConfigurationRepository = {
    async read() { throw new Error("not used"); },
    async replace(input) {
      calls += 1;
      return { source: input.source, version: "2", rules: input.rules };
    },
  };
  const useCase = new ReplaceAccountingIntegrationRuleConfiguration(repository);
  const invalidCases = [
    { rules: [{ ...payrollRule, amountField: "recognized_inventory_cost" as const }] },
    { rules: [{ ...payrollRule, amountField: "employer_contributions" as const }] },
    { rules: [{ ...payrollRule, creditAccountId: "expense:wages" }] },
    { rules: [payrollRule, payrollRule] },
    { rules: Array.from({ length: 33 }, (_, index) => ({ ...payrollRule, id: `rule-${index}` })) },
  ];
  for (const invalid of invalidCases) {
    await assert.rejects(
      () => useCase.execute({ ...payrollScope, expectedVersion: "1", rules: invalid.rules }),
      (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_RULE_INVALID" || error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_RULESET_INVALID",
    );
  }
  assert.equal(calls, 0);
  const saved = await useCase.execute({ ...payrollScope, expectedVersion: "1", rules: payrollRules });
  assert.deepEqual(saved, { source: "payroll.run_confirmed", version: "2", rules: payrollRules });
  assert.equal(calls, 1);
});

test("configuration replacement preserves scope, expected version and inactive purchase mappings in the service RPC contract", async () => {
  const source: AccountingIntegrationRuleConfigurationSupabaseSource = {
    async rpc(name, values) {
      assert.equal(name, "replace_native_accounting_rule_configuration");
      assert.deepEqual(values, {
        p_actor_id: "actor-1",
        p_organization_id: "organization-1",
        p_company_id: "company-1",
        p_source: "purchasing.invoice_confirmed",
        p_expected_version: "7",
        p_rules: [{
          id: "inventory",
          amountField: "recognized_inventory_cost",
          debitAccountId: "asset:inventory",
          creditAccountId: "liability:receiving",
          description: "Inventario recibido",
          isActive: false,
        }],
      });
      return {
        data: {
          source: "purchasing.invoice_confirmed",
          version: "8",
          rules: [{
            id: "inventory",
            amountField: "recognized_inventory_cost",
            debitAccountId: "asset:inventory",
            creditAccountId: "liability:receiving",
            description: "Inventario recibido",
            isActive: false,
          }],
        },
        error: null,
      };
    },
  };
  const result = await new ReplaceAccountingIntegrationRuleConfiguration(
    new SupabaseAccountingIntegrationRuleConfigurationRepository(source),
  ).execute({
    ...payrollScope,
    source: "purchasing.invoice_confirmed",
    expectedVersion: "7",
    rules: [{
      id: "inventory",
      amountField: "recognized_inventory_cost",
      debitAccountId: "asset:inventory",
      creditAccountId: "liability:receiving",
      description: "Inventario recibido",
      isActive: false,
    }],
  });
  assert.deepEqual(result, {
    source: "purchasing.invoice_confirmed",
    version: "8",
    rules: [{
      id: "inventory",
      amountField: "recognized_inventory_cost",
      debitAccountId: "asset:inventory",
      creditAccountId: "liability:receiving",
      description: "Inventario recibido",
      isActive: false,
    }],
  });
});

test("configuration adapter maps authorization, stale configuration and malformed result failures", async () => {
  const cases = [
    ["ACCESS_DENIED", "ACCOUNTING_INTEGRATION_ACCESS_DENIED"],
    ["VERSION_MISMATCH", "ACCOUNTING_INTEGRATION_RULESET_CHANGED"],
    ["INVALID_CONFIGURATION", "ACCOUNTING_INTEGRATION_RULESET_INVALID"],
  ] as const;
  for (const [message, code] of cases) {
    const source: AccountingIntegrationRuleConfigurationSupabaseSource = {
      async rpc() { return { data: null, error: { message } }; },
    };
    await assert.rejects(
      () => new ReadAccountingIntegrationRuleConfiguration(new SupabaseAccountingIntegrationRuleConfigurationRepository(source)).execute(payrollScope),
      (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === code,
    );
  }
  const malformed: AccountingIntegrationRuleConfigurationSupabaseSource = {
    async rpc() { return { data: { source: "payroll.run_confirmed", version: "1", rules: [{ id: "x" }] }, error: null }; },
  };
  await assert.rejects(
    () => new ReadAccountingIntegrationRuleConfiguration(new SupabaseAccountingIntegrationRuleConfigurationRepository(malformed)).execute(payrollScope),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_RULE_INVALID",
  );
});

test("configuration use cases reject malformed trusted scope and stale expected revisions", async () => {
  const repository: AccountingIntegrationRuleConfigurationRepository = {
    async read() { throw new Error("not used"); },
    async replace() { throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_CHANGED", "stale"); },
  };
  await assert.rejects(
    () => new ReadAccountingIntegrationRuleConfiguration(repository).execute({ ...payrollScope, tenantId: " " }),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_ACCESS_DENIED",
  );
  await assert.rejects(
    () => new ReplaceAccountingIntegrationRuleConfiguration(repository).execute({ ...payrollScope, expectedVersion: " ", rules: payrollRules }),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_RULESET_CHANGED",
  );
  await assert.rejects(
    () => new ReplaceAccountingIntegrationRuleConfiguration(repository).execute({ ...payrollScope, expectedVersion: "1", rules: payrollRules }),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_RULESET_CHANGED",
  );
});
