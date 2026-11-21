import assert from "node:assert/strict";
import test from "node:test";
import { exactDecimal } from "@kontave/monetary/domain";
import {
  completedMonthEnds,
  financedSaleRevaluationJournalEntries,
  revalueFinancedSalesAtMonthEnds,
  salesDate,
  settleFinancedSale,
} from "../../src/domain";

const d = exactDecimal;
const describe = (kind: string, month: string) => `${kind} ${month}`;
// 2982.10 Bs financed at 179.43 = 16.61985175 USD, settled on 2025-11-20.
const settlement = settleFinancedSale({
  reference: "2025-10-01",
  saleDate: salesDate("2025-10-01"),
  saleAmountVes: d("7455.25"),
  upfrontPercent: d("60"),
  saleVesPerUsd: d("179.43"),
}, [{ collectedOn: salesDate("2025-11-20"), receivedVes: d("3992.47") }]);

test("revalues only the balance still open at each month end", () => {
  const revaluations = revalueFinancedSalesAtMonthEnds([settlement], [
    { month: "2025-11", date: salesDate("2025-11-30"), vesPerUsd: d("245") },
    { month: "2025-10", date: salesDate("2025-10-31"), vesPerUsd: d("220") },
  ]);
  assert.equal(revaluations.length, 1, "November has no open balance after the deposit");
  const [october] = revaluations;
  assert.equal(october?.outstandingUsd, "16.61985175");
  assert.equal(october?.carriedVes, "2982.1");
  assert.equal(october?.revaluedVes, "3656.37");
  assert.equal(october?.difference, "674.27");
  assert.equal(october?.direction, "gain");
});

test("books the month-end adjustment and reverses it on the first day of the next month", () => {
  const revaluations = revalueFinancedSalesAtMonthEnds([settlement], [{ month: "2025-10", date: salesDate("2025-10-31"), vesPerUsd: d("220") }]);
  const entries = financedSaleRevaluationJournalEntries(revaluations, salesDate("2025-11-01"), describe);
  assert.deepEqual(entries.map((entry) => [entry.key, entry.date, entry.lines.map((line) => [line.role, line.debit, line.credit])]), [
    ["revaluation:2025-10", "2025-10-31", [["financier_receivable", "674.27", "0"], ["exchange_gain", "0", "674.27"]]],
    ["revaluation_reversal:2025-10", "2025-11-01", [["financier_receivable", "0", "674.27"], ["exchange_gain", "674.27", "0"]]],
  ]);
  assert.equal(financedSaleRevaluationJournalEntries(revaluations, salesDate("2025-10-31"), describe).length, 1, "no reversal before the next month starts");
});

test("books a loss when the rate fell below the historical one", () => {
  const [revaluation] = revalueFinancedSalesAtMonthEnds([settlement], [{ month: "2025-10", date: salesDate("2025-10-31"), vesPerUsd: d("170") }]);
  assert.equal(revaluation?.direction, "loss");
  const [entry] = financedSaleRevaluationJournalEntries([revaluation!], salesDate("2025-10-31"), describe);
  assert.deepEqual(entry?.lines.map((line) => line.role), ["exchange_loss", "financier_receivable"]);
});

test("lists every completed month end up to the cut-off", () => {
  assert.deepEqual(completedMonthEnds(salesDate("2025-11-15"), salesDate("2026-02-28")).map((item) => item.date), ["2025-11-30", "2025-12-31", "2026-01-31", "2026-02-28"]);
  assert.deepEqual(completedMonthEnds(salesDate("2026-02-01"), salesDate("2026-02-27")), []);
});
