import assert from "node:assert/strict";
import test from "node:test";
import { emptyValuationFixture, inventoryProfileFixture } from "../src/index.js";

test("inventory fixtures expose a supported profile and empty valuation", () => {
  assert.equal(inventoryProfileFixture().valuationPolicy.method, "weighted_average");
  assert.equal(emptyValuationFixture().totalValue.minorAmount, 0n);
});
