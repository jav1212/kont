import assert from "node:assert/strict";
import test from "node:test";
import {
  companyId,
  organizationId,
  type OrganizationCompany,
  userId,
} from "../../src/domain";
import {
  CreateOrganizationalUser,
  GetOrganizationalUser,
  ListOrganizationalUsers,
  RequireOrganizationalCompanyAccess,
  RevokeOrganizationalUser,
  UpdateOrganizationalUser,
  type OrganizationalCompanyDirectory,
  type OrganizationalCompanyLookup,
  type OrganizationalUserRepository,
  type UserAdministrationAuthorizer,
  type UserIdentityDirectory,
} from "../../src/application";
import { InMemoryOrganizationalUserRepository } from "../../src/testing";

const orgA = organizationId("org-a");
const orgB = organizationId("org-b");
const actor = userId("actor");
const subject = userId("subject");
const foreignSubject = userId("shared-subject");
const companyA = companyId("company-a");
const companyB = companyId("company-b");
const companies: OrganizationCompany[] = [
  {
    id: companyA,
    organizationId: orgA,
    name: "A",
    rif: null,
    logoUrl: null,
    operatingProfile: "standard",
  },
];
const identities: UserIdentityDirectory = {
  async findById(id) {
    return id === subject || id === foreignSubject
      ? { id, email: `${id}@example.com`, displayName: "User" }
      : null;
  },
};
const companyDirectory: OrganizationalCompanyDirectory = {
  async listCompanies(id) {
    return companies.filter((company) => company.organizationId === id);
  },
};
const companyLookup: OrganizationalCompanyLookup = {
  ...companyDirectory,
  async findCompany(organizationIdValue, companyIdValue) {
    return (
      companies.find(
        (company) =>
          company.organizationId === organizationIdValue &&
          company.id === companyIdValue,
      ) ?? null
    );
  },
};
const allowed: UserAdministrationAuthorizer = {
  async authorizeUserAdministration(_actor, organizationIdValue) {
    return {
      organizationId: organizationIdValue,
      maximumAssignablePriority: 10,
    };
  },
};

test("creates an organization-local user only after trusted authorization and validates company tenancy", async () => {
  const repository = new InMemoryOrganizationalUserRepository();
  const create = new CreateOrganizationalUser(
    repository,
    identities,
    companyDirectory,
    allowed,
  );
  const result = await create.execute({
    actorUserId: actor,
    organizationId: orgA,
    userId: subject,
    administrativePriority: 4,
    allowedCompanyIds: [companyA],
  });
  assert.equal(result.organizationId, orgA);
  assert.deepEqual(result.allowedCompanyIds, [companyA]);
  await assert.rejects(
    () =>
      create.execute({
        actorUserId: actor,
        organizationId: orgA,
        userId: foreignSubject,
        administrativePriority: 4,
        allowedCompanyIds: [companyB],
      }),
    { code: "ORGANIZATIONAL_USER_COMPANY_INVALID" },
  );
});

test("administrative priority cannot become a privilege-escalation path", async () => {
  const repository = new InMemoryOrganizationalUserRepository();
  const create = new CreateOrganizationalUser(
    repository,
    identities,
    companyDirectory,
    allowed,
  );
  await assert.rejects(
    () =>
      create.execute({
        actorUserId: actor,
        organizationId: orgA,
        userId: subject,
        administrativePriority: 11,
        allowedCompanyIds: [],
      }),
    { code: "ORGANIZATIONAL_USER_PRIORITY_ESCALATION" },
  );
});

test("updates use compare-and-swap versions", async () => {
  const repository = new InMemoryOrganizationalUserRepository();
  const create = new CreateOrganizationalUser(
    repository,
    identities,
    companyDirectory,
    allowed,
  );
  await create.execute({
    actorUserId: actor,
    organizationId: orgA,
    userId: subject,
    administrativePriority: 2,
    allowedCompanyIds: [],
  });
  const update = new UpdateOrganizationalUser(
    repository,
    companyDirectory,
    allowed,
  );
  const changed = await update.execute({
    actorUserId: actor,
    organizationId: orgA,
    userId: subject,
    expectedVersion: 1,
    changes: { administrativePriority: 3 },
  });
  assert.equal(changed.version, 2);
  await assert.rejects(
    () =>
      update.execute({
        actorUserId: actor,
        organizationId: orgA,
        userId: subject,
        expectedVersion: 1,
        changes: { administrativePriority: 4 },
      }),
    { code: "ORGANIZATIONAL_USER_VERSION_CONFLICT" },
  );
});

