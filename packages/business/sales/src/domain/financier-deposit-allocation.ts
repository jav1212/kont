import {
  compareDecimal,
  divideDecimal,
  exactDecimal,
  multiplyDecimal,
  quantizeDecimal,
  subtractDecimal,
  type ExactDecimal,
} from "@kontave/monetary/domain";
import {
  settleFinancedSale,
  type FinancedSaleCollection,
  type FinancedSaleSettlement,
  type FinancedSaleTerms,
} from "./financed-sale-exchange-difference";
import { SalesFailure } from "./sales-failure";
import { salesDate, type SalesDate } from "./temporal";

/*
 * A financier deposit is not tied to a specific sale: it settles USD at the
 * official rate of its date, and those USD are applied first-in first-out to
 * the oldest financed balances already sold on or before the deposit date.
 */

const ZERO = exactDecimal("0");
const HUNDRED = exactDecimal("100");
/** Remaining USD below half a cent are rounding, not an unapplied deposit. */
const USD_TOLERANCE = exactDecimal("0.005");

/** One bank deposit from the financier. */
export interface FinancierDeposit {
  readonly reference: string;
  readonly depositDate: SalesDate;
  /** Net VES received in the bank. */
  readonly amountVes: ExactDecimal;
  /** Official VES per USD on the deposit date. */
  readonly vesPerUsd: ExactDecimal;
  /** Fee the financier withholds, as a percentage of the gross amount settled. */
  readonly commissionPercent: ExactDecimal;
}

/** Portion of a deposit that found no outstanding balance to settle. */
export interface UnappliedFinancierDeposit {
  readonly deposit: FinancierDeposit;
  readonly unappliedUsd: ExactDecimal;
  readonly unappliedVes: ExactDecimal;
}

/** Settlement of one sale with the deposit references that paid it. */
export interface AllocatedFinancedSale {
  readonly settlement: FinancedSaleSettlement;
  readonly depositReferences: readonly string[];
}

/** Result of applying every deposit to the financed sales. */
export interface FinancierDepositAllocation {
  /** One entry per sale, in the order received. */
  readonly sales: readonly AllocatedFinancedSale[];
  readonly unapplied: readonly UnappliedFinancierDeposit[];
}

/**
 * Applies financier deposits to financed sales first-in first-out. Each deposit
 * is grossed up by its commission, converted to USD at its own rate and spread
 * over the oldest outstanding balances sold on or before its date. Shares are
 * rounded to the bolivar cent and the last share of a deposit takes the
 * remainder, so the shares always add up to the deposit.
 * @param sales - Financed sale terms in any order; references must be unique.
 * @param deposits - Financier deposits in any order; references must be unique.
 * @returns Each sale settled by its deposit shares plus the unapplied remainders.
 * @throws {SalesFailure} `SALES_FINANCED_SALE_INVALID` for invalid terms or duplicate
 * references, or `SALES_FINANCED_COLLECTION_INVALID` for an invalid deposit.
 */
