import assert from "node:assert/strict";
import test from "node:test";
import { InventoryFailure } from "../../src/domain";
import {
  CreateInventoryOperation,
  GetInventoryOperation,
  ListInventoryFlows,
  PostInventoryOperation,
  ReverseInventoryOperation,
  type InventoryOperationsRepository,
} from "../../src/application/inventory-operations";

const repository = {
  async list() {
    return {
      items: [],
      nextCursor: null,
      total: 0,
      summary: {
        movementCount: 0,
        totalValue: { amount: "0", currency: "VES" as const },
        quantities: [],
      },
    };
  },
  async get(): Promise<never> { throw new Error("network unavailable"); },
  async create(input) { return input as never; },
  async update(input) { return input as never; },
  async post(input) { return input as never; },
  async reverse(input) { return input as never; },
} satisfies InventoryOperationsRepository;

const context = {
  actorUserId: "00000000-0000-4000-8000-000000000001" as never,
  organizationId: "00000000-0000-4000-8000-000000000002" as never,
  companyId: "J-1" as never,
};

test("flow query rejects inverted periods", () => {
  assert.throws(
    () => new ListInventoryFlows(repository).execute({
      ...context,
      from: "2026-08-02",
      to: "2026-08-01",
      limit: 25,
    }),
    /period is invalid/,
  );
});

test("flow query rejects impossible calendar dates", () => {
  assert.throws(
    () => new ListInventoryFlows(repository).execute({
      ...context,
      from: "2026-02-30",
      to: "2026-03-01",
      limit: 25,
    }),
    /effective date is invalid/,
  );
});

test("manual capabilities cannot create purchase receipts", () => {
  assert.throws(
    () => new CreateInventoryOperation(repository).execute({
      ...context,
      reason: "purchase_receipt",
      effectiveDate: "2026-08-16",
      lines: [{ productId: "p", direction: "inbound", quantity: "1", unit: "each" as never }],
    }),
    /owning capability/,
  );
});

test("self consumption must be outbound", () => {
  assert.throws(
    () => new CreateInventoryOperation(repository).execute({
      ...context,
      reason: "self_consumption",
      effectiveDate: "2026-08-16",
      lines: [{ productId: "p", direction: "inbound", quantity: "1", unit: "each" as never }],
    }),
    /direction/,
  );
});

test("post and reverse require optimistic versions", () => {
  assert.throws(
    () => new PostInventoryOperation(repository).execute({
      ...context,
      operationId: "o",
      expectedVersion: 0,
    }),
    /expectedVersion/,
  );
  assert.throws(
    () => new ReverseInventoryOperation(repository).execute({
      ...context,
      operationId: "o",
      expectedVersion: 1,
      effectiveDate: "2026-08-16",
      reason: " ",
    }),
    /reason is required/,
  );
});

test("maps unexpected repository failures", async () => {
  await assert.rejects(
    () => new GetInventoryOperation(repository).execute({ ...context, operationId: "operation-1" }),
    (error: unknown) => (
      error instanceof InventoryFailure
      && error.code === "INVENTORY_REPOSITORY_UNAVAILABLE"
    ),
  );
});
