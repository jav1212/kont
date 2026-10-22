import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import {
  GetProductCustomFieldCatalog,
  GetProductCustomFieldValuesByProductIds,
  ReplaceProductCustomFieldCatalog,
  UpdateProductCustomFieldValues,
  type ProductCustomFieldCatalog,
  type ProductCustomFieldSnapshot,
  type ProductCustomFieldsAccess,
  type ProductCustomFieldsContext,
  type ProductCustomFieldsRepository,
} from "../../src/application";
import { ProductFailure, productId, type ProductCustomFieldDefinition } from "../../src/domain";

const context: ProductCustomFieldsContext = {
  actorUserId: userId("custom-fields-actor"),
  organizationId: organizationId("custom-fields-org"),
  companyId: companyId("custom-fields-company"),
};
const id = productId("product-custom-1");
const definitions: readonly ProductCustomFieldDefinition[] = [
  { id: "supplier-code", label: "Código proveedor", type: "text", required: true, maxLength: 30 },
  { id: "temperature", label: "Requiere frío", type: "boolean", required: false },
];

class MemoryRepository implements ProductCustomFieldsRepository {
  catalog: ProductCustomFieldCatalog | null = null;
  values: ProductCustomFieldSnapshot | null = { values: {}, version: 0 };

  async findCatalog(): Promise<ProductCustomFieldCatalog | null> { return this.catalog; }
  async saveCatalog(input: { definitions: readonly ProductCustomFieldDefinition[]; expectedVersion: number }): Promise<ProductCustomFieldCatalog> {
    const currentVersion = this.catalog?.version ?? 0;
    if (input.expectedVersion !== currentVersion) throw new ProductFailure("PRODUCT_CUSTOM_FIELD_CATALOG_VERSION_CONFLICT", "stale");
    this.catalog = { definitions: input.definitions, version: currentVersion + 1, updatedAt: "2026-09-29T00:00:00.000Z" };
    return this.catalog;
  }
  async findValues(): Promise<ProductCustomFieldSnapshot | null> { return this.values; }
  async findValuesByProductIds(_context: ProductCustomFieldsContext, productIds: readonly ReturnType<typeof productId>[]): Promise<Readonly<Record<string, ProductCustomFieldSnapshot>>> {
    const snapshot = this.values;
    return snapshot ? Object.fromEntries(productIds.map((productIdValue) => [productIdValue, snapshot])) : {};
  }
  async saveValues(input: { values: ProductCustomFieldSnapshot["values"]; expectedVersion: number }): Promise<ProductCustomFieldSnapshot> {
    if (!this.values || input.expectedVersion !== this.values.version) throw new ProductFailure("PRODUCT_CUSTOM_FIELDS_VERSION_CONFLICT", "stale");
    this.values = { values: input.values, version: this.values.version + 1 };
    return this.values;
  }
}

class AllowAccess implements ProductCustomFieldsAccess {
  async assertCanReadCatalog(): Promise<void> {}
  async assertCanManageCatalog(): Promise<void> {}
  async assertCanReadValues(): Promise<void> {}
  async assertCanUpdateValues(): Promise<void> {}
}

test("catalog management and product values use explicit authorization and optimistic versions", async () => {
  const repository = new MemoryRepository();
  const access = new AllowAccess();
  const getCatalog = new GetProductCustomFieldCatalog(repository, access);
  assert.equal((await getCatalog.execute(context)).version, 0);

  const replaceCatalog = new ReplaceProductCustomFieldCatalog(repository, access);
  const savedCatalog = await replaceCatalog.execute({ ...context, definitions, expectedVersion: 0 });
  assert.equal(savedCatalog.version, 1);
  assert.equal(savedCatalog.definitions[0]?.id, "supplier-code");
  await assert.rejects(
    () => replaceCatalog.execute({ ...context, definitions, expectedVersion: 0 }),
    { code: "PRODUCT_CUSTOM_FIELD_CATALOG_VERSION_CONFLICT" },
  );

  const updateValues = new UpdateProductCustomFieldValues(repository, access);
  const savedValues = await updateValues.execute({
    ...context,
    productId: id,
    expectedVersion: 0,
    values: { "supplier-code": " SUP-9 ", temperature: false },
  });
  assert.deepEqual(savedValues, { values: { "supplier-code": "SUP-9", temperature: false }, version: 1 });
  await assert.rejects(
    () => updateValues.execute({ ...context, productId: id, expectedVersion: 0, values: { "supplier-code": "SUP-10" } }),
    { code: "PRODUCT_CUSTOM_FIELDS_VERSION_CONFLICT" },
  );
});

test("authorization and company field definitions gate catalog and value changes", async () => {
  const repository = new MemoryRepository();
  let writes = 0;
  const source = repository.saveValues.bind(repository);
  repository.saveValues = async (input) => { writes += 1; return source(input); };
  const denied: ProductCustomFieldsAccess = {
    async assertCanReadCatalog() { throw new ProductFailure("PRODUCT_ACCESS_DENIED", "denied"); },
    async assertCanManageCatalog() { throw new ProductFailure("PRODUCT_ACCESS_DENIED", "denied"); },
    async assertCanReadValues() { throw new ProductFailure("PRODUCT_ACCESS_DENIED", "denied"); },
    async assertCanUpdateValues() { throw new ProductFailure("PRODUCT_ACCESS_DENIED", "denied"); },
  };
  await assert.rejects(
    () => new ReplaceProductCustomFieldCatalog(repository, denied).execute({ ...context, definitions, expectedVersion: 0 }),
    { code: "PRODUCT_ACCESS_DENIED" },
  );
  await assert.rejects(
    () => new UpdateProductCustomFieldValues(repository, denied).execute({ ...context, productId: id, expectedVersion: 0, values: { "supplier-code": "X" } }),
    { code: "PRODUCT_ACCESS_DENIED" },
  );
  const update = new UpdateProductCustomFieldValues(repository, new AllowAccess());
  await assert.rejects(
    () => update.execute({ ...context, productId: id, expectedVersion: 0, values: { "supplier-code": "X", undeclared: "value" } }),
    { code: "PRODUCT_CUSTOM_FIELDS_INVALID" },
  );
  assert.equal(writes, 0);
});

test("batch reads validate requested catalog values and cap page size", async () => {
  const repository = new MemoryRepository();
  repository.catalog = { definitions, version: 1, updatedAt: null };
  repository.values = { values: { "supplier-code": "SUP-2", temperature: false }, version: 3 };
  const query = new GetProductCustomFieldValuesByProductIds(repository, new AllowAccess());
  assert.deepEqual(await query.execute(context, [id]), {
    [id]: { values: { "supplier-code": "SUP-2", temperature: false }, version: 3 },
  });
  await assert.rejects(() => query.execute(context, Array.from({ length: 51 }, (_, index) => `product-${index}`)), { code: "PRODUCT_CUSTOM_FIELDS_INVALID" });
  await assert.rejects(() => query.execute(context, [id, id]), { code: "PRODUCT_CUSTOM_FIELDS_INVALID" });
});
