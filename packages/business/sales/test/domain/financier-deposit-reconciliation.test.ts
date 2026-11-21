import assert from "node:assert/strict";
import test from "node:test";
import { exactDecimal } from "@kontave/monetary/domain";
import { SalesFailure, salesDate, suggestFinancierDepositMatches } from "../../src/domain";

const deposit = (id: string, date: string, amount: string, bankEntryId: string | null = null) => ({ id, depositDate: salesDate(date), amountVes: exactDecimal(amount), bankEntryId });
const credit = (id: string, date: string, amount: string) => ({ id, date: salesDate(date), amountVes: exactDecimal(amount), concept: "CASHEA" });

test("pairs equal amounts within the tolerance, closest dates first", () => {
  const result = suggestFinancierDepositMatches(
    [deposit("d-1", "2025-11-20", "3992.47"), deposit("d-2", "2025-11-21", "3992.47"), deposit("d-3", "2025-11-25", "100")],
    [credit("b-1", "2025-11-21", "3992.470"), credit("b-2", "2025-11-23", "3992.47"), credit("b-3", "2025-11-30", "55")],
  );
  assert.deepEqual(result.matches.map((match) => [match.depositId, match.bankEntryId, match.dayGap]), [["d-2", "b-1", 0], ["d-1", "b-2", 3]]);
  assert.deepEqual(result.unmatchedDepositIds, ["d-3"]);
  assert.deepEqual(result.unmatchedCredits.map((item) => item.id), ["b-3"]);
});

test("ignores existing links on both sides and gaps beyond the tolerance", () => {
  const result = suggestFinancierDepositMatches(
    [deposit("d-1", "2025-11-20", "10", "b-1"), deposit("d-2", "2025-11-01", "10")],
    [credit("b-1", "2025-11-20", "10"), credit("b-2", "2025-11-10", "10")],
  );
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.unmatchedDepositIds, ["d-2"]);
  assert.deepEqual(result.unmatchedCredits.map((item) => item.id), ["b-2"]);
  assert.throws(() => suggestFinancierDepositMatches([], [], 40), SalesFailure);
});
