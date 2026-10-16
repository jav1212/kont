import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { SupabaseProductsRepository } from "../../src/adapters/supabase";
import { productId } from "../../src/domain";

const context = {
  actorUserId: userId("adapter-actor"),
  organizationId: organizationId("adapter-org"),
  companyId: companyId("adapter-company"),
};

test("custom-field persistence maps company scope and separate revisions to RPCs", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "get_native_product_custom_field_catalog") {
        return { data: { definitions: [], version: 0, updatedAt: null }, error: null };
      }
      if (name === "replace_native_product_custom_field_catalog") {
        return { data: { definitions: args.p_definitions, version: 1, updatedAt: "2026-09-29T00:00:00.000Z" }, error: null };
      }
      if (name === "get_native_product_custom_field_values") {
        return { data: { values: {}, version: 0 }, error: null };
      }
      if (name === "get_native_product_custom_field_values_batch") {
        return { data: { "adapter-product": { values: { "warehouse-bin": "A-1" }, version: 2 } }, error: null };
      }
      return { data: { values: args.p_values, version: 1 }, error: null };
    },
  } as unknown as SupabaseClient;
  const repository = new SupabaseProductsRepository(client);
  const fields = [{ id: "warehouse-bin", label: "Ubicación", type: "text" as const, required: false, maxLength: 20 }];

  assert.equal((await repository.findCatalog(context))?.version, 0);
  assert.equal((await repository.saveCatalog({ ...context, definitions: fields, expectedVersion: 0 })).version, 1);
  assert.equal((await repository.findValues(context, productId("adapter-product")))?.version, 0);
  assert.deepEqual(await repository.findValuesByProductIds(context, [productId("adapter-product")]), {
    "adapter-product": { values: { "warehouse-bin": "A-1" }, version: 2 },
  });
  assert.deepEqual(await repository.saveValues({
    ...context,
    productId: productId("adapter-product"),
    values: { "warehouse-bin": "A-1" },
    expectedVersion: 0,
  }), { values: { "warehouse-bin": "A-1" }, version: 1 });

  assert.deepEqual(calls.map(({ name }) => name), [
    "get_native_product_custom_field_catalog",
    "replace_native_product_custom_field_catalog",
    "get_native_product_custom_field_values",
    "get_native_product_custom_field_values_batch",
    "replace_native_product_custom_field_values",
  ]);
  assert.equal(calls[1]?.args.p_expected_version, 0);
  assert.deepEqual(calls[3]?.args.p_product_ids, ["adapter-product"]);
  assert.equal(calls[4]?.args.p_product_id, "adapter-product");
  assert.equal(calls[4]?.args.p_expected_version, 0);
});
