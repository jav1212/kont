import assert from "node:assert/strict";
import { mock, test } from "node:test";

const permissions: string[] = [];
const calls: { read?: unknown; configure?: unknown } = {};
let persistedPolicy: Record<string, unknown> | null = null;

mock.module("@kontave/companies/domain", {
  namedExports: {
    CompanyFailure: class CompanyFailure extends Error { constructor(readonly code: string, message: string) { super(message); } },
    companyId: (value: string) => `company:${value}`,
    companyMonetaryPolicySettings: (value: unknown) => value,
    COMPANY_MONETARY_RATE_SOURCE: "bcv",
    COMPANY_MONETARY_ROUNDING_PROFILE: "commercial_v1",
  },
});
mock.module("@kontave/monetary/domain", { namedExports: { currencyCode: (value: string) => `currency:${value}` } });
mock.module("@/src/modules/companies/backend/administration-web", {
  namedExports: {
    getCompanyAdministrationWebContext: async (_tenant: unknown, requestedCompanyId: string) => ({
      company: { id: `canonical:${requestedCompanyId}` },
      actions: {
        scope: () => ({ actorUserId: "server-actor", organizationId: "server-organization" }),
        getMonetaryPolicy: { execute: async (query: unknown) => { calls.read = query; return persistedPolicy; } },
        configureMonetaryPolicy: { execute: async (command: unknown) => { calls.configure = command; return persistedPolicy; } },
      },
    }),
  },
});
mock.module("@/src/shared/backend/utils/require-tenant", {
  namedExports: {
    withTenantPermission: (permission: string, handler: (request: Request, tenant: unknown) => Promise<Response>) => {
      permissions.push(permission);
      return (request: Request) => handler(request, { userId: "untrusted-request-actor", tenantId: "untrusted-request-tenant" });
    },
  },
});

const { GET, PATCH } = await import("../app/api/companies/monetary-policy/route");

test("GET reads the canonical company policy using authenticated server scope", async () => {
  persistedPolicy = {
    version: 3,
    operatingCurrency: { code: "VES", minorUnit: 2 },
    referenceCurrencies: [{ code: "USD", minorUnit: 2 }],
    rateSource: "bcv",
    roundingProfile: "commercial_v1",
    allowPreviousAvailableDate: false,
    configuredAt: "2026-10-16T12:00:00.000Z",
    configuredBy: "server-actor",
  };
  const response = await GET(new Request("https://kont.test/api/companies/monetary-policy?companyId=J-12345678-9"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: {
    version: 3,
    operatingCurrency: { code: "VES", minorUnit: 2 },
    referenceCurrencyCodes: ["USD"],
    rateSource: "bcv",
    roundingProfile: "commercial_v1",
    allowPreviousAvailableDate: false,
    configuredAt: "2026-10-16T12:00:00.000Z",
  } });
  assert.deepEqual(calls.read, {
    actorUserId: "server-actor", organizationId: "server-organization", companyId: "company:canonical:J-12345678-9",
  });
  assert.equal(permissions.at(-2), "companies.read");
});

test("PATCH normalizes currencies and derives all authority fields from the server context", async () => {
  persistedPolicy = {
    version: 1,
    operatingCurrency: { code: "VES", minorUnit: 2 },
    referenceCurrencies: [{ code: "EUR", minorUnit: 2 }, { code: "USD", minorUnit: 2 }],
    rateSource: "bcv",
    roundingProfile: "commercial_v1",
    allowPreviousAvailableDate: false,
    configuredAt: "2026-10-16T12:00:00.000Z",
    configuredBy: "server-actor",
  };
  const response = await PATCH(new Request("https://kont.test/api/companies/monetary-policy", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: "J-12345678-9", expectedPolicyVersion: 0, idempotencyKey: "request-1", reason: "Configuración inicial", referenceCurrencyCodes: ["USD", "EUR"] }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: {
    version: 1,
    operatingCurrency: { code: "VES", minorUnit: 2 },
    referenceCurrencyCodes: ["EUR", "USD"],
    rateSource: "bcv",
    roundingProfile: "commercial_v1",
    allowPreviousAvailableDate: false,
    configuredAt: "2026-10-16T12:00:00.000Z",
  } });
  assert.deepEqual(calls.configure, {
    actorUserId: "server-actor", organizationId: "server-organization", companyId: "company:canonical:J-12345678-9",
    expectedPolicyVersion: 0, idempotencyKey: "request-1", reason: "Configuración inicial",
    settings: {
      operatingCurrencyCode: "currency:VES", operatingCurrencyMinorUnit: 2,
      referenceCurrencyCodes: ["currency:EUR", "currency:USD"], rateSource: "bcv", roundingProfile: "commercial_v1",
      allowPreviousAvailableDate: false, maxPreviousDays: 0,
    },
  });
  assert.equal(permissions.at(-1), "companies.update");
});

test("PATCH rejects an empty reference-currency selection before persistence", async () => {
  calls.configure = undefined;
  const response = await PATCH(new Request("https://kont.test/api/companies/monetary-policy", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: "J-12345678-9", expectedPolicyVersion: 0, idempotencyKey: "request-2", reason: "Invalid", referenceCurrencyCodes: [] }),
  }));
  assert.equal(response.status, 400);
  assert.equal(calls.configure, undefined);
});
