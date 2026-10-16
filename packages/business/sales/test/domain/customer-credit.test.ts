import assert from "node:assert/strict";
import test from "node:test";
import { currency, moneyFromDecimal } from "@kontave/monetary/domain";
import { assessCustomerCredit, SalesFailure } from "../../src/domain";

const usd = currency("USD", 2);
const amount = (value: string) => moneyFromDecimal(value, usd);

test("credit at the exact limit is permitted; one minor unit above requires an override", () => {
  const exposure = {
    creditLimit: amount("100"),
    outstandingDebt: amount("99.99"),
    additionalCredit: amount("0.01"),
  };
  assert.equal(assessCustomerCredit(exposure).requiresOverride, false);
  const assessment = assessCustomerCredit({
    ...exposure,
    additionalCredit: amount("0.02"),
  });
  assert.equal(assessment.requiresOverride, true);
  assert.equal(assessment.projectedDebt.minorAmount, 10001n);
});

test("an already overdrawn customer requires an exception even without new credit", () => {
  const assessment = assessCustomerCredit({
    creditLimit: amount("100"),
    outstandingDebt: amount("101"),
    additionalCredit: amount("0"),
  });
  assert.equal(assessment.alreadyOverdrawn, true);
  assert.equal(assessment.requiresOverride, true);
});

test("zero credit limit denies any positive credit and negative or mixed amounts are rejected", () => {
  const exposure = {
    creditLimit: amount("0"),
    outstandingDebt: amount("0"),
    additionalCredit: amount("0.01"),
  };
  assert.equal(assessCustomerCredit(exposure).requiresOverride, true);
  assert.throws(
    () => assessCustomerCredit({ ...exposure, outstandingDebt: amount("-1") }),
    (error: unknown) =>
      error instanceof SalesFailure && error.code === "SALES_CREDIT_INVALID",
  );
  assert.throws(
    () =>
      assessCustomerCredit({
        ...exposure,
        additionalCredit: moneyFromDecimal("1", currency("VES", 2)),
      }),
    (error: unknown) =>
      error instanceof SalesFailure && error.code === "SALES_CURRENCY_MISMATCH",
  );
});
