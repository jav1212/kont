import assert from "node:assert/strict";
import test from "node:test";
import { exactDecimal } from "@kontave/monetary/domain";
import {
  SalesFailure,
  allocateFinancierDeposits,
  financedSaleJournalEntries,
  salesDate,
  type FinancedSaleTerms,
  type FinancierDeposit,
} from "../../src/domain";

const d = exactDecimal;

function sale(reference: string, amount: string, rate: string): FinancedSaleTerms {
  return { reference, saleDate: salesDate(reference), saleAmountVes: d(amount), upfrontPercent: d("60"), saleVesPerUsd: d(rate) };
}

function deposit(reference: string, date: string, amount: string, rate: string, commission = "0"): FinancierDeposit {
  return { reference, depositDate: salesDate(date), amountVes: d(amount), vesPerUsd: d(rate), commissionPercent: d(commission) };
}

test("settles the reference sale with a deposit at the BCV rate of its date", () => {
  // 2982.10 Bs financed at 179.43 = 16.61985175 USD; at 240.22296107 that is exactly 3992.47 Bs.
  const result = allocateFinancierDeposits([sale("2025-10-01", "7455.25", "179.43")], [deposit("dep-1", "2025-11-20", "3992.47", "240.22296107")]);
  const settlement = result.sales[0]!.settlement;
  assert.equal(settlement.exchangeDifference, "1010.37");
  assert.equal(settlement.outstandingCarriedVes, "0");
  assert.deepEqual(result.sales[0]!.depositReferences, ["dep-1"]);
  assert.deepEqual(result.unapplied, []);
});

test("applies deposits first-in first-out and splits one deposit across sales", () => {
  // Financed: a = 400 Bs / 100 = 4 USD, b = 400 Bs / 200 = 2 USD. Deposit of 5 USD at 250.
  const result = allocateFinancierDeposits(
    [sale("2025-10-02", "1000", "200"), sale("2025-10-01", "1000", "100")],
    [deposit("dep-1", "2025-10-20", "1250", "250")],
  );
  const [b, a] = result.sales;
  assert.equal(a!.settlement.collections[0]?.receivedVes, "1000");
  assert.equal(a!.settlement.exchangeDifference, "600");
  assert.equal(a!.settlement.outstandingUsd, "0");
  assert.equal(b!.settlement.collections[0]?.receivedVes, "250");
  assert.equal(b!.settlement.collections[0]?.appliedUsd, "1");
  assert.equal(b!.settlement.outstandingUsd, "1");
  assert.equal(b!.settlement.outstandingCarriedVes, "200");
});

test("never applies a deposit to sales made after it and reports the unapplied remainder", () => {
  const result = allocateFinancierDeposits([sale("2025-10-10", "1000", "100")], [deposit("dep-1", "2025-10-05", "500", "100")]);
  assert.equal(result.sales[0]!.settlement.collections.length, 0);
  assert.equal(result.unapplied[0]?.unappliedUsd, "5");
  assert.equal(result.unapplied[0]?.unappliedVes, "500");
});

test("grosses up the commission and books it separately from the exchange difference", () => {
  // 4 USD at 250 = 1000 Bs gross; 2% commission leaves 980 Bs in the bank.
  const result = allocateFinancierDeposits([sale("2025-10-01", "1000", "100")], [deposit("dep-1", "2025-10-15", "980", "250", "2")]);
  const settlement = result.sales[0]!.settlement;
  assert.equal(settlement.collections[0]?.receivedVes, "1000");
  assert.equal(settlement.collections[0]?.commissionVes, "20");
  assert.equal(settlement.exchangeDifference, "600");
  const collectionEntry = financedSaleJournalEntries(settlement)[1]!;
  assert.deepEqual(collectionEntry.lines.map((line) => [line.role, line.debit, line.credit]), [
    ["bank", "980", "0"],
    ["financier_commission", "20", "0"],
    ["financier_receivable", "0", "400"],
    ["exchange_gain", "0", "600"],
  ]);
});

test("keeps shares adding up to the deposit when rounding spreads it over many sales", () => {
  const sales = ["2025-10-01", "2025-10-02", "2025-10-03"].map((date) => sale(date, "333.33", "179.4308"));
  // Each sale finances 133.33 Bs (≈0.7431 USD); 300 Bs at 199.1072 (≈1.5067 USD) pays two and part of the third.
  const result = allocateFinancierDeposits(sales, [deposit("dep-1", "2025-10-20", "300", "199.1072")]);
  const total = result.sales.flatMap((item) => item.settlement.collections).reduce((sum, collection) => sum + Number(collection.receivedVes), 0);
  assert.equal(total.toFixed(2), "300.00");
  assert.deepEqual(result.sales.map((item) => item.settlement.outstandingCarriedVes === "0"), [true, true, false]);
  assert.equal(result.unapplied.length, 0);
});

test("rejects duplicate references and invalid deposits", () => {
  assert.throws(() => allocateFinancierDeposits([sale("2025-10-01", "1", "1"), sale("2025-10-01", "2", "1")], []), (error) => error instanceof SalesFailure && error.code === "SALES_FINANCED_SALE_INVALID");
  assert.throws(() => allocateFinancierDeposits([], [deposit("x", "2025-10-01", "0", "1")]), (error) => error instanceof SalesFailure && error.code === "SALES_FINANCED_COLLECTION_INVALID");
  assert.throws(() => allocateFinancierDeposits([], [deposit("x", "2025-10-01", "1", "1", "100")]), (error) => error instanceof SalesFailure && error.code === "SALES_FINANCED_COLLECTION_INVALID");
});
