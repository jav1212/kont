import assert from "node:assert/strict";
import test from "node:test";
import { userId } from "@kontave/organizations/domain";
import { UpdateUserSystemLabels, type UserProcessDefaults, type UserProcessDefaultsRepository } from "@kontave/preferences/application";
import { PreferencesFailure } from "@kontave/preferences/domain";
import { EMPLOYEE_SYSTEM_LABELS } from "@/src/modules/payroll/domain/employee-system-labels";
import { PRODUCT_SYSTEM_LABELS } from "@/src/modules/inventory/domain/product-system-labels";
import { SUPPLIER_SYSTEM_LABELS } from "@/src/modules/purchases/domain/supplier-system-labels";

class MemoryRepository implements UserProcessDefaultsRepository {
  readonly values = new Map<string, UserProcessDefaults>();

  async find(_userId: string, processId: string) {
    return this.values.get(processId) ?? null;
  }

  async save(value: UserProcessDefaults, expectedVersion: number) {
    if ((this.values.get(value.processId)?.version ?? 0) !== expectedVersion) throw new Error("stale revision");
    this.values.set(value.processId, value);
    return value;
  }
}

test("registered system-label catalogs use globally unique stable IDs", () => {
  const ids = [PRODUCT_SYSTEM_LABELS, EMPLOYEE_SYSTEM_LABELS, SUPPLIER_SYSTEM_LABELS].flatMap((catalog) => catalog.map(({ id }) => id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.startsWith("system.")));
});

test("supplier RIF keeps its canonical tax label and cannot receive a personal override", async () => {
  const rif = SUPPLIER_SYSTEM_LABELS.find(({ id }) => id === "system.purchases.suppliers.rif");
  assert.deepEqual(rif, { id: "system.purchases.suppliers.rif", defaultLabel: "RIF", customizable: false });

  const repository = new MemoryRepository();
  const update = new UpdateUserSystemLabels(repository, { now: () => "2026-09-30T12:00:00.000Z" });
  await assert.rejects(() => update.execute({
    userId: userId("supplier-label-owner"),
    catalog: SUPPLIER_SYSTEM_LABELS,
    catalogId: "purchases.suppliers",
    expectedVersion: 0,
    labels: { "system.purchases.suppliers.rif": "Tax number" },
  }), (cause: unknown) => cause instanceof PreferencesFailure && cause.code === "PREFERENCES_INVALID");
  assert.equal(repository.values.size, 0);
});
