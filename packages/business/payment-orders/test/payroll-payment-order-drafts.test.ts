import assert from "node:assert/strict";
import test from "node:test";
import {
  CreatePayrollPaymentOrderDrafts,
  PaymentOrderFailure,
  samePayrollConfirmationInstant,
  type PayrollPaymentOrderDraft,
  type PayrollPaymentOrderDraftRepository,
} from "../src";

const scope = {
  actorId: "actor-1",
  tenantId: "tenant-1",
  organizationId: "organization-1",
  companyId: "company-1",
} as const;
const confirmedRun = {
  id: "run-1",
  tenantId: scope.tenantId,
  organizationId: scope.organizationId,
  companyId: scope.companyId,
  status: "confirmed",
  confirmedAt: "2026-10-01T12:00:00.000Z",
} as const;
const receipt = {
  id: "receipt-1",
  runId: confirmedRun.id,
  companyId: scope.companyId,
  employeeId: "employee-1",
  netPay: "1500.2500",
  currency: "VES",
  beneficiary: "Cuenta nómina configurada",
} as const;

class AtomicDraftRepository implements PayrollPaymentOrderDraftRepository {
  public readonly drafts = new Map<string, PayrollPaymentOrderDraft>();

  /** {@inheritDoc PayrollPaymentOrderDraftRepository.createOrReplay} */
  public async createOrReplay(input: PayrollPaymentOrderDraft) {
    const existing = this.drafts.get(input.idempotencyKey);
    if (existing) {
      assert.deepEqual(existing.traceability, input.traceability);
      assert.equal(existing.amount, input.amount);
      return {
        disposition: "replayed" as const,
        order: orderFrom(existing),
        traceability: existing.traceability,
      };
    }
    this.drafts.set(input.idempotencyKey, input);
    return {
      disposition: "created" as const,
      order: orderFrom(input),
      traceability: input.traceability,
    };
  }
}

test("confirmed payroll receipts create then replay one independently traced draft", async () => {
  const repository = new AtomicDraftRepository();
  const command = new CreatePayrollPaymentOrderDrafts(repository);
  const first = await command.execute({ scope, confirmedRun, receipts: [receipt] });
  const replay = await command.execute({ scope, confirmedRun, receipts: [receipt] });

  assert.equal(first[0]?.disposition, "created");
  assert.equal(replay[0]?.disposition, "replayed");
  assert.equal(repository.drafts.size, 1);
  assert.deepEqual(first[0]?.traceability, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    companyId: scope.companyId,
    payrollRunId: confirmedRun.id,
    payrollReceiptId: receipt.id,
    employeeId: receipt.employeeId,
    payrollConfirmedAt: confirmedRun.confirmedAt,
  });
  assert.equal(first[0]?.order.amount, receipt.netPay);
  assert.equal(first[0]?.order.currency, "VES");
});

test("payroll payment-order drafts reject runs and receipts outside the company scope", async () => {
  const command = new CreatePayrollPaymentOrderDrafts(new AtomicDraftRepository());
  await assert.rejects(
    command.execute({
      scope,
      confirmedRun: { ...confirmedRun, companyId: "company-2" },
      receipts: [receipt],
    }),
    (error: unknown) =>
      error instanceof PaymentOrderFailure && error.code === "FORBIDDEN",
  );
  await assert.rejects(
    command.execute({
      scope,
      confirmedRun,
      receipts: [{ ...receipt, companyId: "company-2" }],
    }),
    (error: unknown) =>
      error instanceof PaymentOrderFailure && error.code === "FORBIDDEN",
  );
});

test("payroll payment-order drafts reject zero net pay and duplicate receipt instructions", async () => {
  const command = new CreatePayrollPaymentOrderDrafts(new AtomicDraftRepository());
  await assert.rejects(
    command.execute({
      scope,
      confirmedRun,
      receipts: [{ ...receipt, netPay: "0" }],
    }),
    (error: unknown) =>
      error instanceof PaymentOrderFailure && error.code === "INVALID",
  );
  await assert.rejects(
    command.execute({ scope, confirmedRun, receipts: [receipt, receipt] }),
    (error: unknown) =>
      error instanceof PaymentOrderFailure && error.code === "CONFLICT",
  );
});

test("payroll payment-order drafts accept equivalent NUMERIC serialization from persistence", async () => {
  const persistence = new AtomicDraftRepository();
  const command = new CreatePayrollPaymentOrderDrafts({
    async createOrReplay(input) {
      const result = await persistence.createOrReplay(input);
      return { ...result, order: { ...result.order, amount: "1500.25" } };
    },
  });

  const [result] = await command.execute({ scope, confirmedRun, receipts: [receipt] });
  assert.equal(result?.order.amount, "1500.25");
});

test("payroll confirmation timestamps compare as strict instants through microsecond precision", async () => {
  assert.equal(
    samePayrollConfirmationInstant(
      "2026-10-01T12:00:00.123400Z",
      "2026-10-01T08:00:00.1234-04:00",
    ),
    true,
  );
  assert.equal(
    samePayrollConfirmationInstant(
      confirmedRun.confirmedAt,
      "2026-10-01T12:00:00+00:00",
    ),
    true,
  );
  assert.equal(samePayrollConfirmationInstant("2026-10-01", confirmedRun.confirmedAt), false);
  assert.equal(samePayrollConfirmationInstant("2026-02-30T12:00:00Z", confirmedRun.confirmedAt), false);
});

test("payroll payment-order drafts reject malformed atomic persistence responses", async () => {
  const persistence = new AtomicDraftRepository();
  const command = new CreatePayrollPaymentOrderDrafts({
    async createOrReplay(input) {
      const result = await persistence.createOrReplay(input);
      return { ...result, disposition: "unknown" as "created" };
    },
  });

  await assert.rejects(
    command.execute({ scope, confirmedRun, receipts: [receipt] }),
    (error: unknown) =>
      error instanceof PaymentOrderFailure && error.code === "UNAVAILABLE",
  );
});

function orderFrom(draft: PayrollPaymentOrderDraft) {
  return {
    id: `order:${draft.traceability.payrollReceiptId}`,
    tenantId: draft.scope.tenantId,
    organizationId: draft.scope.organizationId,
    companyId: draft.scope.companyId,
    beneficiary: draft.beneficiary,
    concept: draft.concept,
    amount: draft.amount,
    currency: draft.currency,
    dueDate: draft.dueDate,
    status: "draft" as const,
    version: 1,
  };
}
