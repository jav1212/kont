import assert from "node:assert/strict";
import test from "node:test";
import { ProductStatus } from "@kontave/products-domain";
import { productFixture } from "../src/index.js";

test("canonical product fixture exposes a stable active product", () => {
  const product = productFixture();
  assert.equal(product.sku, "SKU-001");
  assert.equal(product.status, ProductStatus.Active);
});
