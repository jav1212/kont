import assert from "node:assert/strict";
import test from "node:test";
import { organizationId, userId } from "@kontave/organizations/domain";
import {
  ConfigureCompanyFiscalProfile,
  GetCompanyFiscalProfile,
  type CompanyAdministrationAuthorization,
  type CompanyFiscalProfileRepository,
} from "../../src/application";
import { CompanyFailure, CompanyFiscalProfile, companyId } from "../../src/domain";

const actor = userId("actor-a");
const organization = organizationId("organization-a");
const company = companyId("company-a");

function profile(version = 7): CompanyFiscalProfile {
  return new CompanyFiscalProfile({
    companyId: company, legalName: "Empresa Antigua CA", taxId: "J29767818-2",
    personNature: null, fiscalAddress: "Avenida Principal", taxpayerType: "ordinario", companyVersion: version,
  });
}

function command(overrides: Partial<Parameters<ConfigureCompanyFiscalProfile["execute"]>[0]> = {}) {
  return {
    actorUserId: actor, organizationId: organization, companyId: company,
    expectedCompanyVersion: 7, idempotencyKey: "fiscal-1", reason: "Actualizar domicilio fiscal",
    fiscalAddress: " Avenida Principal ", taxpayerType: "especial" as const, ...overrides,
  };
}

test("fiscal profile exposes legacy RIF context without normalizing it and uses read/update permissions", async () => {
  const calls: unknown[][] = [];
  const authorization: CompanyAdministrationAuthorization = {
    async assertCanManageCompanies(...args) { calls.push(args); },
  };
  const repository: CompanyFiscalProfileRepository = {
    async get() { return profile(); },
    async configure() { return profile(8); },
  };
  const loaded = await new GetCompanyFiscalProfile(authorization, repository).execute({ actorUserId: actor, organizationId: organization, companyId: company });
  assert.equal(loaded.taxId, "J29767818-2");
  const saved = await new ConfigureCompanyFiscalProfile(authorization, repository).execute(command());
  assert.equal(saved.companyVersion, 8);
  assert.deepEqual(calls.map((call) => call.slice(1)), [["read_fiscal_profile", "companies.read"], ["configure_fiscal_profile", "companies.update"]]);
});

test("fiscal profile normalizes only mutable input and rejects values the RPC rejects", async () => {
  let received: Parameters<CompanyFiscalProfileRepository["configure"]>[0] | undefined;
  const repository: CompanyFiscalProfileRepository = {
    async get() { return profile(); },
    async configure(value) { received = value; return profile(8); },
  };
  const allow: CompanyAdministrationAuthorization = { async assertCanManageCompanies() {} };
  await new ConfigureCompanyFiscalProfile(allow, repository).execute(command());
  assert.equal(received?.fiscalAddress, "Avenida Principal");
  assert.equal(received?.reason, "Actualizar domicilio fiscal");
  for (const partial of [
    { expectedCompanyVersion: 0 }, { fiscalAddress: " " }, { fiscalAddress: "A\u0000B" },
    { taxpayerType: "exento" as never }, { idempotencyKey: " ".repeat(129) }, { reason: "A\nB" },
  ]) {
    await assert.rejects(() => new ConfigureCompanyFiscalProfile(allow, repository).execute(command(partial)), failure("COMPANY_FISCAL_PROFILE_INVALID"));
  }
  await new ConfigureCompanyFiscalProfile(allow, repository).execute(command({ fiscalAddress: null, idempotencyKey: "clear-1" }));
  assert.equal(received?.fiscalAddress, null);
});

test("fiscal profile authorizes before persistence and rejects a response outside its company scope", async () => {
  let persisted = false;
  const denied: CompanyAdministrationAuthorization = {
    async assertCanManageCompanies() { throw new CompanyFailure("COMPANY_ACCESS_DENIED", "Denied."); },
  };
  const repository: CompanyFiscalProfileRepository = {
    async get() { persisted = true; return profile(); },
    async configure() { persisted = true; return profile(); },
  };
  await assert.rejects(() => new GetCompanyFiscalProfile(denied, repository).execute({ actorUserId: actor, organizationId: organization, companyId: company }), failure("COMPANY_ACCESS_DENIED"));
  await assert.rejects(() => new ConfigureCompanyFiscalProfile(denied, repository).execute(command()), failure("COMPANY_ACCESS_DENIED"));
  assert.equal(persisted, false);
  const escaped: CompanyFiscalProfileRepository = {
    async get() { return new CompanyFiscalProfile({ ...profile(), companyId: companyId("other-company") }); },
    async configure() { return profile(); },
  };
  const allow: CompanyAdministrationAuthorization = { async assertCanManageCompanies() {} };
  await assert.rejects(() => new GetCompanyFiscalProfile(allow, escaped).execute({ actorUserId: actor, organizationId: organization, companyId: company }), failure("COMPANY_OUTSIDE_ORGANIZATION"));
});

function failure(code: string) {
  return (error: unknown) => error instanceof CompanyFailure && error.code === code;
}
