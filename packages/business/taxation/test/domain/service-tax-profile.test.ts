import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import {
  ServiceTaxProfile,
  TaxationFailure,
  serviceTaxProfileId,
  taxCode,
  taxationDate,
} from "../../src/domain";

const IVA = taxCode("IVA");

test("service tax profile resolves the classification in effect on the operation date", () => {
  const profile = serviceProfile([
    { taxCode: IVA, treatment: "exempt", effectiveFrom: taxationDate("2026-01-01"), effectiveTo: taxationDate("2026-06-30"), legalBasis: "Exemption", classificationVersion: "v1" },
    { taxCode: IVA, treatment: "taxed", effectiveFrom: taxationDate("2026-07-01"), effectiveTo: null, legalBasis: "IVA general", classificationVersion: "v2" },
  ]);

  assert.equal(profile.assignmentAt(IVA, "2026-03-01").treatment, "exempt");
  assert.equal(profile.assignmentAt(IVA, "2026-09-27").treatment, "taxed");
});

test("service tax profile rejects overlapping assignments for the same tax", () => {
  assert.throws(() => serviceProfile([
    { taxCode: IVA, treatment: "exempt", effectiveFrom: taxationDate("2026-01-01"), effectiveTo: null, legalBasis: "Exemption", classificationVersion: "v1" },
    { taxCode: IVA, treatment: "taxed", effectiveFrom: taxationDate("2026-02-01"), effectiveTo: null, legalBasis: "IVA general", classificationVersion: "v2" },
  ]), (error: unknown) => error instanceof TaxationFailure && error.code === "TAXATION_ASSIGNMENT_OVERLAP");
});

function serviceProfile(assignments: ConstructorParameters<typeof ServiceTaxProfile>[0]["assignments"]): ServiceTaxProfile {
  return new ServiceTaxProfile({
    id: serviceTaxProfileId("service-profile-1"),
    companyId: companyId("company-1"),
    serviceCode: "SERV-CONSULTING",
    unitCode: "E48",
    jurisdiction: "ve",
    assignments,
    version: 1,
  });
}
