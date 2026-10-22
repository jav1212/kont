import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { ProductCatalogImportConflictPolicy, ProductFailure, productCategoryId, productId } from "../../src/domain";
import { SupabaseProductCatalogImportRepository } from "../../src/adapters/supabase";

const sourceCompanyId = companyId("source-company");
const destinationCompanyId = companyId("destination-company");
const context = { actorUserId: userId("actor-id"), organizationId: organizationId("organization-id") };

test("the Supabase import adapter maps preview and execute RPC contracts without exposing operational fields", async () => {
  const calls: Array<{ readonly name: string; readonly args: Record<string, unknown> }> = [];
  const repository = new SupabaseProductCatalogImportRepository({
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "preview_native_product_catalog_import") {
        return { data: {
          sourceCompanyId, destinationCompanyId, sourceSnapshotToken: "source-token", destinationSnapshotToken: "destination-token",
          selection: { sourceCategoryIds: ["source-category"], sourceProductIds: ["source-product"], conflictPolicy: "skip" },
          conflicts: [{ itemKind: "product", sourceItemId: "source-product", reason: "destination_product_sku_exists", destinationItemId: "target-product" }],
          importableCategoryCount: 1, importableProductCount: 0,
        }, error: null };
      }
      return { data: {
        sourceCompanyId, destinationCompanyId, sourceSnapshotToken: "source-token", destinationSnapshotToken: "destination-after",
        conflictPolicy: "skip", createdCategories: [{ itemKind: "category", sourceItemId: "source-category", destinationItemId: "target-category" }],
        skippedCategorySourceIds: [], createdProducts: [], skippedProductSourceIds: ["source-product"],
      }, error: null };
    },
  } as never);
  const selection = { sourceCategoryIds: [productCategoryId("source-category")], sourceProductIds: [productId("source-product")], conflictPolicy: ProductCatalogImportConflictPolicy.Skip };
  const preview = await repository.preview({ ...context, sourceCompanyId, destinationCompanyId, selection });
  const result = await repository.execute({ ...context, sourceCompanyId, destinationCompanyId, selection, expectedSourceSnapshotToken: "source-token", expectedDestinationSnapshotToken: "destination-token", idempotencyKey: "import-1" });
  assert.equal(preview.conflicts[0]?.reason, "destination_product_sku_exists");
  assert.equal(result.createdCategories[0]?.destinationItemId, "target-category");
  assert.deepEqual(calls[0], { name: "preview_native_product_catalog_import", args: {
    p_actor_user_id: context.actorUserId, p_organization_id: context.organizationId, p_source_company_id: sourceCompanyId,
    p_destination_company_id: destinationCompanyId, p_selection: selection,
  } });
  assert.deepEqual(calls[1], { name: "execute_native_product_catalog_import", args: {
    p_actor_user_id: context.actorUserId, p_organization_id: context.organizationId, p_source_company_id: sourceCompanyId,
    p_destination_company_id: destinationCompanyId, p_selection: selection, p_expected_source_snapshot_token: "source-token",
    p_expected_destination_snapshot_token: "destination-token", p_idempotency_key: "import-1",
  } });
});

test("the Supabase import adapter preserves expected RPC failures", async () => {
  const repository = new SupabaseProductCatalogImportRepository({
    rpc: async () => ({ data: null, error: { message: "PRODUCT_CATALOG_IMPORT_DESTINATION_VERSION_CONFLICT" } }),
  } as never);
  await assert.rejects(
    () => repository.preview({ ...context, sourceCompanyId, destinationCompanyId, selection: { sourceCategoryIds: [productCategoryId("source-category")], sourceProductIds: [], conflictPolicy: ProductCatalogImportConflictPolicy.Fail } }),
    (error: unknown) => error instanceof ProductFailure && error.code === "PRODUCT_CATALOG_IMPORT_DESTINATION_VERSION_CONFLICT",
  );
});
