import assert from "node:assert/strict";
import test from "node:test";
import { organizationId } from "@kontave/organizations-domain";
import { Company, CompanyCountry, CompanyStatus, companyId, taxId } from "../src/index.js";

test("company owns its legal and operational invariants", () => {
  const company = new Company({ id: companyId("id"), organizationId: organizationId("org"), legacyCompanyId: "J-29767818-2", legalName: " Cliente CA ", tradeName: null, taxId: taxId("J-29767818-2"), country: CompanyCountry.Venezuela, status: CompanyStatus.Active });
  assert.equal(company.legalName, "Cliente CA");
  assert.equal(company.suspend().status, CompanyStatus.Suspended);
});
