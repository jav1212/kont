import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { ProductCategoryAlias, ProductFailure, normalizeProductCategoryAlias, productCategoryId } from "../../src/domain";

test("category aliases normalize labels and retire with optimistic revision", () => {
  const alias = new ProductCategoryAlias({
    id: "alias-1",
    companyId: companyId("company-1"),
    categoryId: productCategoryId("category-1"),
    alias: "  Medical  ",
    status: "active",
    version: 4,
  });

  const retired = alias.retire();
  assert.equal(alias.alias, "Medical");
  assert.equal(alias.status, "active");
  assert.equal(retired.status, "retired");
  assert.equal(retired.version, 5);
  assert.throws(() => retired.retire(), ProductFailure);
});

test("category alias normalization rejects blank and control-character labels", () => {
  assert.throws(() => normalizeProductCategoryAlias("  "), { code: "PRODUCT_CATEGORY_ALIAS_INVALID" });
  assert.throws(() => normalizeProductCategoryAlias("A\nB"), { code: "PRODUCT_CATEGORY_ALIAS_INVALID" });
});
