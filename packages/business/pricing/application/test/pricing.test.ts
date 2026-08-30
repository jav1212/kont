import assert from "node:assert/strict";
import test from "node:test";
import {
  GetProductSalePricing,
  UpdateProductSalePricing,
  type PricingContext,
  type ProductSalePricingRepository,
} from "../src/index";

test("rejects an invalid expected version before persistence", () => {
  assert.throws(
    () => new UpdateProductSalePricing({} as ProductSalePricingRepository).execute({} as PricingContext, "product" as never, null, 0),
    { code: "PRICING_INVALID" },
  );
});

test("maps unexpected repository failures to a typed pricing failure", async () => {
  const repository: ProductSalePricingRepository = {
    get: async () => { throw new Error("database unavailable"); },
    save: async () => { throw new Error("database unavailable"); },
  };
  await assert.rejects(
    new GetProductSalePricing(repository).execute({} as PricingContext, "product" as never),
    { code: "PRICING_REPOSITORY_UNAVAILABLE" },
  );
});
