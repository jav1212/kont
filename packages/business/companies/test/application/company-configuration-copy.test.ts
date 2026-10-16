import assert from "node:assert/strict";
import test from "node:test";
import { organizationId, userId } from "@kontave/organizations/domain";
import { currency } from "@kontave/monetary/domain";
import {
  CompanyConfigurationCopyOperation,
  CompanyAdministrationPermission,
  CopyCompanyConfigurationToExisting,
  CreateCompanyFromExisting,
  type CompanyConfigurationCopyAuthorization,
  type CompanyConfigurationCopyRepository,
} from "../../src/application";
import {
  Company,
  CompanyCountry,
  CompanyFailure,
  CompanyFiscalProfile,
  CompanyStatus,
  companyDateFormat,
  companyId,
  companyMonetaryPolicy,
  deriveCompanyConfigurationCopy,
  taxId,
} from "../../src/domain";

const actor = userId("actor-a");
const organization = organizationId("organization-a");
const sourceId = companyId("source-company");
const destinationId = companyId("destination-company");

function company(id: ReturnType<typeof companyId>, version: number, legalName = "Company"): Company {
  return new Company({
    id,
    organizationId: organization,
    legacyCompanyId: id,
    legalName,
    tradeName: null,
    taxId: null,
    country: CompanyCountry.Venezuela,
    status: CompanyStatus.Active,
    operatingProfile: "kiosk",
    personNature: "juridical",
    version,
  });
}

function selection() {
  return {
    sections: ["operating_profile", "date_format", "monetary_policy"] as const,
    expectedSourceDateFormatVersion: 3,
    expectedSourceMonetaryPolicyVersion: 4,
  };
}

test("the domain derives only selected typed settings and never legal identity or counters", () => {
  const source = company(sourceId, 8, "Source Legal Name");
  const result = deriveCompanyConfigurationCopy({
    company: source,
    dateFormat: companyDateFormat({ organizationId: organization, companyId: sourceId, version: 3, dateOrder: "year_first", configuredAt: "2026-09-30T00:00:00.000Z", configuredBy: actor }),
    monetaryPolicy: companyMonetaryPolicy({
      organizationId: organization, companyId: sourceId, version: 4,
      operatingCurrency: currency("VES", 2), referenceCurrencies: [currency("USD", 2)],
      rateSource: "bcv", roundingProfile: "commercial_v1", allowPreviousAvailableDate: false, maxPreviousDays: 0,
      configuredAt: "2026-09-30T00:00:00.000Z", configuredBy: actor,
    }),
    fiscalProfile: null,
  }, selection().sections);
  assert.deepEqual(result, {
    operatingProfile: "kiosk",
    dateOrder: "year_first",
    monetaryPolicySettings: {
      operatingCurrencyCode: "VES", operatingCurrencyMinorUnit: 2, referenceCurrencyCodes: ["USD"],
      rateSource: "bcv", roundingProfile: "commercial_v1", allowPreviousAvailableDate: false, maxPreviousDays: 0,
    },
  });
  assert.equal("taxId" in result, false);
  assert.equal("legalName" in result, false);
  assert.equal("salesInvoiceNextNumber" in result, false);
});

test("the domain rejects a selected setting that the source has not configured", () => {
  assert.throws(
    () => deriveCompanyConfigurationCopy({ company: company(sourceId, 1), dateFormat: null, monetaryPolicy: null, fiscalProfile: null }, ["date_format"]),
    failure("COMPANY_CONFIGURATION_SOURCE_SETTINGS_ABSENT"),
  );
});

test("the domain rejects a sidecar belonging to another company", () => {
  assert.throws(
    () => deriveCompanyConfigurationCopy({
      company: company(sourceId, 1),
      dateFormat: companyDateFormat({
        organizationId: organization, companyId: destinationId, version: 1,
        dateOrder: "day_first", configuredAt: "2026-09-30T00:00:00.000Z", configuredBy: actor,
      }),
      monetaryPolicy: null,
      fiscalProfile: null,
    }, ["date_format"]),
    failure("COMPANY_CONFIGURATION_COPY_INVALID"),
  );
});

test("fiscal configuration copies only address and taxpayer classification at the locked company revision", () => {
  const source = company(sourceId, 8, "Source Legal Name");
  const fiscalProfile = new CompanyFiscalProfile({
    companyId: sourceId, legalName: source.legalName, taxId: "J-12345678-9",
    personNature: "juridical", fiscalAddress: " Caracas ", taxpayerType: "especial", companyVersion: 8,
  });
  const result = deriveCompanyConfigurationCopy({
    company: source, dateFormat: null, monetaryPolicy: null, fiscalProfile,
  }, ["fiscal_profile"]);
  assert.deepEqual(result, { fiscalSettings: { fiscalAddress: "Caracas", taxpayerType: "especial" } });
  assert.equal("legalName" in result.fiscalSettings!, false);
  assert.equal("taxId" in result.fiscalSettings!, false);
  assert.equal("personNature" in result.fiscalSettings!, false);
  assert.throws(() => deriveCompanyConfigurationCopy({
    company: company(sourceId, 9), dateFormat: null, monetaryPolicy: null, fiscalProfile,
  }, ["fiscal_profile"]), failure("COMPANY_CONFIGURATION_COPY_INVALID"));
});

