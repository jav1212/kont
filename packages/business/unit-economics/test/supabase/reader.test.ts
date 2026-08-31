import assert from "node:assert/strict";
import test from "node:test";
import { UnitEconomicsFailure, type ProductUnitEconomicsQuery } from "../../src/application";
import { SupabaseUnitEconomicsReader } from "../../src/adapters/supabase";

const query = {
  actorUserId: "actor",
  organizationId: "organization",
  companyId: "company",
  productId: "product",
  from: "2026-01-01",
  to: "2026-01-31",
  granularity: "day",
} as ProductUnitEconomicsQuery;

test("translates a missing product report to its stable failure code", async () => {
  const client = { rpc: async () => ({ data: null, error: { message: "PRODUCT_INSIGHTS_NOT_FOUND" } }) };
  const reader = new SupabaseUnitEconomicsReader(client as never);
  await assert.rejects(
    reader.read(query),
    (cause) => cause instanceof UnitEconomicsFailure && cause.code === "UNIT_ECONOMICS_NOT_FOUND",
  );
});

test("wraps rejected RPC promises as typed unavailable failures", async () => {
  const client = { rpc: async () => { throw new Error("network unavailable"); } };
  const reader = new SupabaseUnitEconomicsReader(client as never);
  await assert.rejects(
    reader.read(query),
    (cause) => cause instanceof UnitEconomicsFailure
      && cause.code === "UNIT_ECONOMICS_UNAVAILABLE"
      && cause.cause instanceof Error,
  );
});
