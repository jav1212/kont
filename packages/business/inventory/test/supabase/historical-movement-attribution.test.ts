import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseHistoricalInventoryMovementAttributionRepository } from "../../src/adapters/supabase";
import {
  HistoricalInventoryMovementAttributionFailure,
  type AttributeHistoricalInventoryMovementCommand,
  type GetHistoricalInventoryMovementAttributionCandidateQuery,
} from "../../src/application";

const fingerprint = "a".repeat(64);
const query = {
  actorUserId: "00000000-0000-4000-8000-000000000001", organizationId: "00000000-0000-4000-8000-000000000002", companyId: "J-12345678-9", movementId: "legacy-movement-1",
} as unknown as GetHistoricalInventoryMovementAttributionCandidateQuery;
const command = {
  ...query, branchId: "00000000-0000-4000-8000-000000000003", expectedMovementFingerprint: fingerprint, reason: "Conteo físico revisado por gerencia", idempotencyKey: "historical-legacy-movement-1",
} as unknown as AttributeHistoricalInventoryMovementCommand;
const candidate = { movementId: query.movementId, companyId: query.companyId, productId: "product-1", type: "entrada", date: "2026-01-15", quantity: "2.5000", unit: "each", unitCostVes: "10.0000", totalCostVes: "25.0000", reference: "Ajuste legado", fingerprint, attributedBranchId: null };
const result = { movementId: query.movementId, companyId: query.companyId, branchId: command.branchId, productId: "product-1", type: "entrada", date: "2026-01-15", quantity: "2.5000", unit: "each", unitCostVes: "10.0000", totalCostVes: "25.0000", attributedAt: "2026-10-02T12:00:00.000Z", attributedBy: command.actorUserId, reason: command.reason };

function repository(rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>) { return new SupabaseHistoricalInventoryMovementAttributionRepository({ rpc } as never); }

test("uses the read-only candidate RPC with its complete authorization scope", async () => {
  let request: { name: string; args: Record<string, unknown> } | undefined;
  const preview = await repository(async (name, args) => { request = { name, args }; return { data: candidate, error: null }; }).get(query);
  assert.equal(request?.name, "get_native_inventory_historical_movement_attribution_candidate");
  assert.deepEqual(request?.args, { p_actor_user_id: query.actorUserId, p_organization_id: query.organizationId, p_company_id: query.companyId, p_movement_id: query.movementId });
  assert.equal(preview.fingerprint, fingerprint);
});

test("uses the atomic attribution RPC with its reviewed concurrency token", async () => {
  let request: { name: string; args: Record<string, unknown> } | undefined;
  const attribution = await repository(async (name, args) => { request = { name, args }; return { data: result, error: null }; }).attribute(command);
  assert.equal(request?.name, "attribute_native_inventory_historical_movement");
  assert.deepEqual(request?.args, { p_actor_user_id: command.actorUserId, p_organization_id: command.organizationId, p_company_id: command.companyId, p_movement_id: command.movementId, p_branch_id: command.branchId, p_expected_movement_fingerprint: command.expectedMovementFingerprint, p_reason: command.reason, p_idempotency_key: command.idempotencyKey });
  assert.equal(attribution.totalCostVes, "25");
});

test("maps expected RPC failures and rejects foreign or malformed responses", async () => {
  for (const code of ["INVENTORY_BRANCH_ATTRIBUTION_INVALID", "INVENTORY_BRANCH_ATTRIBUTION_ACCESS_DENIED", "INVENTORY_BRANCH_ATTRIBUTION_MOVEMENT_UNAVAILABLE", "INVENTORY_BRANCH_ATTRIBUTION_ALREADY_ATTRIBUTED", "INVENTORY_BRANCH_ATTRIBUTION_STALE", "INVENTORY_BRANCH_ATTRIBUTION_IDEMPOTENCY_CONFLICT"] as const) {
    await assert.rejects(() => repository(async () => ({ data: null, error: { message: code } })).attribute(command), (error: unknown) => error instanceof HistoricalInventoryMovementAttributionFailure && error.code === code);
  }
  await assert.rejects(
    () => repository(async () => ({ data: { ...candidate, companyId: "other-company" }, error: null })).get(query),
    (error: unknown) => error instanceof HistoricalInventoryMovementAttributionFailure && error.code === "INVENTORY_BRANCH_ATTRIBUTION_UNAVAILABLE",
  );
  await assert.rejects(
    () => repository(async () => ({ data: { ...result, attributedBy: "00000000-0000-4000-8000-000000000009" }, error: null })).attribute(command),
    (error: unknown) => error instanceof HistoricalInventoryMovementAttributionFailure && error.code === "INVENTORY_BRANCH_ATTRIBUTION_UNAVAILABLE",
  );
  await assert.rejects(
    () => repository(async () => ({ data: { ...result, quantity: "1e3" }, error: null })).attribute(command),
    (error: unknown) => error instanceof HistoricalInventoryMovementAttributionFailure && error.code === "INVENTORY_BRANCH_ATTRIBUTION_UNAVAILABLE",
  );
});
