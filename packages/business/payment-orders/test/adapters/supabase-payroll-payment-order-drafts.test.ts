import assert from "node:assert/strict";
import test from "node:test";
import {
  PaymentOrderFailure,
  type PayrollPaymentOrderDraft,
} from "../../src";
import {
  SupabasePayrollPaymentOrderDraftRepository,
  type PayrollPaymentOrderDraftRpcClient,
} from "../../src/adapters/supabase";

const draft: PayrollPaymentOrderDraft = {
  scope: {
    actorId: "00000000-0000-4000-8000-000000000021",
    tenantId: "00000000-0000-4000-8000-000000000001",
    organizationId: "00000000-0000-4000-8000-000000000011",
    companyId: "J-12345678-9",
  },
  idempotencyKey: "payroll-payment-order:v1:test",
  traceability: {
    tenantId: "00000000-0000-4000-8000-000000000001",
    organizationId: "00000000-0000-4000-8000-000000000011",
    companyId: "J-12345678-9",
    payrollRunId: "run-1",
    payrollReceiptId: "receipt-1",
    employeeId: "employee-1",
    payrollConfirmedAt: "2026-10-01T12:00:00.000Z",
  },
  beneficiary: "Cuenta nómina configurada",
  concept: "Nómina run-1, recibo receipt-1",
  amount: "1500.2500",
  currency: "VES",
  dueDate: null,
};

test("Supabase payroll draft repository calls the atomic RPC with exact serialized amount", async () => {
  let name = "";
  let args: Record<string, unknown> | undefined;
  const repository = new SupabasePayrollPaymentOrderDraftRepository({
    async rpc(rpcName, rpcArgs) {
      name = rpcName;
      args = rpcArgs;
      return success("created");
    },
  });

  const result = await repository.createOrReplay(draft);
  assert.equal(result.disposition, "created");
  assert.equal(result.order.amount, "1500.25");
  assert.equal(name, "create_payroll_payment_order_draft");
  assert.deepEqual(args, {
    p_actor_id: draft.scope.actorId,
    p_organization_id: draft.scope.organizationId,
    p_company_id: draft.scope.companyId,
    p_run_id: draft.traceability.payrollRunId,
    p_receipt_id: draft.traceability.payrollReceiptId,
    p_expected_employee_id: draft.traceability.employeeId,
    p_expected_amount: "1500.2500",
    p_expected_confirmed_at: draft.traceability.payrollConfirmedAt,
    p_beneficiary: draft.beneficiary,
    p_idempotency_key: draft.idempotencyKey,
  });
});

test("Supabase payroll draft repository accepts only a consistent replay", async () => {
  const repository = new SupabasePayrollPaymentOrderDraftRepository(client(success("replayed")));
  assert.equal((await repository.createOrReplay(draft)).disposition, "replayed");
  const mismatch = new SupabasePayrollPaymentOrderDraftRepository(client(success("replayed", { amount: "1500.26" })));
  await assert.rejects(
    mismatch.createOrReplay(draft),
    (error: unknown) => error instanceof PaymentOrderFailure && error.code === "UNAVAILABLE",
  );
});

test("Supabase payroll draft repository accepts PostgreSQL offset timestamptz serialization", async () => {
  const response = success("created");
  const payload = response.data as { traceability: Record<string, unknown> };
  payload.traceability = {
    ...payload.traceability,
    payrollConfirmedAt: "2026-10-01T08:00:00.000000-04:00",
  };
  const result = await new SupabasePayrollPaymentOrderDraftRepository(client(response)).createOrReplay(draft);
  assert.equal(result.traceability.payrollConfirmedAt, "2026-10-01T08:00:00.000000-04:00");
});

test("Supabase payroll draft repository maps conflict and forbidden RPC errors", async () => {
  for (const [message, code] of [
    ["PAYROLL_PAYMENT_ORDER_DRAFT_IDEMPOTENCY_CONFLICT", "CONFLICT"],
    ["ORGANIZATIONAL_USER_ACCESS_DENIED", "FORBIDDEN"],
    ["PAYROLL_PAYMENT_ORDER_AUTHORIZATION_REVOKED", "FORBIDDEN"],
  ] as const) {
    const repository = new SupabasePayrollPaymentOrderDraftRepository(client({
      data: null,
      error: { message },
    }));
    await assert.rejects(
      repository.createOrReplay(draft),
      (error: unknown) => error instanceof PaymentOrderFailure && error.code === code,
    );
  }
});

test("Supabase payroll draft repository rejects malformed data and transport ambiguity", async () => {
  const malformed = new SupabasePayrollPaymentOrderDraftRepository(client({ data: { disposition: "created" }, error: null }));
  await assert.rejects(
    malformed.createOrReplay(draft),
    (error: unknown) => error instanceof PaymentOrderFailure && error.code === "UNAVAILABLE",
  );
  const unavailable = new SupabasePayrollPaymentOrderDraftRepository({
    async rpc() { throw new Error("connection reset"); },
  });
  await assert.rejects(
    unavailable.createOrReplay(draft),
    (error: unknown) => error instanceof PaymentOrderFailure && error.code === "UNAVAILABLE",
  );
});

function client(result: { readonly data: unknown; readonly error: { readonly message?: string } | null }): PayrollPaymentOrderDraftRpcClient {
  return { async rpc() { return result; } };
}

function success(
  disposition: "created" | "replayed",
  patch: Readonly<Record<string, unknown>> = {},
): { readonly data: unknown; readonly error: null } {
  return {
    data: {
      disposition,
      order: {
        id: "payment-order-1",
        tenant_id: draft.scope.tenantId,
        organization_id: draft.scope.organizationId,
        company_id: draft.scope.companyId,
        beneficiary: draft.beneficiary,
        concept: draft.concept,
        amount: "1500.25",
        currency: "VES",
        due_date: null,
        status: "draft",
        version: 1,
        ...patch,
      },
      traceability: draft.traceability,
    },
    error: null,
  };
}
