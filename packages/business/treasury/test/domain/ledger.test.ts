import assert from "node:assert/strict";
import test from "node:test";
import { exactDecimal } from "@kontave/monetary/domain";
import { balanceFromEntries, TreasuryFailure, type TreasuryLedgerEntry } from "../../src";

const money = (amount: string) => ({ amount: exactDecimal(amount), currency: "VES", operationalValue: { baseCurrency: "VES" as const, amount: exactDecimal(amount), rate: exactDecimal("1"), source: "opening", asOf: "2026-01-01", policyVersion: "v1", rounding: "half_up", minorUnit: 2 } });
const entry = (id: string, direction: "credit" | "debit", amount: string): TreasuryLedgerEntry => ({ id, accountKind: "cash_box", accountId: "cash-1", direction, money: money(amount), operationalDate: "2026-01-01", valueDate: "2026-01-01", concept: "test", status: "posted", version: 1 });

test("ledger balance is exact and reversals remain visible", () => {
  assert.equal(balanceFromEntries([entry("income", "credit", "10.10"), entry("expense", "debit", "2.25")], "VES"), "7.85");
  const reversedOriginal = { ...entry("reversed-income", "credit", "10"), status: "reversed" as const };
  const compensatingDebit = entry("income-reversal", "debit", "10");
  assert.equal(balanceFromEntries([reversedOriginal, compensatingDebit], "VES"), "0");
});

test("ledger balance rejects a mixed native currency", () => {
  const usd = { ...entry("usd", "credit", "1"), money: { ...money("1"), currency: "USD" } };
  assert.throws(() => balanceFromEntries([entry("ves", "credit", "1"), usd], "VES"), TreasuryFailure);
});
