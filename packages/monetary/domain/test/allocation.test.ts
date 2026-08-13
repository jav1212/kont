import assert from "node:assert/strict";
import test from "node:test";
import { allocateMoney, allocationPart, currency, moneyFromDecimal } from "../src/index.js";

const VES = currency("VES", 2);

test("last-part carry preserves the total and exposes the residual", () => {
  const result = allocateMoney({
    total: moneyFromDecimal("10.00", VES),
    parts: [allocationPart("a", "1"), allocationPart("b", "1"), allocationPart("c", "1")],
    strategy: "last_part_carry",
  });
  assert.deepEqual(result.map((part) => part.amount.minorAmount), [333n, 333n, 334n]);
  assert.deepEqual(result.map((part) => part.residualAdjustment.minorAmount), [0n, 0n, 1n]);
});

test("largest remainder is deterministic and preserves positive and negative totals", () => {
  for (const total of ["10.00", "-10.00"]) {
    const result = allocateMoney({
      total: moneyFromDecimal(total, VES),
      parts: [allocationPart("a", "1"), allocationPart("b", "1"), allocationPart("c", "1")],
      strategy: "largest_remainder",
    });
    const sum = result.reduce((current, part) => current + part.amount.minorAmount, 0n);
    assert.equal(sum, moneyFromDecimal(total, VES).minorAmount);
    assert.equal(result[0]?.residualAdjustment.minorAmount, total.startsWith("-") ? -1n : 1n);
  }
});

test("allocation rejects empty and zero-weight requests", () => {
  assert.throws(
    () => allocateMoney({ total: moneyFromDecimal("1.00", VES), parts: [], strategy: "largest_remainder" }),
    { code: "INVALID_ALLOCATION" },
  );
  assert.throws(
    () => allocateMoney({ total: moneyFromDecimal("1.00", VES), parts: [allocationPart("a", "0")], strategy: "largest_remainder" }),
    { code: "INVALID_ALLOCATION" },
  );
});

test("allocation conserves totals across a deterministic scenario matrix", () => {
  for (let minor = -250; minor <= 250; minor += 7) {
    const result = allocateMoney({
      total: { minorAmount: BigInt(minor), currency: VES },
      parts: [allocationPart(1, "1.25"), allocationPart(2, "2.50"), allocationPart(3, "4.75")],
      strategy: "largest_remainder",
    });
    assert.equal(result.reduce((sum, part) => sum + part.amount.minorAmount, 0n), BigInt(minor));
  }
});
