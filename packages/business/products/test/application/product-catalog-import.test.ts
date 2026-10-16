import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import {
  ProductCatalogImportConflictPolicy,
  ProductFailure,
  productCategoryId,
  productId,
} from "../../src/domain";
import {
  ExecuteProductCatalogImport,
  PreviewProductCatalogImport,
  ProductCatalogImportOperation,
  type ExecuteProductCatalogImportCommand,
  type ProductCatalogImportAuthorization,
  type ProductCatalogImportPreview,
  type ProductCatalogImportRepository,
} from "../../src/application";

const actorUserId = userId("import-actor");
const organizationIdValue = organizationId("import-organization");
const sourceCompanyId = companyId("source-company");
const destinationCompanyId = companyId("destination-company");
const categoryId = productCategoryId("source-category");
const productIdValue = productId("source-product");

function selection(policy = ProductCatalogImportConflictPolicy.Skip) {
  return { sourceCategoryIds: [categoryId], sourceProductIds: [productIdValue], conflictPolicy: policy };
}

function preview(): ProductCatalogImportPreview {
  return {
    sourceCompanyId,
    destinationCompanyId,
    sourceSnapshotToken: "source:selected:v1",
    destinationSnapshotToken: "destination:keys:v1",
    selection: selection(),
    conflicts: [{ itemKind: "product", sourceItemId: productIdValue, reason: "destination_product_sku_ambiguous", destinationItemId: productId("destination-product") }],
    importableCategoryCount: 1,
    importableProductCount: 0,
  };
}

function command(): ExecuteProductCatalogImportCommand {
  return {
    actorUserId,
    organizationId: organizationIdValue,
    sourceCompanyId,
    destinationCompanyId,
    selection: selection(),
    expectedSourceSnapshotToken: "source:selected:v1",
    expectedDestinationSnapshotToken: "destination:keys:v1",
    idempotencyKey: "import-catalog-1",
  };
}

test("preview authorizes the source read and destination write independently", async () => {
  const calls: Array<{ readonly companyId: string; readonly operation: ProductCatalogImportOperation; readonly permission: string }> = [];
  const authorization: ProductCatalogImportAuthorization = {
    async assertCanImportProductCatalog(scope, operation, permission) {
      calls.push({ companyId: scope.companyId, operation, permission });
    },
  };
  const result = await new PreviewProductCatalogImport(authorization, { async preview() { return preview(); } }).execute({
    actorUserId, organizationId: organizationIdValue, sourceCompanyId, destinationCompanyId, selection: selection(),
  });
  assert.equal(result.sourceSnapshotToken, "source:selected:v1");
  assert.deepEqual(calls, [
    { companyId: sourceCompanyId, operation: ProductCatalogImportOperation.ReadSource, permission: "inventory.read" },
    { companyId: destinationCompanyId, operation: ProductCatalogImportOperation.PreviewDestination, permission: "inventory.update" },
  ]);
});

test("preview accepts an ordinary target collision as an explicit conflict", async () => {
  const authorization: ProductCatalogImportAuthorization = { async assertCanImportProductCatalog() {} };
  const result = await new PreviewProductCatalogImport(authorization, {
    async preview() {
      return {
        ...preview(),
        conflicts: [{ itemKind: "product", sourceItemId: productIdValue, reason: "destination_product_sku_exists", destinationItemId: productId("existing-product") }],
      };
    },
  }).execute({ actorUserId, organizationId: organizationIdValue, sourceCompanyId, destinationCompanyId, selection: selection() });
  assert.equal(result.conflicts[0]?.reason, "destination_product_sku_exists");
});

test("execute pins both opaque snapshots, retains skip policy, and requires an atomic receipt", async () => {
  const calls: Array<{ readonly companyId: string; readonly operation: ProductCatalogImportOperation; readonly permission: string }> = [];
  const authorization: ProductCatalogImportAuthorization = {
    async assertCanImportProductCatalog(scope, operation, permission) {
      calls.push({ companyId: scope.companyId, operation, permission });
    },
  };
  const persisted: ExecuteProductCatalogImportCommand[] = [];
  const repository: Pick<ProductCatalogImportRepository, "execute"> = {
    async execute(value) {
      persisted.push(value);
      return {
        sourceCompanyId,
        destinationCompanyId,
        sourceSnapshotToken: value.expectedSourceSnapshotToken,
        destinationSnapshotToken: "destination:after:v2",
        conflictPolicy: value.selection.conflictPolicy,
        createdCategories: [{ itemKind: "category", sourceItemId: categoryId, destinationItemId: productCategoryId("created-category") }],
        skippedCategorySourceIds: [],
        createdProducts: [],
        skippedProductSourceIds: [productIdValue],
      };
    },
  };
  const result = await new ExecuteProductCatalogImport(authorization, repository).execute({ ...command(), idempotencyKey: " import-catalog-1 " });
  assert.equal(result.destinationSnapshotToken, "destination:after:v2");
  assert.equal(persisted[0]?.idempotencyKey, "import-catalog-1");
  assert.deepEqual(calls, [
    { companyId: sourceCompanyId, operation: ProductCatalogImportOperation.ReadSource, permission: "inventory.read" },
    { companyId: destinationCompanyId, operation: ProductCatalogImportOperation.ImportToDestination, permission: "inventory.update" },
  ]);
});

