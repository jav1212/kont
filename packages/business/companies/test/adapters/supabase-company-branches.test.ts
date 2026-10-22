import assert from "node:assert/strict";
import test from "node:test";
import { organizationId, userId } from "@kontave/organizations/domain";
import { SupabaseCompanyBranchRepository, type CompanySourceResponse, type CompanySupabaseSource } from "../../src/adapters/supabase";
import { CompanyFailure, companyId } from "../../src/domain";

const actorUserId = userId("7b12e42d-3945-4d34-a035-feb773b50001");
const organization = organizationId("8e2403ad-a266-4ffc-8680-b744f241001e");
const company = companyId("company-a");
const branch = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const selectionRow = { user_id: actorUserId, organization_id: organization, company_id: company, branch_id: branch, version: 1, updated_at: "2026-09-28T00:00:00.000Z" };

function source(reply: CompanySourceResponse, calls: Array<{ readonly name: string; readonly args: Record<string, unknown> }>): CompanySupabaseSource {
  return {
    async listByOrganization() { return { data: [], error: null }; },
    async findById() { return { data: null, error: null }; },
    async save() { return { data: null, error: null }; },
    async rpc(name, args) { calls.push({ name, args }); return reply; },
  };
}

test("branch selection adapter uses the scoped read and selection RPCs", async () => {
  const calls: Array<{ readonly name: string; readonly args: Record<string, unknown> }> = [];
  const repository = new SupabaseCompanyBranchRepository(source({ data: selectionRow, error: null }, calls));
  const scope = { actorUserId, organizationId: organization, companyId: company };
  const current = await repository.getSelection(scope);
  const selected = await repository.select({ ...scope, branchId: branch, expectedVersion: 0 });
  assert.equal(current.version, 1);
  assert.equal(selected.branchId, branch);
  assert.deepEqual(calls.map((call) => call.name), ["get_native_company_branch_selection", "select_native_company_branch"]);
  assert.equal(calls[1]?.args.p_branch_id, branch);
  assert.equal(calls[1]?.args.p_expected_version, 0);
});

test("branch selection adapter rejects responses from another user's scope", async () => {
  const repository = new SupabaseCompanyBranchRepository(source({ data: { ...selectionRow, user_id: "e1427f0a-c820-4b50-8937-1a8e7b982c5c" }, error: null }, []));
  await assert.rejects(() => repository.getSelection({ actorUserId, organizationId: organization, companyId: company }),
    (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_BRANCH_SELECTION_ACCESS_DENIED");
});

test("branch selection adapter translates a cross-company target rejection", async () => {
  const repository = new SupabaseCompanyBranchRepository(source({ data: null, error: { message: "COMPANY_BRANCH_NOT_FOUND" } }, []));
  await assert.rejects(() => repository.select({ actorUserId, organizationId: organization, companyId: company, branchId: branch, expectedVersion: 0 }),
    (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_BRANCH_NOT_FOUND");
});

test("branch membership adapter maps scoped assignment and revocation RPCs", async () => {
  const calls: Array<{ readonly name: string; readonly args: Record<string, unknown> }> = [];
  const membershipRow = { organization_id: organization, company_id: company, branch_id: branch, user_id: actorUserId, status: "active", version: 1, changed_by: actorUserId, updated_at: "2026-09-28T00:00:00.000Z" };
  const scripted: CompanySupabaseSource = {
    async listByOrganization() { return { data: [], error: null }; }, async findById() { return { data: null, error: null }; }, async save() { return { data: null, error: null }; },
    async rpc(name, args) { calls.push({ name, args }); const row = { ...membershipRow, status: args.p_status ?? "active", version: args.p_expected_version === undefined ? 1 : Number(args.p_expected_version) + 1 }; return { data: name === "list_native_company_branch_memberships" ? [row] : row, error: null }; },
  };
  const repository = new SupabaseCompanyBranchRepository(scripted);
  const scope = { actorUserId, organizationId: organization, companyId: company };
  const [listed] = await repository.listMemberships(scope);
  const updated = await repository.setMembership({ ...scope, branchId: branch, userId: actorUserId, status: "revoked", expectedVersion: 1 });
  assert.equal(listed?.status, "active");
  assert.equal(updated.status, "revoked");
  assert.equal(updated.version, 2);
  assert.deepEqual(calls.map((call) => call.name), ["list_native_company_branch_memberships", "set_native_company_branch_membership"]);
  assert.equal(calls[1]?.args.p_status, "revoked");
  assert.equal(calls[1]?.args.p_expected_version, 1);
});

test("branch membership adapter preserves scope and version conflicts as typed errors", async () => {
  const repository = new SupabaseCompanyBranchRepository(source({ data: null, error: { message: "COMPANY_BRANCH_MEMBERSHIP_VERSION_CONFLICT" } }, []));
  await assert.rejects(() => repository.setMembership({ actorUserId, organizationId: organization, companyId: company, branchId: branch, userId: actorUserId, status: "active", expectedVersion: 0 }),
    (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_BRANCH_MEMBERSHIP_VERSION_CONFLICT");
});