export function allocateFinancierDeposits(
  sales: readonly FinancedSaleTerms[],
  deposits: readonly FinancierDeposit[],
): FinancierDepositAllocation {
  assertUnique(sales.map((sale) => sale.reference), "SALES_FINANCED_SALE_INVALID", "Financed sale references must be unique.");
  assertUnique(deposits.map((deposit) => deposit.reference), "SALES_FINANCED_COLLECTION_INVALID", "Deposit references must be unique.");

  const order = [...sales.keys()].sort((left, right) =>
    sales[left]!.saleDate.localeCompare(sales[right]!.saleDate) || sales[left]!.reference.localeCompare(sales[right]!.reference));
  const outstanding = sales.map((sale) => settleFinancedSale(sale).financedUsd);
  const collections = sales.map((): FinancedSaleCollection[] => []);
  const paidBy = sales.map((): string[] => []);
  const unapplied: UnappliedFinancierDeposit[] = [];

  const sortedDeposits = [...deposits].sort((left, right) => left.depositDate.localeCompare(right.depositDate) || left.reference.localeCompare(right.reference));
  for (const deposit of sortedDeposits) {
    const valid = validateDeposit(deposit);
    const grossVes = vesCents(divideDecimal(valid.amountVes, subtractDecimal(exactDecimal("1"), divideDecimal(valid.commissionPercent, HUNDRED))));
    const commissionVes = subtractDecimal(grossVes, valid.amountVes);
    const depositUsd = quantizeDecimal(divideDecimal(grossVes, valid.vesPerUsd), { scale: 8, mode: "half_up" });

    // Plan the USD each eligible sale takes before converting, so the last share can absorb rounding.
    let remainingUsd = depositUsd;
    const takes: Array<{ index: number; usd: ExactDecimal }> = [];
    for (const index of order) {
      if (compareDecimal(remainingUsd, USD_TOLERANCE) <= 0) break;
      if (sales[index]!.saleDate > valid.depositDate || compareDecimal(outstanding[index]!, ZERO) <= 0) continue;
      const usd = compareDecimal(outstanding[index]!, remainingUsd) <= 0 ? outstanding[index]! : remainingUsd;
      takes.push({ index, usd });
      outstanding[index] = subtractDecimal(outstanding[index]!, usd);
      remainingUsd = subtractDecimal(remainingUsd, usd);
    }
    const fullyApplied = compareDecimal(remainingUsd, USD_TOLERANCE) <= 0;

    let remainingGross = grossVes;
    let remainingCommission = commissionVes;
    takes.forEach(({ index, usd }, position) => {
      const last = fullyApplied && position === takes.length - 1;
      const share = last ? remainingGross : vesCents(multiplyDecimal(usd, valid.vesPerUsd));
      const commission = last ? remainingCommission : vesCents(divideDecimal(multiplyDecimal(commissionVes, usd), depositUsd));
      remainingGross = subtractDecimal(remainingGross, share);
      remainingCommission = subtractDecimal(remainingCommission, commission);
      if (compareDecimal(share, ZERO) <= 0) return;
      collections[index]!.push({ collectedOn: valid.depositDate, receivedVes: share, vesPerUsd: valid.vesPerUsd, commissionVes: commission });
      paidBy[index]!.push(valid.reference);
    });
    if (!fullyApplied) {
      unapplied.push(Object.freeze({ deposit: valid, unappliedUsd: remainingUsd, unappliedVes: remainingGross }));
    }
  }

  return Object.freeze({
    sales: Object.freeze(sales.map((sale, index) => Object.freeze({
      settlement: settleFinancedSale(sale, collections[index]!),
      depositReferences: Object.freeze([...new Set(paidBy[index]!)]),
    }))),
    unapplied: Object.freeze(unapplied),
  });
}

function validateDeposit(deposit: FinancierDeposit): FinancierDeposit {
  const reference = deposit.reference.trim();
  if (!reference || reference.length > 128) throw invalid("Deposit reference is invalid.");
  const amountVes = exactDecimal(deposit.amountVes);
  const vesPerUsd = exactDecimal(deposit.vesPerUsd);
  const commissionPercent = exactDecimal(deposit.commissionPercent);
  if (compareDecimal(amountVes, ZERO) <= 0) throw invalid("Deposit amount must be positive.");
  if (compareDecimal(vesPerUsd, ZERO) <= 0) throw invalid("Deposit rate must be positive.");
  if (compareDecimal(commissionPercent, ZERO) < 0 || compareDecimal(commissionPercent, HUNDRED) >= 0) {
    throw invalid("Commission percentage must be at least 0 and below 100.");
  }
  return Object.freeze({ reference, depositDate: salesDate(deposit.depositDate), amountVes: vesCents(amountVes), vesPerUsd, commissionPercent });
}

function vesCents(value: ExactDecimal): ExactDecimal {
  return quantizeDecimal(value, { scale: 2, mode: "half_up" });
}

function assertUnique(references: readonly string[], code: "SALES_FINANCED_SALE_INVALID" | "SALES_FINANCED_COLLECTION_INVALID", message: string): void {
  if (new Set(references.map((reference) => reference.trim())).size !== references.length) throw new SalesFailure(code, message);
}

function invalid(message: string): SalesFailure {
  return new SalesFailure("SALES_FINANCED_COLLECTION_INVALID", message);
}
