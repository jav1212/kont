import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies-domain";
import { Product, ProductFailure, ProductStatus, UnitOfMeasure, barcode, productCategoryId, productId, rehydrateSku, sku } from "../src/index";

const COMPANY_ID = companyId("company-1");

test("product normalizes identity and preserves immutable history versions", () => {
  const product = new Product({ id: productId("product-1"), companyId: COMPANY_ID, legacyProductId: null, sku: sku(" med-001 "), barcodes: [barcode("001234567890")], name: " Acetaminofén 500 mg ", description: null, categoryId: productCategoryId("medicine"), baseUnit: UnitOfMeasure.Each, status: ProductStatus.Active, version: 1 });
  const inactive = product.deactivate();
  assert.equal(product.sku, "MED-001");
  assert.equal(product.name, "Acetaminofén 500 mg");
  assert.equal(product.status, ProductStatus.Active);
  assert.equal(inactive.status, ProductStatus.Inactive);
  assert.equal(inactive.version, 2);
});

test("product rejects duplicate barcodes", () => {
  const repeatedBarcode = barcode("001234567890");
  assert.throws(() => new Product({ id: productId("product-1"), companyId: COMPANY_ID, legacyProductId: null, sku: sku("MED-001"), barcodes: [repeatedBarcode, repeatedBarcode], name: "Acetaminofén", description: null, categoryId: null, baseUnit: UnitOfMeasure.Each, status: ProductStatus.Active, version: 1 }), (error: unknown) => error instanceof ProductFailure && error.code === "PRODUCT_DUPLICATE_BARCODE");
});

test("legacy products can be rehydrated without inventing an SKU", () => {
  assert.equal(rehydrateSku("", "legacy-product-1"), "");
  assert.throws(
    () => rehydrateSku("", null),
    (error: unknown) => error instanceof ProductFailure && error.code === "PRODUCT_IDENTIFIER_INVALID",
  );
});
