import assert from "node:assert/strict";
import test from "node:test";
import { userId } from "@kontave/organizations/domain";
import { GetEffectiveUserProcessParameters, UpdateUserProcessParameters, type ProcessParameterCatalog, type UserProcessDefaultsRepository } from "../../src/application";
import type { UserProcessDefaults } from "../../src/domain";

const owner = userId("process-parameters-owner");
const clock = { now: () => "2026-09-30T00:00:00.000Z" };
const catalog: ProcessParameterCatalog = {
  processId: "payroll.run",
  parameters: [
    { id: "preview", kind: "boolean", defaultValue: true, customizable: true },
    { id: "page_size", kind: "number", defaultValue: 25, min: 10, max: 100, customizable: true },
    { id: "label", kind: "text", defaultValue: "Nómina", maxLength: 40, customizable: true },
    { id: "period", kind: "choice", defaultValue: "current", options: ["current", "previous"], customizable: true },
    { id: "approval_required", kind: "boolean", defaultValue: true, customizable: false },
  ],
};

class MemoryRepository implements UserProcessDefaultsRepository {
  value: UserProcessDefaults | null = null;
  reads = 0;
  writes = 0;

  /** @param _userId - Preference owner. @param processId - Namespaced process key. @returns Stored snapshot, if any. */
  async find(_userId: typeof owner, processId: string): Promise<UserProcessDefaults | null> {
    this.reads += 1;
    assert.equal(processId, "process.parameters.payroll.run");
    return this.value;
  }

  /** @param value - Replacement snapshot. @param expectedVersion - Revision to compare. @returns Stored snapshot. @throws Error on a stale write. */
  async save(value: UserProcessDefaults, expectedVersion: number): Promise<UserProcessDefaults> {
    this.writes += 1;
    if ((this.value?.version ?? 0) !== expectedVersion) throw new Error("stale");
    this.value = value;
    return value;
  }
}

test("process parameters resolve defaults without writing and replace sparse typed overrides", async () => {
  const repository = new MemoryRepository();
  const get = new GetEffectiveUserProcessParameters(repository, clock);
  const update = new UpdateUserProcessParameters(repository, clock);
  const initial = await get.execute({ userId: owner, catalog });
  assert.equal(initial.version, 0);
  assert.deepEqual(initial.values, { preview: true, page_size: 25, label: "Nómina", period: "current", approval_required: true });
  assert.equal(repository.writes, 0);

  const changed = await update.execute({ userId: owner, catalog, expectedVersion: 0, values: { preview: false, page_size: 50, period: "previous" } });
  assert.equal(changed.version, 1);
  assert.deepEqual(repository.value?.values, { preview: false, page_size: 50, period: "previous" });
  assert.equal(changed.values.approval_required, true);
  await assert.rejects(() => update.execute({ userId: owner, catalog, expectedVersion: 0, values: {} }), { code: "PREFERENCES_VERSION_CONFLICT" });
  const reset = await update.execute({ userId: owner, catalog, expectedVersion: 1, values: {} });
  assert.deepEqual(reset.values, initial.values);
  assert.deepEqual(repository.value?.values, {});
});

test("process parameters reject unregistered, locked, mismatched and out-of-range values before writing", async () => {
  const repository = new MemoryRepository();
  const update = new UpdateUserProcessParameters(repository, clock);
  const invalid = [
    { other: true }, { approval_required: false }, { preview: "false" }, { page_size: 101 },
    { page_size: Number.NaN }, { label: "x".repeat(41) }, { label: "x\u0000" }, { period: "next" },
  ];
  for (const values of invalid) {
    await assert.rejects(() => update.execute({ userId: owner, catalog, expectedVersion: 0, values }), { code: "PREFERENCES_INVALID" });
  }
  await assert.rejects(() => update.execute({ userId: owner, catalog: { ...catalog, parameters: [...catalog.parameters, catalog.parameters[0]!] }, expectedVersion: 0, values: {} }), { code: "PREFERENCES_INVALID" });
  assert.equal(repository.reads, 0);
  assert.equal(repository.writes, 0);
});

test("a catalog revision ignores retired overrides and restores newly locked defaults", async () => {
  const repository = new MemoryRepository();
  const update = new UpdateUserProcessParameters(repository, clock);
  await update.execute({ userId: owner, catalog, expectedVersion: 0, values: { preview: false, period: "previous" } });
  const revised: ProcessParameterCatalog = {
    processId: catalog.processId,
    parameters: catalog.parameters.filter((item) => item.id !== "period").map((item) => item.id === "preview" ? { ...item, customizable: false } : item),
  };
  const result = await new GetEffectiveUserProcessParameters(repository, clock).execute({ userId: owner, catalog: revised });
  assert.equal(result.values.preview, true);
  assert.equal(result.values.period, undefined);
  assert.equal(result.version, 1);
});
