import assert from "node:assert/strict";
import test from "node:test";
import { isChunkLoadError, recoverFromChunkLoadError } from "../src/shared/frontend/feedback/chunk-load-recovery";

function installWindow(storage: Map<string, string> | null): { reloads: number } {
    const state = { reloads: 0 };
    const sessionStorage = storage === null
        ? { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("SecurityError"); } }
        : { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } };
    Object.assign(globalThis, { window: { sessionStorage, location: { reload: () => { state.reloads += 1; } } } });
    return state;
}

test.afterEach(() => { delete (globalThis as { window?: unknown }).window; });

test("recognizes webpack, Turbopack, and dynamic import chunk failures", () => {
    // Messages observed in system_error_logs plus the common browser variants.
    assert.equal(isChunkLoadError(new Error("Loading chunk 23423 failed.\n(error: https://kontave.com/_next/static/chunks/23423-b64d4b74.js)")), true);
    assert.equal(isChunkLoadError(Object.assign(new Error("x"), { name: "ChunkLoadError" })), true);
    assert.equal(isChunkLoadError(new Error("Loading CSS chunk 512 failed.")), true);
    assert.equal(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://kontave.com/_next/a.js")), true);
    assert.equal(isChunkLoadError(new Error("No se pudo guardar.")), false);
    assert.equal(isChunkLoadError("Loading chunk 1 failed"), false);
});

test("reloads once and reports if the failure repeats within the window", () => {
    const state = installWindow(new Map());
    const failure = new Error("Loading chunk 19510 failed.");
    assert.equal(recoverFromChunkLoadError(failure), true);
    assert.equal(recoverFromChunkLoadError(failure), false);
    assert.equal(state.reloads, 1);
});

test("never reloads without a storage-backed loop guard or for other failures", () => {
    const state = installWindow(null);
    assert.equal(recoverFromChunkLoadError(new Error("Loading chunk 1 failed.")), false);
    installWindow(new Map());
    assert.equal(recoverFromChunkLoadError(new TypeError("x is undefined")), false);
    assert.equal(state.reloads, 0);
});
