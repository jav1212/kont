import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies-domain";
import { currency, moneyFromDecimal } from "@kontave/monetary-domain";
import { productId, UnitOfMeasure } from "@kontave/products-domain";
import {
  emptyValuationPosition,
  inventoryLocationId,
  quantity,
  stockEffect,
  stockEffectId,
} from "../src/index";

const VES = currency("VES", 2);
const COMPANY_ID = companyId("company-1");
const PRODUCT_ID = productId("product-1");
const LOCATION_ID = inventoryLocationId("main");

test("weighted average preserves exact unit cost and quantized value", () => {
  const empty = emptyValuationPosition({ companyId: COMPANY_ID, productId: PRODUCT_ID, locationId: LOCATION_ID, lotId: null, quantity: quantity("0", UnitOfMeasure.Each), functionalCurrency: VES });
  const first = empty.applyReceipt(
    stockEffect({ id: stockEffectId("receipt-1"), productId: PRODUCT_ID, locationId: LOCATION_ID, lotId: null, quantity: quantity("3", UnitOfMeasure.Each) }),
    moneyFromDecimal("10.00", VES),
  );
  const second = first.position.applyReceipt(
    stockEffect({ id: stockEffectId("receipt-2"), productId: PRODUCT_ID, locationId: LOCATION_ID, lotId: null, quantity: quantity("2", UnitOfMeasure.Each) }),
    moneyFromDecimal("8.00", VES),
  );
  const issue = second.position.applyIssue(
    stockEffect({ id: stockEffectId("issue-1"), productId: PRODUCT_ID, locationId: LOCATION_ID, lotId: null, quantity: quantity("-2", UnitOfMeasure.Each) }),
  );

  assert.equal(first.effect.unitCost.amount, "3.3333333333333333333333333333333333333333333333333333333333333333333333333333333");
  assert.equal(second.position.averageUnitCost?.amount, "3.6");
  assert.equal(issue.effect.valueDelta.minorAmount, -720n);
  assert.equal(issue.position.quantity.amount, "3");
  assert.equal(issue.position.totalValue.minorAmount, 1080n);
});

test("exhausting a position consumes the remaining value without rounding residue", () => {
  const empty = emptyValuationPosition({ companyId: COMPANY_ID, productId: PRODUCT_ID, locationId: LOCATION_ID, lotId: null, quantity: quantity("0", UnitOfMeasure.Each), functionalCurrency: VES });
  const receipt = empty.applyReceipt(
    stockEffect({ id: stockEffectId("receipt"), productId: PRODUCT_ID, locationId: LOCATION_ID, lotId: null, quantity: quantity("3", UnitOfMeasure.Each) }),
    moneyFromDecimal("10.00", VES),
  );
  const issue = receipt.position.applyIssue(
    stockEffect({ id: stockEffectId("issue"), productId: PRODUCT_ID, locationId: LOCATION_ID, lotId: null, quantity: quantity("-3", UnitOfMeasure.Each) }),
  );
  assert.equal(issue.position.totalValue.minorAmount, 0n);
  assert.equal(issue.position.averageUnitCost, null);
});
