import assert from "node:assert/strict";
import test from "node:test";
import { companyId, CompanySecondaryTaxIdentifier, secondaryTaxIdentifierScheme, secondaryTaxIdentifierValue, secondaryTaxJurisdiction } from "../../src/domain";
import { organizationId } from "@kontave/organizations/domain";

test("secondary tax identifiers preserve opaque values and normalize only their key", () => {
  const row = new CompanySecondaryTaxIdentifier({
    id: "8af98c56-5ed7-4e2b-a585-61fbdf6ace00",
    organizationId: organizationId("f502adce-4f15-4ea3-9f33-e6882a8f1100"),
    companyId: companyId("company-1"),
    jurisdiction: secondaryTaxJurisdiction(" ve "),
    scheme: secondaryTaxIdentifierScheme(" VAT "),
    value: secondaryTaxIdentifierValue(" AbC- 19 "),
    version: 2,
    createdAt: "2026-09-29T10:00:00.000Z",
    updatedAt: "2026-09-29T11:00:00.000Z",
  });

  assert.equal(row.jurisdiction, "VE");
  assert.equal(row.scheme, "vat");
  assert.equal(row.value, "AbC- 19");
  assert.ok(Object.isFrozen(row));
});

test("secondary identifier validation rejects invalid slots and unsafe values", () => {
  assert.throws(() => secondaryTaxJurisdiction("VEN"), { code: "COMPANY_SECONDARY_TAX_IDENTIFIER_INVALID" });
  assert.throws(() => secondaryTaxIdentifierScheme("Vat ID"), { code: "COMPANY_SECONDARY_TAX_IDENTIFIER_INVALID" });
  assert.throws(() => secondaryTaxIdentifierValue("\t"), { code: "COMPANY_SECONDARY_TAX_IDENTIFIER_INVALID" });
  assert.throws(() => secondaryTaxIdentifierValue("X".repeat(129)), { code: "COMPANY_SECONDARY_TAX_IDENTIFIER_INVALID" });
});
