import assert from "node:assert/strict";
import test from "node:test";
import { KontaveRemoteClient, KontaveRemoteFailure } from "../src/index";

test("remote client applies the platform header and unwraps API data", async () => {
  let request: RequestInit | undefined;
  const client = new KontaveRemoteClient({
    baseUrl: "https://kontave.test",
    platform: "web",
    getAccessToken: async () => "access-token",
    request: async (_input, init) => {
      request = init;
      return Response.json({
        data: { id: "product-1" },
        meta: { requestId: "request-1" },
      });
    },
  });
  assert.deepEqual(await client.get("/api/products"), { id: "product-1" });
  const headers = new Headers(request?.headers);
  assert.equal(headers.get("authorization"), "Bearer access-token");
  assert.equal(headers.get("x-kontave-client"), "web");
});

test("remote client exposes serializable backend failure details", async () => {
  const client = new KontaveRemoteClient({
    baseUrl: "https://kontave.test",
    platform: "mobile",
    authenticatedRequest: async () =>
      Response.json(
        {
          error: {
            code: "PRODUCT_NOT_FOUND",
            message: "Missing product",
            requestId: "request-2",
          },
        },
        { status: 404 },
      ),
  });
  await assert.rejects(
    client.get("/api/products/missing"),
    (failure: unknown) => {
      assert.ok(failure instanceof KontaveRemoteFailure);
      assert.equal(failure.code, "PRODUCT_NOT_FOUND");
      assert.equal(failure.requestId, "request-2");
      return true;
    },
  );
});
