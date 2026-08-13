import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateExchangeDifference,
  convertMoney,
  currency,
  exchangeRate,
  moneyFromDecimal,
} from "../src/index.js";

const VES = currency("VES", 2);
const USD = currency("USD", 2);

test("exchange rates preserve their published scale and conversion audit value", () => {
  const rate = exchangeRate({ baseCurrency: USD, quoteCurrency: VES, value: "36.4512" });
  const result = convertMoney({ amount: moneyFromDecimal("10.25", USD), rate, roundingMode: "half_up" });
  assert.equal(rate.value, "36.4512");
  assert.equal(rate.publishedScale, 4);
  assert.equal(result.exactAmount, "373.6248");
  assert.equal(result.converted.minorAmount, 37_362n);
});

test("exchange rates have an explicit direction", () => {
  const rate = exchangeRate({ baseCurrency: USD, quoteCurrency: VES, value: "36.4512" });
  assert.throws(
    () => convertMoney({ amount: moneyFromDecimal("10.00", VES), rate, roundingMode: "half_up" }),
    { code: "EXCHANGE_RATE_DIRECTION_MISMATCH" },
  );
});

test("exchange difference distinguishes gains, losses and no change", () => {
  const recognitionRate = exchangeRate({ baseCurrency: USD, quoteCurrency: VES, value: "36.0000" });
  const higherRate = exchangeRate({ baseCurrency: USD, quoteCurrency: VES, value: "37.0000" });
  const lowerRate = exchangeRate({ baseCurrency: USD, quoteCurrency: VES, value: "35.0000" });
  const foreignAmount = moneyFromDecimal("100.00", USD);

  assert.equal(calculateExchangeDifference({ foreignAmount, recognitionRate, settlementRate: higherRate, roundingMode: "half_up" }).kind, "gain");
  assert.equal(calculateExchangeDifference({ foreignAmount, recognitionRate, settlementRate: lowerRate, roundingMode: "half_up" }).kind, "loss");
  assert.equal(calculateExchangeDifference({ foreignAmount, recognitionRate, settlementRate: recognitionRate, roundingMode: "half_up" }).kind, "none");
});
