import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { currency, exactDecimal, moneyFromDecimal } from "@kontave/monetary/domain";
import { organizationId } from "@kontave/organizations/domain";
import { TaxationFailure, taxationDate } from "../../src/domain";
import { bankDebitTaxExclusion, bankDebitTaxPolicy, calculateBankDebitTax, type BankDebitTaxPolicy } from "../../src/domain/bank-debit-tax";

const VES = currency("VES", 2);
const scope = { organizationId: organizationId("org-a"), companyId: companyId("company-a") };
const operation = { id: "debit-1", scope, operationDate: taxationDate("2026-08-13"), debitAmount: moneyFromDecimal("10.01", VES) };

function policy(overrides: Partial<BankDebitTaxPolicy> = {}): BankDebitTaxPolicy {
  return bankDebitTaxPolicy({ id: "idb-v1", scope, version: "v1", effectiveFrom: taxationDate("2026-01-01"), effectiveTo: null, ratePercent: exactDecimal("0.75"), base: { kind: "full_debit_amount", currency: VES }, roundingMode: "half_up", legalBasis: "Configured company policy", approval: { approvalReference: "approval-1", approvedBy: "user-1", approvedAt: "2026-01-01T12:00:00.000Z", evidenceReference: "evidence-1" }, ...overrides });
}

test("selects only a policy effective for the debit date and stores its exact snapshot", () => {
  const result = calculateBankDebitTax({ policies: [policy({ id: "old", version: "old", effectiveTo: taxationDate("2026-06-30") }), policy()], operation, exclusion: null });
  assert.equal(result.taxAmount.minorAmount, 8n);
  assert.equal(result.snapshot.taxableBase.amount, "10.01");
  assert.equal(result.snapshot.taxAmount.amount, "0.08");
  assert.equal(result.snapshot.policyVersion, "v1");
});

test("uses configured rounding mode and never binary number arithmetic", () => {
  const result = calculateBankDebitTax({ policies: [policy({ ratePercent: exactDecimal("0.5"), roundingMode: "half_up" })], operation: { ...operation, debitAmount: moneyFromDecimal("1", VES) }, exclusion: null });
  assert.equal(result.taxAmount.minorAmount, 1n);
});

test("does not select a policy from another organization or company", () => {
  const foreignScope = { organizationId: organizationId("org-b"), companyId: companyId("company-b") };
  assert.throws(() => calculateBankDebitTax({ policies: [policy({ scope: foreignScope })], operation, exclusion: null }), failure("TAXATION_RULE_MISSING"));
});

test("permits a configured zero rate while retaining the policy snapshot", () => {
  const result = calculateBankDebitTax({ policies: [policy({ ratePercent: exactDecimal("0") })], operation, exclusion: null });
  assert.equal(result.taxAmount.minorAmount, 0n);
  assert.equal(result.snapshot.ratePercent, "0");
});

test("an explicitly approved exclusion produces an auditable zero tax snapshot", () => {
  const exclusion = bankDebitTaxExclusion({ operationId: operation.id, scope, policyId: "idb-v1", policyVersion: "v1", reason: "Documented exception", evidenceReference: "exception-file", approval: { approvalReference: "exception-approval", approvedBy: "user-2", approvedAt: "2026-08-13T12:00:00.000Z", evidenceReference: "approval-file" } });
  const result = calculateBankDebitTax({ policies: [policy()], operation, exclusion, exclusionAuthorizer: { authorize: ({ exclusion: value }) => value.approval.approvalReference === "exception-approval" } });
  assert.equal(result.excluded, true);
  assert.equal(result.taxAmount.minorAmount, 0n);
  assert.equal(result.snapshot.exclusion?.reason, "Documented exception");
});

test("fails closed when a policy is absent or an exclusion lacks an authorized decision", () => {
  assert.throws(() => calculateBankDebitTax({ policies: [], operation, exclusion: null }), failure("TAXATION_RULE_MISSING"));
  const exclusion = bankDebitTaxExclusion({ operationId: operation.id, scope, policyId: "idb-v1", policyVersion: "v1", reason: "Exception", evidenceReference: "file", approval: { approvalReference: "approval", approvedBy: "user", approvedAt: "2026-08-13T12:00:00.000Z", evidenceReference: "approval-file" } });
  assert.throws(() => calculateBankDebitTax({ policies: [policy()], operation, exclusion }), failure("TAXATION_ACCESS_DENIED"));
});

function failure(code: TaxationFailure["code"]): (error: unknown) => boolean { return (error): error is TaxationFailure => error instanceof TaxationFailure && error.code === code; }
