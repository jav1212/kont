import {
  PaymentOrderFailure,
  paymentOrderAmount,
  paymentOrderDate,
  type PaymentOrder,
} from "../../domain";
import {
  canonicalPayrollConfirmationInstant,
  samePayrollConfirmationInstant,
} from "../../application";
import type {
  PayrollPaymentOrderDraft,
  PayrollPaymentOrderDraftRepository,
  PayrollPaymentOrderDraftResult,
  PayrollPaymentOrderTraceability,
} from "../../application";

/** Narrow service-side transport for the atomic payroll payment-order draft RPC. */
export interface PayrollPaymentOrderDraftRpcClient {
  /**
   * Invokes a service-side RPC.
   * @param name - Fixed database function name.
   * @param values - Typed RPC arguments serialized without monetary number coercion.
   * @returns The database JSON response or an RPC error.
   */
  rpc(
    name: "create_payroll_payment_order_draft",
    values: Record<string, unknown>,
  ): PromiseLike<{
    readonly data: unknown;
    readonly error: { readonly message?: string; readonly code?: string } | null;
  }>;
}

/**
 * Supabase persistence adapter for one atomic, payroll-originated payment-order draft.
 *
 * The database owns authorization, source locking, confirmation checks, durable
 * traceability, and idempotency. This adapter deliberately has no direct-table API.
 */
export class SupabasePayrollPaymentOrderDraftRepository
  implements PayrollPaymentOrderDraftRepository
{
  /**
   * Creates the service-only payroll payment-order draft adapter.
   * @param client - Credentialed RPC client; it must not expose direct payment-order writes here.
   * @returns A repository that calls the single atomic SQL boundary.
   */
  public constructor(private readonly client: PayrollPaymentOrderDraftRpcClient) {}

  /** {@inheritDoc PayrollPaymentOrderDraftRepository.createOrReplay} */
  public async createOrReplay(
    input: PayrollPaymentOrderDraft,
  ): Promise<PayrollPaymentOrderDraftResult> {
    let response: Awaited<ReturnType<PayrollPaymentOrderDraftRpcClient["rpc"]>>;
    try {
      response = await this.client.rpc(
        "create_payroll_payment_order_draft",
        argumentsFor(input),
      );
    } catch {
      throw new PaymentOrderFailure(
        "UNAVAILABLE",
        "Payroll payment-order draft persistence is unavailable.",
      );
    }
    if (response.error) throw mapRpcFailure(response.error);
    return decodeResult(response.data, input);
  }
}

function argumentsFor(input: PayrollPaymentOrderDraft): Record<string, unknown> {
  return {
    p_actor_id: input.scope.actorId,
    p_organization_id: input.scope.organizationId,
    p_company_id: input.scope.companyId,
    p_run_id: input.traceability.payrollRunId,
    p_receipt_id: input.traceability.payrollReceiptId,
    p_expected_employee_id: input.traceability.employeeId,
    // Decimal text prevents JavaScript floating-point coercion before PostgreSQL NUMERIC validates it.
    p_expected_amount: input.amount,
    p_expected_confirmed_at: input.traceability.payrollConfirmedAt,
    p_beneficiary: input.beneficiary,
    p_idempotency_key: input.idempotencyKey,
  };
}

function decodeResult(
  value: unknown,
  expected: PayrollPaymentOrderDraft,
): PayrollPaymentOrderDraftResult {
  const row = record(value, "Payroll payment-order draft response");
  if (row.disposition !== "created" && row.disposition !== "replayed")
    unavailable("Payroll payment-order draft disposition is malformed.");
  const order = decodeOrder(row.order);
  const traceability = decodeTraceability(row.traceability);
  if (
    order.tenantId !== expected.scope.tenantId ||
    order.organizationId !== expected.scope.organizationId ||
    order.companyId !== expected.scope.companyId ||
    order.beneficiary !== expected.beneficiary ||
    order.concept !== expected.concept ||
    order.currency !== expected.currency ||
    order.dueDate !== expected.dueDate ||
    order.status !== "draft" ||
    !sameAmount(order.amount, expected.amount) ||
    !sameTraceability(traceability, expected.traceability)
  )
    unavailable("Payroll payment-order draft response is out of scope or inconsistent.");
  return { disposition: row.disposition, order, traceability };
}

