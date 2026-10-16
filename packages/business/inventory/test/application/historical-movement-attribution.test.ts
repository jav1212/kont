import assert from "node:assert/strict";
import test from "node:test";
import {
  AttributeHistoricalInventoryMovement,
  freezeHistoricalInventoryMovementAttribution,
  freezeHistoricalInventoryMovementAttributionCandidate,
  GetHistoricalInventoryMovementAttributionCandidate,
  HistoricalInventoryMovementAttributionFailure,
  validateAttributeHistoricalInventoryMovementCommand,
  validateGetHistoricalInventoryMovementAttributionCandidateQuery,
  type AttributeHistoricalInventoryMovementCommand,
  type HistoricalInventoryMovementAttribution,
  type HistoricalInventoryMovementAttributionCandidate,
} from "../../src/application";

const fingerprint = "a".repeat(64);
const query = {
  actorUserId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000002",
  companyId: "J-12345678-9",
  movementId: "legacy-movement-1",
};
const command = {
  ...query,
  branchId: "00000000-0000-4000-8000-000000000003",
  expectedMovementFingerprint: fingerprint,
  reason: "Conteo físico revisado por gerencia",
  idempotencyKey: "historical-legacy-movement-1",
} as unknown as AttributeHistoricalInventoryMovementCommand;
const candidate = {
  movementId: query.movementId, companyId: query.companyId, productId: "product-1", type: "entrada", date: "2026-01-15",
  quantity: "2.5000", unit: "each", unitCostVes: "10.0000", totalCostVes: "25.0000", reference: "Ajuste legado", fingerprint, attributedBranchId: null,
} as unknown as HistoricalInventoryMovementAttributionCandidate;
const attribution = {
  movementId: query.movementId, companyId: query.companyId, branchId: command.branchId, productId: "product-1", type: "entrada", date: "2026-01-15",
  quantity: "2.5000", unit: "each", unitCostVes: "10.0000", totalCostVes: "25.0000", attributedAt: "2026-10-02T12:00:00.000Z", attributedBy: command.actorUserId, reason: command.reason,
} as unknown as HistoricalInventoryMovementAttribution;

test("validates and freezes reviewed historical movement scope and attribution commands", () => {
  const validQuery = validateGetHistoricalInventoryMovementAttributionCandidateQuery(query as never);
  const validCommand = validateAttributeHistoricalInventoryMovementCommand({ ...command, reason: ` ${command.reason} ` });
  assert.equal(validCommand.reason, command.reason);
  assert.equal(validCommand.expectedMovementFingerprint, fingerprint);
  assert.equal(Object.isFrozen(validQuery), true);
  assert.equal(Object.isFrozen(validCommand), true);
});

test("rejects malformed scope, fingerprints, reasons and idempotency keys before a write", () => {
  for (const value of [
    { ...command, actorUserId: "not-a-uuid" },
    { ...command, movementId: " " },
    { ...command, branchId: "not-a-uuid" },
    { ...command, expectedMovementFingerprint: "A".repeat(64) },
    { ...command, expectedMovementFingerprint: "a".repeat(63) },
    { ...command, reason: "too short" },
    { ...command, reason: "x".repeat(501) },
    { ...command, idempotencyKey: "x".repeat(129) },
  ]) {
    assert.throws(
      () => validateAttributeHistoricalInventoryMovementCommand(value as never),
      (error: unknown) => error instanceof HistoricalInventoryMovementAttributionFailure
        && error.code === "INVENTORY_BRANCH_ATTRIBUTION_INVALID",
    );
  }
});

test("freezes all reviewed movement types and exact-valued snapshots", () => {
  for (const type of ["entrada", "salida", "ajuste_positivo", "ajuste_negativo", "devolucion_entrada", "devolucion_salida", "autoconsumo"] as const) {
    const result = freezeHistoricalInventoryMovementAttributionCandidate({ ...candidate, type });
    assert.equal(result.type, type);
    assert.equal(result.quantity, "2.5");
  }
  const result = freezeHistoricalInventoryMovementAttribution(attribution);
  assert.equal(result.totalCostVes, "25");
  assert.equal(Object.isFrozen(result), true);
  assert.throws(
    () => freezeHistoricalInventoryMovementAttribution({ ...attribution, type: "entrada_compra" } as never),
    HistoricalInventoryMovementAttributionFailure,
  );
});

test("preserves empty and long legacy references in a read-only candidate", () => {
  assert.equal(freezeHistoricalInventoryMovementAttributionCandidate({ ...candidate, reference: "" }).reference, "");
  assert.equal(freezeHistoricalInventoryMovementAttributionCandidate({ ...candidate, reference: "x".repeat(4096) }).reference?.length, 4096);
  assert.throws(
    () => freezeHistoricalInventoryMovementAttributionCandidate({ ...candidate, reference: "x".repeat(4097) }),
    HistoricalInventoryMovementAttributionFailure,
  );
});

test("passes immutable validated data to ports and maps unknown failures", async () => {
  let candidateQuery: unknown;
  const preview = await new GetHistoricalInventoryMovementAttributionCandidate({
    async get(value) { candidateQuery = value; return candidate; },
  }).execute(query as never);
  assert.equal((candidateQuery as typeof query).movementId, query.movementId);
  assert.equal(preview.fingerprint, fingerprint);

  let received: unknown;
  const result = await new AttributeHistoricalInventoryMovement({
    async attribute(value) { received = value; return attribution; },
  }).execute(command);
  assert.equal((received as AttributeHistoricalInventoryMovementCommand).reason, command.reason);
  assert.equal(result.attributedBy, command.actorUserId);
  await assert.rejects(
    () => new AttributeHistoricalInventoryMovement({ async attribute(): Promise<never> { throw new Error("connection reset"); } }).execute(command),
    (error: unknown) => error instanceof HistoricalInventoryMovementAttributionFailure
      && error.code === "INVENTORY_BRANCH_ATTRIBUTION_UNAVAILABLE",
  );
});
