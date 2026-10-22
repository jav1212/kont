import assert from "node:assert/strict";
import test from "node:test";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import type { CompanyId } from "../../src/domain";
import { CompanyFailure } from "../../src/domain";
import { CreateCompanyBranch, ListCompanyBranchMemberships, ListCompanyBranches, SelectCompanyBranch, SetCompanyBranchMembership, type CompanyBranchRepository, type CreateCompanyBranchCommand, type SetCompanyBranchMembershipCommand } from "../../src/application/company-branches";
import { companyBranchMembership, companyBranchSelection, type CompanyBranch, type CompanyBranchMembership, type CompanyBranchSelection } from "../../src/domain/company-branch";

const scope = { actorUserId: "7b12e42d-3945-4d34-a035-feb773b50001" as UserId, organizationId: "8e2403ad-a266-4ffc-8680-b744f241001e" as OrganizationId, companyId: "company" as CompanyId };
const record: CompanyBranch = Object.freeze({ id: "branch", tenantId: "tenant", ...scope, code: "HQ", name: "Headquarters", createdBy: scope.actorUserId, createdAt: "2026-01-01T00:00:00.000Z" });
const emptySelection = companyBranchSelection({ ...scope, branchId: null, version: 0, updatedAt: null });

class BranchStore implements CompanyBranchRepository {
  readonly created: CreateCompanyBranchCommand[] = [];
  readonly selections: Array<{ readonly branchId: string | null; readonly expectedVersion: number }> = [];
  readonly memberships: SetCompanyBranchMembershipCommand[] = [];
  async createBranch(command: CreateCompanyBranchCommand): Promise<CompanyBranch> { this.created.push(command); return record; }
  async listBranches(query: { readonly actorUserId: UserId; readonly organizationId: OrganizationId; readonly companyId: CompanyId }): Promise<readonly CompanyBranch[]> {
    assert.deepEqual(query, scope);
    return Object.freeze([record]);
  }
  async getSelection(): Promise<CompanyBranchSelection> { return emptySelection; }
  async select(command: { readonly branchId: string | null; readonly expectedVersion: number }): Promise<CompanyBranchSelection> {
    this.selections.push(command);
    return companyBranchSelection({ ...scope, branchId: command.branchId, version: command.expectedVersion + 1, updatedAt: "2026-09-28T00:00:00.000Z" });
  }
  async listMemberships(): Promise<readonly CompanyBranchMembership[]> { return Object.freeze([]); }
  async setMembership(command: SetCompanyBranchMembershipCommand): Promise<CompanyBranchMembership> {
    this.memberships.push(command);
    return companyBranchMembership({ organizationId: scope.organizationId, companyId: scope.companyId, branchId: command.branchId, userId: command.userId, status: command.status, version: command.expectedVersion + 1, changedBy: command.actorUserId, updatedAt: "2026-09-28T00:00:00.000Z" });
  }
}

test("branch creation normalizes identity before calling the scoped repository", async () => {
  const repository = new BranchStore();
  const result = await new CreateCompanyBranch(repository).execute({ ...scope, idempotencyKey: " create-1 ", code: " hq ", name: "  Main   Office " });
  assert.equal(result, record);
  assert.equal(repository.created[0]?.idempotencyKey, "create-1");
  assert.equal(repository.created[0]?.code, "HQ");
  assert.equal(repository.created[0]?.name, "Main Office");
});

test("invalid branch fields fail before persistence", async () => {
  const repository = new BranchStore();
  assert.throws(() => new CreateCompanyBranch(repository).execute({ ...scope, idempotencyKey: "key", code: "bad code", name: "Branch" }),
    (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_BRANCH_INVALID");
  assert.throws(() => new CreateCompanyBranch(repository).execute({ ...scope, idempotencyKey: " ", code: "HQ", name: "Branch" }),
    (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_BRANCH_INVALID");
  assert.equal(repository.created.length, 0);
});

test("branch listing preserves the authenticated company scope", async () => {
  const result = await new ListCompanyBranches(new BranchStore()).execute(scope);
  assert.deepEqual(result, [record]);
});

test("branch selection trims a UUID and writes against the expected revision", async () => {
  const repository = new BranchStore();
  const branchId = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
  const selected = await new SelectCompanyBranch(repository).execute({ ...scope, branchId: ` ${branchId} `, expectedVersion: 0 });
  assert.equal(repository.selections[0]?.branchId, branchId);
  assert.equal(repository.selections[0]?.expectedVersion, 0);
  assert.equal(selected.branchId, branchId);
  assert.equal(selected.version, 1);
});

test("branch selection can be cleared and rejects invalid IDs or revisions before persistence", async () => {
  const repository = new BranchStore();
  await new SelectCompanyBranch(repository).execute({ ...scope, branchId: null, expectedVersion: 3 });
  assert.equal(repository.selections[0]?.branchId, null);
  assert.throws(() => new SelectCompanyBranch(repository).execute({ ...scope, branchId: "not-a-uuid", expectedVersion: 3 }),
    (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_BRANCH_SELECTION_INVALID");
  assert.throws(() => new SelectCompanyBranch(repository).execute({ ...scope, branchId: null, expectedVersion: -1 }),
    (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_BRANCH_SELECTION_INVALID");
  assert.equal(repository.selections.length, 1);
});

test("branch membership list is exposed through its repository port", async () => {
  const result = await new ListCompanyBranchMemberships(new BranchStore()).execute(scope);
  assert.deepEqual(result, []);
});

test("branch membership changes validate user, branch and revision before persistence", async () => {
  const repository = new BranchStore();
  const userId = "e1427f0a-c820-4b50-8937-1a8e7b982c5c" as UserId;
  const branchId = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
  const result = await new SetCompanyBranchMembership(repository).execute({ ...scope, userId, branchId, status: "active", expectedVersion: 0 });
  assert.equal(repository.memberships[0]?.userId, userId);
  assert.equal(repository.memberships[0]?.status, "active");
  assert.equal(result.version, 1);
  assert.throws(() => new SetCompanyBranchMembership(repository).execute({ ...scope, userId: "not-a-uuid" as UserId, branchId, status: "active", expectedVersion: 0 }),
    (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_BRANCH_MEMBERSHIP_INVALID");
  assert.throws(() => new SetCompanyBranchMembership(repository).execute({ ...scope, userId, branchId, status: "revoked", expectedVersion: -1 }),
    (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_BRANCH_MEMBERSHIP_INVALID");
  assert.equal(repository.memberships.length, 1);
});
