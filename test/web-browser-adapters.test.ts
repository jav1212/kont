import assert from "node:assert/strict";
import test from "node:test";
import {
  createBrowserConnectivityProbe,
  type BrowserConnectivityEnvironment,
} from "../src/modules/workspace/frontend/web-browser-adapters";

function environment(
  fetch: BrowserConnectivityEnvironment["fetch"],
  online = true,
) {
  const browser = {
    location: { origin: "https://kontave.test" },
    navigator: { onLine: online },
    fetch,
  };
  return browser;
}

test("the browser probe reaches the Client API with a receiver-bound fetch", async () => {
  let requestUrl: URL | null = null;
  const browser = environment(function (this: BrowserConnectivityEnvironment, input) {
    assert.equal(this, browser);
    requestUrl = new URL(input);
    return Promise.resolve(new Response(null, { status: 401 }));
  });

  assert.deepEqual(
    await createBrowserConnectivityProbe(browser).check(),
    { reachable: true },
  );
  assert.equal(requestUrl?.pathname, "/api/client/v1/organization-access");
});

test("the browser probe preserves network and service failures from the Client API probe", async () => {
  const network = createBrowserConnectivityProbe(
    environment(async () => {
      throw new TypeError("network failed");
    }),
  );
  const service = createBrowserConnectivityProbe(
    environment(async () => new Response(null, { status: 500 })),
  );

  assert.deepEqual(await network.check(), {
    reachable: false,
    reason: "network_unreachable",
  });
  assert.deepEqual(await service.check(), {
    reachable: false,
    reason: "service_unreachable",
  });
});

test("the browser probe reports request cancellation as a timeout", async () => {
  const probe = createBrowserConnectivityProbe(
    environment(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Timed out", "AbortError")),
          );
        }),
    ),
    1,
  );

  assert.deepEqual(await probe.check(), {
    reachable: false,
    reason: "probe_timeout",
  });
});

test("an offline browser does not issue a reachability request", async () => {
  let calls = 0;
  const browser = environment(async () => {
    calls += 1;
    return new Response(null, { status: 401 });
  }, false);
  const probe = createBrowserConnectivityProbe(browser);

  assert.deepEqual(await probe.check(), {
    reachable: false,
    reason: "network_unreachable",
  });
  assert.equal(calls, 0);
  browser.navigator.onLine = true;
  assert.deepEqual(await probe.check(), { reachable: true });
  assert.equal(calls, 1);
});
