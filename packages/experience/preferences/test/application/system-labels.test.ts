import assert from "node:assert/strict";
import test from "node:test";
import { userId } from "@kontave/organizations/domain";
import type { UserProcessDefaults } from "../../src/domain";
import { GetEffectiveUserSystemLabels, UpdateUserSystemLabels, type SystemLabelDefinition, type UserProcessDefaultsRepository } from "../../src/application";

class MemoryRepository implements UserProcessDefaultsRepository {
  value: UserProcessDefaults | null = null;

  async find(_userId: string, processId: string) {
    assert.equal(processId, "system.labels");
    return this.value;
  }

  async save(value: UserProcessDefaults, expectedVersion: number) {
    if ((this.value?.version ?? 0) !== expectedVersion) throw new Error("stale");
    this.value = value;
    return value;
  }
}

const owner = userId("system-label-owner");
const clock = { now: () => "2026-09-29T00:00:00.000Z" };
const catalog: readonly SystemLabelDefinition[] = [
  { id: "system.customer", defaultLabel: "Cliente", customizable: true },
  { id: "system.tax-id", defaultLabel: "RIF", customizable: false },
];

test("system labels resolve registered defaults and update atomically by user revision", async () => {
  const repository = new MemoryRepository();
  const get = new GetEffectiveUserSystemLabels(repository, clock);
  assert.deepEqual((await get.execute({ userId: owner, catalog })).labels, {
    "system.customer": "Cliente",
    "system.tax-id": "RIF",
  });
  assert.equal(repository.value, null);

  const update = new UpdateUserSystemLabels(repository, clock);
  const saved = await update.execute({
    userId: owner,
    catalog,
    expectedVersion: 0,
    labels: { "system.customer": "  Comprador  " },
  });
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.labels, { "system.customer": "Comprador", "system.tax-id": "RIF" });
  await assert.rejects(
    () => update.execute({ userId: owner, catalog, expectedVersion: 0, labels: {} }),
    { code: "PREFERENCES_VERSION_CONFLICT" },
  );

  const lockedCatalog = catalog.map((item) => item.id === "system.customer" ? { ...item, customizable: false } : item);
  assert.equal((await get.execute({ userId: owner, catalog: lockedCatalog })).labels["system.customer"], "Cliente");
  const reset = await update.execute({ userId: owner, catalog, expectedVersion: 1, labels: {} });
  assert.equal(reset.version, 2);
  assert.equal(reset.labels["system.customer"], "Cliente");
});

test("system label updates reject unknown, protected, unsafe, and invalid catalog entries", async () => {
  const repository = new MemoryRepository();
  const update = new UpdateUserSystemLabels(repository, clock);
  const invalid = [
    { "system.unknown": "Nombre" },
    { "system.tax-id": "Identificación" },
    { "system.customer": "Nombre\nilegible" },
    { "system.customer": "x".repeat(61) },
    { "system.customer": " " },
  ];
  for (const labels of invalid) {
    await assert.rejects(
      () => update.execute({ userId: owner, catalog, expectedVersion: 0, labels }),
      { code: "PREFERENCES_INVALID" },
    );
  }
  await assert.rejects(
    () => update.execute({
      userId: owner,
      catalog: [...catalog, catalog[0]!],
      expectedVersion: 0,
      labels: {},
    }),
    { code: "PREFERENCES_INVALID" },
  );
  assert.equal(repository.value, null);
});

test("independent module catalogs keep their overrides in separate user preference rows", async () => {
  const values = new Map<string, UserProcessDefaults>();
  const repository: UserProcessDefaultsRepository = {
    async find(_userId, processId) {
      return values.get(processId) ?? null;
    },
    async save(value, expectedVersion) {
      const current = values.get(value.processId);
      if ((current?.version ?? 0) !== expectedVersion) throw new Error("stale");
      values.set(value.processId, value);
      return value;
    },
  };
  const update = new UpdateUserSystemLabels(repository, clock);
  const get = new GetEffectiveUserSystemLabels(repository, clock);
  const inventoryCatalog = [{ id: "system.product", defaultLabel: "Producto", customizable: true }] as const;
  const billingCatalog = [{ id: "system.invoice", defaultLabel: "Factura", customizable: true }] as const;

  await update.execute({
    userId: owner,
    catalog: inventoryCatalog,
    catalogId: "inventory.products",
    expectedVersion: 0,
    labels: { "system.product": "Artículo" },
  });
  const untouchedBilling = await get.execute({
    userId: owner,
    catalog: billingCatalog,
    catalogId: "billing.invoices",
  });
  assert.equal(untouchedBilling.labels["system.invoice"], "Factura");
  assert.equal(untouchedBilling.version, 0);
  assert.equal(values.size, 1);

  await update.execute({
    userId: owner,
    catalog: billingCatalog,
    catalogId: "billing.invoices",
    expectedVersion: 0,
    labels: { "system.invoice": "Comprobante" },
  });
  const savedInventory = await get.execute({
    userId: owner,
    catalog: inventoryCatalog,
    catalogId: "inventory.products",
  });
  assert.equal(savedInventory.labels["system.product"], "Artículo");
  assert.equal(savedInventory.version, 1);
  assert.equal(values.get("system.labels.inventory.products")?.version, 1);
  assert.equal(values.get("system.labels.billing.invoices")?.version, 1);
});

test("scoped system-label catalogs reject identifiers outside the safe process-id format", async () => {
  const repository = new MemoryRepository();
  const get = new GetEffectiveUserSystemLabels(repository, clock);
  await assert.rejects(
    () => get.execute({ userId: owner, catalog, catalogId: "../other" }),
    { code: "PREFERENCES_INVALID" },
  );
});
