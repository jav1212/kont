import assert from "node:assert/strict";
import test from "node:test";
import { currency, moneyFromDecimal } from "@kontave/monetary/domain";
import {
  AuthorizationReason,
  AuthorizationSource,
  PERMISSIONS,
  type AuthorizationRequest,
} from "@kontave/access-control/domain";
import {
  RequireCustomerInvoiceCreditAuthorization,
  type CustomerInvoiceCreditSnapshot,
} from "../../src/application/customer-credit-authorization";
import { SalesFailure } from "../../src/domain";

const usd = currency("USD", 2);
const input = {
  actor: { userId: "user", organizationId: "org" },
  companyId: "company",
  invoiceId: "invoice",
  context: {
    requestId: "request",
    source: AuthorizationSource.Web,
    occurredAt: "2026-09-28T12:00:00Z",
  },
};
const snapshot: CustomerInvoiceCreditSnapshot = {
  organizationId: "org",
  companyId: "company",
  invoiceId: "invoice",
  customerId: "customer",
  creditLimit: moneyFromDecimal("100", usd),
  outstandingDebt: moneyFromDecimal("100", usd),
  additionalCredit: moneyFromDecimal("1", usd),
};

test("ordinary invoice permission cannot authorize an overdraft exception", async () => {
  const permissions: string[] = [];
  const denied = new Error("denied");
  const useCase = new RequireCustomerInvoiceCreditAuthorization(
    { read: async () => snapshot },
    {
      async execute(request: AuthorizationRequest) {
        permissions.push(request.permission);
        if (request.permission === PERMISSIONS.SALES_OVERDRAWN_CUSTOMER_BILL)
          throw denied;
        return { allowed: true, reason: AuthorizationReason.PermissionGranted };
      },
    },
  );
  await assert.rejects(
    () => useCase.execute(input),
    (error) => error === denied,
  );
  assert.deepEqual(permissions, [
    PERMISSIONS.SALES_CREATE,
    PERMISSIONS.SALES_OVERDRAWN_CUSTOMER_BILL,
  ]);
});

test("a denied actor never reads confidential customer credit facts", async () => {
  let reads = 0;
  const denied = new Error("denied");
  const useCase = new RequireCustomerInvoiceCreditAuthorization(
    {
      read: async () => {
        reads++;
        return snapshot;
      },
    },
    {
      execute: async () => {
        throw denied;
      },
    },
  );
  await assert.rejects(
    () => useCase.execute(input),
    (error) => error === denied,
  );
  assert.equal(reads, 0);
});

test("rejects a foreign credit source even when the actor has invoice permission", async () => {
  const useCase = new RequireCustomerInvoiceCreditAuthorization(
    { read: async () => ({ ...snapshot, companyId: "other" }) },
    {
      execute: async () => ({
        allowed: true,
        reason: AuthorizationReason.PermissionGranted,
      }),
    },
  );
  await assert.rejects(
    () => useCase.execute(input),
    (error: unknown) =>
      error instanceof SalesFailure && error.code === "SALES_CREDIT_INVALID",
  );
});

test("within-limit invoices require only the ordinary invoice permission", async () => {
  const permissions: string[] = [];
  const useCase = new RequireCustomerInvoiceCreditAuthorization(
    {
      read: async () => ({
        ...snapshot,
        outstandingDebt: moneyFromDecimal("99", usd),
      }),
    },
    {
      execute: async (request) => {
        permissions.push(request.permission);
        return { allowed: true, reason: AuthorizationReason.PermissionGranted };
      },
    },
  );
  assert.equal((await useCase.execute(input)).requiresOverride, false);
  assert.deepEqual(permissions, [PERMISSIONS.SALES_CREATE]);
});
