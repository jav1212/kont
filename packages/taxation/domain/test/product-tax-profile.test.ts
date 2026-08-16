import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies-domain";
import { productId } from "@kontave/products-domain";
import {
  ProductTaxProfile,
  TaxationFailure,
  productTaxProfileId,
  taxCode,
  taxationDate,
} from "../src/index";

const IVA = taxCode("IVA");

test("product tax profile resolves the classification effective on the operation date", () => {
  const profile = new ProductTaxProfile({
    id: productTaxProfileId("profile-1"), companyId: companyId("company-1"), productId: productId("product-1"), jurisdiction: "ve", version: 1,
    assignments: [
      { taxCode: IVA, treatment: "exempt", effectiveFrom: taxationDate("2026-01-01"), effectiveTo: taxationDate("2026-06-30"), legalBasis: "Example exemption", classificationVersion: "classification-1" },
      { taxCode: IVA, treatment: "taxed", effectiveFrom: taxationDate("2026-07-01"), effectiveTo: null, legalBasis: "Example taxable classification", classificationVersion: "classification-2" },
    ],
  });
  assert.equal(profile.assignmentAt(IVA, "2026-03-01").treatment, "exempt");
  assert.equal(profile.assignmentAt(IVA, "2026-08-01").treatment, "taxed");
});

test("overlapping classifications for the same product and tax are rejected", () => {
  assert.throws(() => new ProductTaxProfile({
    id: productTaxProfileId("profile-1"), companyId: companyId("company-1"), productId: productId("product-1"), jurisdiction: "VE", version: 1,
    assignments: [
      { taxCode: IVA, treatment: "exempt", effectiveFrom: taxationDate("2026-01-01"), effectiveTo: null, legalBasis: "A", classificationVersion: "1" },
      { taxCode: IVA, treatment: "taxed", effectiveFrom: taxationDate("2026-02-01"), effectiveTo: null, legalBasis: "B", classificationVersion: "2" },
    ],
  }), (error: unknown) => error instanceof TaxationFailure && error.code === "TAXATION_ASSIGNMENT_OVERLAP");
});

test("missing classification blocks tax determination", () => {
  const profile = new ProductTaxProfile({
    id: productTaxProfileId("profile-1"), companyId: companyId("company-1"), productId: productId("product-1"), jurisdiction: "VE", version: 1, assignments: [],
  });
  assert.throws(() => profile.assignmentAt(IVA, "2026-08-01"),
    (error: unknown) => error instanceof TaxationFailure && error.code === "TAXATION_CLASSIFICATION_MISSING");
});
