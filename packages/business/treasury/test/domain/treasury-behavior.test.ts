import assert from "node:assert/strict";
import test from "node:test";
import { exactDecimal } from "@kontave/monetary/domain";
import { calculateExchangeDifference, deliverCheck, reconcileDeterministically, undoCheckDelivery, validateDepositAllocations, type TreasuryMoney } from "../../src";

const money = (amount: string, currency = "VES", operational = amount): TreasuryMoney => ({ amount: exactDecimal(amount), currency, operationalValue: { baseCurrency: "VES", amount: exactDecimal(operational), rate: exactDecimal("1"), source: "rate", asOf: "2026-01-01", policyVersion: "1", rounding: "half_up", minorUnit: 2 } });

test("check delivery never creates a second monetary lifecycle and cannot be undone after a second undo", () => {
  const issued = { id: "check", status: "issued" as const, version: 1, deliveries: [] };
  const delivered = deliverCheck(issued, { id: "delivery", recipientName: "Ana", deliveredAt: "2026-01-02T00:00:00Z" });
  const undone = undoCheckDelivery(delivered, "delivery", "2026-01-03T00:00:00Z", "returned");
  assert.equal(undone.status, "delivery_undone"); assert.equal(undone.deliveries.length, 1);
  assert.throws(() => undoCheckDelivery(undone, "delivery", "2026-01-04T00:00:00Z", "again"));
});
test("deposit allocations must be unique and exact", () => {
  assert.throws(() => validateDepositAllocations(money("10"), [{ collectionId: "sale-1", money: money("5") }, { collectionId: "sale-1", money: money("5") }]), /collection/i);
  assert.throws(() => validateDepositAllocations(money("10"), [{ collectionId: "sale-1", money: money("9") }]), /exactly/i);
  assert.equal(validateDepositAllocations(money("10"), [{ collectionId: "sale-1", money: money("4") }, { collectionId: "sale-2", money: money("6") }]).length, 2);
});
test("automatic reconciliation leaves equal candidates pending", () => {
  const statement = { ledgerEntryId: "statement", direction: "credit" as const, amount: exactDecimal("10"), currency: "VES", valueDate: "2026-01-10", reference: "REF" };
  const decision = reconcileDeterministically(statement, [{ ...statement, ledgerEntryId: "ledger-1" }, { ...statement, ledgerEntryId: "ledger-2" }], { dateWindowDays: 2, amountTolerance: exactDecimal("0"), referenceWeight: 10, dateWeight: 1 });
  assert.deepEqual(decision, { kind: "pending", reason: "ambiguous" });
});
test("automatic reconciliation applies amount tolerance and direction before scoring", () => {
  const statement = { ledgerEntryId: "statement", direction: "credit" as const, amount: exactDecimal("10.00"), currency: "VES", valueDate: "2026-01-10", reference: "REF" };
  const result = reconcileDeterministically(statement, [
    { ...statement, ledgerEntryId: "within-tolerance", amount: exactDecimal("10.50"), reference: "OTHER" },
    { ...statement, ledgerEntryId: "wrong-direction", direction: "debit", amount: exactDecimal("10.00") },
    { ...statement, ledgerEntryId: "over-tolerance", amount: exactDecimal("10.51") },
  ], { dateWindowDays: 2, amountTolerance: exactDecimal("0.50"), referenceWeight: 10, dateWeight: 1 });
  assert.deepEqual(result, { kind: "matched", ledgerEntryId: "within-tolerance", score: 3 });
});
test("exchange difference distinguishes realized and unrealized calculations without rewriting snapshot", () => {
  assert.deepEqual(calculateExchangeDifference("unrealized", money("10", "USD", "400"), money("10", "USD", "450")), { kind: "unrealized", amount: exactDecimal("50"), direction: "gain" });
  assert.deepEqual(calculateExchangeDifference("realized", money("10", "USD", "450"), money("10", "USD", "400")), { kind: "realized", amount: exactDecimal("-50"), direction: "loss" });
});
