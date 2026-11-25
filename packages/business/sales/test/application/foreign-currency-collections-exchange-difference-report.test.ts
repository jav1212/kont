import assert from "node:assert/strict";
import test from "node:test";
import { exactDecimal } from "@kontave/monetary/domain";
import {
  BuildForeignCurrencyCollectionsExchangeDifferenceReport,
  type UsdVesRateHistory,
  type UsdVesRatePoint,
} from "../../src/application";
import { SalesFailure, monthEndOf, salesDate, valueForeignCurrencyCollection } from "../../src/domain";

const d = exactDecimal;

function history(points: Record<string, string>, calls: Array<[string, string]> = []): UsdVesRateHistory {
  return {
    async ratesBetween(start, end) {
      calls.push([start, end]);
      return Object.entries(points).map(([date, rate]): UsdVesRatePoint => ({ effectiveDate: salesDate(date), vesPerUsd: d(rate) }));
    },
  };
}

test("values a day's dollars, rounded to cents, at the month-close rate", () => {
  // IGTF report row of 02/10/2025: one dollar booked at 181.3037.
  const valuation = valueForeignCurrencyCollection(
    { reference: "2025-10-02", collectedOn: salesDate("2025-10-02"), bookedVes: d("181.30"), vesPerUsd: d("181.3037") },
    salesDate("2025-10-31"),
    d("223.6459"),
  );
  assert.equal(valuation.collectedUsd, "1");
  assert.equal(valuation.closingVes, "223.65");
  assert.equal(valuation.exchangeDifference, "42.35");
  assert.equal(valuation.direction, "gain");
});

test("rejects a closing date before the collection and non-positive amounts", () => {
  const collection = { reference: "x", collectedOn: salesDate("2025-10-02"), bookedVes: d("100"), vesPerUsd: d("100") };
  assert.throws(() => valueForeignCurrencyCollection(collection, salesDate("2025-10-01"), d("100")), SalesFailure);
  assert.throws(() => valueForeignCurrencyCollection({ ...collection, bookedVes: d("0") }, salesDate("2025-10-31"), d("100")), SalesFailure);
});

test("finds the last calendar day of a month, leap years included", () => {
  assert.equal(monthEndOf(salesDate("2026-02-10")), "2026-02-28");
  assert.equal(monthEndOf(salesDate("2028-02-01")), "2028-02-29");
  assert.equal(monthEndOf(salesDate("2025-12-31")), "2025-12-31");
});

test("closes each month independently at the rate in effect on its last day", async () => {
  const calls: Array<[string, string]> = [];
  const rates = history({ "2025-10-01": "200", "2025-10-30": "220", "2025-11-03": "230", "2025-11-28": "250" }, calls);
  const report = await new BuildForeignCurrencyCollectionsExchangeDifferenceReport(rates).execute([
    { reference: "a", collectedOn: salesDate("2025-10-01"), bookedVes: d("2000"), igtfVes: d("60") },
    { reference: "b", collectedOn: salesDate("2025-11-03"), bookedVes: d("2300"), igtfVes: d("69") },
  ], salesDate("2025-12-15"));
  assert.deepEqual(calls, [["2025-09-21", "2025-11-30"]], "rates are fetched once up to the last month end");
  assert.deepEqual(report.months.map((month) => [month.month, month.collectedUsd, month.closingDate, month.closingVesPerUsd, month.gainVes, month.provisional]), [
    ["2025-10", "10", "2025-10-31", "220", "200", false],
    ["2025-11", "10", "2025-11-30", "250", "200", false],
  ]);
  assert.equal(report.totals.gainVes, "400");
  assert.equal(report.totals.igtfVes, "129");
  assert.equal(report.totals.collectedUsd, "20");
});

test("closes an unfinished month provisionally at the cut-off and reports losses and failures per row", async () => {
  const report = await new BuildForeignCurrencyCollectionsExchangeDifferenceReport(history({ "2025-10-01": "200", "2025-10-10": "190" })).execute([
    { reference: "a", collectedOn: salesDate("2025-10-01"), bookedVes: d("2000") },
    { reference: "b", collectedOn: salesDate("2025-10-02"), bookedVes: d("1000"), vesPerUsd: d("250") },
    { reference: "c", collectedOn: salesDate("2025-10-20"), bookedVes: d("500") },
  ], salesDate("2025-10-15"));
  const [first, override, late] = report.rows;
  assert.ok(first?.status === "calculated" && override?.status === "calculated");
  assert.equal(first.valuation.closingDate, "2025-10-15");
  assert.equal(first.valuation.exchangeDifference, "-100");
  assert.equal(override.rateSource, "override");
  assert.equal(override.valuation.collectedUsd, "4");
  assert.equal(late?.status, "failed");
  const [month] = report.months;
  assert.equal(month?.provisional, true);
  assert.equal(month?.days, 3);
  assert.equal(month?.lossVes, "340");
});

test("wraps rate source failures as an unavailable repository", async () => {
  const failing: UsdVesRateHistory = { async ratesBetween() { throw new Error("down"); } };
  await assert.rejects(
    new BuildForeignCurrencyCollectionsExchangeDifferenceReport(failing).execute([
      { reference: "a", collectedOn: salesDate("2025-10-01"), bookedVes: d("1") },
    ], salesDate("2025-10-31")),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_REPOSITORY_UNAVAILABLE",
  );
});
