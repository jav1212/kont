import assert from "node:assert/strict";
import test from "node:test";
import { VENEZUELAN_IVA } from "@kontave/taxation-venezuela";
import { venezuelanProductTaxProfileFixture, venezuelanVatRuleFixture } from "../src/index.js";

test("taxation fixtures expose matching product classifications and rules", () => {
  const profile = venezuelanProductTaxProfileFixture("exempt");
  const rule = venezuelanVatRuleFixture("exempt");
  assert.equal(profile.assignmentAt(VENEZUELAN_IVA, "2026-08-13").treatment, rule.treatment);
  assert.equal(rule.rate, "0");
});
