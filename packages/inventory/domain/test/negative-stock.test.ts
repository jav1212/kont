import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies-domain";
import { currency, moneyFromDecimal } from "@kontave/monetary-domain";
import { productId, UnitOfMeasure } from "@kontave/products-domain";
import {
  NegativeStockPosition,
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

test("negative issue opens a provisional exposure and later receipt revalues it", () => {
  const empty = emptyValuationPosition({ companyId: COMPANY_ID, productId: PRODUCT_ID, locationId: LOCATION_ID, lotId: null, quantity: quantity("0", UnitOfMeasure.Each), functionalCurrency: VES });
  const initial = empty.applyReceipt(
    stockEffect({ id: stockEffectId("initial"), productId: PRODUCT_ID, locationId: LOCATION_ID, lotId: null, quantity: quantity("2", UnitOfMeasure.Each) }),
    moneyFromDecimal("6.00", VES),
  );
  const negative = NegativeStockPosition.issueFrom(
    initial.position,
    stockEffect({ id: stockEffectId("sale"), productId: PRODUCT_ID, locationId: LOCATION_ID, lotId: null, quantity: quantity("-5", UnitOfMeasure.Each) }),
  );
  assert.equal(negative.position.quantity.amount, "-3");
  assert.equal(negative.position.provisionalValue.minorAmount, -900n);
  assert.equal(negative.position.exposures[0]?.openQuantity.amount, "3");

  const replenished = negative.position.applyReceipt(
    stockEffect({ id: stockEffectId("purchase"), productId: PRODUCT_ID, locationId: LOCATION_ID, lotId: null, quantity: quantity("5", UnitOfMeasure.Each) }),
    moneyFromDecimal("20.00", VES),
  );
  assert.equal(replenished.position.quantity.amount, "2");
  assert.equal("totalValue" in replenished.position ? replenished.position.totalValue.minorAmount : null, 800n);
  assert.equal(replenished.costOfIssueAdjustment.minorAmount, 300n);
  assert.equal(replenished.settlements[0]?.provisionalCost.minorAmount, 900n);
  assert.equal(replenished.settlements[0]?.actualCost.minorAmount, 1200n);
});

test("negative valuation cannot start without a known historical average", () => {
  const empty = emptyValuationPosition({ companyId: COMPANY_ID, productId: PRODUCT_ID, locationId: LOCATION_ID, lotId: null, quantity: quantity("0", UnitOfMeasure.Each), functionalCurrency: VES });
  const issue = stockEffect({ id: stockEffectId("sale"), productId: PRODUCT_ID, locationId: LOCATION_ID, lotId: null, quantity: quantity("-1", UnitOfMeasure.Each) });
  assert.throws(() => NegativeStockPosition.issueFrom(empty, issue), { code: "INVENTORY_VALUATION_INVALID" });
});
