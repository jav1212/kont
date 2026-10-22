import assert from "node:assert/strict";
import test from "node:test";
import { userId } from "@kontave/organizations/domain";
import type { UserProcessDefaults } from "../../src/domain";
import { GetEffectiveUserHelpTexts, UpdateUserHelpTexts, type HelpTopicDefinition, type UserProcessDefaultsRepository } from "../../src/application";

class MemoryRepository implements UserProcessDefaultsRepository {
  value: UserProcessDefaults | null = null;

  async find(_userId: string, processId: string) {
    assert.equal(processId, "help.texts");
    return this.value;
  }

  async save(value: UserProcessDefaults, expectedVersion: number) {
    if ((this.value?.version ?? 0) !== expectedVersion) throw new Error("stale");
    this.value = value;
    return value;
  }
}

const owner = userId("help-text-owner");
const clock = { now: () => "2026-09-29T00:00:00.000Z" };
const catalog: readonly HelpTopicDefinition[] = [
  { id: "sales.customer-id", defaultText: "Identificación fiscal del cliente.", customizable: true },
  { id: "sales.tax-warning", defaultText: "Verifique el tratamiento fiscal vigente.", customizable: false },
];

test("help text resolves canonical defaults and saves customizable copy with optimistic revisions", async () => {
  const repository = new MemoryRepository();
  const get = new GetEffectiveUserHelpTexts(repository, clock);
  assert.deepEqual((await get.execute({ userId: owner, catalog })).texts, {
    "sales.customer-id": "Identificación fiscal del cliente.",
    "sales.tax-warning": "Verifique el tratamiento fiscal vigente.",
  });
  assert.equal(repository.value, null);

  const update = new UpdateUserHelpTexts(repository, clock);
  const saved = await update.execute({
    userId: owner,
    catalog,
    expectedVersion: 0,
    texts: { "sales.customer-id": "  RIF o cédula del cliente.  " },
  });
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.texts, {
    "sales.customer-id": "RIF o cédula del cliente.",
    "sales.tax-warning": "Verifique el tratamiento fiscal vigente.",
  });
  const lockedCatalog = catalog.map((topic) => topic.id === "sales.customer-id" ? { ...topic, customizable: false } : topic);
  const lockedRead = await get.execute({ userId: owner, catalog: lockedCatalog });
  assert.equal(lockedRead.texts["sales.customer-id"], "Identificación fiscal del cliente.");
  await assert.rejects(
    () => update.execute({ userId: owner, catalog, expectedVersion: 0, texts: {} }),
    { code: "PREFERENCES_VERSION_CONFLICT" },
  );
  const reset = await update.execute({ userId: owner, catalog, expectedVersion: 1, texts: {} });
  assert.deepEqual(reset.texts, {
    "sales.customer-id": "Identificación fiscal del cliente.",
    "sales.tax-warning": "Verifique el tratamiento fiscal vigente.",
  });
});

test("help text rejects unregistered, locked, unsafe, and unbounded overrides before saving", async () => {
  const repository = new MemoryRepository();
  const update = new UpdateUserHelpTexts(repository, clock);
  const invalid = [
    { "unknown.topic": "Ayuda" },
    { "sales.tax-warning": "Texto legal alterado" },
    { "sales.customer-id": "Texto\u0007inseguro" },
    { "sales.customer-id": "x".repeat(2_001) },
    { "sales.customer-id": "   " },
  ];
  for (const texts of invalid) {
    await assert.rejects(
      () => update.execute({ userId: owner, catalog, expectedVersion: 0, texts }),
      { code: "PREFERENCES_INVALID" },
    );
  }
  await assert.rejects(
    () => update.execute({
      userId: owner,
      catalog: [...catalog, catalog[0]!],
      expectedVersion: 0,
      texts: {},
    }),
    { code: "PREFERENCES_INVALID" },
  );
  assert.equal(repository.value, null);
});
