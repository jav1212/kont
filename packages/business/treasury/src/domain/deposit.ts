import { addDecimal, compareDecimal, exactDecimal } from "@kontave/monetary/domain";
import { TreasuryFailure } from "./failure";
import { treasuryMoney, type TreasuryMoney } from "./model";

/** One reserved Sales collection referenced by a Treasury deposit. */
export interface DepositCollectionAllocation { readonly collectionId: string; readonly money: TreasuryMoney; }
/** Validates allocations exactly match the deposit and do not duplicate a source collection. @param deposit - Native-currency deposit money. @param allocations - Referenced collection amounts. @returns Validated immutable allocations. @throws {TreasuryFailure} When currencies, totals, or source identities conflict. */
export function validateDepositAllocations(deposit: TreasuryMoney, allocations: readonly DepositCollectionAllocation[]): readonly DepositCollectionAllocation[] {
  treasuryMoney(deposit); const identifiers = new Set<string>(); let sum = exactDecimal("0");
  for (const allocation of allocations) { treasuryMoney(allocation.money); if (!allocation.collectionId.trim() || identifiers.has(allocation.collectionId)) throw new TreasuryFailure("SOURCE_ALREADY_APPLIED", "A collection may appear in a deposit only once."); identifiers.add(allocation.collectionId); if (allocation.money.currency !== deposit.currency) throw new TreasuryFailure("INVALID", "Deposit collections must share deposit currency."); sum = addDecimal(sum, allocation.money.amount); }
  if (compareDecimal(sum, deposit.amount) !== 0) throw new TreasuryFailure("INVALID", "Deposit collections must exactly equal deposit amount.");
  return allocations;
}
