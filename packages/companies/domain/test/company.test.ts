import assert from "node:assert/strict";
import test from "node:test";
import { organizationId } from "@kontave/organizations-domain";
import { Company, CompanyCountry, CompanyStatus, companyId, taxId } from "../src/index.js";

test("company owns its legal and operational invariants", () => {
  const company = new Company({ id: companyId("id"), organizationId: organizationId("org"), legacyCompanyId: "J-29767818-2", legalName: " Cliente CA ", tradeName: null, taxId: taxId("J-29767818-2"), country: CompanyCountry.Venezuela, status: CompanyStatus.Active });
  assert.equal(company.legalName, "Cliente CA");
  assert.equal(company.suspend().status, CompanyStatus.Suspended);
});

test("legacy seven-digit Venezuelan tax identifiers are canonicalized", () => {
  assert.equal(taxId("j-3122611-0"), "J-03122611-0");
});

test("legacy Venezuelan tax identifier separators are canonicalized", () => {
  assert.equal(taxId("J31226110"), "J-03122611-0");
  assert.equal(taxId("J-03.122.611-0"), "J-03122611-0");
  assert.equal(taxId("j 03122611 0"), "J-03122611-0");
});

test("invalid Venezuelan tax identifiers remain rejected", () => {
  assert.throws(() => taxId("J-123-0"), /invalid/);
});
