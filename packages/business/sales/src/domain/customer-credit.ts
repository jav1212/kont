import {
  moneyFromMinor,
  sameCurrency,
  type Money,
} from "@kontave/monetary/domain";
import { SalesFailure } from "./sales-failure";

/** Authoritative credit exposure expressed in one agreed currency. */
export interface CustomerCreditExposure {
  readonly creditLimit: Money;
  readonly outstandingDebt: Money;
  readonly additionalCredit: Money;
}

/** Commercial facts used by authorization to require an explicit overdraft exception. */
export interface CustomerCreditAssessment {
  readonly alreadyOverdrawn: boolean;
  readonly wouldExceedLimit: boolean;
  readonly requiresOverride: boolean;
  readonly projectedDebt: Money;
}

/**
 * Assesses existing and projected customer overdraft without floating-point arithmetic.
 * A zero limit forbids new credit; equality with the limit is permitted. Amounts
 * must already be converted by the owning monetary policy, never implicitly here.
 * @param exposure - Persisted limit and debt, plus the proposed credit amount.
 * @returns Immutable facts for the actor's commercial authorization decision.
 * @throws {SalesFailure} When amounts are negative or use different currencies.
 */
export function assessCustomerCredit(
  exposure: CustomerCreditExposure,
): CustomerCreditAssessment {
  const { creditLimit, outstandingDebt, additionalCredit } = exposure;
  if (
    [creditLimit, outstandingDebt, additionalCredit].some(
      (amount) => amount.minorAmount < 0n,
    )
  ) {
    throw new SalesFailure(
      "SALES_CREDIT_INVALID",
      "Credit exposure amounts must be non-negative.",
    );
  }
  if (
    !sameCurrency(creditLimit.currency, outstandingDebt.currency) ||
    !sameCurrency(creditLimit.currency, additionalCredit.currency)
  ) {
    throw new SalesFailure(
      "SALES_CURRENCY_MISMATCH",
      "Credit exposure must use one agreed currency.",
    );
  }
  const projectedDebt = Object.freeze(
    moneyFromMinor(
      outstandingDebt.minorAmount + additionalCredit.minorAmount,
      Object.freeze({ ...creditLimit.currency }),
    ),
  );
  const alreadyOverdrawn =
    outstandingDebt.minorAmount > creditLimit.minorAmount;
  const wouldExceedLimit = projectedDebt.minorAmount > creditLimit.minorAmount;
  return Object.freeze({
    alreadyOverdrawn,
    wouldExceedLimit,
    requiresOverride: alreadyOverdrawn || wouldExceedLimit,
    projectedDebt,
  });
}
