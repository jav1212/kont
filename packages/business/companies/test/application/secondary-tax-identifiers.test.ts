import assert from "node:assert/strict";
import test from "node:test";
import { companyId, CompanyFailure, CompanySecondaryTaxIdentifier } from "../../src/domain";
import {
  CompanyAdministrationOperation,
  CompanyAdministrationPermission,
  GetCompanySecondaryTaxIdentifiers,
  RemoveCompanySecondaryTaxIdentifier,
  SetCompanySecondaryTaxIdentifier,
  type CompanyAdministrationAuthorization,
  type CompanySecondaryTaxIdentifierRepository,
  type CompanySecondaryTaxIdentifierScope,
  type RemoveCompanySecondaryTaxIdentifierCommand,
  type SetCompanySecondaryTaxIdentifierCommand,
} from "../../src/application";
import { organizationId, userId } from "@kontave/organizations/domain";

const scope: CompanySecondaryTaxIdentifierScope = {
  actorUserId: userId("actor"),
  organizationId: organizationId("organization"),
  companyId: companyId("company"),
};

const createIdentifier = (overrides: Partial<ConstructorParameters<typeof CompanySecondaryTaxIdentifier>[0]> = {}) => new CompanySecondaryTaxIdentifier({
  id: "87c33431-9bc4-4985-b5ac-641d6b912e17",
  organizationId: scope.organizationId,
  companyId: scope.companyId,
  jurisdiction: "VE",
  scheme: "vat",
  value: "ABC-19",
  version: 1,
  createdAt: "2026-09-29T10:00:00.000Z",
  updatedAt: "2026-09-29T10:00:00.000Z",
  ...overrides,
});

class MemoryRepository implements CompanySecondaryTaxIdentifierRepository {
  rows: CompanySecondaryTaxIdentifier[] = [];
  writes = 0;

  async list(): Promise<readonly CompanySecondaryTaxIdentifier[]> { return this.rows.filter((row) => row.companyId === scope.companyId); }

  async set(command: SetCompanySecondaryTaxIdentifierCommand): Promise<CompanySecondaryTaxIdentifier> {
    this.writes += 1;
    const index = this.rows.findIndex((row) => row.companyId === command.companyId && row.jurisdiction === command.jurisdiction && row.scheme === command.scheme);
    if (index < 0) {
      if (command.expectedVersion !== 0) throw new CompanyFailure("COMPANY_SECONDARY_TAX_IDENTIFIER_VERSION_CONFLICT", "stale");
      const saved = createIdentifier({ jurisdiction: command.jurisdiction, scheme: command.scheme, value: command.value, version: 1 });
      this.rows.push(saved);
      return saved;
    }
    const current = this.rows[index]!;
    if (command.expectedVersion !== current.version) {
      if (command.value === current.value) return current;
      throw new CompanyFailure("COMPANY_SECONDARY_TAX_IDENTIFIER_VERSION_CONFLICT", "stale");
    }
    const saved = createIdentifier({ jurisdiction: current.jurisdiction, scheme: current.scheme, value: command.value, version: current.version + 1 });
    this.rows.splice(index, 1, saved);
    return saved;
  }

  async remove(command: RemoveCompanySecondaryTaxIdentifierCommand): Promise<void> {
    this.writes += 1;
    const index = this.rows.findIndex((row) => row.companyId === command.companyId && row.jurisdiction === command.jurisdiction && row.scheme === command.scheme);
    if (index < 0) throw new CompanyFailure("COMPANY_SECONDARY_TAX_IDENTIFIER_NOT_FOUND", "missing");
    const current = this.rows[index]!;
    if (command.expectedVersion !== current.version) throw new CompanyFailure("COMPANY_SECONDARY_TAX_IDENTIFIER_VERSION_CONFLICT", "stale");
    this.rows.splice(index, 1);
    this.clearedValue = current.value;
  }
  clearedValue: string | null = null;
}

