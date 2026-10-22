import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { productId, UnitOfMeasure } from "@kontave/products/domain";
import {
  ExecuteCrossCompanyInventoryTransfer,
  PreviewCrossCompanyInventoryTransfer,
  type CrossCompanyInventoryTransferRepository,
} from "../../src/application";
import { crossCompanyInventoryTransferId, InventoryFailure } from "../../src/domain";

const actorUserId = userId("actor");
const organizationIdValue = organizationId("organization");
const sourceCompanyId = companyId("source-company");
const destinationCompanyId = companyId("destination-company");
const transferId = crossCompanyInventoryTransferId("transfer-1");

function command() {
  return {
    actorUserId, organizationId: organizationIdValue, transferId, sourceCompanyId, destinationCompanyId,
    effectiveDate: "2026-10-01", reference: " transfer-ref ", notes: " paired movement ",
    expectedSourceSnapshotToken: " source-v7 ", expectedDestinationSnapshotToken: " destination-v3 ",
    correlationId: " correlation-1 ", idempotencyKey: " transfer-key-1 ",
    lines: [{ sourceProductId: productId("source-product"), destinationProductId: productId("destination-product"), quantity: "2.5000", unit: UnitOfMeasure.Each }],
  } as const;
}

test("execute normalizes the command and accepts only a matching paired receipt", async () => {
  const persisted: Parameters<CrossCompanyInventoryTransferRepository["execute"]>[0][] = [];
  const repository: CrossCompanyInventoryTransferRepository = {
    async preview(input) { return { sourceCompanyId: input.sourceCompanyId, destinationCompanyId: input.destinationCompanyId, sourceSnapshotToken: "source-token", destinationSnapshotToken: "destination-token" }; },
    async execute(input) {
      persisted.push(input);
      return { transferId: input.transferId, sourceCompanyId: input.sourceCompanyId, destinationCompanyId: input.destinationCompanyId, sourceOperationId: "source-operation", destinationOperationId: "destination-operation", replayed: false };
    },
  };
  const result = await new ExecuteCrossCompanyInventoryTransfer(repository).execute(command());
  assert.equal(result.sourceOperationId, "source-operation");
  assert.equal(persisted[0]?.idempotencyKey, "transfer-key-1");
  assert.equal(persisted[0]?.expectedSourceSnapshotToken, "source-v7");
  assert.equal(persisted[0]?.lines[0]?.quantity, "2.5");
});

test("execute rejects an invalid mapping before persistence and a receipt for another company", async () => {
  let calls = 0;
  const repository: CrossCompanyInventoryTransferRepository = {
    async preview(input) { return { sourceCompanyId: input.sourceCompanyId, destinationCompanyId: input.destinationCompanyId, sourceSnapshotToken: "source-token", destinationSnapshotToken: "destination-token" }; },
    async execute(input) {
      calls += 1;
      return { transferId: input.transferId, sourceCompanyId: destinationCompanyId, destinationCompanyId: input.destinationCompanyId, sourceOperationId: "source-operation", destinationOperationId: "destination-operation", replayed: false };
    },
  };
  const useCase = new ExecuteCrossCompanyInventoryTransfer(repository);
  await assert.rejects(() => useCase.execute({ ...command(), idempotencyKey: " " }), failure("INVENTORY_CROSS_COMPANY_TRANSFER_INVALID"));
  assert.equal(calls, 0);
  await assert.rejects(() => useCase.execute(command()), failure("INVENTORY_CROSS_COMPANY_TRANSFER_INVALID"));
  assert.equal(calls, 1);
});

test("execute preserves expected repository concurrency and idempotency failures", async () => {
  const repository: CrossCompanyInventoryTransferRepository = {
    async preview(input) { return { sourceCompanyId: input.sourceCompanyId, destinationCompanyId: input.destinationCompanyId, sourceSnapshotToken: "source-token", destinationSnapshotToken: "destination-token" }; },
    async execute() { throw new InventoryFailure("INVENTORY_CROSS_COMPANY_TRANSFER_SNAPSHOT_CONFLICT", "Source drifted."); },
  };
  await assert.rejects(() => new ExecuteCrossCompanyInventoryTransfer(repository).execute(command()), failure("INVENTORY_CROSS_COMPANY_TRANSFER_SNAPSHOT_CONFLICT"));
});

test("preview normalizes wire quantities and returns only matching opaque snapshot tokens", async () => {
  const calls: Parameters<CrossCompanyInventoryTransferRepository["preview"]>[0][] = [];
  const repository: Pick<CrossCompanyInventoryTransferRepository, "preview"> = {
    async preview(input) {
      calls.push(input);
      return { sourceCompanyId: input.sourceCompanyId, destinationCompanyId: input.destinationCompanyId, sourceSnapshotToken: " source-v8 ", destinationSnapshotToken: " destination-v4 " };
    },
  };
  const input = command();
  const preview = await new PreviewCrossCompanyInventoryTransfer(repository).execute({
    actorUserId: input.actorUserId, organizationId: input.organizationId, sourceCompanyId: input.sourceCompanyId,
    destinationCompanyId: input.destinationCompanyId, effectiveDate: input.effectiveDate, lines: input.lines,
  });
  assert.equal(preview.sourceSnapshotToken, "source-v8");
  assert.equal(calls[0]?.lines[0]?.quantity, "2.5");
});

test("preview rejects a quantity beyond legacy NUMERIC(14,4) before persistence", async () => {
  const repository: Pick<CrossCompanyInventoryTransferRepository, "preview"> = {
    async preview() { throw new Error("Unexpected preview"); },
  };
  const input = command();
  await assert.rejects(() => new PreviewCrossCompanyInventoryTransfer(repository).execute({
    actorUserId: input.actorUserId, organizationId: input.organizationId, sourceCompanyId: input.sourceCompanyId,
    destinationCompanyId: input.destinationCompanyId, effectiveDate: input.effectiveDate,
    lines: [{ ...input.lines[0], quantity: "2.12345" }],
  }), failure("INVENTORY_CROSS_COMPANY_TRANSFER_INVALID"));
});

test("preview rejects a quantity whose integer precision exceeds NUMERIC(14,4)", async () => {
  const repository: Pick<CrossCompanyInventoryTransferRepository, "preview"> = { async preview() { throw new Error("Unexpected preview"); } };
  const input = command();
  await assert.rejects(() => new PreviewCrossCompanyInventoryTransfer(repository).execute({
    actorUserId: input.actorUserId, organizationId: input.organizationId, sourceCompanyId: input.sourceCompanyId,
    destinationCompanyId: input.destinationCompanyId, effectiveDate: input.effectiveDate,
    lines: [{ ...input.lines[0], quantity: "12345678901" }],
  }), failure("INVENTORY_CROSS_COMPANY_TRANSFER_INVALID"));
});

function failure(code: string) {
  return (error: unknown) => error instanceof InventoryFailure && error.code === code;
}
