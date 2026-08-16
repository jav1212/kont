import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies-domain";
import { productId, UnitOfMeasure } from "@kontave/products-domain";
import {
  InventoryFailure,
  InventoryPeriod,
  InventoryProfile,
  StockLot,
  StockPosition,
  inventoryLocationId,
  localDate,
  quantity,
  stockEffect,
  stockEffectId,
  stockLotId,
} from "../src/index";

const COMPANY_ID = companyId("company-1");
const PRODUCT_ID = productId("product-1");
const LOCATION_ID = inventoryLocationId("main");

const PROFILE = new InventoryProfile({
  productId: PRODUCT_ID,
  companyId: COMPANY_ID,
  trackingPolicy: { method: "none" },
  negativeStockPolicy: { mode: "forbidden" },
  valuationPolicy: { method: "weighted_average" },
  status: "active",
  version: 1,
});

test("stock position applies matching effects and forbids negative stock", () => {
  const position = new StockPosition({ companyId: COMPANY_ID, productId: PRODUCT_ID, locationId: LOCATION_ID, lotId: null, onHand: quantity("2", UnitOfMeasure.Each), version: 1 });
  const issue = stockEffect({ id: stockEffectId("issue"), productId: PRODUCT_ID, locationId: LOCATION_ID, lotId: null, quantity: quantity("-3", UnitOfMeasure.Each) });
  assert.throws(() => position.apply(issue, PROFILE), (error: unknown) => error instanceof InventoryFailure && error.code === "INVENTORY_NEGATIVE_STOCK");
});

test("negative stock is accepted only by an explicit profile policy", () => {
  const position = new StockPosition({ companyId: COMPANY_ID, productId: PRODUCT_ID, locationId: LOCATION_ID, lotId: null, onHand: quantity("2", UnitOfMeasure.Each), version: 1 });
  const issue = stockEffect({ id: stockEffectId("negative-issue"), productId: PRODUCT_ID, locationId: LOCATION_ID, lotId: null, quantity: quantity("-3", UnitOfMeasure.Each) });
  const allowed = new InventoryProfile({ ...PROFILE, negativeStockPolicy: { mode: "allowed", provisionalValuation: "last_known_average" } });
  assert.equal(position.apply(issue, allowed).onHand.amount, "-1");
});

test("lot policy requires an unexpired active lot", () => {
  const lotProfile = new InventoryProfile({ ...PROFILE, trackingPolicy: { method: "lot", expirationRequired: true } });
  const withoutLot = stockEffect({ id: stockEffectId("receipt"), productId: PRODUCT_ID, locationId: LOCATION_ID, lotId: null, quantity: quantity("1", UnitOfMeasure.Each) });
  assert.throws(() => lotProfile.assertAccepts(withoutLot), { code: "INVENTORY_LOT_REQUIRED" });

  const lot = new StockLot({ id: stockLotId("lot-1"), companyId: COMPANY_ID, productId: PRODUCT_ID, lotNumber: "L-001", manufacturedOn: localDate("2026-01-01"), expiresOn: localDate("2026-07-31"), status: "active", version: 1 });
  assert.throws(() => lot.assertUsable("2026-08-13", true), { code: "INVENTORY_LOT_UNAVAILABLE" });
});

test("closed inventory period rejects its effective dates", () => {
  const period = InventoryPeriod.open(COMPANY_ID, "2026-08").close("2026-09-01T00:00:00Z");
  assert.throws(() => period.assertAccepts(localDate("2026-08-13")), { code: "INVENTORY_PERIOD_CLOSED" });
  assert.doesNotThrow(() => period.assertAccepts(localDate("2026-09-01")));
});