test("the use case rejects a self-import before authorizing or writing", async () => {
  let authorized = false;
  const authorization: ProductCatalogImportAuthorization = { async assertCanImportProductCatalog() { authorized = true; } };
  const repository: Pick<ProductCatalogImportRepository, "execute"> = { async execute() { throw new Error("must not persist"); } };
  await assert.rejects(
    () => new ExecuteProductCatalogImport(authorization, repository).execute({ ...command(), destinationCompanyId: sourceCompanyId }),
    failure("PRODUCT_CATALOG_IMPORT_INVALID"),
  );
  assert.equal(authorized, false);
});

test("the use case rejects a receipt that silently omits a selected source record", async () => {
  const authorization: ProductCatalogImportAuthorization = { async assertCanImportProductCatalog() {} };
  const repository: Pick<ProductCatalogImportRepository, "execute"> = {
    async execute(value) {
      return {
        sourceCompanyId, destinationCompanyId, sourceSnapshotToken: value.expectedSourceSnapshotToken,
        destinationSnapshotToken: "destination:after:v2", conflictPolicy: value.selection.conflictPolicy,
        createdCategories: [], skippedCategorySourceIds: [], createdProducts: [], skippedProductSourceIds: [],
      };
    },
  };
  await assert.rejects(() => new ExecuteProductCatalogImport(authorization, repository).execute(command()), failure("PRODUCT_CATALOG_IMPORT_INVALID"));
});

test("the receipt accepts created and skipped categories in a different order than the selection", async () => {
  const categoryTwo = productCategoryId("source-category-two");
  const authorization: ProductCatalogImportAuthorization = { async assertCanImportProductCatalog() {} };
  const repository: Pick<ProductCatalogImportRepository, "execute"> = {
    async execute(value) {
      return {
        sourceCompanyId, destinationCompanyId, sourceSnapshotToken: value.expectedSourceSnapshotToken,
        destinationSnapshotToken: "destination:after:v2", conflictPolicy: value.selection.conflictPolicy,
        createdCategories: [{ itemKind: "category", sourceItemId: categoryTwo, destinationItemId: productCategoryId("created-category-two") }],
        skippedCategorySourceIds: [categoryId], createdProducts: [], skippedProductSourceIds: [],
      };
    },
  };
  const result = await new ExecuteProductCatalogImport(authorization, repository).execute({
    ...command(), selection: { sourceCategoryIds: [categoryId, categoryTwo], sourceProductIds: [], conflictPolicy: ProductCatalogImportConflictPolicy.Skip },
  });
  assert.equal(result.createdCategories[0]?.sourceItemId, categoryTwo);
});

test("the source selection cannot rely on duplicate source identities", async () => {
  await assert.rejects(
    () => new PreviewProductCatalogImport({ async assertCanImportProductCatalog() {} }, { async preview() { return preview(); } }).execute({
      actorUserId, organizationId: organizationIdValue, sourceCompanyId, destinationCompanyId,
      selection: { sourceCategoryIds: [categoryId, categoryId], sourceProductIds: [], conflictPolicy: ProductCatalogImportConflictPolicy.Fail },
    }),
    failure("PRODUCT_CATALOG_IMPORT_INVALID"),
  );
});

test("selection bounds an atomic import and rejects malformed runtime identifiers", async () => {
  const categories = Array.from({ length: 101 }, (_, index) => productCategoryId(`category-${index}`));
  await assert.rejects(
    () => new PreviewProductCatalogImport({ async assertCanImportProductCatalog() {} }, { async preview() { return preview(); } }).execute({
      actorUserId, organizationId: organizationIdValue, sourceCompanyId, destinationCompanyId,
      selection: { sourceCategoryIds: categories, sourceProductIds: [], conflictPolicy: ProductCatalogImportConflictPolicy.Fail },
    }),
    failure("PRODUCT_CATALOG_IMPORT_INVALID"),
  );
  await assert.rejects(
    () => new PreviewProductCatalogImport({ async assertCanImportProductCatalog() {} }, { async preview() { return preview(); } }).execute({
      actorUserId, organizationId: organizationIdValue, sourceCompanyId, destinationCompanyId,
      selection: { sourceCategoryIds: ["\t" as unknown as typeof categoryId], sourceProductIds: [], conflictPolicy: ProductCatalogImportConflictPolicy.Fail },
    }),
    /product category identifier is invalid/,
  );
});

function failure(code: string) {
  return (error: unknown) => error instanceof ProductFailure && error.code === code;
}
