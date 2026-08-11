import assert from "node:assert/strict";
import test from "node:test";
import { PaymentEventType, PaymentProvider, PaymentStatus } from "../src/index.js";

test("payment lifecycle exposes stable persistence values", () => {
  assert.equal(PaymentStatus.Confirmed, "confirmed");
  assert.equal(PaymentProvider.Manual, "manual");
  assert.equal(PaymentEventType.Confirmed, "payment.confirmed");
});
