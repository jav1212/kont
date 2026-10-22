import assert from "node:assert/strict";
import test from "node:test";
import { organizationId } from "@kontave/organizations/domain";
import { Company, CompanyCountry, CompanyFailure, CompanyStatus, companyId, documentSeriesNextNumber, taxId } from "../../src/domain";

test("company owns its legal and operational invariants", () => {
  const company = new Company({ id: companyId("id"), organizationId: organizationId("org"), legacyCompanyId: "J-29767818-2", legalName: " Cliente CA ", tradeName: null, taxId: taxId("J-29767818-2"), country: CompanyCountry.Venezuela, status: CompanyStatus.Active, version: 1 });
  assert.equal(company.legalName, "Cliente CA");
  assert.equal(company.suspend().status, CompanyStatus.Suspended);
  assert.equal(company.operatingProfile, "standard");
});

test("company preserves a kiosk operating profile independently from its status", () => {
  const company = new Company({ id: companyId("id"), organizationId: organizationId("org"), legacyCompanyId: null, legalName: "Kiosco", tradeName: null, taxId: null, country: CompanyCountry.Venezuela, status: CompanyStatus.Active, operatingProfile: "kiosk", version: 1 });
  assert.equal(company.operatingProfile, "kiosk");
  assert.equal(company.suspend().operatingProfile, "kiosk");
});

test("person nature is explicit and historical companies remain unclassified", () => {
  const legacy = new Company({ id: companyId("legacy"), organizationId: organizationId("org"), legacyCompanyId: null, legalName: "Legacy", tradeName: null, taxId: null, country: CompanyCountry.Venezuela, status: CompanyStatus.Active });
  const juridical = new Company({ id: companyId("new"), organizationId: organizationId("org"), legacyCompanyId: null, legalName: "New", tradeName: null, taxId: null, country: CompanyCountry.Venezuela, status: CompanyStatus.Active, personNature: "juridical" });
  assert.equal(legacy.personNature, null);
  assert.equal(juridical.personNature, "juridical");
  assert.throws(() => new Company({ id: companyId("invalid"), organizationId: organizationId("org"), legacyCompanyId: null, legalName: "Invalid", tradeName: null, taxId: null, country: CompanyCountry.Venezuela, status: CompanyStatus.Active, personNature: "government" as never }), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_INVALID");
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

test("document counters reject values truncated by the deployed eight-digit formatter", () => {
  assert.equal(documentSeriesNextNumber(99_999_999), 99_999_999);
  for (const value of [100_000_000, 2_147_483_646, 0, -1, 1.5, NaN]) {
    assert.throws(() => documentSeriesNextNumber(value),
      (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_DOCUMENT_NUMBER_INVALID");
  }
});
