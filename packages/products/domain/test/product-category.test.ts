import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies-domain";
import { ProductCategory, ProductCategoryStatus, productCategoryId } from "../src/index.js";

test("product category has an independent immutable lifecycle", () => {
  const category = new ProductCategory({ id: productCategoryId("medicine"), companyId: companyId("company-1"), legacyCategoryId: "legacy-department-1", name: " Medicine ", description: null, status: ProductCategoryStatus.Active, version: 1 });
  const inactive = category.deactivate();
  assert.equal(category.name, "Medicine");
  assert.equal(category.status, ProductCategoryStatus.Active);
  assert.equal(inactive.status, ProductCategoryStatus.Inactive);
  assert.equal(inactive.version, 2);
});
