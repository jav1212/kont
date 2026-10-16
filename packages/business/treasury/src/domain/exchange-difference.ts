import { compareDecimal, exactDecimal, subtractDecimal, type ExactDecimal } from "@kontave/monetary/domain";
import { TreasuryFailure } from "./failure";
import { type TreasuryMoney } from "./model";

/** Classification determines whether a difference is a period revaluation or settlement fact. */
export type ExchangeDifferenceKind = "unrealized" | "realized";
/** Exact operational-currency adjustment calculated from two snapshots. */
export interface ExchangeDifference { readonly kind: ExchangeDifferenceKind; readonly amount: ExactDecimal; readonly direction: "gain" | "loss" | "none"; }
/** Calculates a separate realized or unrealized VES adjustment without mutating the original entry. @param kind - Revaluation or settlement classification. @param prior - Historical native-money snapshot. @param current - Current native-money snapshot for the same currency and amount. @returns Exact VES adjustment. @throws {TreasuryFailure} When snapshots do not represent the same exposure. */
export function calculateExchangeDifference(kind: ExchangeDifferenceKind, prior: TreasuryMoney, current: TreasuryMoney): ExchangeDifference {
  if (prior.currency !== current.currency || compareDecimal(prior.amount, current.amount) !== 0) throw new TreasuryFailure("INVALID", "Exchange difference requires the same native exposure.");
  const delta = subtractDecimal(current.operationalValue.amount, prior.operationalValue.amount); const comparison = compareDecimal(delta, exactDecimal("0"));
  return { kind, amount: delta, direction: comparison === 0 ? "none" : comparison > 0 ? "gain" : "loss" };
}
