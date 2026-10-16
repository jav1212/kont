import assert from "node:assert/strict";
import test from "node:test";
import { exactDecimal } from "@kontave/monetary/domain";
import { ExecuteTreasuryCommand, TreasuryFailure, type TreasuryCommandRepository, type TreasuryWriteCommand } from "../../src";

const scope = { tenantId: "tenant", organizationId: "organization", companyId: "company", actorId: "actor" };
const money = { amount: exactDecimal("1"), currency: "VES", operationalValue: { baseCurrency: "VES" as const, amount: exactDecimal("1"), rate: exactDecimal("1"), source: "policy", asOf: "2026-01-01", policyVersion: "v1", rounding: "half_up", minorUnit: 2 } };
const command: TreasuryWriteCommand = { ...scope, idempotencyKey: "key", correlationId: "correlation", kind: "post_ledger_entry", entryId: "entry", account: { kind: "cash_box", id: "cash", currency: "VES" }, direction: "credit", money, operationalDate: "2026-01-01", valueDate: "2026-01-01", concept: "opening", expectedAccountVersion: 1, movementType: "cash_income" };

test("command validates before invoking durable persistence", async () => {
  let invoked = false;
  const repository: TreasuryCommandRepository = { async execute() { invoked = true; return { commandId: "receipt", replayed: false, affectedIds: ["entry"], versions: { cash: 2 } }; } };
  const result = await new ExecuteTreasuryCommand(repository).execute(command);
  assert.equal(invoked, true); assert.equal(result.commandId, "receipt");
});
test("command refuses a nonpositive amount before persistence", async () => {
  const repository: TreasuryCommandRepository = { async execute() { throw new Error("must not run"); } };
  await assert.rejects(new ExecuteTreasuryCommand(repository).execute({ ...command, money: { ...money, amount: exactDecimal("0") } }), TreasuryFailure);
});
test("command refuses malformed scope and overlapping checkbook range inputs before persistence", async () => {
  const repository: TreasuryCommandRepository = { async execute() { throw new Error("must not run"); } };
  const executor = new ExecuteTreasuryCommand(repository);
  await assert.rejects(executor.execute({ ...command, tenantId: "" }), TreasuryFailure);
  await assert.rejects(executor.execute({ ...scope, idempotencyKey: "key", correlationId: "correlation", kind: "create_checkbook", checkbookId: "book", bankAccountId: "bank", firstNumber: 10, lastNumber: 9 }), TreasuryFailure);
  await assert.rejects(executor.execute({ ...scope, idempotencyKey: "key", correlationId: "correlation", kind: "create_checkbook", checkbookId: "unsafe-book", bankAccountId: "bank", firstNumber: Number.MAX_SAFE_INTEGER - 1, lastNumber: Number.MAX_SAFE_INTEGER }), TreasuryFailure);
});

test("untrusted command payloads fail with typed validation errors before persistence", async () => {
  const executor = new ExecuteTreasuryCommand({ async execute() { throw new Error("must not run"); } });
  await assert.rejects(executor.execute(null as unknown as TreasuryWriteCommand), (error: unknown) => error instanceof TreasuryFailure && error.code === "INVALID");
  await assert.rejects(executor.execute({ ...command, kind: "future_command" } as unknown as TreasuryWriteCommand), (error: unknown) => error instanceof TreasuryFailure && error.code === "INVALID");
  await assert.rejects(executor.execute({ ...command, money: null } as unknown as TreasuryWriteCommand), (error: unknown) => error instanceof TreasuryFailure && error.code === "INVALID");
  await assert.rejects(executor.execute({ ...command, direction: "sideways" } as unknown as TreasuryWriteCommand), (error: unknown) => error instanceof TreasuryFailure && error.code === "INVALID");
  const statement = { ...scope, idempotencyKey: "bad-lines", correlationId: "bad-lines-correlation", kind: "import_bank_statement", statementId: "statement", bankAccountId: "bank", periodStart: "2026-01-01", periodEnd: "2026-01-31", externalReference: "external", lines: {} };
  await assert.rejects(executor.execute(statement as unknown as TreasuryWriteCommand), (error: unknown) => error instanceof TreasuryFailure && error.code === "INVALID");
});

