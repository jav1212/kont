import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { organizationRequest } from "../src/modules/organizations/frontend/organization-request";

const responseSchema = z.object({ id: z.string() });

/**
 * Executes a test with a temporary fetch implementation.
 *
 * @param fetcher - Deterministic replacement for the global fetch function.
 * @param run - Test assertions that use the replacement.
 * @returns The result from the assertions.
 * @throws Error when the assertions or request fail unexpectedly.
 */
async function withFetch<T>(fetcher: typeof fetch, run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("organization reads retry the recovered repository failure with the same tenant scope", async () => {
  const calls: RequestInit[] = [];
  await withFetch(async (_input, init) => {
    calls.push(init ?? {});
    if (calls.length === 1) {
      return Response.json({
        error: "No se pudo consultar la información de la organización.",
        code: "ORGANIZATION_REPOSITORY_UNAVAILABLE",
      }, { status: 503 });
    }
    return Response.json({ data: { id: "organization-a" } });
  }, async () => {
    const controller = new AbortController();
    const result = await organizationRequest("/api/organizations/organization-a/companies", responseSchema, {
      headers: { "X-Tenant-Id": "tenant-a" },
      signal: controller.signal,
    });
    assert.deepEqual(result, { id: "organization-a" });
    assert.equal(calls.length, 2);
    assert.equal(new Headers(calls[0].headers).get("X-Tenant-Id"), "tenant-a");
    assert.equal(new Headers(calls[1].headers).get("X-Tenant-Id"), "tenant-a");
    assert.equal(calls[0].headers, calls[1].headers);
    assert.equal(calls[0].signal, controller.signal);
    assert.equal(calls[1].signal, controller.signal);
  });
});

test("organization reads expose the original message after bounded retry exhaustion", async () => {
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return Response.json({
      error: "No se pudo consultar la información de la organización.",
      code: "ORGANIZATION_REPOSITORY_UNAVAILABLE",
    }, { status: 503 });
  }, async () => {
    await assert.rejects(
      organizationRequest("/api/organizations", responseSchema),
      { message: "No se pudo consultar la información de la organización." },
    );
    assert.equal(calls, 3);
  });
});

test("organization writes and authentication failures do not retry", async () => {
  const requests: RequestInit[] = [];
  await withFetch(async (_input, init) => {
    requests.push(init ?? {});
    if (init?.method === "PATCH") {
      return Response.json({
        error: "No se pudo consultar la información de la organización.",
        code: "ORGANIZATION_REPOSITORY_UNAVAILABLE",
      }, { status: 503 });
    }
    return Response.json({ error: "La sesión expiró.", code: "UNAUTHENTICATED" }, { status: 401 });
  }, async () => {
    await assert.rejects(
      organizationRequest("/api/organizations/organization-a", responseSchema, { method: "PATCH" }),
      { message: "No se pudo consultar la información de la organización." },
    );
    await assert.rejects(
      organizationRequest("/api/organizations", responseSchema),
      { message: "La sesión expiró." },
    );
    assert.equal(requests.length, 2);
  });
});

test("organization reads do not retry a malformed or unrelated 503 envelope", async () => {
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return calls === 1
      ? Response.json({ code: "ORGANIZATION_REPOSITORY_UNAVAILABLE" }, { status: 503 })
      : Response.json({ error: "Otro servicio no está disponible.", code: "ANOTHER_REPOSITORY_UNAVAILABLE" }, { status: 503 });
  }, async () => {
    await assert.rejects(
      organizationRequest("/api/organizations", responseSchema),
      { message: "No se pudo consultar la organización." },
    );
    await assert.rejects(
      organizationRequest("/api/organizations", responseSchema),
      { message: "Otro servicio no está disponible." },
    );
    assert.equal(calls, 2);
  });
});

test("cancelling an organization retry wait prevents a later fetch", async () => {
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return Response.json({
      error: "No se pudo consultar la información de la organización.",
      code: "ORGANIZATION_REPOSITORY_UNAVAILABLE",
    }, { status: 503 });
  }, async () => {
    const controller = new AbortController();
    const request = organizationRequest("/api/organizations", responseSchema, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await assert.rejects(request, { name: "AbortError" });
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(calls, 1);
  });
});

test("a cancelled organization request does not start a fetch", async () => {
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return Response.json({ data: { id: "organization-a" } });
  }, async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      organizationRequest("/api/organizations", responseSchema, { signal: controller.signal }),
      { name: "AbortError" },
    );
    assert.equal(calls, 0);
  });
});
