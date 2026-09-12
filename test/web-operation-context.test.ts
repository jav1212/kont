import assert from "node:assert/strict";
import test from "node:test";
import {
  ClientInputValidationError,
  decodeUpdateOperationalDefaults,
} from "@kontave/client-contracts";
import { currency } from "@kontave/monetary/domain";
import {
  OrganizationFailure,
  companyId,
  organizationId,
  userId,
} from "@kontave/organizations/domain";
import {
  createOperationalDefaults,
  localDate,
  OperationContextFailure,
} from "@kontave/operation-context/domain";
import {
  createWebOperationContextActions,
  type WebOperationContextDependencies,
} from "@/src/modules/operation-context/backend/web-operation-context-actions";
import { webOperationContextErrorResponse } from "@/src/modules/operation-context/backend/web-operation-context-http";
import {
  TenantForbiddenError,
  type TenantContext,
} from "@/src/shared/backend/utils/require-tenant";

const actorId = "10000000-0000-4000-8000-000000000001";
const tenantId = "20000000-0000-4000-8000-000000000001";
const organizationA = "30000000-0000-4000-8000-000000000001";
const organizationB = "30000000-0000-4000-8000-000000000002";
const companyA = "J-12345678-9";
const companyB = "J-87654321-0";

/** Builds a terminal-bound cookie tenant context for authorization-order tests. @returns Context pinned to the selected legacy tenant. */
function barcodeTenant(): TenantContext {
  return {
    userId: actorId,
    tenantId,
    schemaName: "tenant_20000000000040008000000000000001",
    actingAs: { ownerId: tenantId, role: "cajero" },
    role: "cajero",
    effectiveOwnerId: tenantId,
    barcodeSession: true,
  };
}

/** Builds a coordinator port with observable initialization and update calls. @param counters Mutable counters used to assert work ordering. @returns Coordinator dependency that starts from a persisted ready snapshot. */
function coordinator(counters: { initialized: number; updated: number }) {
  const defaults = createOperationalDefaults({
    key: {
      userId: userId(actorId),
      organizationId: organizationId(organizationA),
      companyId: companyId(companyA),
    },
    effectiveDate: localDate("2026-09-12"),
    presentationCurrency: currency("VES", 2).code,
    exchangeRate: {
      status: "unavailable",
      effectiveDate: localDate("2026-09-12"),
    },
    version: 4,
    updatedAt: "2026-09-12T12:00:00.000Z",
  });
  return {
    async initialize() {
      counters.initialized += 1;
    },
    async update() {
      counters.updated += 1;
    },
    getState() {
      return { status: "ready" as const, value: defaults };
    },
  };
}

/** Produces a minimal dependency composition with explicit access and persistence spies. @param input Test-specific authorization and company behavior. @returns Dependencies accepted by the Web operation-context action factory. */
function dependencies(input: {
  readonly workspace: (
    organization: string,
    permission: unknown,
  ) => Promise<unknown>;
  readonly company: () => Promise<unknown>;
  readonly counters: {
    initialized: number;
    updated: number;
    companyReads: number;
    rateReads: number;
  };
}): WebOperationContextDependencies {
  return {
    organizations: {
      workspace: input.workspace,
    } as unknown as WebOperationContextDependencies["organizations"],
    organizationDirectory: {
      getCompany: {
        async execute() {
          input.counters.companyReads += 1;
          return input.company();
        },
      },
    } as unknown as WebOperationContextDependencies["organizationDirectory"],
    createCoordinator: () => coordinator(input.counters),
    createExchangeRateResolver: () =>
      ({
        async historical() {
          input.counters.rateReads += 1;
          throw new Error("Rate resolution must not run in this test.");
        },
      }) as unknown as ReturnType<
        NonNullable<
          WebOperationContextDependencies["createExchangeRateResolver"]
        >
      >,
  };
}

