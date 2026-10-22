import assert from "node:assert/strict";
import test from "node:test";
import { organizationId, userId } from "@kontave/organizations/domain";
import { ActivateCompany, CompanyAdministrationOperation, CompanyAdministrationPermission, CreateCompany, GetCompanyDocumentNumberingSettings, SetCompanyPersonNature, SuspendCompany, UpdateCompany, UpdateCompanyDocumentNumberingSettings, type CompanyAdministrationAuthorization } from "../../src/application";
import { CompanyCountry, CompanyFailure, CompanyStatus, companyId, taxId } from "../../src/domain";
import { InMemoryCompanyAdministrationRepository } from "../../src/testing";

const organization = organizationId("organization-a");
const actor = userId("actor-a");
const authorization: CompanyAdministrationAuthorization = { async assertCanManageCompanies() {} };
function createCommand(key = "request-1") { return { actorUserId: actor, organizationId: organization, idempotencyKey: key, legalName: " Acme CA ", tradeName: " Acme ", taxId: taxId("J-29767818-2"), country: CompanyCountry.Venezuela, operatingProfile: "standard" as const, personNature: "juridical" as const }; }

test("create is idempotent for the same actor and normalized intent", async () => {
  const repository = new InMemoryCompanyAdministrationRepository(); const useCase = new CreateCompany(authorization, repository);
  const first = await useCase.execute(createCommand()); const replay = await useCase.execute(createCommand());
  assert.notEqual(first.id, "J-29767818-2"); assert.equal(replay, first); assert.equal(repository.companies.length, 1);
});

