import assert from "node:assert/strict";
import test from "node:test";
import { currencyCode } from "@kontave/monetary-domain";
import { fixedSalePricing, markupSalePricing } from "../src/index";

test("validates fixed and markup sale pricing", () => {
  const fixed = fixedSalePricing("12.50", currencyCode("USD"));
  const markup = markupSalePricing("30", currencyCode("VES"));
  assert.equal(fixed.mode, "fixed");
  assert.equal(fixed.mode === "fixed" && fixed.amount, "12.5");
  assert.equal(markup.mode === "markup" && markup.percentage, "30");
  assert.equal(Object.isFrozen(fixed), true);
});

test("rejects invalid pricing", () => {
  assert.throws(() => fixedSalePricing("0", currencyCode("VES")), { code: "PRICING_INVALID" });
});