test("a tenant-organization mismatch aborts before company or operation-context persistence", async () => {
  const counters = {
    initialized: 0,
    updated: 0,
    companyReads: 0,
    rateReads: 0,
  };
  const actions = createWebOperationContextActions(
    new Request(
      "https://web.test/api/organizations/mismatch/companies/company/operation-context",
    ),
    barcodeTenant(),
    dependencies({
      counters,
      workspace: async () => {
        throw new TenantForbiddenError();
      },
      company: async () => ({ id: companyA }),
    }),
  );

  await assert.rejects(
    () => actions.get(organizationB, companyA),
    TenantForbiddenError,
  );
  assert.deepEqual(counters, {
    initialized: 0,
    updated: 0,
    companyReads: 0,
    rateReads: 0,
  });
});

test("a foreign company aborts before operation-context persistence and rate resolution", async () => {
  const counters = {
    initialized: 0,
    updated: 0,
    companyReads: 0,
    rateReads: 0,
  };
  const actions = createWebOperationContextActions(
    new Request(
      "https://web.test/api/organizations/authorized/companies/foreign/operation-context",
    ),
    barcodeTenant(),
    dependencies({
      counters,
      workspace: async () => undefined,
      company: async () => {
        throw new OrganizationFailure(
          "COMPANY_ACCESS_DENIED",
          "foreign company",
        );
      },
    }),
  );

  await assert.rejects(
    () => actions.exchangeRates(organizationA, companyB, "2026-09-12"),
    OrganizationFailure,
  );
  assert.deepEqual(counters, {
    initialized: 0,
    updated: 0,
    companyReads: 1,
    rateReads: 0,
  });
});

test("an authorized barcode-pinned organization is admitted after its canonical business permission", async () => {
  const counters = {
    initialized: 0,
    updated: 0,
    companyReads: 0,
    rateReads: 0,
  };
  const permissions: unknown[] = [];
  const actions = createWebOperationContextActions(
    new Request(
      "https://web.test/api/organizations/authorized/companies/company/operation-context",
    ),
    barcodeTenant(),
    dependencies({
      counters,
      workspace: async (_organization, permission) => {
        permissions.push(permission);
      },
      company: async () => ({ id: companyA }),
    }),
  );

  const result = await actions.get(organizationA, companyA);
  assert.equal(result.version, 4);
  assert.deepEqual(permissions, ["inventory.read"]);
  assert.deepEqual(counters, {
    initialized: 1,
    updated: 0,
    companyReads: 1,
    rateReads: 0,
  });
});

test("a decoded PATCH command returns optimistic conflict without calling coordinator update", async () => {
  const counters = {
    initialized: 0,
    updated: 0,
    companyReads: 0,
    rateReads: 0,
  };
  const actions = createWebOperationContextActions(
    new Request(
      "https://web.test/api/organizations/authorized/companies/company/operation-context",
    ),
    barcodeTenant(),
    dependencies({
      counters,
      workspace: async () => undefined,
      company: async () => ({ id: companyA }),
    }),
  );
  const command = decodeUpdateOperationalDefaults({
    expectedVersion: 3,
    effectiveDate: "2026-09-13",
  });

  await assert.rejects(
    () => actions.update(organizationA, companyA, command),
    (cause: unknown) =>
      cause instanceof OperationContextFailure &&
      cause.code === "OPERATION_CONTEXT_VERSION_CONFLICT",
  );
  assert.deepEqual(counters, {
    initialized: 1,
    updated: 0,
    companyReads: 1,
    rateReads: 0,
  });
});

test("operation-context PATCH decoding rejects unknown fields and malformed manual-rate reasons", () => {
  for (const value of [
    { expectedVersion: 1, unexpected: true },
    {
      expectedVersion: 1,
      manualExchangeRate: { baseCurrency: "USD", value: "36.4", reason: "" },
    },
    { expectedVersion: -1, effectiveDate: "2026-09-12" },
  ])
    assert.throws(
      () => decodeUpdateOperationalDefaults(value),
      ClientInputValidationError,
    );
});

test("unexpected coordinator diagnostics never reach the Web response", async () => {
  const response = webOperationContextErrorResponse(
    new Error("postgres://secret@host/internal database failure"),
  );
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: "No se pudo procesar el contexto operativo.",
    code: "INTERNAL_ERROR",
  });
});
