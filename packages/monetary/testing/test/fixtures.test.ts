import assert from "node:assert/strict";
import test from "node:test";
import { convertMoney } from "@kontave/monetary-domain";
import { usd, usdToVes, VES } from "../src/index";

test("canonical monetary fixtures compose through the public APIs", () => {
  const result = convertMoney({ amount: usd("10.25"), rate: usdToVes("36.4512"), roundingMode: "half_up" });
  assert.equal(result.converted.minorAmount, 37_362n);
  assert.equal(result.converted.currency, VES);
});
