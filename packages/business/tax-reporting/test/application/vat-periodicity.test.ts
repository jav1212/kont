import assert from "node:assert/strict";
import test from "node:test";
import { ConfigureVatPeriodicity, GetVatPeriodicity } from "../../src/application/vat-periodicity";
import { SupabaseVatPeriodicityRepository } from "../../src/adapters/supabase/vat-periodicity";
import { TaxReportingFailure, type ConfigureVatPeriodicityCommand, type VatPeriodicityRepository } from "../../src/domain";

const scope = { tenantId: "tenant", organizationId: "organization", companyId: "J-1" };
const command = (overrides: Partial<ConfigureVatPeriodicityCommand> = {}): ConfigureVatPeriodicityCommand => ({ periodicity: "monthly", expectedPeriodicity: null, reason: null, actorId: "actor", idempotencyKey: "key-1", ...overrides });

/** @returns Repository double that records the last persisted command. */
function recordingRepository(): VatPeriodicityRepository & { saved: ConfigureVatPeriodicityCommand | null } {
  return {
    saved: null,
    async get() { return { periodicity: null, persistedPeriods: 0, changes: [] }; },
    async set(_scope, next) { this.saved = next; return { periodicity: next.periodicity, replayed: false }; },
  };
}

test("first configuration needs no reason and reaches persistence trimmed", async () => {
  const repository = recordingRepository();
  await new ConfigureVatPeriodicity(repository).execute({ scope, command: command({ reason: "  ", idempotencyKey: " key-1 " }) });
  assert.equal(repository.saved?.reason, null);
  assert.equal(repository.saved?.idempotencyKey, "key-1");
});

test("changing a configured value requires a reason and an actual change", async () => {
  const repository = recordingRepository();
  const action = new ConfigureVatPeriodicity(repository);
  await assert.rejects(action.execute({ scope, command: command({ periodicity: "fortnightly", expectedPeriodicity: "monthly" }) }), /requires a reason/);
  await assert.rejects(action.execute({ scope, command: command({ expectedPeriodicity: "monthly", reason: "x" }) }), /already configured/);
  assert.equal(repository.saved, null, "rejected commands never reach persistence");
  await action.execute({ scope, command: command({ periodicity: "fortnightly", expectedPeriodicity: "monthly", reason: "Providencia SENIAT" }) });
  const saved = repository.saved as ConfigureVatPeriodicityCommand | null;
  assert.equal(saved?.periodicity, "fortnightly");
});

test("reader requires an actor and never infers a default periodicity", async () => {
  const reader = new GetVatPeriodicity(recordingRepository());
  await assert.rejects(reader.execute({ scope, actorId: " " }), TaxReportingFailure);
  assert.equal((await reader.execute({ scope, actorId: "actor" })).periodicity, null);
});

test("adapter maps security and lock failures to stable codes and decodes the audit trail", async () => {
  const failing = (message: string) => new SupabaseVatPeriodicityRepository({ async rpc() { return { data: null, error: { message, code: "P0001" } }; } } as never);
  await assert.rejects(failing("ORGANIZATIONAL_USER_ACCESS_DENIED").set(scope, command()), (error: unknown) => error instanceof TaxReportingFailure && error.code === "TAX_REPORTING_SCOPE");
  await assert.rejects(failing("TAX_REPORTING_PERIODICITY_LOCKED").set(scope, command()), (error: unknown) => error instanceof TaxReportingFailure && error.code === "TAX_REPORTING_PERIODICITY_LOCKED");
  let args: Record<string, unknown> | undefined;
  const reading = new SupabaseVatPeriodicityRepository({ async rpc(_name: string, next: Record<string, unknown>) { args = next; return { data: { periodicity: "monthly", persistedPeriods: 2, events: [{ from: null, to: "monthly", actorId: "actor", reason: null, occurredAt: "2026-10-23T00:00:00Z" }] }, error: null }; } } as never);
  const setting = await reading.get(scope, "actor");
  assert.equal(args?.p_actor_id, "actor");
  assert.deepEqual([setting.periodicity, setting.persistedPeriods, setting.changes[0]?.to], ["monthly", 2, "monthly"]);
  const malformed = new SupabaseVatPeriodicityRepository({ async rpc() { return { data: { periodicity: "weekly", persistedPeriods: 0, events: [] }, error: null }; } } as never);
  await assert.rejects(malformed.get(scope, "actor"), (error: unknown) => error instanceof TaxReportingFailure && error.code === "TAX_REPORTING_UNAVAILABLE");
});
