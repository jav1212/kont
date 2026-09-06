import assert from "node:assert/strict";
import test from "node:test";
import {
  KontaveRemoteFailure,
  RemoteAuthenticationPort,
  RemoteBillingPort,
  RemoteInventoryPort,
  RemoteOperationContextPort,
  RemoteOrganizationsPort,
  RemoteOfficialExchangeRatesPort,
  RemoteExchangeRatesFailure,
  RemotePortalMonitoringPort,
  RemoteProfilePort,
  RemotePurchasingPort,
  RemoteSalesPort,
  type RemoteTransport,
} from "../src/index";
import * as fixtures from "./response-fixtures";

const query = { from: "2026-08-01", to: "2026-08-17" };
const version = { expectedVersion: 1 };

interface BoundaryCase {
  readonly name: string;
  readonly payload: object;
  readonly run: (transport: RemoteTransport) => Promise<unknown>;
}

const cases: readonly BoundaryCase[] = [
  {
    name: "authentication sessions",
    payload: [fixtures.sessionFixture],
    run: (t) => new RemoteAuthenticationPort(t).sessions(),
  },
  {
    name: "password confirmation",
    payload: { changed: true },
    run: (t) =>
      new RemoteAuthenticationPort(t).changePassword({
        newPassword: "password",
      }),
  },
  {
    name: "session revocation",
    payload: { revoked: true },
    run: (t) => new RemoteAuthenticationPort(t).revokeSession("session"),
  },
  {
    name: "other session revocations",
    payload: { revoked: true },
    run: (t) => new RemoteAuthenticationPort(t).revokeOtherSessions(),
  },
  {
    name: "profile",
    payload: fixtures.currentUserFixture,
    run: (t) => new RemoteProfilePort(t).current(),
  },
  {
    name: "profile update",
    payload: fixtures.currentUserFixture,
    run: (t) => new RemoteProfilePort(t).update(version),
  },
  {
    name: "preferences",
    payload: fixtures.preferencesFixture,
    run: (t) => new RemoteProfilePort(t).preferences(),
  },
  {
    name: "preferences update",
    payload: fixtures.preferencesFixture,
    run: (t) => new RemoteProfilePort(t).updatePreferences(version),
  },
  {
    name: "billing overview",
    payload: fixtures.billingOverviewFixture,
    run: (t) => new RemoteBillingPort(t).overview("org"),
  },
  {
    name: "billing plans",
    payload: [fixtures.billingPlanFixture],
    run: (t) => new RemoteBillingPort(t).plans("org"),
  },
  {
    name: "billing payment requests",
    payload: [fixtures.paymentRequestFixture],
    run: (t) => new RemoteBillingPort(t).paymentRequests("org"),
  },
  {
    name: "organization",
    payload: fixtures.organizationFixture,
    run: (t) => new RemoteOrganizationsPort(t).get("org"),
  },
  {
    name: "organization update",
    payload: fixtures.organizationFixture,
    run: (t) => new RemoteOrganizationsPort(t).update("org", version),
  },
  {
    name: "organization access",
    payload: [fixtures.accessibleOrganizationFixture],
    run: (t) => new RemoteOrganizationsPort(t).accessible(),
  },
  {
    name: "companies",
    payload: [fixtures.companyFixture],
    run: (t) => new RemoteOrganizationsPort(t).companies("org"),
  },
  {
    name: "operational companies",
    payload: [fixtures.operationalCompanyFixture],
    run: (t) => new RemoteOrganizationsPort(t).operationalCompanies("org"),
  },
  {
    name: "modules",
    payload: [fixtures.organizationModuleFixture],
    run: (t) => new RemoteOrganizationsPort(t).modules("org", "desktop"),
  },
  {
    name: "members",
    payload: [fixtures.memberFixture],
    run: (t) => new RemoteOrganizationsPort(t).members("org"),
  },
  {
    name: "roles",
    payload: [fixtures.roleFixture],
    run: (t) => new RemoteOrganizationsPort(t).roles("org"),
  },
  {
    name: "operational defaults",
    payload: fixtures.operationalDefaultsFixture,
    run: (t) => new RemoteOperationContextPort(t).get("org", "company"),
  },
  {
    name: "operational defaults update",
    payload: fixtures.operationalDefaultsFixture,
    run: (t) =>
      new RemoteOperationContextPort(t).update("org", "company", version),
  },
  {
    name: "exchange rate set",
    payload: fixtures.exchangeRateSetFixture,
    run: (t) =>
      new RemoteOperationContextPort(t).exchangeRates("org", "company", "date"),
  },
  {
    name: "inventory dashboard",
    payload: fixtures.inventoryDashboardFixture,
    run: (t) => new RemoteInventoryPort(t).dashboard("org", "company", query),
  },
  {
    name: "inventory entries",
    payload: fixtures.inventoryFlowPageFixture,
    run: (t) => new RemoteInventoryPort(t).entries("org", "company", query),
  },
  {
    name: "inventory outputs",
    payload: fixtures.inventoryFlowPageFixture,
    run: (t) => new RemoteInventoryPort(t).outputs("org", "company", query),
  },
  {
    name: "inventory operations",
    payload: fixtures.inventoryFlowPageFixture,
    run: (t) => new RemoteInventoryPort(t).operations("org", "company", query),
  },
  {
    name: "inventory operation detail",
    payload: fixtures.inventoryOperationFixture,
    run: (t) =>
      new RemoteInventoryPort(t).operation("org", "company", "operation"),
  },
  {
    name: "inventory operation create",
    payload: fixtures.inventoryOperationFixture,
    run: (t) =>
      new RemoteInventoryPort(t).create("org", "company", {
        reason: "opening_balance",
        effectiveDate: "date",
        lines: [],
      }),
  },
  {
    name: "inventory operation update",
    payload: fixtures.inventoryOperationFixture,
    run: (t) =>
      new RemoteInventoryPort(t).update("org", "company", "operation", version),
  },
  {
    name: "inventory operation post",
    payload: fixtures.inventoryOperationFixture,
    run: (t) =>
      new RemoteInventoryPort(t).post("org", "company", "operation", 1),
  },
  {
    name: "inventory operation reverse",
    payload: fixtures.inventoryOperationFixture,
    run: (t) =>
      new RemoteInventoryPort(t).reverse("org", "company", "operation", {
        ...version,
        effectiveDate: "date",
        reason: "correction",
      }),
  },
  {
    name: "purchasing dashboard",
    payload: fixtures.purchasingDashboardFixture,
    run: (t) => new RemotePurchasingPort(t).dashboard("org", "company", query),
  },
  {
    name: "sales dashboard",
    payload: fixtures.salesDashboardFixture,
    run: (t) => new RemoteSalesPort(t).dashboard("org", "company", query),
  },
  {
    name: "portal monitoring",
    payload: fixtures.portalMonitoringFixture,
    run: (t) => new RemotePortalMonitoringPort(t).current(),
  },
];

