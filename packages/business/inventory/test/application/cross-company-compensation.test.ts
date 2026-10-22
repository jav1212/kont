import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { productId, UnitOfMeasure } from "@kontave/products/domain";
import { ExecuteCrossCompanyInventoryCompensation, PreviewCrossCompanyInventoryCompensation, type CrossCompanyInventoryCompensationRepository } from "../../src/application";
import { crossCompanyInventoryTransferId, InventoryFailure } from "../../src/domain";

const actorUserId = userId("actor"); const organizationIdValue = organizationId("organization"); const originalTransferId = crossCompanyInventoryTransferId("original"); const sourceCompanyId = companyId("source"); const destinationCompanyId = companyId("destination");
const preview = { originalTransferId, sourceCompanyId, destinationCompanyId, effectiveDate: "2026-10-02", lines: [{ sourceProductId: productId("source-product"), destinationProductId: productId("destination-product"), quantity: "2.5", unit: UnitOfMeasure.Each }], sourceSnapshotToken: "source-token", destinationSnapshotToken: "destination-token" } as const;
const previewCommand = { actorUserId, organizationId: organizationIdValue, originalTransferId, effectiveDate: "2026-10-02" } as const;

test("compensation preview pins original physical lines and execute preserves a new immutable identity", async () => {
  const calls: string[] = [];
  const repository: CrossCompanyInventoryCompensationRepository = { async preview() { calls.push("preview"); return preview; }, async execute(command) { calls.push("execute"); return { originalTransferId: command.originalTransferId, compensationTransferId: command.compensationTransferId, sourceCompanyId, destinationCompanyId, sourceOperationId: "source-op", destinationOperationId: "destination-op", replayed: false }; } };
  const result = await new PreviewCrossCompanyInventoryCompensation(repository).execute(previewCommand);
  assert.equal(result.lines[0]?.quantity, "2.5");
  const receipt = await new ExecuteCrossCompanyInventoryCompensation(repository).execute({ ...previewCommand, compensationTransferId: crossCompanyInventoryTransferId("compensation"), idempotencyKey: "key", reason: "Return physical stock", expectedSourceSnapshotToken: result.sourceSnapshotToken, expectedDestinationSnapshotToken: result.destinationSnapshotToken });
  assert.equal(receipt.compensationTransferId, crossCompanyInventoryTransferId("compensation")); assert.deepEqual(calls, ["preview", "execute"]);
});

test("compensation rejects reuse of original identity and preserves typed database failures", async () => {
  const repository: CrossCompanyInventoryCompensationRepository = { async preview() { return preview; }, async execute() { throw new InventoryFailure("INVENTORY_CROSS_COMPANY_COMPENSATION_ALREADY_COMPENSATED", "Already compensated."); } };
  const useCase = new ExecuteCrossCompanyInventoryCompensation(repository);
  await assert.rejects(() => useCase.execute({ ...previewCommand, compensationTransferId: originalTransferId, idempotencyKey: "key", reason: "reason", expectedSourceSnapshotToken: "source", expectedDestinationSnapshotToken: "destination" }), code("INVENTORY_CROSS_COMPANY_COMPENSATION_INVALID"));
  await assert.rejects(() => useCase.execute({ ...previewCommand, compensationTransferId: crossCompanyInventoryTransferId("comp"), idempotencyKey: "key", reason: "reason", expectedSourceSnapshotToken: "source", expectedDestinationSnapshotToken: "destination" }), code("INVENTORY_CROSS_COMPANY_COMPENSATION_ALREADY_COMPENSATED"));
});
function code(value: string) { return (error: unknown) => error instanceof InventoryFailure && error.code === value; }
