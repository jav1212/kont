import assert from "node:assert/strict";
import test from "node:test";
import { organizationId, userId } from "@kontave/organizations/domain";
import { CompanyFailure, companyId } from "../../src/domain";
import { SupabaseCompanyBranchConnectivityRepository, type CompanySourceResponse, type CompanySupabaseSource } from "../../src/adapters/supabase";

const actorUserId = userId("7b12e42d-3945-4d34-a035-feb773b50001");
const organization = organizationId("8e2403ad-a266-4ffc-8680-b744f241001e");
const company = companyId("company-a");
const branch = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const clientInstanceId = "1c97ab68-5a8a-4a40-a733-ea6df5c3baf2";

function source(reply: CompanySourceResponse, calls: Array<{ readonly name: string; readonly args: Record<string, unknown> }>): CompanySupabaseSource {
  return {
    async listByOrganization() { return { data: [], error: null }; },
    async findById() { return { data: null, error: null }; },
    async save() { return { data: null, error: null }; },
    async rpc(name, args) { calls.push({ name, args }); return reply; },
  };
}

test("branch connectivity adapter uses only scoped heartbeat and read RPCs", async () => {
  const calls: Array<{ readonly name: string; readonly args: Record<string, unknown> }> = [];
  const repository = new SupabaseCompanyBranchConnectivityRepository(source({
    data: { branchId: branch, clientInstanceId, lastSeenAt: "2026-09-28T00:00:00.000Z" }, error: null,
  }, calls));
  const statusRepository = new SupabaseCompanyBranchConnectivityRepository(source({
    data: [{ branchId: branch, online: true, connectedClientCount: 1, lastSeenAt: "2026-09-28T00:00:00.000Z" }], error: null,
  }, calls));
  const scope = { actorUserId, organizationId: organization, companyId: company };
  const heartbeat = await repository.recordHeartbeat({ ...scope, branchId: branch, clientInstanceId });
  const statuses = await statusRepository.listStatuses(scope);
  assert.equal(heartbeat.branchId, branch);
  assert.equal(statuses[0]?.connectedClientCount, 1);
  assert.deepEqual(calls.map((call) => call.name), ["record_native_company_branch_heartbeat", "get_native_company_branch_connectivity"]);
  assert.equal(calls[0]?.args.p_actor_user_id, actorUserId);
  assert.equal(calls[0]?.args.p_client_instance_id, clientInstanceId);
});

test("branch connectivity adapter maps authorization errors and rejects malformed status", async () => {
  const denied = new SupabaseCompanyBranchConnectivityRepository(source({ data: null, error: { message: "COMPANY_BRANCH_CONNECTIVITY_ACCESS_DENIED" } }, []));
  await assert.rejects(() => denied.recordHeartbeat({ actorUserId, organizationId: organization, companyId: company, branchId: branch, clientInstanceId }),
    (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_BRANCH_CONNECTIVITY_ACCESS_DENIED");
  const malformed = new SupabaseCompanyBranchConnectivityRepository(source({ data: [{ branchId: branch, online: true, connectedClientCount: 0, lastSeenAt: null }], error: null }, []));
  await assert.rejects(() => malformed.listStatuses({ actorUserId, organizationId: organization, companyId: company }),
    (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_REPOSITORY_UNAVAILABLE");
});