test("secondary identifier use cases require the right company permission and use independent slot revisions", async () => {
  const repository = new MemoryRepository();
  const permissions: string[] = [];
  const authorization: CompanyAdministrationAuthorization = {
    async assertCanManageCompanies(actualScope, operation, permission) {
      assert.equal(actualScope.organizationId, scope.organizationId);
      permissions.push(`${operation}:${permission}`);
    },
  };
  const set = new SetCompanySecondaryTaxIdentifier(authorization, repository);
  const command: SetCompanySecondaryTaxIdentifierCommand = {
    ...scope,
    jurisdiction: " ve ",
    scheme: " VAT ",
    value: "  ABC-19  ",
    expectedVersion: 0,
  };
  const created = await set.execute(command);
  assert.equal(created.version, 1);
  assert.equal(created.jurisdiction, "VE");
  assert.equal(created.scheme, "vat");
  assert.equal(created.value, "ABC-19");
  assert.equal((await set.execute(command)).version, 1);
  await assert.rejects(() => set.execute({ ...command, value: "Different" }), { code: "COMPANY_SECONDARY_TAX_IDENTIFIER_VERSION_CONFLICT" });

  const listed = await new GetCompanySecondaryTaxIdentifiers(authorization, repository).execute(scope);
  assert.equal(listed.length, 1);
  assert.deepEqual(permissions.slice(0, 3), [
    `${CompanyAdministrationOperation.ConfigureSecondaryTaxIdentifiers}:${CompanyAdministrationPermission.Update}`,
    `${CompanyAdministrationOperation.ConfigureSecondaryTaxIdentifiers}:${CompanyAdministrationPermission.Update}`,
    `${CompanyAdministrationOperation.ConfigureSecondaryTaxIdentifiers}:${CompanyAdministrationPermission.Update}`,
  ]);
  assert.equal(permissions[3], `${CompanyAdministrationOperation.ReadSecondaryTaxIdentifiers}:${CompanyAdministrationPermission.Read}`);
});

test("secondary identifier retirement validates revision and clears its value", async () => {
  const repository = new MemoryRepository();
  repository.rows = [createIdentifier()];
  const authorization: CompanyAdministrationAuthorization = { async assertCanManageCompanies() {} };
  await new RemoveCompanySecondaryTaxIdentifier(authorization, repository).execute({
    ...scope, jurisdiction: "VE", scheme: "vat", expectedVersion: 1,
  });
  assert.equal(repository.clearedValue, "ABC-19");
  assert.equal(repository.rows.length, 0);
  assert.equal((await new GetCompanySecondaryTaxIdentifiers(authorization, repository).execute(scope)).length, 0);
});

test("authorization and validation run before a secondary identifier write", async () => {
  const repository = new MemoryRepository();
  const denied: CompanyAdministrationAuthorization = {
    async assertCanManageCompanies() { throw new CompanyFailure("COMPANY_ACCESS_DENIED", "denied"); },
  };
  await assert.rejects(() => new SetCompanySecondaryTaxIdentifier(denied, repository).execute({
    ...scope, jurisdiction: "VE", scheme: "vat", value: "AB-1", expectedVersion: 0,
  }), { code: "COMPANY_ACCESS_DENIED" });
  await assert.rejects(() => new SetCompanySecondaryTaxIdentifier(denied, repository).execute({
    ...scope, jurisdiction: "VEN", scheme: "vat", value: "AB-1", expectedVersion: 0,
  }), { code: "COMPANY_SECONDARY_TAX_IDENTIFIER_INVALID" });
  assert.equal(repository.writes, 0);
});

test("set rejects a persistence response for another identifier slot", async () => {
  const repository = new MemoryRepository();
  repository.set = async () => createIdentifier({ scheme: "other_tax_id" });
  const authorization: CompanyAdministrationAuthorization = { async assertCanManageCompanies() {} };
  await assert.rejects(() => new SetCompanySecondaryTaxIdentifier(authorization, repository).execute({
    ...scope, jurisdiction: "VE", scheme: "vat", value: "AB-1", expectedVersion: 0,
  }), { code: "COMPANY_REPOSITORY_UNAVAILABLE" });
});
