import assert from "node:assert/strict";
import test from "node:test";
import { TreasuryFailure, validateTreasuryQuery, type TreasuryQuery } from "../../src";

const scope = { tenantId: "tenant", organizationId: "organization", companyId: "company", actorId: "actor", page: 1, pageSize: 20 };

test("bank and beneficiary master queries validate bounded filters", () => {
  const banks: TreasuryQuery = { ...scope, kind: "list_banks", search: "Central" };
  const beneficiaries: TreasuryQuery = { ...scope, kind: "list_beneficiaries", status: "inactive", search: "J-123" };
  assert.equal(validateTreasuryQuery(banks), banks);
  assert.equal(validateTreasuryQuery(beneficiaries), beneficiaries);
  assert.throws(() => validateTreasuryQuery({ ...banks, search: "   " }), TreasuryFailure);
  assert.throws(() => validateTreasuryQuery({ ...beneficiaries, status: "deleted" as "inactive" }), TreasuryFailure);
  assert.throws(() => validateTreasuryQuery({ ...banks, search: "x".repeat(121) }), TreasuryFailure);
  assert.throws(() => validateTreasuryQuery({ ...banks, search: 42 } as unknown as TreasuryQuery), (error: unknown) => error instanceof TreasuryFailure && error.code === "INVALID");
});

test("TES-016 check-number filters are positive safe integer folios", () => {
  const query: TreasuryQuery = { ...scope, kind: "list_checks", number: "12345" };
  assert.equal(validateTreasuryQuery(query), query);
  assert.throws(() => validateTreasuryQuery({ ...query, number: "0" }), TreasuryFailure);
  assert.throws(() => validateTreasuryQuery({ ...query, number: "01" }), TreasuryFailure);
  assert.throws(() => validateTreasuryQuery({ ...query, number: "9007199254740992" }), TreasuryFailure);
});

test("TES-037 responsible-actor filters require a nonblank actor identifier", () => {
  const query: TreasuryQuery = { ...scope, kind: "list_ledger_entries", accountKind: "cash_box", accountId: "cash", from: "2026-01-01", to: "2026-01-31", responsibleActorId: "actor-1" };
  assert.equal(validateTreasuryQuery(query), query);
  assert.throws(() => validateTreasuryQuery({ ...query, responsibleActorId: " " }), TreasuryFailure);
});

test("query validation rejects malformed transport values with typed failures", () => {
  assert.throws(() => validateTreasuryQuery(null as unknown as TreasuryQuery), (error: unknown) => error instanceof TreasuryFailure && error.code === "INVALID");
  assert.throws(() => validateTreasuryQuery({ ...scope, kind: "future_query" } as unknown as TreasuryQuery), (error: unknown) => error instanceof TreasuryFailure && error.code === "INVALID");
  assert.throws(() => validateTreasuryQuery({ ...scope, kind: "list_checks", number: {} } as unknown as TreasuryQuery), (error: unknown) => error instanceof TreasuryFailure && error.code === "INVALID");
  assert.throws(() => validateTreasuryQuery({ ...scope, kind: "get_balance", accountKind: "wallet", accountId: "cash", asOf: "2026-01-01" } as unknown as TreasuryQuery), (error: unknown) => error instanceof TreasuryFailure && error.code === "INVALID");
  assert.throws(() => validateTreasuryQuery({ ...scope, kind: "treasury_report", report: "all_data", from: "2026-01-01", to: "2026-01-31" } as unknown as TreasuryQuery), (error: unknown) => error instanceof TreasuryFailure && error.code === "INVALID");
});
