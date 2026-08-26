import assert from "node:assert/strict";
import test from "node:test";
import type { ClientFeature } from "@kontave/client-contracts";
import { createKontaveClient, type ClientRuntimeModule } from "../src/index";

const feature: ClientFeature<{ readonly status: "idle" }> = {
  getSnapshot: () => ({ status: "idle" }),
  subscribe: () => () => undefined,
};

test("client starts modules in order and stops them in reverse order", async () => {
  const calls: string[] = [];
  const module = (name: string): ClientRuntimeModule => ({
    start: () => {
      calls.push(`start:${name}`);
    },
    stop: () => {
      calls.push(`stop:${name}`);
    },
  });
  const client = createKontaveClient({
    features: { products: feature },
    modules: [module("session"), module("workspace")],
  });
  await client.start();
  await client.stop();
  assert.deepEqual(calls, [
    "start:session",
    "start:workspace",
    "stop:workspace",
    "stop:session",
  ]);
  assert.equal(client.getLifecycleSnapshot().status, "stopped");
});

test("client rolls back modules when startup fails", async () => {
  const calls: string[] = [];
  const client = createKontaveClient({
    features: { products: feature },
    modules: [
      {
        start: () => {
          calls.push("start:session");
        },
        stop: () => {
          calls.push("stop:session");
        },
      },
      {
        start: () => {
          throw new Error("workspace unavailable");
        },
        stop: () => undefined,
      },
    ],
  });
  await assert.rejects(client.start(), /workspace unavailable/);
  assert.deepEqual(calls, ["start:session", "stop:session"]);
  assert.equal(client.getLifecycleSnapshot().status, "failed");
});
