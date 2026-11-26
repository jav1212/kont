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

test("values a day's bolivar base, rounded to whole cents of dollars, at the payment rate", () => {
  // IGTF report row of 02/10/2025: one dollar booked at 181.3037.
  const valuation = valueForeignCurrencyCollection(
    { reference: "2025-10-02", collectedOn: salesDate("2025-10-02"), amount: d("181.30"), currency: "VES", vesPerUsd: d("181.3037") },
    salesDate("2025-10-09"),
    d("223.6459"),
  );
  assert.equal(valuation.collectedUsd, "1");
  assert.equal(valuation.bookedVes, "181.3");
  assert.equal(valuation.paymentVes, "223.65");
  assert.equal(valuation.exchangeDifference, "42.35");
  assert.equal(valuation.direction, "gain");
});

test("books a dollar amount at the collection rate", () => {
  const valuation = valueForeignCurrencyCollection(
    { reference: "a", collectedOn: salesDate("2025-10-01"), amount: d("100"), currency: "USD", vesPerUsd: d("180.5") },
    salesDate("2025-10-08"),
    d("179"),
  );
  assert.equal(valuation.bookedVes, "18050");
  assert.equal(valuation.paymentVes, "17900");
  assert.equal(valuation.exchangeDifference, "-150");
  assert.equal(valuation.direction, "loss");
});

test("rejects a payment before the collection and non-positive amounts", () => {
  const collection = { reference: "x", collectedOn: salesDate("2025-10-02"), amount: d("100"), currency: "VES" as const, vesPerUsd: d("100") };
  assert.throws(() => valueForeignCurrencyCollection(collection, salesDate("2025-10-01"), d("100")), SalesFailure);
  assert.throws(() => valueForeignCurrencyCollection({ ...collection, amount: d("0") }, salesDate("2025-10-31"), d("100")), SalesFailure);
});

test("finds the last calendar day of a month, leap years included", () => {
  assert.equal(monthEndOf(salesDate("2026-02-10")), "2026-02-28");
  assert.equal(monthEndOf(salesDate("2028-02-01")), "2028-02-29");
  assert.equal(monthEndOf(salesDate("2025-12-31")), "2025-12-31");
});

test("values dollars collected on 01/10 at the rate of the payment seven days later", async () => {
  const calls: Array<[string, string]> = [];
  const rates = history({ "2025-10-01": "200", "2025-10-08": "210", "2025-10-30": "220", "2025-11-06": "230" }, calls);
  const report = await new BuildForeignCurrencyCollectionsExchangeDifferenceReport(rates).execute([
    { reference: "a", collectedOn: salesDate("2025-10-01"), amount: d("23808.06"), currency: "USD" },
    { reference: "b", collectedOn: salesDate("2025-10-30"), amount: d("2200"), currency: "VES", igtfVes: d("66") },
  ], salesDate("2025-12-15"));
  assert.deepEqual(calls, [["2025-09-21", "2025-11-06"]], "rates are fetched once up to the last payment");
  const [usd, ves] = report.rows;
  assert.ok(usd?.status === "calculated" && ves?.status === "calculated");
  assert.equal(usd.valuation.paidOn, "2025-10-08");
  assert.equal(usd.valuation.bookedVes, "4761612");
  assert.equal(usd.valuation.exchangeDifference, "238080.6");
  // Paid in the next month: still reported with the collections of October.
  assert.equal(ves.valuation.paidOn, "2025-11-06");
  assert.equal(ves.valuation.exchangeDifference, "100");
  assert.equal(report.paymentTermDays, 7);
  assert.deepEqual(report.months.map((month) => [month.month, month.days, month.collectedUsd, month.gainVes, month.provisional]), [
    ["2025-10", 2, "23818.06", "238180.6", false],
  ]);
  assert.equal(report.totals.igtfVes, "66");
});

test("uses a row's own payment date over the term", async () => {
  const report = await new BuildForeignCurrencyCollectionsExchangeDifferenceReport(history({ "2025-10-01": "200", "2025-10-15": "190" })).execute([
    { reference: "a", collectedOn: salesDate("2025-10-01"), amount: d("10"), currency: "USD", paidOn: salesDate("2025-10-15") },
    { reference: "b", collectedOn: salesDate("2025-10-02"), amount: d("10"), currency: "USD", paidOn: salesDate("2025-10-01") },
  ], salesDate("2025-10-31"), 3);
  const [own, early] = report.rows;
  assert.ok(own?.status === "calculated");
  assert.equal(own.valuation.paidOn, "2025-10-15");
  assert.equal(own.valuation.exchangeDifference, "-100");
  assert.equal(early?.status, "failed");
});

test("values a payment after the cut-off provisionally and reports failures per row", async () => {
  const report = await new BuildForeignCurrencyCollectionsExchangeDifferenceReport(history({ "2025-10-01": "200", "2025-10-10": "190" })).execute([
    { reference: "a", collectedOn: salesDate("2025-10-01"), amount: d("2000"), currency: "VES" },
    { reference: "b", collectedOn: salesDate("2025-10-12"), amount: d("1000"), currency: "VES", vesPerUsd: d("250") },
    { reference: "c", collectedOn: salesDate("2025-10-20"), amount: d("500"), currency: "VES" },
  ], salesDate("2025-10-15"));
  const [paid, pending, late] = report.rows;
  assert.ok(paid?.status === "calculated" && pending?.status === "calculated");
  assert.equal(paid.valuation.paidOn, "2025-10-08");
  assert.equal(paid.provisional, false);
  assert.equal(pending.valuation.paidOn, "2025-10-15");
  assert.equal(pending.scheduledPaidOn, "2025-10-19");
  assert.equal(pending.provisional, true);
  assert.equal(pending.rateSource, "override");
  assert.equal(pending.valuation.collectedUsd, "4");
  assert.equal(late?.status, "failed");
  const [month] = report.months;
  assert.equal(month?.provisional, true);
  assert.equal(month?.days, 3);
  assert.equal(month?.bookedVes, "3500");
  assert.equal(month?.lossVes, "240");
});

test("rejects a negative or fractional payment term", async () => {
  const use = new BuildForeignCurrencyCollectionsExchangeDifferenceReport(history({}));
  await assert.rejects(use.execute([], salesDate("2025-10-31"), -1), SalesFailure);
  await assert.rejects(use.execute([], salesDate("2025-10-31"), 1.5), SalesFailure);
});

test("wraps rate source failures as an unavailable repository", async () => {
  const failing: UsdVesRateHistory = { async ratesBetween() { throw new Error("down"); } };
  await assert.rejects(
    new BuildForeignCurrencyCollectionsExchangeDifferenceReport(failing).execute([
      { reference: "a", collectedOn: salesDate("2025-10-01"), amount: d("1"), currency: "VES" },
    ], salesDate("2025-10-31")),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_REPOSITORY_UNAVAILABLE",
  );
});