function decodeOrder(value: unknown): PaymentOrder {
  const row = record(value, "Payroll payment-order draft order");
  const id = text(row.id, "Payment-order identifier", 128);
  const tenantId = text(row.tenant_id, "Payment-order tenant identifier");
  const organizationId = text(row.organization_id, "Payment-order organization identifier");
  const companyId = text(row.company_id, "Payment-order company identifier");
  const beneficiary = text(row.beneficiary, "Payment-order beneficiary", 240);
  const concept = text(row.concept, "Payment-order concept", 1000);
  const amount = decimal(row.amount, "Payment-order amount");
  const currency = text(row.currency, "Payment-order currency", 3);
  if (!/^[A-Z]{3}$/.test(currency)) unavailable("Payment-order currency is malformed.");
  const dueDate = date(row.due_date);
  if (row.status !== "draft") unavailable("Payroll payment-order must remain a draft.");
  const version = row.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1)
    unavailable("Payment-order version is malformed.");
  return {
    id,
    tenantId,
    organizationId,
    companyId,
    beneficiary,
    concept,
    amount,
    currency,
    dueDate,
    status: "draft",
    version,
  };
}

function decodeTraceability(value: unknown): PayrollPaymentOrderTraceability {
  const row = record(value, "Payroll payment-order draft traceability");
  const payrollConfirmedAt = text(row.payrollConfirmedAt, "Payroll confirmation timestamp");
  try {
    canonicalPayrollConfirmationInstant(payrollConfirmedAt);
  } catch {
    unavailable("Payroll confirmation timestamp is malformed.");
  }
  return {
    tenantId: text(row.tenantId, "Traceability tenant identifier"),
    organizationId: text(row.organizationId, "Traceability organization identifier"),
    companyId: text(row.companyId, "Traceability company identifier"),
    payrollRunId: text(row.payrollRunId, "Traceability payroll run identifier"),
    payrollReceiptId: text(row.payrollReceiptId, "Traceability payroll receipt identifier"),
    employeeId: text(row.employeeId, "Traceability employee identifier"),
    payrollConfirmedAt,
  };
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) unavailable(`${label} is malformed.`);
  return value as Readonly<Record<string, unknown>>;
}

function text(value: unknown, label: string, maximum = 128): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum)
    unavailable(`${label} is malformed.`);
  return value;
}

function decimal(value: unknown, label: string): string {
  if (typeof value !== "string") unavailable(`${label} is malformed.`);
  try {
    return paymentOrderAmount(value);
  } catch {
    unavailable(`${label} is malformed.`);
  }
}

function date(value: unknown): string | null {
  try {
    return paymentOrderDate(value);
  } catch {
    unavailable("Payment-order due date is malformed.");
  }
}

function sameAmount(left: string, right: string): boolean {
  try {
    return canonicalAmount(left) === canonicalAmount(right);
  } catch {
    return false;
  }
}

function canonicalAmount(value: string): string {
  const exact = paymentOrderAmount(value);
  return exact.includes(".")
    ? exact.replace(/0+$/, "").replace(/\.$/, "")
    : exact;
}

function sameTraceability(
  left: PayrollPaymentOrderTraceability,
  right: PayrollPaymentOrderTraceability,
): boolean {
  return left.tenantId === right.tenantId
    && left.organizationId === right.organizationId
    && left.companyId === right.companyId
    && left.payrollRunId === right.payrollRunId
    && left.payrollReceiptId === right.payrollReceiptId
    && left.employeeId === right.employeeId
    && samePayrollConfirmationInstant(left.payrollConfirmedAt, right.payrollConfirmedAt);
}

function mapRpcFailure(error: { readonly message?: string; readonly code?: string }): PaymentOrderFailure {
  const message = error.message ?? "Payroll payment-order draft persistence is unavailable.";
  if (/ACCESS_DENIED|COMPANY_INVALID|AUTHORIZATION_REVOKED|FORBIDDEN|permission denied/i.test(message))
    return new PaymentOrderFailure("FORBIDDEN", message);
  if (/NOT_FOUND/i.test(message)) return new PaymentOrderFailure("NOT_FOUND", message);
  if (/CONFLICT|IDEMPOTENCY|SOURCE_CHANGED|VERSION/i.test(message))
    return new PaymentOrderFailure("CONFLICT", message);
  if (/INVALID|VALIDATION|CONFIRMED/i.test(message))
    return new PaymentOrderFailure("INVALID", message);
  return new PaymentOrderFailure("UNAVAILABLE", message);
}

function unavailable(message: string): never {
  throw new PaymentOrderFailure("UNAVAILABLE", message);
}