test("tax policies accept only unique movement subjects assessed by the tax trigger", async () => {
  const executor = new ExecuteTreasuryCommand({ async execute() { throw new Error("must not run"); } });
  const policy: TreasuryWriteCommand = { ...scope, idempotencyKey: "policy", correlationId: "policy-correlation", kind: "configure_bank_debit_tax_policy", policyId: "idb", expectedVersion: 0, effectiveFrom: "2026-01-01", ratePercent: "0.5", baseCurrency: "VES", rounding: "half_up", legalBasis: "approved rule", approvalReference: "APPROVED-1", subjectTypes: ["bank_debit"] };
  await assert.rejects(executor.execute({ ...policy, subjectTypes: ["cash_expense"] }), (error: unknown) => error instanceof TreasuryFailure && error.code === "INVALID");
  await assert.rejects(executor.execute({ ...policy, subjectTypes: ["bank_debit", "bank_debit"] }), (error: unknown) => error instanceof TreasuryFailure && error.code === "INVALID");
  await assert.rejects(executor.execute({ ...policy, subjectTypes: ["bank_debit", "check_issue"] }), (error: unknown) => error instanceof TreasuryFailure && error.code === "UNAVAILABLE");
});

test("bank-statement import requires unique external rows inside its dated native-currency period", async () => {
  const executor = new ExecuteTreasuryCommand({ async execute() { throw new Error("must not run"); } });
  const line = { lineId: "line-1", externalId: "bank-row-1", valueDate: "2026-01-10", direction: "credit" as const, money, reference: "REF-1", description: "Deposit" };
  const statement: TreasuryWriteCommand = { ...scope, idempotencyKey: "statement", correlationId: "statement-correlation", kind: "import_bank_statement", statementId: "statement-1", bankAccountId: "bank-account", periodStart: "2026-01-01", periodEnd: "2026-01-31", externalReference: "EXT-1", lines: [line] };
  await assert.rejects(executor.execute({ ...statement, lines: [{ ...line, valueDate: "2026-02-01" }] }), TreasuryFailure);
  await assert.rejects(executor.execute({ ...statement, lines: [line, { ...line, lineId: "line-2" }] }), TreasuryFailure);
});

test("TES-022 deposits require one funding source and allocations equal to the deposit total", async () => {
  const executor = new ExecuteTreasuryCommand({ async execute() { throw new Error("must not run"); } });
  const baseDeposit = { ...scope, idempotencyKey: "deposit", correlationId: "deposit-correlation", kind: "create_deposit" as const, depositId: "deposit-1", destinationBankAccountId: "bank-account", expectedDestinationVersion: 1, money, depositDate: "2026-01-01", reference: "deposit-ref" };
  const allocations = [{ collectionId: "collection-a", amount: { ...money, amount: exactDecimal("0.40") } }, { collectionId: "collection-b", amount: { ...money, amount: exactDecimal("0.60") } }] as const;
  await assert.rejects(executor.execute(baseDeposit), TreasuryFailure);
  await assert.rejects(executor.execute({ ...baseDeposit, collectionAllocations: [allocations[0]] }), TreasuryFailure);
  await assert.rejects(executor.execute({ ...baseDeposit, collectionAllocations: [allocations[0], { ...allocations[1], collectionId: "collection-a" }] }), TreasuryFailure);
  await assert.rejects(executor.execute({ ...baseDeposit, sourceAccount: { kind: "cash_box", id: "cash", currency: "VES" }, expectedSourceVersion: 1, collectionAllocations: allocations }), TreasuryFailure);
  await assert.rejects(executor.execute({ ...baseDeposit, collectionAllocations: allocations, money: { ...money, amount: exactDecimal("1.01") } }), TreasuryFailure);
});
