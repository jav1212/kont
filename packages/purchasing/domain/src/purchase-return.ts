import type { CompanyId } from "@kontave/companies-domain";
import type { Money } from "@kontave/monetary-domain";
import type { ProductId } from "@kontave/products-domain";
import type { GoodsReceiptId, GoodsReceiptLineId, PurchaseReturnId, PurchaseReturnLineId, SupplierId } from "./identifiers";
import { PurchasingFailure } from "./purchasing-failure";
import type { PurchaseQuantity } from "./quantity";
import { purchaseInstant, type PurchaseDate, type PurchaseInstant } from "./temporal";

export interface PurchaseReturnLine {
  readonly id: PurchaseReturnLineId;
  readonly receiptLineId: GoodsReceiptLineId;
  readonly productId: ProductId;
  readonly quantity: PurchaseQuantity;
  readonly inventoryLocationReference: string;
  readonly lotReference: string | null;
  readonly acquisitionValue: Money;
}
export interface PurchaseReturnState {
  readonly id: PurchaseReturnId;
  readonly companyId: CompanyId;
  readonly supplierId: SupplierId;
  readonly receiptId: GoodsReceiptId;
  readonly returnDate: PurchaseDate;
  readonly reason: string;
  readonly lines: readonly PurchaseReturnLine[];
  readonly status: "draft" | "confirmed";
  readonly confirmedAt: PurchaseInstant | null;
  readonly version: number;
}
export interface PurchaseReturnConfirmed {
  readonly type: "purchasing.return_confirmed";
  readonly eventId: string;
  readonly operationKey: string;
  readonly returnId: PurchaseReturnId;
  readonly companyId: CompanyId;
  readonly supplierId: SupplierId;
  readonly receiptId: GoodsReceiptId;
  readonly effectiveDate: PurchaseDate;
  readonly occurredAt: PurchaseInstant;
  readonly lines: readonly PurchaseReturnLine[];
}

export class PurchaseReturn {
  readonly id: PurchaseReturnId;
  readonly companyId: CompanyId;
  readonly supplierId: SupplierId;
  readonly receiptId: GoodsReceiptId;
  readonly returnDate: PurchaseDate;
  readonly reason: string;
  readonly lines: readonly PurchaseReturnLine[];
  readonly status: "draft" | "confirmed";
  readonly confirmedAt: PurchaseInstant | null;
  readonly version: number;

  constructor(state: PurchaseReturnState) {
    const reason = state.reason.trim();
    if (!reason || reason.length > 500 || !Number.isSafeInteger(state.version) || state.version < 0 || state.lines.length === 0 || new Set(state.lines.map((line) => line.id)).size !== state.lines.length) {
      throw new PurchasingFailure("PURCHASE_RETURN_INVALID", "Purchase return state is invalid.");
    }
    this.id = state.id;
    this.companyId = state.companyId;
    this.supplierId = state.supplierId;
    this.receiptId = state.receiptId;
    this.returnDate = state.returnDate;
    this.reason = reason;
    this.lines = Object.freeze(state.lines.map((line) => {
      const location = line.inventoryLocationReference.trim();
      if (!location || line.acquisitionValue.minorAmount < 0n) throw new PurchasingFailure("PURCHASE_RETURN_INVALID", "Purchase return line is invalid.");
      return { ...line, inventoryLocationReference: location, lotReference: line.lotReference?.trim() || null };
    }));
    if ((state.status === "draft") !== (state.confirmedAt === null)) throw new PurchasingFailure("PURCHASE_RETURN_INVALID", "Purchase return lifecycle is inconsistent.");
    this.status = state.status;
    this.confirmedAt = state.confirmedAt;
    this.version = state.version;
  }

  confirm(value: string): { readonly purchaseReturn: PurchaseReturn; readonly event: PurchaseReturnConfirmed } {
    if (this.status !== "draft") throw new PurchasingFailure("PURCHASE_RETURN_TRANSITION_INVALID", "Only a draft purchase return can be confirmed.");
    const occurredAt = purchaseInstant(value);
    const version = this.version + 1;
    const operationKey = `purchase-return:${this.id}:v${version}`;
    const purchaseReturn = new PurchaseReturn({ ...this, status: "confirmed", confirmedAt: occurredAt, version });
    return { purchaseReturn, event: { type: "purchasing.return_confirmed", eventId: operationKey, operationKey, returnId: this.id, companyId: this.companyId, supplierId: this.supplierId, receiptId: this.receiptId, effectiveDate: this.returnDate, occurredAt, lines: this.lines } };
  }
}