test("selection cannot cross tenant boundaries and revocation preserves a shared identity for another organization", async () => {
  const repository = new InMemoryOrganizationalUserRepository();
  const create = new CreateOrganizationalUser(
    repository,
    identities,
    companyDirectory,
    allowed,
  );
  await create.execute({
    actorUserId: actor,
    organizationId: orgA,
    userId: foreignSubject,
    administrativePriority: 1,
    allowedCompanyIds: [],
  });
  await create.execute({
    actorUserId: actor,
    organizationId: orgB,
    userId: foreignSubject,
    administrativePriority: 1,
    allowedCompanyIds: [],
  });
  const select = new GetOrganizationalUser(repository, allowed);
  await assert.rejects(
    () =>
      select.execute({
        actorUserId: actor,
        organizationId: orgA,
        userId: subject,
      }),
    { code: "ORGANIZATIONAL_USER_NOT_FOUND" },
  );
  await new RevokeOrganizationalUser(repository, allowed).execute({
    actorUserId: actor,
    organizationId: orgA,
    userId: foreignSubject,
    expectedVersion: 1,
  });
  assert.equal(
    (
      await select.execute({
        actorUserId: actor,
        organizationId: orgB,
        userId: foreignSubject,
      })
    ).userId,
    foreignSubject,
  );
});

test("company access requires an active assignment and an explicit permitted-company entry", async () => {
  const repository = new InMemoryOrganizationalUserRepository();
  const create = new CreateOrganizationalUser(
    repository,
    identities,
    companyDirectory,
    allowed,
  );
  await create.execute({
    actorUserId: actor,
    organizationId: orgA,
    userId: subject,
    administrativePriority: 1,
    allowedCompanyIds: [],
  });
  const access = new RequireOrganizationalCompanyAccess(
    repository,
    companyLookup,
  );
  await assert.rejects(() => access.execute(subject, orgA, companyA), {
    code: "ORGANIZATIONAL_USER_ACCESS_DENIED",
  });
  await new UpdateOrganizationalUser(
    repository,
    companyDirectory,
    allowed,
  ).execute({
    actorUserId: actor,
    organizationId: orgA,
    userId: subject,
    expectedVersion: 1,
    changes: { allowedCompanyIds: [companyA] },
  });
  assert.equal((await access.execute(subject, orgA, companyA)).id, companyA);
  await new RevokeOrganizationalUser(repository, allowed).execute({
    actorUserId: actor,
    organizationId: orgA,
    userId: subject,
    expectedVersion: 2,
  });
  await assert.rejects(() => access.execute(subject, orgA, companyA), {
    code: "ORGANIZATIONAL_USER_ACCESS_DENIED",
  });
});

test("company access rejects foreign rows and listing rejects cross-tenant repository leaks", async () => {
  const repository = new InMemoryOrganizationalUserRepository();
  const create = new CreateOrganizationalUser(
    repository,
    identities,
    companyDirectory,
    allowed,
  );
  await create.execute({
    actorUserId: actor,
    organizationId: orgA,
    userId: subject,
    administrativePriority: 1,
    allowedCompanyIds: [companyA],
  });
  const foreignLookup: OrganizationalCompanyLookup = {
    ...companyDirectory,
    async findCompany() {
      return {
        id: companyA,
        organizationId: orgB,
        name: "Foreign",
        rif: null,
        logoUrl: null,
        operatingProfile: "standard",
      };
    },
  };
  await assert.rejects(
    () =>
      new RequireOrganizationalCompanyAccess(repository, foreignLookup).execute(
        subject,
        orgA,
        companyA,
      ),
    { code: "ORGANIZATIONAL_USER_COMPANY_INVALID" },
  );
  const leakingRepository: OrganizationalUserRepository = {
    async list() {
      return [
        { ...(await repository.find(orgA, subject))!, organizationId: orgB },
      ];
    },
    async find(organizationIdValue, userIdValue) {
      return repository.find(organizationIdValue, userIdValue);
    },
    async create(user) {
      return repository.create(user);
    },
    async update(userIdValue, organizationIdValue, changes, expectedVersion) {
      return repository.update(
        userIdValue,
        organizationIdValue,
        changes,
        expectedVersion,
      );
    },
    async revoke(userIdValue, organizationIdValue, expectedVersion) {
      return repository.revoke(
        userIdValue,
        organizationIdValue,
        expectedVersion,
      );
    },
  };
  await assert.rejects(
    () =>
      new ListOrganizationalUsers(leakingRepository, allowed).execute({
        actorUserId: actor,
        organizationId: orgA,
      }),
    { code: "ORGANIZATIONAL_USER_ACCESS_DENIED" },
  );
});
