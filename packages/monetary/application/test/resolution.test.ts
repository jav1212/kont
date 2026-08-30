import assert from "node:assert/strict";
import test from "node:test";
import { currency, exchangeRate, type ExchangeRateSnapshot } from "@kontave/monetary-domain";
import { ExchangeRateApplicationFailure, InMemoryExchangeRateCache, ResolveExchangeRates, type ExchangeRateCache, type ExchangeRateProvider, type ExchangeRateSet } from "../src/index";

const VES = currency("VES", 2); const USD = currency("USD", 2);
const snapshot: ExchangeRateSnapshot = { rate: exchangeRate({ baseCurrency: USD, quoteCurrency: VES, value: "36.4512" }), effectiveDate: "2026-08-13", capturedAt: "2026-08-13T12:00:00.000Z", source: { kind: "official", authority: "BCV", reference: null } };
const set: ExchangeRateSet = { requestedDate: "2026-08-13", effectiveDate: "2026-08-13", resolution: "exact_date", observedAt: snapshot.capturedAt, rates: [snapshot] };

test("reuses fresh current data without calling the provider twice", async () => {
  let calls = 0;
  const provider: ExchangeRateProvider = { async getCurrentRates() { calls++; return set; }, async getRatesForDate() { return set; } };
  const service = new ResolveExchangeRates(provider, new InMemoryExchangeRateCache(), { currentTtlMilliseconds: 1_000, historicalTtlMilliseconds: 10_000, staleIfErrorMilliseconds: 20_000 }, () => new Date("2026-08-13T12:00:00Z"));
  await service.current(VES); await service.current(VES);
  assert.equal(calls, 1);
});

test("serves bounded stale data when refresh fails", async () => {
  let now = new Date("2026-08-13T12:00:00Z"); let calls = 0;
  const provider: ExchangeRateProvider = { async getCurrentRates() { calls++; if (calls > 1) throw new Error("offline"); return set; }, async getRatesForDate() { return set; } };
  const service = new ResolveExchangeRates(provider, new InMemoryExchangeRateCache(), { currentTtlMilliseconds: 100, historicalTtlMilliseconds: 10_000, staleIfErrorMilliseconds: 10_000 }, () => now);
  await service.current(VES); now = new Date("2026-08-13T12:00:01Z");
  assert.equal((await service.current(VES)).freshness.kind, "stale");
});

test("maps cache failures to the portable application failure", async () => {
  const provider: ExchangeRateProvider = { async getCurrentRates() { return set; }, async getRatesForDate() { return set; } };
  const cache: ExchangeRateCache = { async get() { throw new Error("cache offline"); }, async put() {} };
  const service = new ResolveExchangeRates(provider, cache, { currentTtlMilliseconds: 100, historicalTtlMilliseconds: 100, staleIfErrorMilliseconds: 100 });
  await assert.rejects(
    () => service.current(VES),
    (error: unknown) => error instanceof ExchangeRateApplicationFailure && error.code === "PROVIDER_UNAVAILABLE",
  );
});

test("rejects impossible historical calendar dates", () => {
  const provider: ExchangeRateProvider = { async getCurrentRates() { return set; }, async getRatesForDate() { return set; } };
  const service = new ResolveExchangeRates(provider, new InMemoryExchangeRateCache(), { currentTtlMilliseconds: 100, historicalTtlMilliseconds: 100, staleIfErrorMilliseconds: 100 });
  assert.throws(
    () => service.historical(VES, "2026-02-30"),
    (error: unknown) => error instanceof ExchangeRateApplicationFailure && error.code === "INVALID_PROVIDER_RESPONSE",
  );
});
