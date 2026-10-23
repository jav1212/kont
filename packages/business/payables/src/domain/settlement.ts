import { addDecimal, allocateMoney, allocationPart, compareDecimal, currency, divideDecimal, exactDecimal, moneyFromDecimal, moneyToDecimal, multiplyDecimal, quantizeDecimal, subtractDecimal, type ExactDecimal } from "@kontave/monetary/domain";
import { PayablesFailure } from "./failure";

/** Currency conversion result for applying one supplier payment to one anchored debt. */
export interface PayableSettlement {
  readonly appliedDebtAmount: ExactDecimal;
  readonly consumedPaymentAmount: ExactDecimal;
  readonly exchangeDifferenceVes: ExactDecimal;
}

/** Rates and currencies needed to settle one payment line against one debt. */
export interface PayableSettlementInput {
  readonly paymentAmount: ExactDecimal;
  readonly paymentCurrency: string;
  /** VES per payment-currency unit on the payment date. */
  readonly paymentRate: ExactDecimal;
  readonly debtCurrency: string;
  /** VES per debt-currency unit on the payment date. */
  readonly debtCurrentRate: ExactDecimal;
  /** Immutable VES per debt-currency unit captured when the debt was recorded. */
  readonly debtSnapshotRate: ExactDecimal;
  readonly roundingScale?: number;
}

/** Applies a payment to a debt anchored in its own currency (decision 4).
 * The payment converts at the payment-date rates of both currencies; the debt
 * snapshot only measures the realized VES difference, positive for a loss.
 * Mirrors `shared_payables_post_payment` so previews and persistence agree.
 * @param input - Payment amount, currencies and the three rates involved.
 * @returns The applied debt amount, consumed payment amount and signed VES difference.
 * @throws {PayablesFailure} When amounts or rates are not positive, precision is invalid or the applied amount rounds to zero.
 */
export function settlePayableCurrency(input: PayableSettlementInput): PayableSettlement {
  const scale = input.roundingScale ?? 2;
  const zero = exactDecimal("0");
  if (compareDecimal(input.paymentAmount, zero) <= 0 || compareDecimal(input.paymentRate, zero) <= 0 || compareDecimal(input.debtCurrentRate, zero) <= 0
    || compareDecimal(input.debtSnapshotRate, zero) <= 0 || !Number.isSafeInteger(scale) || scale < 0 || scale > 8) {
    throw new PayablesFailure("INVALID", "Payment amount, rates and currency precision must be valid positive values.");
  }
  const appliedDebtAmount = input.paymentCurrency === input.debtCurrency
    ? input.paymentAmount
    : quantizeDecimal(divideDecimal(multiplyDecimal(input.paymentAmount, input.paymentRate), input.debtCurrentRate), { scale, mode: "half_up" });
  if (compareDecimal(appliedDebtAmount, zero) <= 0) throw new PayablesFailure("INVALID", "The payment rounds to zero in the debt currency.");
  const difference = multiplyDecimal(appliedDebtAmount, subtractDecimal(input.debtCurrentRate, input.debtSnapshotRate));
  return { appliedDebtAmount, consumedPaymentAmount: input.paymentAmount, exchangeDifferenceVes: quantizeDecimal(difference, { scale: 2, mode: "half_up" }) };
}

/** Verifies an exact installment schedule against a transferable balance.
 * @param balance - Open balance in the document's native currency.
 * @param installments - Proposed installment amounts in the same currency.
 * @returns The validated immutable amounts.
 * @throws {PayablesFailure} When the list is empty, has invalid values or does not equal the balance.
 */
export function validateInstallmentAmounts(balance: ExactDecimal, installments: readonly ExactDecimal[]): readonly ExactDecimal[] {
  if (installments.length < 2 || compareDecimal(balance, exactDecimal("0")) <= 0) throw new PayablesFailure("INVALID", "An installment plan needs at least two positive installments.");
  let total = exactDecimal("0");
  for (const amount of installments) {
    if (compareDecimal(amount, exactDecimal("0")) <= 0) throw new PayablesFailure("INVALID", "Installment amounts must be positive.");
    total = addDecimal(total, amount);
  }
  if (compareDecimal(subtractDecimal(total, balance), exactDecimal("0")) !== 0) throw new PayablesFailure("EXCEEDS_BALANCE", "Installments must exactly equal the transferable balance.");
  return [...installments];
}

/** Splits a transferable balance into equal installments without losing minor units.
 * @param balance - Open balance in the document's native currency.
 * @param count - Number of installments, between 2 and 60.
 * @param minorUnit - Fractional digits of the document currency.
 * @returns Installment amounts whose sum equals the balance; the rounding remainder goes to the last one.
 * @throws {PayablesFailure} When the count is out of range or the balance cannot be represented in the currency.
 */
export function splitInstallmentAmounts(balance: ExactDecimal, count: number, minorUnit = 2): readonly ExactDecimal[] {
  if (!Number.isSafeInteger(count) || count < 2 || count > 60) throw new PayablesFailure("INVALID", "An installment plan needs between 2 and 60 installments.");
  try {
    const total = moneyFromDecimal(quantizeDecimal(balance, { scale: minorUnit, mode: "half_up" }), currency("XXX", minorUnit));
    if (total.minorAmount < BigInt(count)) throw new PayablesFailure("INVALID", "The balance is too small to split into the requested installments.");
    const parts = Array.from({ length: count }, (_, index) => allocationPart(index, "1"));
    return allocateMoney({ total, parts, strategy: "last_part_carry" }).map((part) => moneyToDecimal(part.amount));
  } catch (cause: unknown) {
    if (cause instanceof PayablesFailure) throw cause;
    throw new PayablesFailure("INVALID", "The balance cannot be split in this currency.", { cause });
  }
}