function transport(payload: unknown): RemoteTransport {
  // Deliberately dishonest custom transport models untrusted runtime responses.
  return {
    get: async <T>() => payload as T,
    request: async <T>() => payload as T,
  };
}

function invalidResponse(failure: unknown): boolean {
  assert.ok(failure instanceof KontaveRemoteFailure);
  assert.equal(failure.code, "INVALID_RESPONSE");
  assert.equal(failure.requestId, null);
  return true;
}

function fieldPaths(value: unknown, path: readonly string[] = []): string[][] {
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [
    [...path, key],
    ...fieldPaths(child, [...path, key]),
  ]);
}

function changedField(
  payload: object,
  path: readonly string[],
  remove: boolean,
): unknown {
  const copy: unknown = structuredClone(payload);
  let parent = copy as Record<string, unknown>;
  for (const key of path.slice(0, -1))
    parent = parent[key] as Record<string, unknown>;
  const key = path.at(-1);
  assert.ok(key);
  if (remove) delete parent[key];
  else
    parent[key] = typeof parent[key] === "object" ? false : { malformed: true };
  return copy;
}

for (const boundary of cases) {
  test(`${boundary.name}: accepts a complete payload through a custom transport`, async () => {
    assert.deepEqual(
      await boundary.run(transport(boundary.payload)),
      boundary.payload,
    );
  });

  test(`${boundary.name}: rejects every missing or mistyped nested field`, async () => {
    for (const payload of [null, undefined, true, 1, "response", {}]) {
      await assert.rejects(boundary.run(transport(payload)), invalidResponse);
    }
    for (const path of fieldPaths(boundary.payload)) {
      for (const remove of [true, false]) {
        await assert.rejects(
          boundary.run(transport(changedField(boundary.payload, path, remove))),
          invalidResponse,
          `${boundary.name}: ${path.join(".")} ${remove ? "missing" : "wrong type"}`,
        );
      }
    }
  });
}

test("boundary validation accepts additive fields and preserves exact monetary strings", async () => {
  const payload = structuredClone(fixtures.purchasingDashboardFixture);
  Object.assign(payload.summary.confirmedPurchaseTotal, { futureField: true });
  Object.assign(payload, { futureVersion: { enabled: true } });
  assert.deepEqual(
    await new RemotePurchasingPort(transport(payload)).dashboard(
      "org",
      "company",
      query,
    ),
    payload,
  );
  assert.equal(
    payload.summary.confirmedPurchaseTotal.amount,
    "900719925474099312345.0010",
  );
});

test("nullable fields accept explicit null without accepting missing numbers", async () => {
  const plan = {
    ...fixtures.billingPlanFixture,
    maxCompanies: null,
    maxEmployeesPerCompany: null,
    productCode: null,
  };
  assert.deepEqual(
    await new RemoteBillingPort(transport([plan])).plans("org"),
    [plan],
  );
  const broken = { ...plan, maxCompanies: "unlimited" };
  await assert.rejects(
    new RemoteBillingPort(transport([broken])).plans("org"),
    invalidResponse,
  );
  const monitor = {
    ...fixtures.portalMonitoringFixture,
    observedAt: null,
    portals: [
      {
        ...fixtures.portalMonitoringFixture.portals[0],
        responseTimeMs: null,
        checkedAt: null,
        logoUrl: null,
      },
    ],
  };
  assert.deepEqual(
    await new RemotePortalMonitoringPort(transport(monitor)).current(),
    monitor,
  );
});

