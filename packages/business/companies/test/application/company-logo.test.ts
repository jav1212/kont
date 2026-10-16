import assert from "node:assert/strict";
import test from "node:test";
import { organizationId, userId } from "@kontave/organizations/domain";
import { CompanyCountry, CompanyFailure, type CompanyId, type CompanyLogoFile } from "../../src/domain";
import { CompanyAdministrationOperation, CompanyAdministrationPermission, SetCompanyLogo, type CompanyAdministrationAuthorization, type CompanyAdministrationRepository, type CompanyLogoStorage } from "../../src/application";
import { InMemoryCompanyAdministrationRepository } from "../../src/testing";

const organization = organizationId("11111111-1111-4111-8111-111111111111");
const actor = userId("actor-a");
const logo: CompanyLogoFile = { contentType: "image/png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) };
const uploadedUrl = "https://project.supabase.co/storage/v1/object/public/company-logos/11111111-1111-4111-8111-111111111111/636f6d70616e792d61/11111111-1111-4111-8111-111111111111.png";

const authorization: CompanyAdministrationAuthorization = { async assertCanManageCompanies() {} };

test("logo input permits only verified PNG, JPEG, or WebP headers up to 5 MiB", async () => {
  const repository = await seededRepository();
  await assert.rejects(
    () => new SetCompanyLogo(authorization, repository, repository, new RecordingStorage()).execute(command(repository.companies[0]!.id, { ...logo, bytes: new Uint8Array([1, 2, 3]) })),
    (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_LOGO_INVALID",
  );
  await assert.rejects(
    () => new SetCompanyLogo(authorization, repository, repository, new RecordingStorage()).execute(command(repository.companies[0]!.id, { ...logo, bytes: new Uint8Array(5 * 1024 * 1024 + 1).fill(1) })),
    (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_LOGO_INVALID",
  );
});

test("logo update requires companies.update, persists before deleting the former object, and returns its new version", async () => {
  const repository = await seededRepository();
  const storage = new RecordingStorage();
  const company = repository.companies[0]!;
  const updated = await new SetCompanyLogo(authorization, repository, repository, storage).execute(command(company.id, logo));
  assert.equal(updated.logoUrl, uploadedUrl);
  assert.equal(updated.version, 2);
  assert.deepEqual(storage.removed, []);
  await new SetCompanyLogo(authorization, repository, repository, storage).execute(command(company.id, null, 2));
  assert.deepEqual(storage.removed, [uploadedUrl]);
});

test("replacing or removing a legacy URL commits successfully when post-commit cleanup is unavailable", async () => {
  const repository = await seededRepository();
  const company = repository.companies[0]!;
  const legacyUrl = "https://legacy.example.com/logos/company-a.png";
  await repository.updateLogo({ actorUserId: actor, organizationId: organization, companyId: company.id, expectedVersion: 1, logoUrl: legacyUrl });
  const storage = new RecordingStorage(true);
  const logoUseCase = new SetCompanyLogo(authorization, repository, repository, storage);
  const replaced = await logoUseCase.execute(command(company.id, logo, 2));
  assert.equal(replaced.version, 3);
  assert.equal(replaced.logoUrl, uploadedUrl);
  const removed = await logoUseCase.execute(command(company.id, null, 3));
  assert.equal(removed.version, 4);
  assert.equal(removed.logoUrl, null);
  assert.deepEqual(storage.removed, [legacyUrl, uploadedUrl]);
});

test("authorization rejects a logo request before object storage receives an upload", async () => {
  const repository = await seededRepository();
  const storage = new RecordingStorage();
  const denied: CompanyAdministrationAuthorization = { async assertCanManageCompanies() { throw new CompanyFailure("COMPANY_ACCESS_DENIED", "Denied."); } };
  await assert.rejects(() => new SetCompanyLogo(denied, repository, repository, storage).execute(command(repository.companies[0]!.id, logo)));
  assert.deepEqual(storage.uploaded, []);
});

test("a stale or rejected RPC removes an uploaded object only after a verification read proves it was not persisted", async () => {
  const repository = await seededRepository();
  const storage = new RecordingStorage();
  const rejecting = { updateLogo: async () => { throw new CompanyFailure("COMPANY_VERSION_CONFLICT", "Stale."); } } as unknown as CompanyAdministrationRepository;
  await assert.rejects(
    () => new SetCompanyLogo(authorization, repository, rejecting, storage).execute(command(repository.companies[0]!.id, logo)),
    (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_VERSION_CONFLICT",
  );
  assert.deepEqual(storage.removed, [uploadedUrl]);
});

test("an uncertain RPC outcome retains the uploaded object when the verification read observes its URL", async () => {
  const repository = await seededRepository();
  const storage = new RecordingStorage();
  const persistedThenLost = {
    updateLogo: async (value: { readonly companyId: CompanyId; readonly expectedVersion: number; readonly logoUrl: string | null }) => {
      await repository.updateLogo({ actorUserId: actor, organizationId: organization, ...value });
      throw new CompanyFailure("COMPANY_REPOSITORY_UNAVAILABLE", "Reply was lost.");
    },
  } as unknown as CompanyAdministrationRepository;
  await assert.rejects(() => new SetCompanyLogo(authorization, repository, persistedThenLost, storage).execute(command(repository.companies[0]!.id, logo)));
  assert.deepEqual(storage.removed, []);
  assert.equal(repository.companies[0]!.logoUrl, uploadedUrl);
});

test("authorization contract names the dedicated logo operation and companies.update permission", async () => {
  const repository = await seededRepository();
  const calls: Array<[CompanyAdministrationOperation, CompanyAdministrationPermission]> = [];
  const recording: CompanyAdministrationAuthorization = { async assertCanManageCompanies(_scope, operation, permission) { calls.push([operation, permission]); } };
  await new SetCompanyLogo(recording, repository, repository, new RecordingStorage()).execute(command(repository.companies[0]!.id, logo));
  assert.deepEqual(calls, [[CompanyAdministrationOperation.SetLogo, CompanyAdministrationPermission.Update]]);
});

async function seededRepository(): Promise<InMemoryCompanyAdministrationRepository> {
  const repository = new InMemoryCompanyAdministrationRepository([], () => "company-a" as CompanyId);
  await repository.create({ actorUserId: actor, organizationId: organization, idempotencyKey: "create", legalName: "Company A", tradeName: null, taxId: null, country: CompanyCountry.Venezuela, operatingProfile: "standard", personNature: "juridical" });
  return repository;
}

function command(companyId: CompanyId, file: CompanyLogoFile | null, expectedVersion = 1) {
  return { actorUserId: actor, organizationId: organization, companyId, expectedVersion, file };
}

class RecordingStorage implements CompanyLogoStorage {
  readonly uploaded: string[] = [];
  readonly removed: string[] = [];
  constructor(private readonly failRemoval = false) {}
  async upload(): Promise<string> { this.uploaded.push(uploadedUrl); return uploadedUrl; }
  async remove(_scope: { readonly organizationId: ReturnType<typeof organizationId>; readonly companyId: CompanyId }, url: string): Promise<void> {
    this.removed.push(url);
    if (this.failRemoval) throw new Error("Storage cleanup unavailable.");
  }
}
