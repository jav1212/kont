import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { SupabaseProductsRepository } from "../../src/adapters/supabase";
import { productCategoryId } from "../../src/domain";

const context = {
  actorUserId: userId("actor-1"),
  organizationId: organizationId("organization-1"),
  companyId: companyId("company-1"),
};

test("category alias adapter maps scoped RPCs and optimistic retirement", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "list_native_product_category_aliases") return { data: [], error: null };
      if (name === "create_native_product_category_alias") {
        return { data: { id: "00000000-0000-4000-8000-000000000001", companyId: "company-1", categoryId: "category-1", alias: args.p_alias, status: "active", version: 1 }, error: null };
      }
      if (name === "retire_native_product_category_alias") {
        return { data: { id: "00000000-0000-4000-8000-000000000001", companyId: "company-1", categoryId: "category-1", alias: "Meds", status: "retired", version: 2 }, error: null };
      }
      return { data: { categoryId: "category-1", categoryName: "Medicinas", matchedAs: "alias" }, error: null };
    },
  } as unknown as SupabaseClient;
  const repository = new SupabaseProductsRepository(client);

  assert.deepEqual(await repository.listAliases(context, productCategoryId("category-1")), []);
  const created = await repository.createAlias({ ...context, categoryId: productCategoryId("category-1"), alias: "Meds" });
  const retired = await repository.retireAlias({ ...context, aliasId: "00000000-0000-4000-8000-000000000001", expectedVersion: 1 });
  const match = await repository.resolveAlias({ ...context, sourceName: "Meds" });

  assert.equal(created.status, "active");
  assert.equal(retired.version, 2);
  assert.equal(match?.categoryId, "category-1");
  assert.equal(match?.matchedAs, "alias");
  assert.deepEqual(calls.map(({ name }) => name), [
    "list_native_product_category_aliases",
    "create_native_product_category_alias",
    "retire_native_product_category_alias",
    "resolve_native_product_category_alias",
  ]);
  assert.equal(calls[0]?.args.p_category_id, "category-1");
  assert.equal(calls[2]?.args.p_expected_version, 1);
  assert.equal(calls[3]?.args.p_source_name, "Meds");
});

test("category alias adapter preserves typed RPC failures", async () => {
  const client = {
    rpc: async () => ({ data: null, error: { message: "PRODUCT_CATEGORY_ALIAS_VERSION_CONFLICT" } }),
  } as unknown as SupabaseClient;
  const repository = new SupabaseProductsRepository(client);

  await assert.rejects(
    () => repository.retireAlias({ ...context, aliasId: "00000000-0000-4000-8000-000000000001", expectedVersion: 2 }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "PRODUCT_CATEGORY_ALIAS_VERSION_CONFLICT",
  );
});
