import assert from "node:assert/strict";
import test from "node:test";
import { resolveBcvEntries, type BcvEntry } from "../app/api/bcv/_lib";

const usd: BcvEntry = { code: "USD", buy: 764.94, sell: 766.8603, date: "13/08/2026" };

test("usa la respuesta vigente cacheada cuando contiene tasas", async () => {
    let currentCalls = 0;
    const result = await resolveBcvEntries("2026-08-13", {
        today: () => "2026-08-13",
        current: async () => { currentCalls += 1; return [usd]; },
    });
    assert.equal(result.strategy, "current-cache");
    assert.equal(currentCalls, 1);
    assert.deepEqual(result.entries, [usd]);
});

test("revalida sin cache una respuesta vigente vacía", async () => {
    const calls: Array<{ noStore?: boolean }> = [];
    const result = await resolveBcvEntries("2026-08-13", {
        today: () => "2026-08-13",
        current: async (init) => { calls.push(init ?? {}); return calls.length === 1 ? [] : [usd]; },
    });
    assert.equal(result.strategy, "current-fresh");
    assert.deepEqual(calls, [{}, { noStore: true }]);
});

test("cae al histórico cuando el feed vigente continúa vacío", async () => {
    let historyCalls = 0;
    const result = await resolveBcvEntries("2026-08-13", {
        today: () => "2026-08-13",
        current: async () => [],
        history: async () => { historyCalls += 1; return [usd]; },
    });
    assert.equal(result.strategy, "history-cache");
    assert.equal(historyCalls, 1);
});

test("revalida el histórico vacío antes de concluir que no hay tasas", async () => {
    const calls: Array<{ noStore?: boolean } | undefined> = [];
    const result = await resolveBcvEntries("2026-08-12", {
        today: () => "2026-08-13",
        history: async (_date, _days, init) => { calls.push(init); return calls.length === 1 ? [] : [usd]; },
    });
    assert.equal(result.strategy, "history-fresh");
    assert.deepEqual(calls, [undefined, { noStore: true }]);
});

test("informa vacío solo después de agotar ambos intentos históricos", async () => {
    let calls = 0;
    const result = await resolveBcvEntries("2026-08-12", {
        today: () => "2026-08-13",
        history: async () => { calls += 1; return []; },
    });
    assert.equal(result.strategy, "empty");
    assert.equal(calls, 2);
});

test("usa el histórico si el feed vigente falla", async () => {
    const result = await resolveBcvEntries("2026-08-13", {
        today: () => "2026-08-13",
        current: async () => { throw new Error("HTTP 503"); },
        history: async () => [usd],
    });
    assert.equal(result.strategy, "history-cache");
});

test("propaga indisponibilidad cuando ningún intento alcanza al proveedor", async () => {
    await assert.rejects(() => resolveBcvEntries("2026-08-12", {
        today: () => "2026-08-13",
        history: async () => { throw new Error("network"); },
    }), /provider unavailable/);
});
