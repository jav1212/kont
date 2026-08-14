import assert from "node:assert/strict";
import test from "node:test";
import { fiscalInvoiceFixture } from "../src/index.js";

test("fiscal invoice fixture is a reconciled draft", () => {
  const invoice = fiscalInvoiceFixture();
  assert.equal(invoice.type, "invoice");
  assert.equal(invoice.status, "draft");
  assert.equal(invoice.totals.payableAmount.minorAmount, 10_000n);
});
