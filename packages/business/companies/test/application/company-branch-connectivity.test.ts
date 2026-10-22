import assert from "node:assert/strict";
import test from "node:test";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import type { CompanyId } from "../../src/domain";
import { CompanyFailure, type CompanyBranchConnectivity, type CompanyBranchHeartbeat } from "../../src/domain";
import { ListCompanyBranchConnectivity, RecordCompanyBranchHeartbeat, type CompanyBranchConnectivityRepository } from "../../src/application/company-branch-connectivity";

const scope = { actorUserId: "7b12e42d-3945-4d34-a035-feb773b50001" as UserId, organizationId: "8e2403ad-a266-4ffc-8680-b744f241001e" as OrganizationId, companyId: "company" as CompanyId };
const branch = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const clientInstanceId = "1c97ab68-5a8a-4a40-a733-ea6df5c3baf2";

class ConnectivityStore implements CompanyBranchConnectivityRepository {
  heartbeatCommand: Parameters<CompanyBranchConnectivityRepository["recordHeartbeat"]>[0] | undefined;
  rows: readonly CompanyBranchConnectivity[] = [];
  async recordHeartbeat(command: Parameters<CompanyBranchConnectivityRepository["recordHeartbeat"]>[0]): Promise<CompanyBranchHeartbeat> {
    this.heartbeatCommand = command;
    return { branchId: command.branchId, clientInstanceId: command.clientInstanceId, lastSeenAt: "2026-09-28T00:00:00.000Z" };
  }
  async listStatuses(): Promise<readonly CompanyBranchConnectivity[]> { return this.rows; }
}

test("branch heartbeat validates client and branch UUIDs before persistence", async () => {
  const repository = new ConnectivityStore();
  const result = await new RecordCompanyBranchHeartbeat(repository).execute({ ...scope, branchId: ` ${branch} `, clientInstanceId });
  assert.equal(repository.heartbeatCommand?.branchId, branch);
  assert.equal(result.clientInstanceId, clientInstanceId);
  assert.throws(() => new RecordCompanyBranchHeartbeat(repository).execute({ ...scope, branchId: "bad", clientInstanceId }),
    (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_BRANCH_CONNECTIVITY_INVALID");
  assert.throws(() => new RecordCompanyBranchHeartbeat(repository).execute({ ...scope, branchId: branch, clientInstanceId: "bad" }),
    (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_BRANCH_CONNECTIVITY_INVALID");
});

test("branch connectivity lists immutable online and offline aggregates", async () => {
  const repository = new ConnectivityStore();
  repository.rows = [
    { branchId: branch, online: true, connectedClientCount: 2, lastSeenAt: "2026-09-28T00:00:00.000Z" },
    { branchId: "de3471c8-d0a2-4f0d-8e69-889319032ff0", online: false, connectedClientCount: 0, lastSeenAt: "2026-09-27T00:00:00.000Z" },
  ];
  const statuses = await new ListCompanyBranchConnectivity(repository).execute(scope);
  assert.equal(statuses.length, 2);
  assert.equal(statuses[0]?.online, true);
  assert.equal(statuses[1]?.lastSeenAt, "2026-09-27T00:00:00.000Z");
  assert.equal(Object.isFrozen(statuses), true);
});

test("branch connectivity rejects inconsistent and duplicate repository snapshots", async () => {
  const repository = new ConnectivityStore();
  repository.rows = [{ branchId: branch, online: true, connectedClientCount: 0, lastSeenAt: null }];
  await assert.rejects(() => new ListCompanyBranchConnectivity(repository).execute(scope),
    (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_BRANCH_CONNECTIVITY_INVALID");
  repository.rows = [
    { branchId: branch, online: false, connectedClientCount: 0, lastSeenAt: null },
    { branchId: branch, online: false, connectedClientCount: 0, lastSeenAt: null },
  ];
  await assert.rejects(() => new ListCompanyBranchConnectivity(repository).execute(scope),
    (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_BRANCH_CONNECTIVITY_INVALID");
});
