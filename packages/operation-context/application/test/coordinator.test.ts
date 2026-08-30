import test from "node:test";
import assert from "node:assert/strict";
import { currency, exchangeRate } from "@kontave/monetary-domain";
import { companyId, organizationId, userId } from "@kontave/organizations/domain";
import { OperationContextFailure, localDate, type OperationalDefaults } from "@kontave/operation-context-domain";
import { OperationContextCoordinator, type OperationContextStore, type OperationExchangeRateResolver } from "../src/index";

const USD = currency("USD", 2), VES = currency("VES", 2);
const key = { userId: userId("user"), organizationId: organizationId("organization"), companyId: companyId("company") };
const clock = { now: () => "2026-08-16T12:00:00.000Z", today: () => localDate("2026-08-16") };
const result = (date: string, value: string) => ({ requestedDate: date, effectiveDate: date, resolution: "exact_date" as const, observedAt: clock.now(), freshness: { kind: "fresh" as const, retrievedAt: clock.now() }, rates: [{ rate: exchangeRate({ baseCurrency: USD, quoteCurrency: VES, value }), effectiveDate: date, capturedAt: clock.now(), source: { kind: "official" as const, authority: "BCV", reference: null } }] });

class MemoryStore implements OperationContextStore {
  value: OperationalDefaults | null = null;
  async load() { return this.value; }
  async save(value: OperationalDefaults, expectedVersion: number) {
    if ((this.value?.version ?? 0) !== expectedVersion) throw new Error("conflict");
    return this.value = value;
  }
  async clear() { this.value = null; }
}

test("initializes defaults and resolves the official rate", async () => {
  const store = new MemoryStore();
  const rates: OperationExchangeRateResolver = { historical: async (_currency, date) => result(date, "150.12") };
  const coordinator = new OperationContextCoordinator(store, rates, clock);
  await coordinator.initialize(key);
  assert.equal(coordinator.getState().status, "ready");
  assert.equal(store.value?.version, 1);
});

test("a slower date change cannot overwrite the latest selection", async () => {
  const store = new MemoryStore();
  let release!: () => void;
  const slow = new Promise<void>((resolve) => { release = resolve; });
  const rates: OperationExchangeRateResolver = { historical: async (_currency, date) => {
    if (date === "2026-08-14") await slow;
    return result(date, date === "2026-08-15" ? "151" : "150");
  } };
  const coordinator = new OperationContextCoordinator(store, rates, clock);
  await coordinator.initialize(key);
  const first = coordinator.changeEffectiveDate(localDate("2026-08-14"));
  // A changing state intentionally rejects user mutations, so simulate a newer workspace-level resolution.
  const second = coordinator.initialize(key);
  release();
  await Promise.all([first, second]);
  assert.equal(coordinator.getState().status, "ready");
  assert.equal(store.value?.effectiveDate, "2026-08-16");
});

test("invalid manual rates publish a typed failure without leaving a changing state", async () => {
  const store = new MemoryStore();
  const rates: OperationExchangeRateResolver = { historical: async (_currency, date) => result(date, "150.12") };
  const coordinator = new OperationContextCoordinator(store, rates, clock);
  await coordinator.initialize(key);

  await assert.rejects(
    coordinator.selectManualExchangeRate({ baseCurrency: USD, value: "151", reason: " " }),
    (cause) => cause instanceof OperationContextFailure && cause.code === "OPERATION_CONTEXT_INVALID",
  );

  const state = coordinator.getState();
  assert.equal(state.status, "failed");
  assert.equal(state.status === "failed" ? state.previous?.version : null, 1);
  assert.equal(store.value?.version, 1);
});

test("an unavailable official rate persists an explicit unavailable selection", async () => {
  const store = new MemoryStore();
  const rates: OperationExchangeRateResolver = {
    historical: async () => { throw { code: "RATE_NOT_AVAILABLE" }; },
  };
  const coordinator = new OperationContextCoordinator(store, rates, clock);

  await coordinator.initialize(key);

  assert.equal(coordinator.getState().status, "ready");
  assert.equal(store.value?.exchangeRate.status, "unavailable");
});

test("unexpected resolver failures cross the boundary as typed application failures", async () => {
  const store = new MemoryStore();
  let fail = false;
  const rates: OperationExchangeRateResolver = {
    historical: async (_currency, date) => {
      if (fail) throw new Error("provider offline");
      return result(date, "150.12");
    },
  };
  const coordinator = new OperationContextCoordinator(store, rates, clock);
  await coordinator.initialize(key);
  fail = true;

  await assert.rejects(
    coordinator.refreshExchangeRate(),
    (cause) => cause instanceof OperationContextFailure && cause.code === "OPERATION_CONTEXT_REPOSITORY_UNAVAILABLE",
  );
  assert.equal(coordinator.getState().status, "failed");
});
