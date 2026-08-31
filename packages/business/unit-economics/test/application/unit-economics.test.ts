import assert from "node:assert/strict";
import test from "node:test";
import {
  GetProductUnitEconomics,
  UnitEconomicsFailure,
  type ProductUnitEconomicsQuery,
  type UnitEconomicsReader,
} from "../../src/application";

const query = {
  actorUserId: "actor",
  organizationId: "organization",
  companyId: "company",
  productId: "product",
  from: "2026-01-01",
  to: "2026-12-31",
  granularity: "month",
} as ProductUnitEconomicsQuery;

test("limits product unit economics periods", () => {
  assert.throws(
    () => new GetProductUnitEconomics({} as UnitEconomicsReader).execute({ ...query, from: "2025-01-01", to: "2026-08-16", granularity: "day" }),
    { code: "UNIT_ECONOMICS_INVALID" },
  );
});

test("rejects normalized calendar overflows", () => {
  assert.throws(
    () => new GetProductUnitEconomics({} as UnitEconomicsReader).execute({ ...query, from: "2026-02-31", to: "2026-03-01", granularity: "day" }),
    { code: "UNIT_ECONOMICS_INVALID" },
  );
});

test("maps unexpected reader failures to a typed application failure", async () => {
  const reader: UnitEconomicsReader = { read: async () => { throw new Error("report unavailable"); } };
  await assert.rejects(
    new GetProductUnitEconomics(reader).execute(query),
    (cause) => cause instanceof UnitEconomicsFailure
      && cause.code === "UNIT_ECONOMICS_UNAVAILABLE"
      && cause.cause instanceof Error,
  );
});
