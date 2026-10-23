import assert from "node:assert/strict";
import test from "node:test";
import { PostgresTreasuryRepository } from "../../../src/adapters/postgres";
import { TreasuryFailure } from "../../../src/domain";

test("Postgres adapter maps an atomic command receipt", async () => {
  const repository = new PostgresTreasuryRepository({ async call(name) { assert.equal(name, "shared_treasury_execute_command"); return { commandId: "command", replayed: true, affectedIds: ["cash"], versions: { cash: 2 } }; } });
  const result = await repository.execute({ tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" }, { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a", idempotencyKey: "i", correlationId: "x", kind: "create_bank", bankId: "b", code: "bank", name: "Bank", countryCode: "VE" });
  assert.equal(result.replayed, true);
});
test("Postgres adapter normalizes and validates a typed cash-box projection", async () => {
  const repository = new PostgresTreasuryRepository({ async call() { return { items: [{ id: "cash", code: "MAIN", name: "Main", currency: "VES", status: "active", version: 1 }], page: 1, pageSize: 10, total: 1, asOf: "2026-01-01T00:00:00Z" }; } });
  const result = await repository.query({ tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" }, { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a", kind: "list_cash_boxes", page: 1, pageSize: 10 });
  assert.deepEqual(result.items[0], { rowKind: "cash_box", id: "cash", code: "MAIN", name: "Main", currency: "VES", status: "active", version: 1 });
});
test("Postgres adapter preserves the responsible actor on ledger movements", async () => {
  const scope = { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" };
  const repository = new PostgresTreasuryRepository({ async call() { return { items: [{ id: "entry", accountId: "cash", accountKind: "cash_box", direction: "credit", amount: "10.00", currency: "VES", movementType: "cash_income", concept: "Collection", sourceType: "receivable_payment", sourceId: "payment-1", sourceLineId: "line-1", status: "posted", operationalDate: "2026-02-01", valueDate: "2026-02-01", responsibleActorId: "cashier-1", version: 2 }], page: 1, pageSize: 10, total: 1, asOf: "2026-02-01T12:00:00Z" }; } });
  const page = await repository.query(scope, { ...scope, kind: "list_ledger_entries", accountKind: "cash_box", accountId: "cash", from: "2026-02-01", to: "2026-02-28", responsibleActorId: "cashier-1", page: 1, pageSize: 10 });
  assert.deepEqual(page.items[0], { rowKind: "ledger_entry", id: "entry", accountId: "cash", accountKind: "cash_box", direction: "credit", amount: "10.00", currency: "VES", movementType: "cash_income", concept: "Collection", sourceType: "receivable_payment", sourceId: "payment-1", sourceLineId: "line-1", status: "posted", operationalDate: "2026-02-01", valueDate: "2026-02-01", responsibleActorId: "cashier-1", version: 2 });
});
test("Postgres adapter reads bank and beneficiary masters with masked account data", async () => {
  const scope = { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" };
  const banks = new PostgresTreasuryRepository({ async call() { return { items: [{ id: "bank", code: "B-1", name: "Banco Uno", country_code: "VE", version: 1 }], page: 1, pageSize: 10, total: 1, asOf: "2026-10-01T00:00:00Z" }; } });
  const bankPage = await banks.query(scope, { ...scope, kind: "list_banks", page: 1, pageSize: 10 });
  assert.deepEqual(bankPage.items[0], { rowKind: "bank", id: "bank", code: "B-1", name: "Banco Uno", countryCode: "VE", version: 1 });
  const beneficiaries = new PostgresTreasuryRepository({ async call() { return { items: [{ id: "beneficiary", legal_name: "Example Payee", tax_identifier: "J-1", status: "active", version: 2, bank_details: [{ id: "detail", bank_id: "bank", currency: "VES", account_number_masked: "****1234", account_holder: "Example Payee" }] }], page: 1, pageSize: 10, total: 1, asOf: "2026-10-01T00:00:00Z" }; } });
  const beneficiaryPage = await beneficiaries.query(scope, { ...scope, kind: "list_beneficiaries", status: "active", search: "Example", page: 1, pageSize: 10 });
  assert.deepEqual(beneficiaryPage.items[0], { rowKind: "beneficiary", id: "beneficiary", legalName: "Example Payee", taxIdentifier: "J-1", status: "active", version: 2, bankDetails: [{ id: "detail", bankId: "bank", currency: "VES", accountNumberMasked: "****1234", accountHolder: "Example Payee" }] });
});
test("Postgres adapter rejects malformed database output", async () => {
  const repository = new PostgresTreasuryRepository({ async call() { return null; } });
  await assert.rejects(repository.query({ tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" }, { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a", kind: "list_cash_boxes", page: 1, pageSize: 10 }), TreasuryFailure);
});
test("Postgres adapter preserves stable Treasury SQL failure classifications", async () => {
  const repository = new PostgresTreasuryRepository({ async call() { throw new Error("TREASURY_INSUFFICIENT_FUNDS"); } });
  await assert.rejects(repository.query({ tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" }, { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a", kind: "list_cash_boxes", page: 1, pageSize: 10 }), (error: unknown) => error instanceof TreasuryFailure && error.code === "INSUFFICIENT_FUNDS");
});

test("Postgres adapter maps read authorization failures without exposing database messages", async () => {
  const scope = { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" };
  const denied = new PostgresTreasuryRepository({ async call() { throw { message: "ORGANIZATIONAL_USER_ACCESS_DENIED", code: "P0001" }; } });
  await assert.rejects(denied.query(scope, { ...scope, kind: "list_cash_boxes", page: 1, pageSize: 10 }), (error: unknown) => error instanceof TreasuryFailure && error.code === "FORBIDDEN" && error.message === "No tienes permiso para consultar Tesorería en esta empresa.");
  const invalidCompany = new PostgresTreasuryRepository({ async call() { throw new Error("ORGANIZATIONAL_USER_COMPANY_INVALID"); } });
  await assert.rejects(invalidCompany.query(scope, { ...scope, kind: "list_cash_boxes", page: 1, pageSize: 10 }), (error: unknown) => error instanceof TreasuryFailure && error.code === "NOT_FOUND" && error.message === "La empresa no pertenece a la organización seleccionada.");
});

test("Postgres adapter retains unknown PostgREST failures as unavailable causes", async () => {
  const cause = { message: "cannot execute SELECT FOR SHARE in a read-only transaction", code: "25006" };
  const repository = new PostgresTreasuryRepository({ async call() { throw cause; } });
  await assert.rejects(repository.query({ tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" }, { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a", kind: "list_cash_boxes", page: 1, pageSize: 10 }), (error: unknown) => error instanceof TreasuryFailure && error.code === "UNAVAILABLE" && error.message === "Tesorería no está disponible en este momento." && error.cause === cause);
});

test("Postgres adapter decodes balance aggregates instead of treating them as ledger entries", async () => {
  const repository = new PostgresTreasuryRepository({ async call() { return { items: [{ accountId: "account", accountKind: "bank_account", asOf: "2026-01-31", currency: "VES", balance: "12.34000000" }], page: 1, pageSize: 10, total: 1, asOf: "2026-02-01T00:00:00Z" }; } });
  const result = await repository.query({ tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" }, { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a", kind: "get_balance", accountKind: "bank_account", accountId: "account", asOf: "2026-01-31", page: 1, pageSize: 10 });
  assert.deepEqual(result.items[0], { rowKind: "balance", accountId: "account", accountKind: "bank_account", currency: "VES", balance: "12.34000000" });
});

test("Postgres adapter decodes numeric version strings and SQL snake-case projections", async () => {
  const repository = new PostgresTreasuryRepository({ async call() { return { items: [{ id: "account", bank_id: "bank", currency: "USD", holder_name: "Holder", account_number_masked: "***1234", status: "active", version: "2" }], page: 1, pageSize: 10, total: 1, asOf: "2026-02-01T00:00:00Z" }; } });
  const result = await repository.query({ tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" }, { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a", kind: "list_bank_accounts", page: 1, pageSize: 10 });
  assert.deepEqual(result.items[0], { rowKind: "bank_account", id: "account", bankId: "bank", currency: "USD", holderName: "Holder", accountNumberMasked: "***1234", status: "active", version: 2 });
});

test("Postgres adapter preserves delivery event identity and does not decode events as checks", async () => {
  const repository = new PostgresTreasuryRepository({ async call() { return { items: [{ id: "event", check_id: "check", event_type: "delivered", recipient_name: "Name", occurred_at: "2026-02-01T12:00:00Z", reason: null, evidence_reference: "receipt-1" }], page: 1, pageSize: 10, total: 1, asOf: "2026-02-01T12:00:00Z" }; } });
  const result = await repository.query({ tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" }, { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a", kind: "list_check_deliveries", page: 1, pageSize: 10 });
  assert.deepEqual(result.items[0], { rowKind: "check_delivery", id: "event", checkId: "check", eventType: "delivered", recipientName: "Name", occurredAt: "2026-02-01T12:00:00Z", reason: null, evidenceReference: "receipt-1" });
});

test("Postgres adapter decodes checkbook folio and optimistic version", async () => {
  const scope = { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" };
  const repository = new PostgresTreasuryRepository({ async call() { return { items: [{ id: "book", bank_account_id: "account", first_number: "1", last_number: "25", next_number: "2", status: "active", version: "2" }], page: 1, pageSize: 10, total: 1, asOf: "2026-10-01T00:00:00Z" }; } });
  const page = await repository.query(scope, { ...scope, kind: "list_checkbooks", bankAccountId: "account", status: "active", page: 1, pageSize: 10 });
  assert.deepEqual(page.items[0], { rowKind: "checkbook", id: "book", bankAccountId: "account", firstNumber: 1, lastNumber: 25, nextNumber: 2, status: "active", version: 2 });
});

test("Postgres adapter decodes reconciliation links and report scalar rows", async () => {
  const scope = { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" };
  const reconciliation = new PostgresTreasuryRepository({ async call() { return { items: [{ id: "match", bank_account_id: "bank", state: "reconciled", statement_line_id: "line", ledger_entry_id: "entry", match_type: "automatic", rule_version: "2", reason: "automatic match", created_at: "2026-02-01T00:00:00Z", created_by: "actor", version: 1 }], page: 1, pageSize: 10, total: 1, asOf: "2026-02-01T12:00:00Z" }; } });
  const matched = await reconciliation.query(scope, { ...scope, kind: "list_reconciliation_items", bankAccountId: "bank", state: "reconciled", page: 1, pageSize: 10 });
  assert.deepEqual(matched.items[0], { rowKind: "reconciliation", id: "match", bankAccountId: "bank", state: "reconciled", statementLineId: "line", ledgerEntryId: "entry", matchType: "automatic", ruleVersion: 2, reason: "automatic match", createdAt: "2026-02-01T00:00:00Z", createdBy: "actor", version: 1 });
  const report = new PostgresTreasuryRepository({ async call() { return { items: [{ accountId: "bank", balance: "10.50000000", currency: "VES" }], page: 1, pageSize: 10, total: 1, asOf: "2026-02-01T12:00:00Z" }; } });
  const rows = await report.query(scope, { ...scope, kind: "treasury_report", report: "balances", from: "2026-02-01", to: "2026-02-01", page: 1, pageSize: 10 });
  assert.deepEqual(rows.items[0], { rowKind: "report", values: { accountId: "bank", balance: "10.50000000", currency: "VES" } });
});

test("Postgres adapter decodes active and undone reconciliation history", async () => {
  const scope = { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" };
  const repository = new PostgresTreasuryRepository({ async call() { return { items: [{ id: "match", bankAccountId: "bank", statementLineId: "line", ledgerEntryId: "entry", matchType: "manual", ruleSetId: null, ruleVersion: null, reason: "fixed source", status: "undone", createdAt: "2026-02-01T00:00:00Z", createdBy: "actor-a", version: "2", undoneAt: "2026-02-01T01:00:00Z", undoneBy: "actor-b", undoReason: "Wrong bank line" }], page: 1, pageSize: 10, total: 1, asOf: "2026-02-01T01:00:00Z" }; } });
  const page = await repository.query(scope, { ...scope, kind: "list_reconciliation_history", bankAccountId: "bank", page: 1, pageSize: 10 });
  assert.deepEqual(page.items[0], { rowKind: "reconciliation_history", id: "match", bankAccountId: "bank", statementLineId: "line", ledgerEntryId: "entry", matchType: "manual", ruleSetId: null, ruleVersion: null, reason: "fixed source", status: "undone", createdAt: "2026-02-01T00:00:00Z", createdBy: "actor-a", version: 2, undoneAt: "2026-02-01T01:00:00Z", undoneBy: "actor-b", undoReason: "Wrong bank line" });
});

test("Postgres adapter decodes pending statement and ledger reconciliation DTOs", async () => {
  const repository = new PostgresTreasuryRepository({ async call() { return { items: [{ itemKind: "statement_line", id: "line", bankAccountId: "bank", amount: "9.10", currency: "VES", direction: "credit", version: 1, valueDate: "2026-01-10", reference: "REF", ageDays: 2, reason: "unmatched" }, { itemKind: "ledger_entry", id: "entry", bankAccountId: "bank", amount: "9.10", currency: "VES", direction: "credit", version: 1, valueDate: "2026-01-10", reference: "DEP", ageDays: 2, reason: "unmatched" }], page: 1, pageSize: 10, total: 2, asOf: "2026-01-12T00:00:00Z" }; } });
  const scope = { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" };
  const page = await repository.query(scope, { ...scope, kind: "list_reconciliation_items", bankAccountId: "bank", state: "statement_pending", page: 1, pageSize: 10 });
  assert.deepEqual(page.items, [
    { rowKind: "reconciliation_pending", state: "statement_pending", itemKind: "statement_line", id: "line", bankAccountId: "bank", amount: "9.10", currency: "VES", direction: "credit", valueDate: "2026-01-10", reference: "REF", ageDays: 2, reason: "unmatched", version: 1 },
    { rowKind: "reconciliation_pending", state: "ledger_pending", itemKind: "ledger_entry", id: "entry", bankAccountId: "bank", amount: "9.10", currency: "VES", direction: "credit", valueDate: "2026-01-10", reference: "DEP", ageDays: 2, reason: "unmatched", version: 1 },
  ]);
});

test("Postgres adapter decodes the immutable automatic reconciliation preview", async () => {
  const scope = { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" };
  const repository = new PostgresTreasuryRepository({ async call() { return { items: [{ rowKind: "reconciliation_preview", id: "preview-1", bankAccountId: "bank", ruleSetId: "rules", ruleVersion: "2", asOf: "2026-09-30", results: [{ statementLineId: "line", state: "matched", ledgerEntryId: "entry", score: 2.5 }], createdAt: "2026-10-01T00:00:00Z" }], page: 1, pageSize: 10, total: 1, asOf: "2026-10-01T00:00:00Z" }; } });
  const page = await repository.query(scope, { ...scope, kind: "get_reconciliation_preview", previewId: "preview-1", page: 1, pageSize: 10 });
  assert.deepEqual(page.items[0], { rowKind: "reconciliation_preview", id: "preview-1", bankAccountId: "bank", ruleSetId: "rules", ruleVersion: 2, asOf: "2026-09-30", results: [{ statementLineId: "line", state: "matched", ledgerEntryId: "entry", score: 2.5 }], createdAt: "2026-10-01T00:00:00Z" });
});

test("Postgres adapter rejects malformed stored reconciliation preview outcomes", async () => {
  const repository = new PostgresTreasuryRepository({ async call() { return { items: [{ id: "preview-1", bankAccountId: "bank", ruleSetId: "rules", ruleVersion: 1, asOf: "2026-09-30", results: [{ statementLineId: "line", state: "matched", ledgerEntryId: "entry", score: "not-a-number" }], createdAt: "2026-10-01T00:00:00Z" }], page: 1, pageSize: 10, total: 1, asOf: "2026-10-01T00:00:00Z" }; } });
  const scope = { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" };
  await assert.rejects(() => repository.query(scope, { ...scope, kind: "get_reconciliation_preview", previewId: "preview-1", page: 1, pageSize: 10 }));
});

test("Postgres adapter decodes an exchange valuation separately from native ledger rows", async () => {
  const scope = { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" };
  const repository = new PostgresTreasuryRepository({ async call() { return { items: [{ id: "fx-1", source_entry_id: "usd-credit", bank_account_id: "usd-account", difference_kind: "unrealized", valuation_date: "2026-09-30", native_amount: "10.00000000", currency: "USD", prior_ves_amount: "400.00000000", current_ves_amount: "420.00000000", difference_ves_amount: "20.00000000", prior_rate: "40.00000000", current_rate: "42.00000000", prior_policy_version: "fx-1", current_policy_version: "fx-2" }], page: 1, pageSize: 10, total: 1, asOf: "2026-10-01T00:00:00Z" }; } });
  const page = await repository.query(scope, { ...scope, kind: "list_exchange_differences", bankAccountId: "usd-account", from: "2026-09-01", to: "2026-09-30", differenceKind: "unrealized", page: 1, pageSize: 10 });
  assert.deepEqual(page.items[0], { rowKind: "exchange_difference", id: "fx-1", sourceEntryId: "usd-credit", bankAccountId: "usd-account", differenceKind: "unrealized", valuationDate: "2026-09-30", nativeAmount: "10.00000000", currency: "USD", priorVesAmount: "400.00000000", currentVesAmount: "420.00000000", differenceVesAmount: "20.00000000", priorRate: "40.00000000", currentRate: "42.00000000", priorPolicyVersion: "fx-1", currentPolicyVersion: "fx-2" });
});

test("Postgres adapter decodes approved bank-debit tax policy history", async () => {
  const scope = { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" };
  const repository = new PostgresTreasuryRepository({ async call() { return { items: [{ id: "idb", effectiveFrom: "2026-10-01", effectiveTo: null, ratePercent: "3.00000000", baseCurrency: "VES", rounding: "half_up", legalBasis: "Approved basis", approvalReference: "ACT-42", subjectTypes: ["bank_debit", "check_issue"], version: 2, active: true }], page: 1, pageSize: 10, total: 1, asOf: "2026-10-16T00:00:00Z" }; } });
  const page = await repository.query(scope, { ...scope, kind: "list_bank_debit_tax_policies", page: 1, pageSize: 10 });
  assert.deepEqual(page.items[0], { rowKind: "bank_debit_tax_policy", id: "idb", effectiveFrom: "2026-10-01", effectiveTo: null, ratePercent: "3.00000000", baseCurrency: "VES", rounding: "half_up", legalBasis: "Approved basis", approvalReference: "ACT-42", subjectTypes: ["bank_debit", "check_issue"], version: 2, active: true });
});

test("Postgres adapter preserves tax assessment exclusion evidence", async () => {
  const scope = { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" };
  const repository = new PostgresTreasuryRepository({ async call() { return { items: [{ id: "assessment", ledgerEntryId: "debit", bankAccountId: "account", movementType: "bank_debit", concept: "Fee", operationalDate: "2026-10-10", entryVersion: 3, policyId: "idb", policyVersion: 2, ratePercent: "3.00", taxableAmount: "100.00", taxAmount: "3.00", currency: "VES", exclusionId: "excluded", exclusionReason: "Non-taxable operation", evidenceReference: "DOC-1" }], page: 1, pageSize: 10, total: 1, asOf: "2026-10-16T00:00:00Z" }; } });
  const page = await repository.query(scope, { ...scope, kind: "list_bank_debit_tax_assessments", page: 1, pageSize: 10 });
  assert.deepEqual(page.items[0], { rowKind: "bank_debit_tax_assessment", id: "assessment", ledgerEntryId: "debit", bankAccountId: "account", movementType: "bank_debit", concept: "Fee", operationalDate: "2026-10-10", entryVersion: 3, policyId: "idb", policyVersion: 2, ratePercent: "3.00", taxableAmount: "100.00", taxAmount: "3.00", currency: "VES", exclusionId: "excluded", exclusionReason: "Non-taxable operation", evidenceReference: "DOC-1" });
});

test("Postgres adapter reads a payment execution through Treasury's scoped query", async () => {
  const scope = { tenantId: "t", organizationId: "o", companyId: "c", actorId: "a" };
  const repository = new PostgresTreasuryRepository({ async call(_name, args) {
    assert.equal((args.p_query as { kind: string }).kind, "get_payment_order_execution");
    return { items: [{ paymentId: "payment", paymentOrderId: "order", amount: "125.00", currency: "VES", occurredOn: "2026-10-16", ledgerEntryId: "ledger" }], page: 1, pageSize: 1, total: 1, asOf: "2026-10-16T00:00:00Z" };
  } });
  const page = await repository.query(scope, { ...scope, kind: "get_payment_order_execution", paymentOrderId: "order", page: 1, pageSize: 1 });
  assert.deepEqual(page.items[0], { rowKind: "payment_order_execution", paymentId: "payment", paymentOrderId: "order", amount: "125.00", currency: "VES", occurredOn: "2026-10-16", ledgerEntryId: "ledger" });
});