test("idempotency keys cannot be reused by another actor or request", async () => {
  const repository = new InMemoryCompanyAdministrationRepository(); const useCase = new CreateCompany(authorization, repository);
  await useCase.execute(createCommand());
  await assert.rejects(() => useCase.execute({ ...createCommand(), legalName: "Different" }), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_IDEMPOTENCY_CONFLICT");
  await assert.rejects(() => useCase.execute({ ...createCommand(), personNature: "natural" }), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_IDEMPOTENCY_CONFLICT");
  await assert.rejects(() => useCase.execute({ ...createCommand(), actorUserId: userId("actor-b") }), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_IDEMPOTENCY_CONFLICT");
});

test("create normalizes tax identifiers before forming an idempotent intent", async () => {
  const repository = new InMemoryCompanyAdministrationRepository();
  const useCase = new CreateCompany(authorization, repository);
  const legacyForm = { ...createCommand(), taxId: "j31226110" as ReturnType<typeof taxId> };
  const canonicalForm = { ...legacyForm, taxId: taxId("J-03122611-0") };
  const first = await useCase.execute(legacyForm);
  const replay = await useCase.execute(canonicalForm);
  assert.equal(first.taxId, "J-03122611-0");
  assert.equal(replay, first);
});

test("administrative updates preserve organization isolation and reject stale writes", async () => {
  const repository = new InMemoryCompanyAdministrationRepository(); const company = await repository.create(createCommand()); const update = new UpdateCompany(authorization, repository);
  const changed = await update.execute({ actorUserId: actor, organizationId: organization, companyId: company.id, expectedVersion: 1, legalName: "Acme Updated" });
  assert.equal(changed.version, 2); assert.equal(changed.legalName, "Acme Updated");
  await assert.rejects(() => update.execute({ actorUserId: actor, organizationId: organization, companyId: company.id, expectedVersion: 1, tradeName: "Late" }), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_VERSION_CONFLICT");
  await assert.rejects(() => update.execute({ actorUserId: actor, organizationId: organizationId("organization-b"), companyId: company.id, expectedVersion: 2, tradeName: "Cross tenant" }), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_NOT_FOUND");
});

test("person nature is explicitly classified with authorization and optimistic concurrency", async () => {
  const operations: Array<[CompanyAdministrationOperation, CompanyAdministrationPermission]> = [];
  const recording: CompanyAdministrationAuthorization = { async assertCanManageCompanies(_scope, operation, permission) { operations.push([operation, permission]); } };
  const repository = new InMemoryCompanyAdministrationRepository();
  const company = await repository.create(createCommand());
  const changed = await new SetCompanyPersonNature(recording, repository).execute({ actorUserId: actor, organizationId: organization, companyId: company.id, expectedVersion: company.version, personNature: "natural" });
  assert.equal(changed.personNature, "natural");
  assert.equal(changed.version, 2);
  assert.deepEqual(operations, [[CompanyAdministrationOperation.Update, CompanyAdministrationPermission.Update]]);
  await assert.rejects(() => new SetCompanyPersonNature(recording, repository).execute({ actorUserId: actor, organizationId: organization, companyId: company.id, expectedVersion: 1, personNature: "juridical" }), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_VERSION_CONFLICT");
});

test("person nature cannot be inferred or assigned an unsupported value", async () => {
  const repository = new InMemoryCompanyAdministrationRepository();
  await assert.rejects(() => new CreateCompany(authorization, repository).execute({ ...createCommand(), personNature: "government" as never }), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_INVALID");
  assert.equal(repository.companies.length, 0);
});

test("update normalizes a tax identifier before it reaches persistence", async () => {
  const repository = new InMemoryCompanyAdministrationRepository();
  const company = await repository.create({ ...createCommand(), taxId: null });
  const updated = await new UpdateCompany(authorization, repository).execute({
    actorUserId: actor,
    organizationId: organization,
    companyId: company.id,
    expectedVersion: 1,
    taxId: "j31226110" as ReturnType<typeof taxId>,
  });
  assert.equal(updated.taxId, "J-03122611-0");
});

test("lifecycle transitions are durable candidates with version checking", async () => {
  const repository = new InMemoryCompanyAdministrationRepository(); const company = await repository.create(createCommand()); const suspend = new SuspendCompany(authorization, repository); const activate = new ActivateCompany(authorization, repository);
  const suspended = await suspend.execute({ actorUserId: actor, organizationId: organization, companyId: company.id, expectedVersion: 1 }); assert.equal(suspended.status, CompanyStatus.Suspended); assert.equal(suspended.version, 2);
  const active = await activate.execute({ actorUserId: actor, organizationId: organization, companyId: company.id, expectedVersion: 2 }); assert.equal(active.status, CompanyStatus.Active); assert.equal(active.version, 3);
  await assert.rejects(() => activate.execute({ actorUserId: actor, organizationId: organization, companyId: company.id, expectedVersion: 3 }), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_TRANSITION_INVALID");
});

test("authorization runs before a write port receives mutations", async () => {
  const repository = new InMemoryCompanyAdministrationRepository(); const denied: CompanyAdministrationAuthorization = { async assertCanManageCompanies() { throw new CompanyFailure("COMPANY_ACCESS_DENIED", "Denied."); } };
  await assert.rejects(() => new CreateCompany(denied, repository).execute(createCommand()), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_ACCESS_DENIED"); assert.equal(repository.companies.length, 0);
});

test("authorization receives the permission required by each operation", async () => {
  const operations: Array<{ readonly operation: CompanyAdministrationOperation; readonly permission: CompanyAdministrationPermission }> = [];
  const recordingAuthorization: CompanyAdministrationAuthorization = {
    async assertCanManageCompanies(_scope, operation, permission) { operations.push({ operation, permission }); },
  };
  const repository = new InMemoryCompanyAdministrationRepository();
  const company = await new CreateCompany(recordingAuthorization, repository).execute(createCommand());
  const updated = await new UpdateCompany(recordingAuthorization, repository).execute({ actorUserId: actor, organizationId: organization, companyId: company.id, expectedVersion: 1, tradeName: "Changed" });
  const suspended = await new SuspendCompany(recordingAuthorization, repository).execute({ actorUserId: actor, organizationId: organization, companyId: updated.id, expectedVersion: 2 });
  await new ActivateCompany(recordingAuthorization, repository).execute({ actorUserId: actor, organizationId: organization, companyId: suspended.id, expectedVersion: 3 });
  assert.deepEqual(operations, [
    { operation: CompanyAdministrationOperation.Create, permission: CompanyAdministrationPermission.Create },
    { operation: CompanyAdministrationOperation.Update, permission: CompanyAdministrationPermission.Update },
    { operation: CompanyAdministrationOperation.Suspend, permission: CompanyAdministrationPermission.Update },
    { operation: CompanyAdministrationOperation.Activate, permission: CompanyAdministrationPermission.Update },
  ]);
});

test("a canonical tax identifier is unique only inside its organization", async () => {
  const repository = new InMemoryCompanyAdministrationRepository();
  const create = new CreateCompany(authorization, repository);
  await create.execute(createCommand());
  await assert.rejects(() => create.execute(createCommand("duplicate")), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_ALREADY_EXISTS");
  const otherOrganization = await create.execute({ ...createCommand("other-org"), organizationId: organizationId("organization-b") });
  assert.equal(otherOrganization.organizationId, organizationId("organization-b"));
});

test("updating a tax identifier releases its prior value and rejects another current owner", async () => {
  const repository = new InMemoryCompanyAdministrationRepository();
  const create = new CreateCompany(authorization, repository);
  const first = await create.execute(createCommand("first"));
  const second = await create.execute({ ...createCommand("second"), taxId: taxId("J-03122611-0") });
  const update = new UpdateCompany(authorization, repository);
  await assert.rejects(() => update.execute({ actorUserId: actor, organizationId: organization, companyId: second.id, expectedVersion: 1, taxId: first.taxId }), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_ALREADY_EXISTS");
  const changed = await update.execute({ actorUserId: actor, organizationId: organization, companyId: first.id, expectedVersion: 1, taxId: taxId("J-12345678-9") });
  const reused = await update.execute({ actorUserId: actor, organizationId: organization, companyId: second.id, expectedVersion: 1, taxId: taxId("J-29767818-2") });
  assert.equal(changed.taxId, "J-12345678-9");
  assert.equal(reused.taxId, "J-29767818-2");
});

test("creation rejects idempotency keys longer than the SQL contract allows", async () => {
  const repository = new InMemoryCompanyAdministrationRepository();
  await assert.rejects(() => new CreateCompany(authorization, repository).execute(createCommand("a".repeat(129))), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_INVALID");
});

test("company numbering reads and monotonic updates use the existing company version", async () => {
  const repository = new InMemoryCompanyAdministrationRepository();
  const company = await new CreateCompany(authorization, repository).execute(createCommand());
  const scope = { actorUserId: actor, organizationId: organization, companyId: company.id, expectedVersion: 1 };
  const initial = await new GetCompanyDocumentNumberingSettings(authorization, repository).execute(scope);
  assert.deepEqual(initial, { salesInvoiceNextNumber: 1, deliveryNoteNextNumber: 1, companyVersion: 1 });
  const changed = await new UpdateCompanyDocumentNumberingSettings(authorization, repository).execute({ ...scope, salesInvoiceNextNumber: 30, deliveryNoteNextNumber: 12 });
  assert.deepEqual(changed, { salesInvoiceNextNumber: 30, deliveryNoteNextNumber: 12, companyVersion: 2 });
  await assert.rejects(() => new UpdateCompanyDocumentNumberingSettings(authorization, repository).execute({ ...scope, salesInvoiceNextNumber: 10 }), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_VERSION_CONFLICT");
  await assert.rejects(() => new UpdateCompanyDocumentNumberingSettings(authorization, repository).execute({ ...scope, expectedVersion: 2, salesInvoiceNextNumber: 20 }), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_DOCUMENT_NUMBER_REWIND");
});

test("numbering configuration validates positive integer counters and authorization", async () => {
  const repository = new InMemoryCompanyAdministrationRepository();
  const company = await new CreateCompany(authorization, repository).execute(createCommand());
  const scope = { actorUserId: actor, organizationId: organization, companyId: company.id, expectedVersion: 1 };
  await assert.rejects(() => new UpdateCompanyDocumentNumberingSettings(authorization, repository).execute({ ...scope, deliveryNoteNextNumber: 0 }), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_DOCUMENT_NUMBER_INVALID");
  const seen: CompanyAdministrationOperation[] = [];
  const recording: CompanyAdministrationAuthorization = { async assertCanManageCompanies(_scope, operation) { seen.push(operation); } };
  await new GetCompanyDocumentNumberingSettings(recording, repository).execute(scope);
  await new UpdateCompanyDocumentNumberingSettings(recording, repository).execute({ ...scope, salesInvoiceNextNumber: 2 });
  assert.deepEqual(seen, [CompanyAdministrationOperation.ConfigureDocumentNumbering, CompanyAdministrationOperation.ConfigureDocumentNumbering]);
});

test("company identifiers reject an empty value", () => { assert.throws(() => companyId(" "), /invalid/); });
