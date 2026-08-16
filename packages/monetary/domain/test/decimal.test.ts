import assert from "node:assert/strict";
import test from "node:test";
import {
  decimalScale,
  decimalToString,
  divideDecimal,
  exactDecimal,
  multiplyDecimal,
  quantizeDecimal,
} from "../src/index";

test("exact decimals preserve value without binary floating-point conversion", () => {
  const result = multiplyDecimal(exactDecimal("10.25"), exactDecimal("36.4512"));
  assert.equal(decimalToString(result), "373.6248");
  assert.equal(decimalScale("36.4512"), 4);
});

test("decimal inputs reject exponent notation and non-finite values", () => {
  for (const value of ["1e3", "NaN", "Infinity", "", "12,50"]) {
    assert.throws(() => exactDecimal(value), { code: "INVALID_DECIMAL" });
  }
});

test("half-up quantization follows the expected midpoint rule", () => {
  assert.equal(quantizeDecimal(exactDecimal("10.124"), { scale: 2, mode: "half_up" }), "10.12");
  assert.equal(quantizeDecimal(exactDecimal("10.125"), { scale: 2, mode: "half_up" }), "10.13");
  assert.equal(quantizeDecimal(exactDecimal("-10.125"), { scale: 2, mode: "half_up" }), "-10.13");
});

test("division is deterministic and rejects zero", () => {
  assert.equal(divideDecimal(exactDecimal("1"), exactDecimal("4")), "0.25");
  assert.throws(() => divideDecimal(exactDecimal("1"), exactDecimal("0")), { code: "DIVISION_BY_ZERO" });
});