test("operation context validates both exchange-rate selection and source branches", async () => {
  const unavailable = {
    ...fixtures.operationalDefaultsFixture,
    exchangeRate: { status: "unavailable", effectiveDate: "any-date-string" },
  };
  assert.deepEqual(
    await new RemoteOperationContextPort(transport(unavailable)).get(
      "org",
      "company",
    ),
    unavailable,
  );
  const manual = {
    ...fixtures.exchangeRateSetFixture,
    resolution: "previous_available_date",
    rates: [
      {
        ...fixtures.exchangeRateSetFixture.rates[0],
        source: { kind: "manual", reason: "approved override" },
      },
    ],
  };
  assert.deepEqual(
    await new RemoteOperationContextPort(transport(manual)).exchangeRates(
      "org",
      "company",
      "date",
    ),
    manual,
  );
  for (const source of [
    { kind: "official", authority: "BCV" },
    { kind: "manual" },
    { kind: "other", reason: "why" },
  ]) {
    const malformed = { ...manual, rates: [{ ...manual.rates[0], source }] };
    await assert.rejects(
      new RemoteOperationContextPort(transport(malformed)).exchangeRates(
        "org",
        "company",
        "date",
      ),
      invalidResponse,
    );
  }
  await assert.rejects(
    new RemoteOperationContextPort(
      transport({ ...unavailable, exchangeRate: { status: "unavailable" } }),
    ).get("org", "company"),
    invalidResponse,
  );
});

test("literal unions reject unknown strings throughout the capabilities", async () => {
  const invalid: readonly BoundaryCase[] = [
    {
      name: "session client",
      run: (t) => new RemoteAuthenticationPort(t).sessions(),
      payload: [{ ...fixtures.sessionFixture, client: "watch" }],
    },
    {
      name: "role",
      payload: { ...fixtures.organizationFixture, role: "root" },
      run: (t) => new RemoteOrganizationsPort(t).get("org"),
    },
    {
      name: "plan currency",
      payload: [
        {
          ...fixtures.billingPlanFixture,
          monthlyPrice: {
            ...fixtures.billingPlanFixture.monthlyPrice,
            currency: "EUR",
          },
        },
      ],
      run: (t) => new RemoteBillingPort(t).plans("org"),
    },
    {
      name: "inventory reason",
      payload: { ...fixtures.inventoryOperationFixture, reason: "unknown" },
      run: (t) =>
        new RemoteInventoryPort(t).operation("org", "company", "operation"),
    },
    {
      name: "inventory unit",
      payload: {
        ...fixtures.inventoryOperationFixture,
        lines: [
          {
            ...fixtures.inventoryOperationFixture.lines[0],
            quantity: { value: "1", unit: "unknown" },
          },
        ],
      },
      run: (t) =>
        new RemoteInventoryPort(t).operation("org", "company", "operation"),
    },
    {
      name: "purchasing status",
      payload: {
        ...fixtures.purchasingDashboardFixture,
        recentDocuments: [
          {
            ...fixtures.purchasingDashboardFixture.recentDocuments[0],
            status: "unknown",
          },
        ],
      },
      run: (t) =>
        new RemotePurchasingPort(t).dashboard("org", "company", query),
    },
    {
      name: "sales channel",
      payload: {
        ...fixtures.salesDashboardFixture,
        recentConfirmedInvoices: [
          {
            ...fixtures.salesDashboardFixture.recentConfirmedInvoices[0],
            salesChannel: "unknown",
          },
        ],
      },
      run: (t) => new RemoteSalesPort(t).dashboard("org", "company", query),
    },
    {
      name: "portal status",
      payload: { ...fixtures.portalMonitoringFixture, status: "unknown-value" },
      run: (t) => new RemotePortalMonitoringPort(t).current(),
    },
  ];
  for (const boundary of invalid)
    await assert.rejects(
      boundary.run(transport(boundary.payload)),
      invalidResponse,
      boundary.name,
    );
});

test("non-finite custom-transport numbers cannot cross a DTO boundary", async () => {
  for (const version of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    await assert.rejects(
      new RemoteOrganizationsPort(
        transport({ ...fixtures.organizationFixture, version }),
      ).get("org"),
      invalidResponse,
    );
  }
});

test("official exchange rates reject malformed nested source data with a stable cause", async () => {
  const malformed = {
    ...fixtures.exchangeRateSetFixture,
    rates: [
      {
        ...fixtures.exchangeRateSetFixture.rates[0],
        source: { kind: "official" },
      },
    ],
  };
  await assert.rejects(
    new RemoteOfficialExchangeRatesPort(transport(malformed)).current(
      "org",
      "company",
      "date",
    ),
    (failure: unknown) => {
      assert.ok(failure instanceof RemoteExchangeRatesFailure);
      assert.equal(failure.code, "RATE_UNAVAILABLE");
      return invalidResponse(failure.cause);
    },
  );
});
