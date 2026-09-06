import assert from "node:assert/strict";
import test from "node:test";
import { decodeRemote } from "../src/decoding";
import {
  KontaveRemoteClient,
  KontaveRemoteFailure,
  type RemoteTransport,
} from "../src/index";

const invalid = (): null => null;

function invalidResponse(requestId: string | null) {
  return (cause: unknown): boolean => {
    assert.ok(cause instanceof KontaveRemoteFailure);
    assert.equal(cause.code, "INVALID_RESPONSE");
    assert.equal(cause.requestId, requestId);
    return true;
  };
}

for (const payload of [null, false, 42, "invalid", [], {}]) {
  test(`invalid ${JSON.stringify(payload)} preserves the built-in transport request id`, async () => {
    const client = new KontaveRemoteClient({
      baseUrl: "https://kontave.test",
      platform: "desktop",
      authenticatedRequest: async () =>
        Response.json({
          data: payload,
          meta: { requestId: "correlation" },
        }),
    });
    await assert.rejects(
      decodeRemote(client, "/api/client/v1/me", { method: "GET" }, invalid),
      invalidResponse("correlation"),
    );
  });
}

test("out-of-order concurrent responses keep their own correlation identifiers", async () => {
  let resolveFirst: ((response: Response) => void) | undefined;
  let announceFirst: (() => void) | undefined;
  const firstStarted = new Promise<void>((resolve) => {
    announceFirst = resolve;
  });
  const client = new KontaveRemoteClient({
    baseUrl: "https://kontave.test",
    platform: "mobile",
    authenticatedRequest: async (input) => {
      if (String(input).endsWith("first")) {
        return new Promise<Response>((resolve) => {
          resolveFirst = resolve;
          announceFirst?.();
        });
      }
      return Response.json({ data: null, meta: { requestId: "second" } });
    },
  });
  const first = assert.rejects(
    decodeRemote(client, "/first", { method: "GET" }, invalid),
    invalidResponse("first"),
  );
  await firstStarted;
  try {
    await assert.rejects(
      decodeRemote(client, "/second", { method: "GET" }, invalid),
      invalidResponse("second"),
    );
  } finally {
    resolveFirst?.(Response.json({ data: null, meta: { requestId: "first" } }));
    await first;
  }
});

test("custom transports are validated for reads and writes without invented metadata", async () => {
  const calls: string[] = [];
  const transport: RemoteTransport = {
    get: async <T>(path: string) => {
      calls.push(`GET ${path}`);
      return null as T;
    },
    request: async <T>(path: string, init: RequestInit) => {
      calls.push(`${init.method} ${path}`);
      return null as T;
    },
  };
  await assert.rejects(
    decodeRemote(transport, "/read", { method: "GET" }, invalid),
    invalidResponse(null),
  );
  await assert.rejects(
    decodeRemote(transport, "/write", { method: "POST", body: "{}" }, invalid),
    invalidResponse(null),
  );
  assert.deepEqual(calls, ["GET /read", "POST /write"]);
});

test("malformed success and error envelopes preserve independently valid request ids", async () => {
  for (const [body, status] of [
    [{ meta: { requestId: "broken-envelope" } }, 200],
    [
      { error: { code: 1, message: "invalid", requestId: "broken-envelope" } },
      400,
    ],
  ] as const) {
    const client = new KontaveRemoteClient({
      baseUrl: "https://kontave.test",
      platform: "web",
      authenticatedRequest: async () => Response.json(body, { status }),
    });
    await assert.rejects(
      client.get("/invalid"),
      invalidResponse("broken-envelope"),
    );
  }
});

test("well-formed new server error codes remain forward compatible", async () => {
  const client = new KontaveRemoteClient({
    baseUrl: "https://kontave.test",
    platform: "web",
    authenticatedRequest: async () =>
      Response.json(
        {
          error: {
            code: "FUTURE_SERVER_CODE",
            message: "Future error",
            requestId: "future",
          },
        },
        { status: 409 },
      ),
  });
  await assert.rejects(client.get("/future"), (cause: unknown) => {
    assert.ok(cause instanceof KontaveRemoteFailure);
    assert.equal(cause.code, "FUTURE_SERVER_CODE");
    assert.equal(cause.requestId, "future");
    return true;
  });
});

test("internal metadata registry is absent from the package public API", async () => {
  const api = await import("../src/index");
  assert.equal("registerEnvelopeExecutor" in api, false);
  assert.equal("envelopeExecutorFor" in api, false);
});
