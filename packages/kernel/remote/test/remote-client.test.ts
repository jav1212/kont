import assert from "node:assert/strict";
import test from "node:test";
import {
  KontaveRemoteClient,
  KontaveRemoteFailure,
  RemoteAuthenticationPort,
  RemoteBillingPort,
  RemoteInventoryPort,
  RemoteOperationContextPort,
  RemoteOrganizationsPort,
  RemoteOfficialExchangeRatesPort,
  RemotePortalMonitoringPort,
  RemoteProfilePort,
  RemotePurchasingPort,
  RemoteSalesPort,
  type RemoteTransport,
} from "../src/index";

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

test("official rates use the company operation-context endpoint", async () => {
  let requestedPath = "";
  const transport: RemoteTransport = {
    get: async <T>(path: string) => {
      requestedPath = path;
      return {
        requestedDate: "2026-08-17",
        effectiveDate: "2026-08-17",
        resolution: "exact_date",
        observedAt: "2026-08-17T12:00:00.000Z",
        rates: [
          {
            baseCurrency: "USD",
            quoteCurrency: "VES",
            value: "150.10",
            effectiveDate: "2026-08-17",
            capturedAt: "2026-08-17T12:00:00.000Z",
            source: {
              kind: "official",
              authority: "BCV",
              reference: null,
            },
          },
        ],
      } as T;
    },
    request: async <T>() => undefined as T,
  };
  const rates = await new RemoteOfficialExchangeRatesPort(transport).current(
    "organization-1",
    "company-1",
    "2026-08-17",
  );
  assert.equal(rates.rates[0]?.value, 150.1);
  assert.equal(
    requestedPath,
    "/api/client/v1/organizations/organization-1/companies/company-1/operation-context/exchange-rates?date=2026-08-17",
  );
});

test("domain adapters own every Client API route", async () => {
  const paths: string[] = [];
  const transport: RemoteTransport = {
    get: async <T>(path: string) => {
      paths.push(`GET ${path}`);
      return undefined as T;
    },
    request: async <T>(path: string, init: RequestInit) => {
      paths.push(`${init.method} ${path}`);
      return undefined as T;
    },
  };
  const authentication = new RemoteAuthenticationPort(transport);
  const billing = new RemoteBillingPort(transport);
  const inventory = new RemoteInventoryPort(transport);
  const context = new RemoteOperationContextPort(transport);
  const organizations = new RemoteOrganizationsPort(transport);
  const platform = new RemotePortalMonitoringPort(transport);
  const profile = new RemoteProfilePort(transport);
  const purchasing = new RemotePurchasingPort(transport);
  const sales = new RemoteSalesPort(transport);

  await Promise.all([
    authentication.sessions(),
    billing.overview("organization-1"),
    inventory.dashboard("organization-1", "company-1", {
      from: "2026-08-01",
      to: "2026-08-17",
    }),
    context.exchangeRates("organization-1", "company-1", "2026-08-17"),
    organizations.accessible(),
    organizations.modules("organization-1", "desktop"),
    platform.current(),
    profile.current(),
    purchasing.dashboard("organization-1", "company-1", {
      from: "2026-08-01",
      to: "2026-08-17",
    }),
    sales.dashboard("organization-1", "company-1", {
      from: "2026-08-01",
      to: "2026-08-17",
    }),
  ]);

  assert.deepEqual(paths, [
    "GET /api/client/v1/auth/sessions",
    "GET /api/client/v1/organizations/organization-1/billing/overview",
    "GET /api/client/v1/organizations/organization-1/companies/company-1/inventory/dashboard?from=2026-08-01&to=2026-08-17",
    "GET /api/client/v1/organizations/organization-1/companies/company-1/operation-context/exchange-rates?date=2026-08-17",
    "GET /api/client/v1/organization-access",
    "GET /api/client/v1/organizations/organization-1/modules/available?platform=desktop",
    "GET /api/client/v1/platform/status",
    "GET /api/client/v1/me",
    "GET /api/client/v1/organizations/organization-1/companies/company-1/purchasing/dashboard?from=2026-08-01&to=2026-08-17&granularity=day&limit=5",
    "GET /api/client/v1/organizations/organization-1/companies/company-1/sales/dashboard?from=2026-08-01&to=2026-08-17&granularity=day&limit=5",
  ]);
});
