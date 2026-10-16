import {
  paymentOrderAmount,
  PaymentOrderFailure,
  type DecimalAmount,
  type PaymentOrder,
} from "../domain";

/** Authorized tenant and organization boundary for a payroll-originated draft. */
export interface PayrollPaymentOrderScope {
  readonly actorId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
}

/** Immutable evidence that a payroll run may originate administrative drafts. */
export interface ConfirmedPayrollRunEvidence {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly status: "confirmed";
  readonly confirmedAt: string;
}

/** A scoped payroll receipt whose positive net pay can become one administrative draft. */
export interface PayrollReceiptPaymentInstruction {
  readonly id: string;
  readonly runId: string;
  readonly companyId: string;
  readonly employeeId: string;
  readonly netPay: DecimalAmount;
  readonly currency: "VES";
  /** Display label for the configured beneficiary; employee identity remains employeeId. */
  readonly beneficiary: string;
}

/** Source linkage that a durable adapter must persist with its payment-order draft. */
export interface PayrollPaymentOrderTraceability {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly payrollRunId: string;
  readonly payrollReceiptId: string;
  readonly employeeId: string;
  readonly payrollConfirmedAt: string;
}

/** Immutable administrative draft planned for exactly one payroll receipt. */
export interface PayrollPaymentOrderDraft {
  readonly scope: PayrollPaymentOrderScope;
  readonly idempotencyKey: string;
  readonly traceability: PayrollPaymentOrderTraceability;
  readonly beneficiary: string;
  readonly concept: string;
  readonly amount: DecimalAmount;
  readonly currency: "VES";
  readonly dueDate: null;
}

/** Authoritative result of an atomic create-or-replay operation. */
export interface PayrollPaymentOrderDraftResult {
  readonly disposition: "created" | "replayed";
  readonly order: PaymentOrder;
  readonly traceability: PayrollPaymentOrderTraceability;
}

/**
 * Input that plans one ungrouped administrative draft for every supplied payroll receipt.
 * Each receipt is atomic on its own; a multi-receipt invocation is intentionally not a batch transaction.
 */
export interface CreatePayrollPaymentOrderDraftsInput {
  readonly scope: PayrollPaymentOrderScope;
  readonly confirmedRun: ConfirmedPayrollRunEvidence;
  readonly receipts: readonly PayrollReceiptPaymentInstruction[];
}

/**
 * Atomic persistence boundary for payroll-originated payment-order drafts.
 *
 * Implementations must authorize the actor, lock or otherwise protect the source receipt,
 * verify that the run is still confirmed and that the receipt still has the same employee,
 * company, currency, and positive net pay in the same tenant/company scope, and persist the
 * source linkage with a uniqueness constraint on idempotencyKey. A replay with identical
 * immutable values returns the original draft; a mismatched replay fails with CONFLICT.
 */
export interface PayrollPaymentOrderDraftRepository {
  /**
   * Atomically creates a traced draft or returns its identical prior creation.
   * @param input - Validated draft, source trace, scope, and deterministic idempotency key.
   * @returns The authoritative created or replayed order and durable source trace.
   * @throws {PaymentOrderFailure} When source authorization, confirmation, trace persistence, or idempotency fails.
   */
  createOrReplay(
    input: PayrollPaymentOrderDraft,
  ): Promise<PayrollPaymentOrderDraftResult>;
}

/** Plans and atomically records one draft per positive receipt from a confirmed payroll run. */
export class CreatePayrollPaymentOrderDrafts {
  /**
   * Creates the payroll-to-administrative drafting use case.
   * @param repository - Atomic, authorization-enforcing persistence boundary.
   * @returns A use case that never executes or settles a payment.
   */
  public constructor(
    private readonly repository: PayrollPaymentOrderDraftRepository,
  ) {}

  /**
   * Creates or replays independent drafts for a confirmed run's receipts.
   * @param input - Authorized scope, confirmation evidence, and receipt instructions.
   * @returns One authoritative result per input receipt in input order; earlier receipt drafts remain if a later one fails.
   * @throws {PaymentOrderFailure} When scope, confirmation evidence, receipt data, or persistence is invalid.
   */
  public async execute(
    input: CreatePayrollPaymentOrderDraftsInput,
  ): Promise<readonly PayrollPaymentOrderDraftResult[]> {
    validateInput(input);
    const results: PayrollPaymentOrderDraftResult[] = [];
    for (const receipt of input.receipts) {
      const draft = planDraft(input.scope, input.confirmedRun, receipt);
      const result = await this.repository.createOrReplay(draft);
      validateResult(draft, result);
      results.push(result);
    }
    return results;
  }
}

