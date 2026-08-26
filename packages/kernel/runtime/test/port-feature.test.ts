import assert from "node:assert/strict";
import test from "node:test";
import { ClientCapabilityStatus } from "@kontave/client-contracts";
import { createPortFeature } from "../src/features/port-feature";

interface GreetingPort {
  greet(name: string): Promise<string>;
}

test("port features reject calls before start and execute after start", async () => {
  const runtime = createPortFeature<GreetingPort>({
    greet: async (name) => `Hola, ${name}`,
  });

  assert.deepEqual(await runtime.feature.greet("Ana"), {
    ok: false,
    error: {
      code: "CLIENT_FEATURE_NOT_READY",
      message: "La capacidad del cliente todavía no está disponible.",
      recoverable: true,
      requestId: null,
    },
  });

  await runtime.module.start();
  assert.deepEqual(await runtime.feature.greet("Ana"), {
    ok: true,
    value: "Hola, Ana",
  });
});

test("port features normalize failures and publish their failed state", async () => {
  let shouldFail = true;
  const runtime = createPortFeature<GreetingPort>({
    greet: async (name) => {
      if (shouldFail) {
        throw Object.assign(new Error("Sin conexión"), {
          code: "NETWORK_UNAVAILABLE",
          requestId: "request-1",
        });
      }
      return `Hola, ${name}`;
    },
  });
  await runtime.module.start();

  const result = await runtime.feature.greet("Ana");

  assert.equal(result.ok, false);
  assert.deepEqual(runtime.feature.getSnapshot(), {
    status: ClientCapabilityStatus.Failed,
    failure: {
      code: "NETWORK_UNAVAILABLE",
      message: "Sin conexión",
      recoverable: true,
      requestId: "request-1",
    },
  });

  shouldFail = false;
  assert.deepEqual(await runtime.feature.greet("Ana"), {
    ok: true,
    value: "Hola, Ana",
  });
  assert.deepEqual(runtime.feature.getSnapshot(), {
    status: ClientCapabilityStatus.Ready,
  });
});
