import assert from "node:assert/strict";
import test from "node:test";
import { exactDecimal } from "@kontave/monetary/domain";
import {
  BuildFinancedSalesExchangeDifferenceReport,
  buildFinancedSalesJournal,
  type UsdVesRateHistory,
  type UsdVesRatePoint,
} from "../../src/application";
import { SalesFailure, salesDate } from "../../src/domain";

const d = exactDecimal;
const policy = { upfrontPercent: d("60"), estimatedSettlementDays: 14, asOf: salesDate("2025-11-30") };
const describe = (kind: string, month: string) => `${kind} ${month}`;

function history(points: Record<string, string>, calls: Array<[string, string]> = []): UsdVesRateHistory {
  return {
    async ratesBetween(start, end) {
      calls.push([start, end]);
      return Object.entries(points).map(([date, rate]): UsdVesRatePoint => ({ effectiveDate: salesDate(date), vesPerUsd: d(rate) }));
    },
  };
}

test("uses actual deposits and the latest official rate in effect on the sale date", async () => {
  const calls: Array<[string, string]> = [];
  const report = await new BuildFinancedSalesExchangeDifferenceReport(history({ "2025-09-30": "179.43", "2025-10-02": "185" }, calls)).execute([
    { reference: "2025-10-01", saleDate: salesDate("2025-10-01"), saleAmountVes: d("7455.25"), collections: [{ collectedOn: salesDate("2025-10-15"), receivedVes: d("3992.47") }] },
  ], policy);
  const [row] = report.rows;
  assert.equal(row?.status, "calculated");
  assert.ok(row?.status === "calculated");
  assert.equal(row.collectionMode, "actual");
  assert.equal(row.settlement.terms.saleVesPerUsd, "179.43");
  assert.equal(report.totals.realizedGainVes, "1010.37");
  assert.deepEqual(calls, [["2025-09-21", "2025-10-15"]], "rates are fetched once for the whole range");
});

test("estimates settlement at the official rate N days later and leaves later ones pending", async () => {
  const report = await new BuildFinancedSalesExchangeDifferenceReport(history({ "2025-10-01": "200", "2025-10-15": "220" })).execute([
    { reference: "a", saleDate: salesDate("2025-10-01"), saleAmountVes: d("1000") },
    { reference: "b", saleDate: salesDate("2025-11-20"), saleAmountVes: d("1000") },
  ], policy);
  const [estimated, pending] = report.rows;
  assert.ok(estimated?.status === "calculated" && pending?.status === "calculated");
  assert.equal(estimated.collectionMode, "estimated");
  assert.equal(estimated.settlement.collections[0]?.collectedOn, "2025-10-15");
  assert.equal(estimated.settlement.collections[0]?.receivedVes, "440");
  assert.equal(estimated.settlement.exchangeDifference, "40");
  assert.equal(pending.collectionMode, "pending");
  assert.deepEqual(report.months.map((month) => [month.month, month.realizedGainVes, month.outstandingCarriedVes]), [
    ["2025-10", "40", "0"],
    ["2025-11", "0", "400"],
  ]);
  const monthly = buildFinancedSalesJournal(report.rows, { granularity: "monthly", includeEstimated: true, describeMonth: describe });
  assert.deepEqual(monthly.map((entry) => [entry.key, entry.description]), [
    ["sale:2025-10", "sale 2025-10"],
    ["collection:2025-10", "collection 2025-10"],
    ["sale:2025-11", "sale 2025-11"],
  ]);
  const booked = buildFinancedSalesJournal(report.rows, { granularity: "daily", includeEstimated: false, describeMonth: describe });
  assert.deepEqual(booked.map((entry) => entry.key), ["sale:a", "sale:b"], "estimated collections stay out of the books by default");
});

test("reports a row failure without aborting the rest", async () => {
  const report = await new BuildFinancedSalesExchangeDifferenceReport(history({ "2025-10-10": "200" })).execute([
    { reference: "no-rate", saleDate: salesDate("2025-10-01"), saleAmountVes: d("1000") },
    { reference: "manual", saleDate: salesDate("2025-10-01"), saleAmountVes: d("1000"), saleVesPerUsd: d("190") },
  ], { ...policy, asOf: salesDate("2025-10-05") });
  assert.equal(report.rows[0]?.status, "failed");
  const manual = report.rows[1];
  assert.ok(manual?.status === "calculated");
  assert.equal(manual.saleRateSource, "override");
  assert.equal(manual.collectionMode, "pending");
});

test("wraps rate source failures as an unavailable repository", async () => {
  const failing: UsdVesRateHistory = { async ratesBetween() { throw new Error("offline"); } };
  await assert.rejects(
    new BuildFinancedSalesExchangeDifferenceReport(failing).execute([{ reference: "a", saleDate: salesDate("2025-10-01"), saleAmountVes: d("1") }], policy),
    (error) => error instanceof SalesFailure && error.code === "SALES_REPOSITORY_UNAVAILABLE",
  );
});
