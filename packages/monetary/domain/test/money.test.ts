import assert from "node:assert/strict";
import test from "node:test";
import {
  addMoney,
  currency,
  exactDecimal,
  moneyFromDecimal,
  moneyFromMinor,
  moneyToDecimal,
  quantizeMoney,
  subtractMoney,
} from "../src/index.js";

const VES = currency("VES", 2);
const USD = currency("USD", 2);

test("money uses signed minor units and serializes exactly", () => {
  assert.deepEqual(moneyFromDecimal("125.37", VES), { minorAmount: 12_537n, currency: VES });
  assert.equal(moneyToDecimal(moneyFromMinor(-12_537n, VES)), "-125.37");
});

test("money construction never rounds implicitly", () => {
  assert.throws(() => moneyFromDecimal("1.005", VES), { code: "INVALID_DECIMAL" });
  assert.equal(quantizeMoney(exactDecimal("1.005"), VES, "half_up").minorAmount, 101n);
});

test("money arithmetic requires the same currency definition", () => {
  assert.equal(addMoney(moneyFromDecimal("1.00", VES), moneyFromDecimal("2.00", VES)).minorAmount, 300n);
  assert.equal(subtractMoney(moneyFromDecimal("1.00", VES), moneyFromDecimal("2.00", VES)).minorAmount, -100n);
  assert.throws(() => addMoney(moneyFromDecimal("1.00", VES), moneyFromDecimal("1.00", USD)), {
    code: "CURRENCY_MISMATCH",
  });
});

test("currency codes normalize case and reject invalid identifiers", () => {
  assert.equal(currency(" ves ", 2).code, "VES");
  assert.throws(() => currency("B", 2), { code: "INVALID_CURRENCY_CODE" });
});
