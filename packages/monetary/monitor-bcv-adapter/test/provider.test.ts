import assert from "node:assert/strict";
import test from "node:test";
import { FixedCurrencyCatalog } from "@kontave/monetary-application";
import { currency } from "@kontave/monetary-domain";
import { decodeMonitorBcvEntries, MonitorBcvProvider, type Clock, type MonitorBcvTransport } from "../src/index";

const VES = currency("VES", 2), USD = currency("USD", 2), EUR = currency("EUR", 2), JPY = currency("JPY", 0);
const clock: Clock = { now: () => new Date("2026-08-13T12:30:00Z"), today: () => "2026-08-13" };
const body = '[{"code":"USD","buy":764.94,"sell":766.8603,"date":"13/08/2026"},{"code":"EUR","buy":"890,10","sell":"891,1234","date":"13/08/2026"},{"code":"JPY","buy":5,"sell":5.1234567890123,"date":"13/08/2026"}]';
const transport: MonitorBcvTransport = { async request() { return { status: 200, body }; } };

test("codec preserves numeric rate tokens as decimal text", () => {
  assert.equal(decodeMonitorBcvEntries('[{"code":"USD","buy":1,"sell":766.8603000,"date":"13/08/2026"}]')[0]?.sell, "766.8603000");
});

test("provider maps every catalog currency without privileging USD", async () => {
  const provider = new MonitorBcvProvider(new FixedCurrencyCatalog([USD, EUR, JPY]), VES, transport, { baseUrl: "https://provider.test", timeoutMilliseconds: 100, retryAttempts: 0, historicalLookbackDays: 7 }, clock);
  const result = await provider.getCurrentRates({ quoteCurrency: VES });
  assert.deepEqual(result.rates.map((item) => item.rate.baseCurrency.code), ["USD", "EUR", "JPY"]);
  assert.equal(result.rates[1]?.rate.value, "891.1234");
  assert.equal(result.rates[2]?.rate.publishedScale, 13);
});

test("historical lookup distinguishes requested and effective dates", async () => {
  const historical: MonitorBcvTransport = { async request() { return { status: 200, body: '[{"code":"USD","buy":"1","sell":"36.4512","date":"09/08/2026"}]' }; } };
  const provider = new MonitorBcvProvider(new FixedCurrencyCatalog([USD]), VES, historical, { baseUrl: "https://provider.test", timeoutMilliseconds: 100, retryAttempts: 0, historicalLookbackDays: 7 }, clock);
  const result = await provider.getRatesForDate({ quoteCurrency: VES, date: "2026-08-10" });
  assert.equal(result.effectiveDate, "2026-08-09"); assert.equal(result.resolution, "previous_available_date");
});