/**
 * Plans one ungrouped payment-order draft from a confirmed payroll receipt.
 * @param scope - Authorized tenant, organization, and company scope.
 * @param confirmedRun - Immutable confirmation evidence for the source run.
 * @param receipt - One scoped receipt with a positive VES net pay.
 * @returns A deterministic draft carrying receipt and employee traceability.
 * @throws {PaymentOrderFailure} When a value is unsafe for a payment-order draft.
 */
export function planPayrollPaymentOrderDraft(
  scope: PayrollPaymentOrderScope,
  confirmedRun: ConfirmedPayrollRunEvidence,
  receipt: PayrollReceiptPaymentInstruction,
): PayrollPaymentOrderDraft {
  validateInput({ scope, confirmedRun, receipts: [receipt] });
  return planDraft(scope, confirmedRun, receipt);
}

function planDraft(
  scope: PayrollPaymentOrderScope,
  run: ConfirmedPayrollRunEvidence,
  receipt: PayrollReceiptPaymentInstruction,
): PayrollPaymentOrderDraft {
  const traceability: PayrollPaymentOrderTraceability = {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    companyId: scope.companyId,
    payrollRunId: run.id,
    payrollReceiptId: receipt.id,
    employeeId: receipt.employeeId,
    payrollConfirmedAt: run.confirmedAt,
  };
  return {
    scope,
    idempotencyKey: payrollReceiptIdempotencyKey(traceability),
    traceability,
    beneficiary: receipt.beneficiary,
    concept: `Nómina ${run.id}, recibo ${receipt.id}`,
    amount: receipt.netPay,
    currency: "VES",
    dueDate: null,
  };
}

function validateInput(input: CreatePayrollPaymentOrderDraftsInput): void {
  validateScope(input.scope);
  const run = input.confirmedRun;
  validateText(run.id, "Payroll run identifier");
  canonicalPayrollConfirmationInstant(run.confirmedAt);
  if (run.status !== "confirmed")
    throw new PaymentOrderFailure("INVALID", "Payroll run must be confirmed.");
  for (const [label, value] of [
    ["Payroll run tenant", run.tenantId],
    ["Payroll run organization", run.organizationId],
    ["Payroll run company", run.companyId],
  ] as const)
    validateText(value, label);
  if (
    run.tenantId !== input.scope.tenantId ||
    run.organizationId !== input.scope.organizationId ||
    run.companyId !== input.scope.companyId
  )
    throw new PaymentOrderFailure(
      "FORBIDDEN",
      "Payroll run is outside the authorized payment-order scope.",
    );
  if (!Array.isArray(input.receipts) || input.receipts.length === 0)
    throw new PaymentOrderFailure("INVALID", "At least one payroll receipt is required.");
  const receiptIds = new Set<string>();
  for (const receipt of input.receipts) {
    validateText(receipt.id, "Payroll receipt identifier");
    if (receiptIds.has(receipt.id))
      throw new PaymentOrderFailure(
        "CONFLICT",
        "A payroll receipt may create only one draft in a request.",
      );
    receiptIds.add(receipt.id);
    validateText(receipt.runId, "Payroll receipt run identifier");
    validateText(receipt.companyId, "Payroll receipt company");
    validateText(receipt.employeeId, "Payroll employee identifier");
    validateText(receipt.beneficiary, "Beneficiary", 240);
    if (receipt.runId !== run.id || receipt.companyId !== input.scope.companyId)
      throw new PaymentOrderFailure(
        "FORBIDDEN",
        "Payroll receipt is outside the confirmed payroll run scope.",
      );
    if (receipt.currency !== "VES")
      throw new PaymentOrderFailure(
        "INVALID",
        "Payroll receipt net pay must be denominated in VES.",
      );
    paymentOrderAmount(receipt.netPay);
  }
}

function validateScope(scope: PayrollPaymentOrderScope): void {
  validateText(scope.actorId, "Actor identifier");
  validateText(scope.tenantId, "Tenant identifier");
  validateText(scope.organizationId, "Organization identifier");
  validateText(scope.companyId, "Company identifier");
}

