import assert from "node:assert/strict";
import test from "node:test";
import {
  CreatePaymentOrderCommand,
  PaymentOrderFailure,
  UpdatePaymentOrderCommand,
  type PaymentOrderRepository,
} from "../src";
import { SupabasePaymentOrderRepository } from "../src/adapters/supabase";

const repository: PaymentOrderRepository = {
  async create(input) {
    return {
      id: input.id,
      tenantId: "tenant",
      organizationId: input.organizationId,
      companyId: input.companyId,
      beneficiary: input.beneficiary,
      concept: input.concept,
      amount: input.amount,
      currency: input.currency,
      dueDate: input.dueDate,
      status: "draft",
      version: 1,
    };
  },
  async update() {
    throw new Error("unused");
  },
  async cancel() {
    throw new Error("unused");
  },
  async delete() {},
  async get() {
    throw new Error("unused");
  },
};
const input = {
  actorId: "actor",
  organizationId: "org",
  companyId: "company",
  id: "order",
  beneficiary: "Proveedor",
  concept: "Servicios",
  amount: "123.4500",
  currency: "VES",
  dueDate: null,
} as const;
test("payment orders preserve exact decimal amounts and reject unsafe precision", async () => {
  const command = new CreatePaymentOrderCommand(repository);
  assert.equal((await command.execute(input)).amount, "123.4500");
  assert.equal(
    (await command.execute({ ...input, amount: "0.00000001" })).amount,
    "0.00000001",
  );
  for (const amount of [
    "0",
    "0.00000000",
    "NaN",
    "Infinity",
    "1.123456789",
    "123456789012345678901",
  ])
    await assert.rejects(
      command.execute({ ...input, amount }),
      PaymentOrderFailure,
    );
});

test("Supabase payment orders decode positive fractional amounts and reject foreign responses", async () => {
  const row = {
    id: input.id,
    tenant_id: "tenant",
    organization_id: input.organizationId,
    company_id: String(input.companyId),
    beneficiary: input.beneficiary,
    concept: input.concept,
    amount: "0.10000000",
    currency: "VES",
    due_date: null,
    status: "draft",
    version: 1,
  };
  const adapter = new SupabasePaymentOrderRepository({
    async rpc() {
      return { data: row, error: null };
    },
  });
  assert.equal((await adapter.get(input)).amount, "0.10000000");
  row.company_id = "other";
  await assert.rejects(
    adapter.get(input),
    (error: unknown) =>
      error instanceof PaymentOrderFailure && error.code === "UNAVAILABLE",
  );
});
test("payment orders accept only actual due dates and allow an explicit patch clear", async () => {
  const command = new UpdatePaymentOrderCommand(repository);
  await assert.rejects(
    command.execute({ ...input, expectedVersion: 1, dueDate: "2026-02-29" }),
    PaymentOrderFailure,
  );
  let called = false;
  const clear = new UpdatePaymentOrderCommand({
    ...repository,
    async update(order) {
      called = Object.hasOwn(order, "dueDate") && order.dueDate === null;
      return { ...(await repository.create(input)), version: 2 };
    },
  });
  await clear.execute({ ...input, expectedVersion: 1, dueDate: null });
  assert.equal(called, true);
});
