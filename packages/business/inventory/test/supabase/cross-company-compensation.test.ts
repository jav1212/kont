import assert from "node:assert/strict";
import test from "node:test";
import { organizationId, userId } from "@kontave/organizations/domain";
import { UnitOfMeasure } from "@kontave/products/domain";
import { SupabaseCrossCompanyInventoryCompensationRepository } from "../../src/adapters/supabase";
import { crossCompanyInventoryTransferId, InventoryFailure } from "../../src/domain";

const command = { actorUserId: userId("actor"), organizationId: organizationId("organization"), originalTransferId: crossCompanyInventoryTransferId("original"), effectiveDate: "2026-10-02" } as const;
test("compensation adapter calls fixed preview RPC and sanitizes SQL errors", async () => {
  const calls: string[] = []; const repository = new SupabaseCrossCompanyInventoryCompensationRepository({ rpc: async (name: string) => { calls.push(name); return { data: { originalTransferId: "original", sourceCompanyId: "source", destinationCompanyId: "destination", effectiveDate: "2026-10-02", lines: [{ sourceProductId: "sp", destinationProductId: "dp", quantity: "1", unit: UnitOfMeasure.Each }], sourceSnapshotToken: "source", destinationSnapshotToken: "destination" }, error: null }; } } as never);
  const result = await repository.preview(command); assert.equal(result.originalTransferId, command.originalTransferId); assert.deepEqual(calls, ["preview_native_cross_company_inventory_compensation"]);
  const failure = new SupabaseCrossCompanyInventoryCompensationRepository({ rpc: async () => ({ data: null, error: { message: "raw INVENTORY_CROSS_COMPANY_COMPENSATION_NOT_FOUND database detail" } }) } as never);
  await assert.rejects(() => failure.preview(command), (error: unknown) => error instanceof InventoryFailure && error.code === "INVENTORY_CROSS_COMPANY_COMPENSATION_NOT_FOUND" && !error.message.includes("raw"));
});
