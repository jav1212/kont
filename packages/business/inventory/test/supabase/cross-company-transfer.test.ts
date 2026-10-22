import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { productId, UnitOfMeasure } from "@kontave/products/domain";
import { SupabaseCrossCompanyInventoryTransferRepository } from "../../src/adapters/supabase";
import { crossCompanyInventoryTransferId, InventoryFailure } from "../../src/domain";

const actorUserId = userId("actor");
const organizationIdValue = organizationId("organization");
const sourceCompanyId = companyId("source-company");
const destinationCompanyId = companyId("destination-company");

function previewCommand() {
  return {
    actorUserId, organizationId: organizationIdValue, sourceCompanyId, destinationCompanyId,
    effectiveDate: "2026-10-01",
    lines: [{ sourceProductId: productId("source-product"), destinationProductId: productId("destination-product"), quantity: "2.5", unit: UnitOfMeasure.Each }],
  } as const;
}

test("Supabase transfer adapter maps the fixed preview and execute RPC contracts", async () => {
  const calls: Array<{ readonly name: string; readonly args: Record<string, unknown> }> = [];
  const repository = new SupabaseCrossCompanyInventoryTransferRepository({
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "preview_native_cross_company_inventory_transfer") {
        return { data: { sourceCompanyId, destinationCompanyId, sourceSnapshotToken: "source-token", destinationSnapshotToken: "destination-token" }, error: null };
      }
      return { data: { transferId: "transfer-1", sourceCompanyId, destinationCompanyId, sourceOperationId: "source-operation", destinationOperationId: "destination-operation", replayed: false }, error: null };
    },
  } as never);
  const preview = await repository.preview(previewCommand());
  const result = await repository.execute({
    ...previewCommand(), transferId: crossCompanyInventoryTransferId("transfer-1"), correlationId: "correlation-1", idempotencyKey: "key-1",
    reference: "ref", notes: "notes", expectedSourceSnapshotToken: preview.sourceSnapshotToken, expectedDestinationSnapshotToken: preview.destinationSnapshotToken,
  });
  assert.equal(result.transferId, crossCompanyInventoryTransferId("transfer-1"));
  assert.deepEqual(calls[0], { name: "preview_native_cross_company_inventory_transfer", args: {
    p_actor_user_id: actorUserId, p_organization_id: organizationIdValue, p_source_company_id: sourceCompanyId,
    p_destination_company_id: destinationCompanyId, p_effective_date: "2026-10-01",
    p_lines: [{ sourceProductId: productId("source-product"), destinationProductId: productId("destination-product"), quantity: "2.5", unit: UnitOfMeasure.Each }],
  } });
  assert.equal(calls[1]?.name, "execute_native_cross_company_inventory_transfer");
  assert.equal(calls[1]?.args.p_expected_destination_snapshot_token, "destination-token");
});

test("Supabase transfer adapter maps expected RPC failures and rejects malformed responses", async () => {
  const conflict = new SupabaseCrossCompanyInventoryTransferRepository({
    rpc: async () => ({ data: null, error: { message: "INVENTORY_CROSS_COMPANY_TRANSFER_IDEMPOTENCY_CONFLICT" } }),
  } as never);
  await assert.rejects(() => conflict.preview(previewCommand()), failure("INVENTORY_CROSS_COMPANY_TRANSFER_IDEMPOTENCY_CONFLICT"));
  const malformed = new SupabaseCrossCompanyInventoryTransferRepository({ rpc: async () => ({ data: { sourceCompanyId }, error: null }) } as never);
  await assert.rejects(() => malformed.preview(previewCommand()), failure("INVENTORY_REPOSITORY_UNAVAILABLE"));
});

test("Supabase transfer adapter maps SQL and organizational faults without exposing raw database text", async () => {
  const snapshot = new SupabaseCrossCompanyInventoryTransferRepository({
    rpc: async () => ({ data: null, error: { message: "postgres says INVENTORY_CROSS_COMPANY_TRANSFER_SNAPSHOT_CONFLICT details" } }),
  } as never);
  await assert.rejects(() => snapshot.preview(previewCommand()), (error: unknown) => error instanceof InventoryFailure
    && error.code === "INVENTORY_CROSS_COMPANY_TRANSFER_SNAPSHOT_CONFLICT" && !error.message.includes("postgres says"));
  const denied = new SupabaseCrossCompanyInventoryTransferRepository({
    rpc: async () => ({ data: null, error: { message: "ORGANIZATIONAL_USER_ACCESS_DENIED" } }),
  } as never);
  await assert.rejects(() => denied.preview(previewCommand()), failure("INVENTORY_OPERATION_ACCESS_DENIED"));
});

function failure(code: string) {
  return (error: unknown) => error instanceof InventoryFailure && error.code === code;
}
