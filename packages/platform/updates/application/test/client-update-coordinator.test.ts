import assert from "node:assert/strict";
import test from "node:test";
import type { ClientUpdateProvider } from "../src/index";
import { ClientUpdateCoordinator, ClientUpdateFailure } from "../src/index";
import type { ClientUpdateRelease } from "@kontave/client-updates-contracts";

const installed = {
  product: "kontave-desktop",
  platform: "win32",
  architecture: "x64",
  channel: "production",
  productVersion: "1.0.0",
  buildNumber: "100",
  runtimeVersion: null,
  apiVersion: "v1",
} as const;

const release: ClientUpdateRelease = {
  ...installed,
  productVersion: "1.1.0",
  buildNumber: "110",
  kind: "binary",
  requirement: "optional",
  minimumApiVersion: "v1",
  publishedAt: "2026-08-14T12:00:00.000Z",
  releaseNotes: "Correcciones de estabilidad.",
};

function provider(overrides: Partial<ClientUpdateProvider> = {}): ClientUpdateProvider {
  return {
    installed,
    capabilities: { supportsBackgroundDownload: true, supportsProgress: true, applyMode: "restart" },
    check: async () => ({ status: "available", release }),
    download: async (_release, onProgress) => { onProgress(0.25); onProgress(1); },
    apply: async () => undefined,
    ...overrides,
  };
}

test("coordinates the complete update lifecycle with immutable observable snapshots", async () => {
  const statuses: string[] = [];
  const coordinator = new ClientUpdateCoordinator(provider());
  coordinator.subscribe(() => statuses.push(coordinator.getSnapshot().status));

  assert.equal((await coordinator.check()).status, "available");
  assert.equal((await coordinator.download()).status, "ready");
  assert.equal((await coordinator.apply()).status, "idle");
  assert.deepEqual(statuses, ["checking", "available", "downloading", "downloading", "downloading", "ready", "applying", "idle"]);
});

test("maps provider errors to a public typed failure without leaking the cause", async () => {
  const coordinator = new ClientUpdateCoordinator(provider({ check: async () => { throw new Error("private token"); } }));
  const snapshot = await coordinator.check();
  assert.equal(snapshot.status, "failed");
  if (snapshot.status !== "failed") return;
  assert.deepEqual(snapshot.failure, { code: "UPDATE_CHECK_FAILED", operation: "check", retryable: true });
  assert.equal("message" in snapshot.failure, false);
});

test("rejects a release for another channel before it can be downloaded", async () => {
  const coordinator = new ClientUpdateCoordinator(provider({
    check: async () => ({ status: "available", release: { ...release, channel: "preview" } }),
  }));
  const snapshot = await coordinator.check();
  assert.equal(snapshot.status, "failed");
  if (snapshot.status !== "failed") return;
  assert.equal(snapshot.failure.code, "UPDATE_INVALID");
  assert.equal(snapshot.failure.retryable, false);
});

test("does not allow download before an available release exists", async () => {
  const coordinator = new ClientUpdateCoordinator(provider());
  await assert.rejects(() => coordinator.download(), (failure: unknown) =>
    failure instanceof ClientUpdateFailure && failure.code === "UPDATE_INVALID");
});
