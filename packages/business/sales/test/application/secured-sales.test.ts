import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SecuredSales,
  type SecuredSalesRepository,
} from "../../src/application/secured-sales";
import { SupabaseSecuredSalesRepository } from "../../src/adapters/supabase/secured-sales";
import { SalesFailure } from "../../src/domain";

const scope = {
  actorUserId: "actor",
  organizationId: "organization",
  companyId: "company",
};

test("invalid money never reaches the commercial persistence boundary", () => {
  let calls = 0;
  const repository = {
    setCreditLimit: async () => {
      calls++;
      throw new Error("must not execute");
    },
  } as unknown as SecuredSalesRepository;
  const service = new SecuredSales(repository);
  for (const limitVes of [
    "-1",
    "NaN",
    "1e5",
    "0.000000001",
    "100000000000000000000",
  ]) {
    assert.throws(
      () =>
        service.setCreditLimit({
          ...scope,
          customerId: "customer",
          limitVes,
          expectedVersion: 0,
        }),
      SalesFailure,
    );
  }
  assert.equal(calls, 0);
});

test("registered sales branch attribution requires a UUID before confirmation", () => {
  let calls = 0;
  const repository = { async confirm() { calls++; throw new Error("must not execute"); } } as unknown as SecuredSalesRepository;
  const service = new SecuredSales(repository);
  assert.throws(() => service.confirm({ ...scope, invoiceId: "invoice", allowNegativeStock: false, companyBranchId: "HQ" }), SalesFailure);
  assert.equal(calls, 0);
});

test("registered sales branch attribution selects the additive scoped RPC", async () => {
  const branchId = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
  let name = "";
  let args: Record<string, unknown> | undefined;
  const client = { rpc: async (rpcName: string, rpcArgs: Record<string, unknown>) => {
    name = rpcName; args = rpcArgs;
    return { data: { companyId: scope.companyId, invoiceId: "invoice", status: "confirmed" }, error: null };
  } } as unknown as SupabaseClient;
  const service = new SecuredSales(new SupabaseSecuredSalesRepository(client));
  await service.confirm({ ...scope, invoiceId: "invoice", allowNegativeStock: false, companyBranchId: branchId });
  assert.equal(name, "confirm_native_sales_invoice_branch_secure");
  assert.equal(args?.p_company_branch_id, branchId);
  assert.equal(args?.p_branch_id, branchId);
});

test("the RPC adapter rejects cross-company confirmation responses", async () => {
  const client = {
    rpc: async () => ({
      data: { companyId: "other", invoiceId: "invoice", status: "confirmed" },
      error: null,
    }),
  } as unknown as SupabaseClient;
  const repository = new SupabaseSecuredSalesRepository(client);
  await assert.rejects(
    repository.confirm({
      ...scope,
      invoiceId: "invoice",
      allowNegativeStock: false,
    }),
    (error: unknown) =>
      error instanceof SalesFailure &&
      error.code === "SALES_REPOSITORY_UNAVAILABLE",
  );
});

test("the RPC adapter binds trusted actor and maps database permission failures", async () => {
  let received: Record<string, unknown> | undefined;
  const client = {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      received = args;
      return {
        data: null,
        error: { message: "ORGANIZATIONAL_USER_ACCESS_DENIED" },
      };
    },
  } as unknown as SupabaseClient;
  const repository = new SupabaseSecuredSalesRepository(client);
  await assert.rejects(
    repository.reversePayment({
      ...scope,
      receivableId: "debt",
      paymentId: "payment",
      idempotencyKey: "reversal-1",
      reason: "Duplicate",
    }),
    (error: unknown) =>
      error instanceof SalesFailure && error.code === "SALES_ACCESS_DENIED",
  );
  assert.equal(received?.p_actor_user_id, scope.actorUserId);
  assert.equal(received?.p_organization_id, scope.organizationId);
});

test("credit persistence preserves exact decimal strings without Number conversion", async () => {
  const limitVes = "99999999999999999999.12345678";
  const client = {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      assert.equal(args.p_limit_ves, limitVes);
      return {
        data: {
          companyId: scope.companyId,
          customerId: "customer",
          limitVes,
          version: 1,
        },
        error: null,
      };
    },
  } as unknown as SupabaseClient;
  const service = new SecuredSales(new SupabaseSecuredSalesRepository(client));
  assert.equal(
    (
      await service.setCreditLimit({
        ...scope,
        customerId: "customer",
        limitVes,
        expectedVersion: 0,
      })
    ).limitVes,
    limitVes,
  );
});
