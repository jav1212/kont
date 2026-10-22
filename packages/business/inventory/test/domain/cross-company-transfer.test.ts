import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { productId, UnitOfMeasure } from "@kontave/products/domain";
import {
  CrossCompanyInventoryTransfer,
  crossCompanyInventoryTransferId,
  InventoryFailure,
  localDate,
  quantity,
} from "../../src/domain";

const sourceCompanyId = companyId("source-company");
const destinationCompanyId = companyId("destination-company");

function transfer(lines = [{ sourceProductId: productId("source-product"), destinationProductId: productId("destination-product"), quantity: quantity("3.25", UnitOfMeasure.Each) }]) {
  return new CrossCompanyInventoryTransfer({
    id: crossCompanyInventoryTransferId("transfer-1"), sourceCompanyId, destinationCompanyId,
    effectiveDate: localDate("2026-10-01"), reference: " transfer-1 ", notes: " evidence ", lines,
  });
}

test("cross-company transfer freezes explicit mapped quantities without inferring catalog identity", () => {
  const result = transfer();
  assert.equal(result.reference, "transfer-1");
  assert.equal(result.lines[0]?.sourceProductId, productId("source-product"));
  assert.equal(result.lines[0]?.destinationProductId, productId("destination-product"));
  assert.equal(result.lines[0]?.quantity.amount, "3.25");
  assert.ok(Object.isFrozen(result.lines));
});

test("cross-company transfer rejects same-company scope, duplicate mappings, and non-positive quantities", () => {
  assert.throws(() => new CrossCompanyInventoryTransfer({
    id: crossCompanyInventoryTransferId("same-company"), sourceCompanyId, destinationCompanyId: sourceCompanyId,
    effectiveDate: localDate("2026-10-01"), reference: null, notes: null, lines: [{ sourceProductId: productId("source"), destinationProductId: productId("destination"), quantity: quantity("1", UnitOfMeasure.Each) }],
  }), failure());
  assert.throws(() => transfer([
    { sourceProductId: productId("source"), destinationProductId: productId("destination-a"), quantity: quantity("1", UnitOfMeasure.Each) },
    { sourceProductId: productId("source"), destinationProductId: productId("destination-b"), quantity: quantity("1", UnitOfMeasure.Each) },
  ]), failure());
  assert.throws(() => transfer([{ sourceProductId: productId("source"), destinationProductId: productId("destination"), quantity: quantity("0", UnitOfMeasure.Each) }]), failure());
});

function failure() {
  return (error: unknown) => error instanceof InventoryFailure && error.code === "INVENTORY_CROSS_COMPANY_TRANSFER_INVALID";
}