test("copy to an existing company authorizes both resources and passes all optimistic revisions atomically", async () => {
  const calls: Array<{ readonly companyId: string | null; readonly operation: string; readonly permission: string }> = [];
  const authorization: CompanyConfigurationCopyAuthorization = {
    async assertCanCopyCompanyConfiguration(scope, operation, permission) {
      calls.push({ companyId: scope.companyId, operation, permission });
    },
  };
  const persisted: Parameters<CompanyConfigurationCopyRepository["copyToExisting"]>[0][] = [];
  const repository: CompanyConfigurationCopyRepository = {
    async copyToExisting(command) {
      persisted.push(command);
      return { company: company(destinationId, 10, "Destination"), copiedSections: command.selection.sections };
    },
    async createFromExisting() { throw new Error("Unexpected creation"); },
  };
  const result = await new CopyCompanyConfigurationToExisting(authorization, repository).execute({
    actorUserId: actor, organizationId: organization, sourceCompanyId: sourceId, expectedSourceCompanyVersion: 8,
    destinationCompanyId: destinationId, expectedDestinationCompanyVersion: 9,
    expectedDestinationDateFormatVersion: 2, expectedDestinationMonetaryPolicyVersion: 5,
    idempotencyKey: " copy-existing-1 ", selection: selection(),
  });
  assert.equal(result.company.id, destinationId);
  assert.ok(persisted[0]);
  assert.equal(persisted[0].idempotencyKey, "copy-existing-1");
  assert.equal(persisted[0].expectedSourceCompanyVersion, 8);
  assert.equal(persisted[0].expectedDestinationCompanyVersion, 9);
  assert.deepEqual(calls, [
    { companyId: sourceId, operation: CompanyConfigurationCopyOperation.ReadSource, permission: CompanyAdministrationPermission.Read },
    { companyId: destinationId, operation: CompanyConfigurationCopyOperation.CopyToExisting, permission: CompanyAdministrationPermission.Update },
  ]);
});

test("creation uses a supplied destination identity and authorizes source read plus destination create", async () => {
  const calls: Array<{ readonly companyId: string | null; readonly operation: string; readonly permission: string }> = [];
  const authorization: CompanyConfigurationCopyAuthorization = {
    async assertCanCopyCompanyConfiguration(scope, operation, permission) {
      calls.push({ companyId: scope.companyId, operation, permission });
    },
  };
  const persisted: Parameters<CompanyConfigurationCopyRepository["createFromExisting"]>[0][] = [];
  const createdId = companyId("created-company");
  const repository: CompanyConfigurationCopyRepository = {
    async copyToExisting() { throw new Error("Unexpected existing copy"); },
    async createFromExisting(command) {
      persisted.push(command);
      return { company: company(createdId, 1, command.target.legalName), copiedSections: command.selection.sections };
    },
  };
  const result = await new CreateCompanyFromExisting(authorization, repository).execute({
    actorUserId: actor, organizationId: organization, sourceCompanyId: sourceId, expectedSourceCompanyVersion: 8,
    idempotencyKey: "create-from-existing-1", selection: selection(),
    target: { legalName: " Target Legal Name ", tradeName: " Target Trade ", taxId: taxId("J-29767818-2"), country: CompanyCountry.Venezuela, personNature: "juridical" },
  });
  assert.equal(result.company.id, createdId);
  assert.ok(persisted[0]);
  assert.equal(persisted[0].target.legalName, "Target Legal Name");
  assert.equal(persisted[0].target.tradeName, "Target Trade");
  assert.deepEqual(calls, [
    { companyId: sourceId, operation: CompanyConfigurationCopyOperation.ReadSource, permission: CompanyAdministrationPermission.Read },
    { companyId: null, operation: CompanyConfigurationCopyOperation.CreateFromExisting, permission: CompanyAdministrationPermission.Create },
  ]);
});

test("copy commands reject ambiguous selections, absent expected revisions, and a same-company destination", async () => {
  const authorization: CompanyConfigurationCopyAuthorization = { async assertCanCopyCompanyConfiguration() {} };
  const repository: CompanyConfigurationCopyRepository = {
    async copyToExisting() { throw new Error("Unexpected persistence"); },
    async createFromExisting() { throw new Error("Unexpected persistence"); },
  };
  const useCase = new CopyCompanyConfigurationToExisting(authorization, repository);
  const base = {
    actorUserId: actor, organizationId: organization, sourceCompanyId: sourceId, expectedSourceCompanyVersion: 1,
    destinationCompanyId: destinationId, expectedDestinationCompanyVersion: 1, idempotencyKey: "copy-validation",
  };
  await assert.rejects(() => useCase.execute({ ...base, selection: { sections: ["date_format"] } }), failure("COMPANY_CONFIGURATION_COPY_INVALID"));
  await assert.rejects(() => useCase.execute({ ...base, selection: { sections: ["operating_profile", "operating_profile"] } }), failure("COMPANY_CONFIGURATION_COPY_INVALID"));
  await assert.rejects(() => useCase.execute({ ...base, destinationCompanyId: sourceId, selection: { sections: ["operating_profile"] } }), failure("COMPANY_CONFIGURATION_COPY_INVALID"));
});

function failure(code: string) {
  return (error: unknown) => error instanceof CompanyFailure && error.code === code;
}
