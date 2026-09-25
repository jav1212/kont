import {
  type CustomerReceivableId,
  type RecordReceivablePayment as RecordReceivablePaymentCommand,
  type RecordReceivablePaymentResult,
} from "../domain/customer-receivable";
import { SalesFailure } from "../domain/sales-failure";

/** Command accepted by the atomically serialized receivable-payment port. */
export interface RecordReceivablePaymentRequest {
  readonly receivableId: CustomerReceivableId;
  readonly payment: RecordReceivablePaymentCommand;
}

/**
 * Persistence boundary for payment recording.
 * Implementations lock or serialize the receivable, apply the domain aggregate,
 * and persist the payment and resulting aggregate version in one transaction.
 */
export interface ReceivablePaymentRecorder {
  /**
   * Records a payment exactly once for its idempotency key.
   * @param request - Receivable identity and immutable payment command.
   * @returns The persisted aggregate result and whether it was a replay.
   * @throws {SalesFailure} When the receivable is absent, a key conflicts, or persistence cannot commit atomically.
   */
  recordAtomically(request: RecordReceivablePaymentRequest): Promise<RecordReceivablePaymentResult>;
}

/** Applies one customer-receivable payment through the serialized persistence boundary. */
export class RecordCustomerReceivablePayment {
  /**
   * Creates the payment-recording use case.
   * @param recorder - Port that serializes and commits payment recording.
   */
  constructor(private readonly recorder: ReceivablePaymentRecorder) {}

  /**
   * Records a payment or returns the result of its prior idempotent execution.
   * @param request - Receivable identity and payment command.
   * @returns The committed payment result.
   * @throws {SalesFailure} When business validation fails or the atomic persistence boundary is unavailable.
   */
  async execute(request: RecordReceivablePaymentRequest): Promise<RecordReceivablePaymentResult> {
    try {
      return await this.recorder.recordAtomically(request);
    } catch (cause) {
      if (cause instanceof SalesFailure) throw cause;
      throw new SalesFailure("SALES_REPOSITORY_UNAVAILABLE", "Customer receivable payment recording is unavailable.", { cause });
    }
  }
}
