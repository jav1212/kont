/** Exact, serialized monetary amount. JavaScript numbers are deliberately excluded. */
export type DecimalAmount = string;

/** A persisted administrative instruction. It records intent and never executes a bank transfer. */
export interface PaymentOrder {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly beneficiary: string;
  readonly concept: string;
  readonly amount: DecimalAmount;
  readonly currency: string;
  readonly dueDate: string | null;
  readonly status: "draft" | "cancelled";
  readonly version: number;
}

/** Stable expected failure emitted by payment-order domain and application code. */
export class PaymentOrderFailure extends Error {
  /**
   * Creates a stable failure for a payment-order boundary.
   * @param code - Stable classification suitable for a transport boundary.
   * @param message - Safe explanation for an application caller.
   * @returns A typed payment-order failure.
   */
  public constructor(
    public readonly code:
      "INVALID" | "NOT_FOUND" | "CONFLICT" | "FORBIDDEN" | "UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "PaymentOrderFailure";
  }
}

/** Validates and returns an exact positive amount supported by the operational schema. @param value - Candidate serialized amount. @returns Validated decimal text. @throws {PaymentOrderFailure} When the value is not a positive 20.8 decimal. */
export function paymentOrderAmount(value: unknown): DecimalAmount {
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9]\d{0,19})(?:\.\d{1,8})?$/.test(value) ||
    !/[1-9]/.test(value)
  )
    throw new PaymentOrderFailure(
      "INVALID",
      "Amount must be a positive decimal with at most 20 integer and 8 fractional digits.",
    );
  return value;
}

/** Validates an ISO calendar date without accepting JavaScript date rollover. @param value - Candidate date or null. @returns Canonical date text or null. @throws {PaymentOrderFailure} When the date does not exist. */
export function paymentOrderDate(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new PaymentOrderFailure(
      "INVALID",
      "Due date must be an ISO calendar date or null.",
    );
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new PaymentOrderFailure(
      "INVALID",
      "Due date must be an actual calendar date.",
    );
  return value;
}
