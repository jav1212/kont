import assert from "node:assert/strict";
import test from "node:test";
import { exactDecimal } from "@kontave/monetary/domain";
import {
  SalesFailure,
  financedSaleJournalEntries,
  salesDate,
  settleFinancedSale,
  summarizeFinancedSaleJournalByMonth,
  type FinancedSaleJournalEntry,
  type FinancedSaleTerms,
} from "../../src/domain";

const d = exactDecimal;

function terms(overrides: Partial<FinancedSaleTerms> = {}): FinancedSaleTerms {
  return {
    reference: "2025-10-01",
    saleDate: salesDate("2025-10-01"),
    saleAmountVes: d("7455.25"),
    upfrontPercent: d("60"),
    saleVesPerUsd: d("179.43"),
    ...overrides,
  };
}

function balanced(entry: FinancedSaleJournalEntry): void {
  const debit = entry.lines.reduce((total, line) => total + Number(line.debit), 0);
  const credit = entry.lines.reduce((total, line) => total + Number(line.credit), 0);
  assert.equal(debit.toFixed(2), credit.toFixed(2), `${entry.description} is unbalanced`);
}

test("reproduces the reference Cashea settlement of 2025-10-01", () => {
  const result = settleFinancedSale(terms(), [{ collectedOn: salesDate("2025-10-15"), receivedVes: d("3992.47") }]);
  assert.equal(result.upfrontVes, "4473.15");
  assert.equal(result.financedVes, "2982.1");
  assert.equal(result.saleAmountUsd, "41.54962938");
  assert.equal(result.financedUsd, "16.61985175");
  const [collection] = result.collections;
  assert.ok(collection);
  assert.equal(collection.carriedVes, "2982.1");
  assert.equal(collection.exchangeDifference, "1010.37");
  assert.equal(collection.direction, "gain");
  assert.equal(collection.settlesBalance, true);
  assert.equal(collection.impliedVesPerUsd, "240.22296107");
  assert.equal(result.outstandingCarriedVes, "0");
  assert.equal(result.exchangeDifference, "1010.37");
});

test("produces the two balanced entries of the reference example", () => {
  const entries = financedSaleJournalEntries(settleFinancedSale(terms(), [{ collectedOn: salesDate("2025-10-15"), receivedVes: d("3992.47") }]));
  assert.deepEqual(entries.map((entry) => entry.lines.map((line) => [line.role, line.debit, line.credit])), [
    [["bank", "4473.15", "0"], ["financier_receivable", "2982.1", "0"], ["sales", "0", "7455.25"]],
    [["bank", "3992.47", "0"], ["financier_receivable", "0", "2982.1"], ["exchange_gain", "0", "1010.37"]],
  ]);
  assert.deepEqual(entries.map((entry) => entry.key), ["sale:2025-10-01", "collection:2025-10-01:2025-10-15:1"]);
  entries.forEach(balanced);
});

test("records a loss when the financier settles at a lower rate", () => {
  const result = settleFinancedSale(terms(), [{ collectedOn: salesDate("2025-10-15"), receivedVes: d("2900") }]);
  assert.equal(result.exchangeDifference, "-82.1");
  assert.equal(result.collections[0]?.direction, "loss");
  const collectionEntry = financedSaleJournalEntries(result)[1];
  assert.ok(collectionEntry);
  assert.deepEqual(collectionEntry.lines.map((line) => line.role), ["bank", "exchange_loss", "financier_receivable"]);
  balanced(collectionEntry);
});

test("applies partial collections by their own rate and closes the remainder exactly", () => {
  const result = settleFinancedSale(terms(), [
    { collectedOn: salesDate("2025-10-20"), receivedVes: d("1200") },
    { collectedOn: salesDate("2025-10-10"), receivedVes: d("2000"), vesPerUsd: d("200") },
  ]);
  const [partial, final] = result.collections;
  assert.ok(partial && final);
  assert.equal(partial.collectedOn, "2025-10-10", "collections are applied in date order");
  assert.equal(partial.appliedUsd, "10");
  assert.equal(partial.carriedVes, "1794.3");
  assert.equal(partial.settlesBalance, false);
  assert.equal(final.carriedVes, "1187.8");
  assert.equal(result.outstandingCarriedVes, "0");
  assert.equal(result.exchangeDifference, "217.9");
});

test("leaves the balance outstanding without collections", () => {
  const result = settleFinancedSale(terms());
  assert.equal(result.collections.length, 0);
  assert.equal(result.outstandingCarriedVes, "2982.1");
  assert.equal(result.exchangeDifference, "0");
});

test("rejects invalid terms and collections", () => {
  assert.throws(() => settleFinancedSale(terms({ upfrontPercent: d("100") })), (error) => error instanceof SalesFailure && error.code === "SALES_FINANCED_SALE_INVALID");
  assert.throws(() => settleFinancedSale(terms({ saleAmountVes: d("0") })), (error) => error instanceof SalesFailure && error.code === "SALES_FINANCED_SALE_INVALID");
  const invalidCollection = (error: unknown) => error instanceof SalesFailure && error.code === "SALES_FINANCED_COLLECTION_INVALID";
  assert.throws(() => settleFinancedSale(terms(), [{ collectedOn: salesDate("2025-09-30"), receivedVes: d("10") }]), invalidCollection);
  assert.throws(() => settleFinancedSale(terms(), [
    { collectedOn: salesDate("2025-10-15"), receivedVes: d("3992.47") },
    { collectedOn: salesDate("2025-10-16"), receivedVes: d("1") },
  ]), invalidCollection);
  assert.throws(() => settleFinancedSale(terms(), [{ collectedOn: salesDate("2025-10-15"), receivedVes: d("5000"), vesPerUsd: d("200") }]), invalidCollection);
});

test("summarizes entries by month and kind with balanced netted lines", () => {
  const october = settleFinancedSale(terms(), [{ collectedOn: salesDate("2025-10-15"), receivedVes: d("3992.47") }]);
  const lateOctober = settleFinancedSale(terms({ reference: "2025-10-28", saleDate: salesDate("2025-10-28"), saleAmountVes: d("1000") }), [
    { collectedOn: salesDate("2025-11-11"), receivedVes: d("300") },
  ]);
  const summary = summarizeFinancedSaleJournalByMonth(
    [...financedSaleJournalEntries(october), ...financedSaleJournalEntries(lateOctober)],
    (kind, month) => `${kind} ${month}`,
  );
  assert.deepEqual(summary.map((entry) => [entry.description, entry.date]), [
    ["sale 2025-10", "2025-10-28"],
    ["collection 2025-10", "2025-10-15"],
    ["collection 2025-11", "2025-11-11"],
  ]);
  assert.deepEqual(summary[0]?.lines.map((line) => [line.role, line.debit, line.credit]), [
    ["bank", "5073.15", "0"],
    ["financier_receivable", "3382.1", "0"],
    ["sales", "0", "8455.25"],
  ]);
  assert.deepEqual(summary[2]?.lines.map((line) => line.role), ["bank", "exchange_loss", "financier_receivable"]);
  summary.forEach(balanced);
});
