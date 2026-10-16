import type { GetPaymentOrder, PaymentOrderRepository } from "./index";
import { PaymentOrderFailure, type PaymentOrder } from "../domain";

/** Immutable execution evidence owned by treasury, separate from administrative order state. */
export interface PaymentOrderExecutionEvidence {
  readonly paymentId: string;
  readonly paymentOrderId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly amount: string;
  readonly currency: string;
  readonly occurredOn: string;
  readonly ledgerEntryId: string;
}

/** Read boundary implemented by treasury's authorized execution query. */
export interface PaymentOrderExecutionReader {
  /**
   * Reads the single full settlement of an order in its authorized scope.
   * @param input - Actor, organization, company and order identity.
   * @returns Immutable execution evidence, or null when the order is unpaid.
   * @throws {PaymentOrderFailure} When access is denied or evidence cannot be read.
   */
  getExecution(input: GetPaymentOrder): Promise<PaymentOrderExecutionEvidence | null>;
}

/** Combined administrative and financial view; administrative cancellation never means payment. */
export interface PaymentOrderSettlement {
  readonly order: PaymentOrder;
  readonly execution: PaymentOrderExecutionEvidence | null;
  readonly settlementStatus: "unpaid" | "paid" | "cancelled";
  readonly remainingAmount: string;
}

/** Queries an order with treasury settlement evidence without creating a second payment writer. */
export class GetPaymentOrderSettlement {
  /**
   * Creates a read-only composition over the two owning contexts.
   * @param orders - Authorized administrative order repository.
   * @param executions - Authorized treasury execution reader.
   * @returns A query retaining compatibility with draft/cancelled order contracts.
   */
  public constructor(
    private readonly orders: Pick<PaymentOrderRepository, "get">,
    private readonly executions: PaymentOrderExecutionReader,
  ) {}

  /**
   * Reads current settlement, checking immutable identity and amount consistency.
   * Reads need not share a snapshot: an executed order is protected against edits by persistence.
   * @param input - Verified actor and scoped order identity.
   * @returns The order, optional execution, and exact unpaid amount.
   * @throws {PaymentOrderFailure} When authorization fails, evidence conflicts, or persistence is unavailable.
   */
  public async execute(input: GetPaymentOrder): Promise<PaymentOrderSettlement> {
    try {
      const order = await this.orders.get(input);
      const execution = await this.executions.getExecution(input);
      if (execution !== null && (
        execution.paymentOrderId !== order.id ||
        execution.organizationId !== order.organizationId ||
        execution.companyId !== order.companyId ||
        execution.currency !== order.currency ||
        canonicalAmount(execution.amount) !== canonicalAmount(order.amount) ||
        order.status === "cancelled"
      )) {
        throw new PaymentOrderFailure("CONFLICT", "Treasury execution does not match this payment order.");
      }
      return {
        order,
        execution,
        settlementStatus: execution ? "paid" : order.status === "cancelled" ? "cancelled" : "unpaid",
        remainingAmount: execution || order.status === "cancelled" ? "0" : order.amount,
      };
    } catch (cause: unknown) {
      if (cause instanceof PaymentOrderFailure) throw cause;
      throw new PaymentOrderFailure("UNAVAILABLE", "Payment-order settlement is unavailable.");
    }
  }
}

// String normalization compares exact decimals without introducing a second arithmetic engine.
function canonicalAmount(value: string): string {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new PaymentOrderFailure("CONFLICT", "Execution amount is not a serialized decimal.");
  }
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}
