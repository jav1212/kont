import { TreasuryFailure } from "./failure";
import { requireText } from "./model";

/** Lifecycle of a check after its single emission ledger effect. */
export type CheckStatus = "issued" | "delivered" | "delivery_undone" | "cleared" | "voided";
/** Immutable delivery fact retained for a check. */
export interface CheckDelivery { readonly id: string; readonly recipientName: string; readonly deliveredAt: string; readonly undoneAt?: string; readonly undoReason?: string; }
/** Check state needed to validate delivery and reversal transitions. */
export interface TreasuryCheck { readonly id: string; readonly status: CheckStatus; readonly version: number; readonly deliveries: readonly CheckDelivery[]; }
/** Records delivery without emitting another monetary effect. @param check - Current check state. @param delivery - Delivery evidence. @returns Updated state. @throws {TreasuryFailure} When state or evidence is invalid. */
export function deliverCheck(check: TreasuryCheck, delivery: CheckDelivery): TreasuryCheck {
  validateCheck(check); requireText(delivery.id, "Delivery identifier"); requireText(delivery.recipientName, "Delivery recipient"); requireText(delivery.deliveredAt, "Delivery timestamp");
  if (check.status !== "issued" && check.status !== "delivery_undone") throw new TreasuryFailure("CONFLICT", "Only an issued check may be delivered.");
  if (check.deliveries.some(item => item.id === delivery.id)) throw new TreasuryFailure("CONFLICT", "Check delivery already exists.");
  return { ...check, status: "delivered", version: check.version + 1, deliveries: [...check.deliveries, delivery] };
}
/** Compensates the latest delivery while preserving delivery history. @param check - Current check state. @param deliveryId - Delivered event to undo. @param undoneAt - Audit timestamp. @param reason - Required business reason. @returns Updated state. @throws {TreasuryFailure} When clearing or state makes undo incompatible. */
export function undoCheckDelivery(check: TreasuryCheck, deliveryId: string, undoneAt: string, reason: string): TreasuryCheck {
  validateCheck(check); requireText(deliveryId, "Delivery identifier"); requireText(undoneAt, "Undo timestamp"); requireText(reason, "Undo reason");
  if (check.status !== "delivered") throw new TreasuryFailure("CONFLICT", "Only a delivered check may have delivery undone.");
  const delivery = check.deliveries.find(item => item.id === deliveryId);
  if (!delivery || delivery.undoneAt !== undefined) throw new TreasuryFailure("NOT_FOUND", "Active check delivery was not found.");
  return { ...check, status: "delivery_undone", version: check.version + 1, deliveries: check.deliveries.map(item => item.id === deliveryId ? { ...item, undoneAt, undoReason: reason } : item) };
}
function validateCheck(check: TreasuryCheck): void { requireText(check.id, "Check identifier"); if (!Number.isSafeInteger(check.version) || check.version < 1) throw new TreasuryFailure("INVALID", "Check version is invalid."); }
