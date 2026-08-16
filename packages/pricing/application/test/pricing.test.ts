import assert from"node:assert/strict";import test from"node:test";import{UpdateProductSalePricing,type ProductSalePricingRepository}from"../src/index.js";
test("rejects an invalid expected version before persistence",()=>assert.throws(()=>new UpdateProductSalePricing({}as ProductSalePricingRepository).execute({}as never,"product"as never,null,0),{code:"PRICING_INVALID"}));