function validateResult(
  draft: PayrollPaymentOrderDraft,
  result: PayrollPaymentOrderDraftResult,
): void {
  if (
    (result.disposition !== "created" && result.disposition !== "replayed") ||
    !isValidText(result.order.id)
  )
    throw new PaymentOrderFailure(
      "UNAVAILABLE",
      "Payroll payment-order persistence returned a malformed draft.",
    );
  if (
    result.order.tenantId !== draft.scope.tenantId ||
    result.order.organizationId !== draft.scope.organizationId ||
    result.order.companyId !== draft.scope.companyId ||
    !sameDecimalAmount(result.order.amount, draft.amount) ||
    result.order.currency !== draft.currency ||
    result.order.beneficiary !== draft.beneficiary ||
    result.order.concept !== draft.concept ||
    result.order.dueDate !== draft.dueDate ||
    result.order.status !== "draft" ||
    !sameTraceability(result.traceability, draft.traceability)
  )
    throw new PaymentOrderFailure(
      "UNAVAILABLE",
      "Payroll payment-order persistence returned an inconsistent draft.",
    );
}

function sameTraceability(
  left: PayrollPaymentOrderTraceability,
  right: PayrollPaymentOrderTraceability,
): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.organizationId === right.organizationId &&
    left.companyId === right.companyId &&
    left.payrollRunId === right.payrollRunId &&
    left.payrollReceiptId === right.payrollReceiptId &&
    left.employeeId === right.employeeId &&
    samePayrollConfirmationInstant(left.payrollConfirmedAt, right.payrollConfirmedAt)
  );
}

function sameDecimalAmount(left: DecimalAmount, right: DecimalAmount): boolean {
  try {
    return normalizeDecimalAmount(left) === normalizeDecimalAmount(right);
  } catch {
    return false;
  }
}

function normalizeDecimalAmount(value: DecimalAmount): string {
  const validated = paymentOrderAmount(value);
  const integer = validated.split(".")[0] ?? "0";
  const fraction = validated.split(".")[1] ?? "";
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction.length === 0
    ? integer
    : `${integer}.${normalizedFraction}`;
}

function payrollReceiptIdempotencyKey(
  traceability: PayrollPaymentOrderTraceability,
): string {
  return `payroll-payment-order:v1:${[
    traceability.tenantId,
    traceability.organizationId,
    traceability.companyId,
    traceability.payrollRunId,
    traceability.payrollReceiptId,
  ]
    .map((value) => `${value.length}:${value}`)
    .join(":")}`;
}

function validateText(value: unknown, label: string, maximum = 128): asserts value is string {
  if (!isValidText(value, maximum))
    throw new PaymentOrderFailure("INVALID", `${label} is invalid.`);
}

function isValidText(value: unknown, maximum = 128): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum
  );
}

/**
 * Converts a strict, offset-bearing ISO payroll confirmation instant to a UTC microsecond key.
 * @param value - An RFC 3339 timestamp emitted by the payroll source or PostgreSQL timestamptz JSON.
 * @returns A canonical UTC instant preserving up to six fractional decimal places.
 * @throws {PaymentOrderFailure} When the timestamp has no explicit offset or is not a real calendar instant.
 */
export function canonicalPayrollConfirmationInstant(value: unknown): string {
  if (typeof value !== "string")
    throw new PaymentOrderFailure("INVALID", "Payroll confirmation timestamp is invalid.");
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match)
    throw new PaymentOrderFailure("INVALID", "Payroll confirmation timestamp is invalid.");
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText, zone, sign, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = zone === "Z" ? 0 : Number(offsetHourText);
  const offsetMinute = zone === "Z" ? 0 : Number(offsetMinuteText);
  if (
    month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)
    || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59
  )
    throw new PaymentOrderFailure("INVALID", "Payroll confirmation timestamp is invalid.");
  const localUtcMilliseconds = calendarUtcMilliseconds(year, month, day, hour, minute, second);
  const offsetMilliseconds = (offsetHour * 60 + offsetMinute) * 60_000;
  const utcMilliseconds = localUtcMilliseconds + (sign === "+" ? -offsetMilliseconds : offsetMilliseconds);
  const microseconds = (fractionText ?? "").padEnd(6, "0");
  return `${utcMilliseconds}:${microseconds}`;
}

/**
 * Compares strict payroll confirmation timestamps as instants, not as JSON serialization text.
 * @param left - First offset-bearing timestamp.
 * @param right - Second offset-bearing timestamp.
 * @returns Whether both values identify the same UTC instant through microsecond precision.
 */
export function samePayrollConfirmationInstant(left: unknown, right: unknown): boolean {
  try {
    return canonicalPayrollConfirmationInstant(left) === canonicalPayrollConfirmationInstant(right);
  } catch {
    return false;
  }
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function calendarUtcMilliseconds(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getTime();
}
