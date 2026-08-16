import assert from "node:assert/strict";
import test from "node:test";
import { FakeClientUpdateProvider } from "../src/index";

test("fake provider records deterministic update operations", async () => {
  const installed = {
    product: "test-client", platform: "test", architecture: "test", channel: "internal",
    productVersion: "1.0.0", buildNumber: null, runtimeVersion: null, apiVersion: null,
  };
  const provider = new FakeClientUpdateProvider(
    installed,
    { supportsBackgroundDownload: false, supportsProgress: true, applyMode: "reload" },
    { status: "up-to-date", checkedAt: "2026-08-14T12:00:00.000Z" },
  );
  provider.progress.push(0.5, 1);
  assert.equal((await provider.check()).status, "up-to-date");
  assert.equal(provider.checkCount, 1);
});
