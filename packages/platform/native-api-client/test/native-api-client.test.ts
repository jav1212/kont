import assert from "node:assert/strict";
import test from "node:test";
import { NativeApiClient, NativeApiFailure } from "../src/index";

test("adds bearer token and mobile client header", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer token");
    assert.equal(new Headers(init?.headers).get("x-kontave-client"), "mobile");
    return new Response(JSON.stringify({ data: { ok: true }, meta: { requestId: "request" } }), { status: 200 });
  };
  try { assert.deepEqual(await new NativeApiClient({ baseUrl: "https://kontave.test", client: "mobile", getAccessToken: async () => "token" }).get("/status"), { ok: true }); }
  finally { globalThis.fetch = originalFetch; }
});

test("rejects requests without a session", async () => {
  const client = new NativeApiClient({ baseUrl: "https://kontave.test", client: "mobile", getAccessToken: async () => null });
  await assert.rejects(() => client.get("/status"), (failure: unknown) => failure instanceof NativeApiFailure && failure.code === "AUTHENTICATION_REQUIRED");
});

test("delegates authenticated requests to the platform refresh adapter", async () => {
  let requestedUrl = "";
  const client = new NativeApiClient({
    baseUrl: "https://kontave.test",
    client: "mobile",
    authenticatedFetch: async (input, init) => {
      requestedUrl = input.toString();
      assert.equal(new Headers(init?.headers).get("accept"), "application/json");
      return new Response(JSON.stringify({ data: { refreshed: true }, meta: { requestId: "request" } }), { status: 200 });
    },
  });

  assert.deepEqual(await client.get("/status"), { refreshed: true });
  assert.equal(requestedUrl, "https://kontave.test/status");
});
