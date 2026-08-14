import type { CompanyId } from "@kontave/companies-domain";
import type { Money } from "@kontave/monetary-domain";
import type { ProductId } from "@kontave/products-domain";
import type { GoodsReceiptId, GoodsReceiptLineId, PurchaseOrderId, PurchaseOrderLineId, SupplierId } from "./identifiers.js";
import { PurchasingFailure } from "./purchasing-failure.js";
import type { PurchaseQuantity } from "./quantity.js";
import { purchaseInstant, type PurchaseDate, type PurchaseInstant } from "./temporal.js";

export type AcquisitionCostStatus = "recognized" | "provisional";
export interface ReceiptAcquisitionValue {
  readonly amount: Money;
  readonly status: AcquisitionCostStatus;
  readonly basis: string;
}
export interface GoodsReceiptLine {
  readonly id: GoodsReceiptLineId;
  readonly orderLineId: PurchaseOrderLineId | null;
  readonly productId: ProductId;
  readonly quantity: PurchaseQuantity;
  readonly inventoryLocationReference: string;
  readonly lotReference: string | null;
  readonly acquisitionValue: ReceiptAcquisitionValue;
}
export type GoodsReceiptStatus = "draft" | "confirmed" | "reversed";
export interface GoodsReceiptState {
  readonly id: GoodsReceiptId;
  readonly companyId: CompanyId;
  readonly supplierId: SupplierId;
  readonly orderId: PurchaseOrderId | null;
  readonly receiptDate: PurchaseDate;
  readonly lines: readonly GoodsReceiptLine[];
  readonly status: GoodsReceiptStatus;
  readonly confirmedAt: PurchaseInstant | null;
  readonly reversedAt: PurchaseInstant | null;
  readonly version: number;
}
export interface PurchaseReceiptConfirmed {
  readonly type: "purchasing.receipt_confirmed";
  readonly eventId: string;
  readonly operationKey: string;
  readonly receiptId: GoodsReceiptId;
  readonly companyId: CompanyId;
  readonly supplierId: SupplierId;
  readonly effectiveDate: PurchaseDate;
  readonly occurredAt: PurchaseInstant;
  readonly lines: readonly GoodsReceiptLine[];
}
export interface PurchaseReceiptReversed {
  readonly type: "purchasing.receipt_reversed";
  readonly eventId: string;
  readonly originalOperationKey: string;
  readonly receiptId: GoodsReceiptId;
  readonly companyId: CompanyId;
  readonly effectiveDate: PurchaseDate;
  readonly occurredAt: PurchaseInstant;
}

export class GoodsReceipt {
  readonly id: GoodsReceiptId;
  readonly companyId: CompanyId;
  readonly supplierId: SupplierId;
  readonly orderId: PurchaseOrderId | null;
  readonly receiptDate: PurchaseDate;
  readonly lines: readonly GoodsReceiptLine[];
  readonly status: GoodsReceiptStatus;
  readonly confirmedAt: PurchaseInstant | null;
  readonly reversedAt: PurchaseInstant | null;
  readonly version: number;

  constructor(state: GoodsReceiptState) {
    if (!Number.isSafeInteger(state.version) || state.version < 0 || state.lines.length === 0 || new Set(state.lines.map((line) => line.id)).size !== state.lines.length) {
      throw new PurchasingFailure("PURCHASE_RECEIPT_INVALID", "Goods receipt state is invalid.");
    }
    this.id = state.id;
    this.companyId = state.companyId;
    this.supplierId = state.supplierId;
    this.orderId = state.orderId;
    this.receiptDate = state.receiptDate;
    this.lines = Object.freeze(state.lines.map(validateLine));
    if ((state.status === "draft") !== (state.confirmedAt === null) || (state.status === "reversed") !== (state.reversedAt !== null)) {
      throw new PurchasingFailure("PURCHASE_RECEIPT_INVALID", "Goods receipt lifecycle is inconsistent.");
    }
    this.status = state.status;
    this.confirmedAt = state.confirmedAt;
    this.reversedAt = state.reversedAt;
    this.version = state.version;
  }

  confirm(value: string): { readonly receipt: GoodsReceipt; readonly event: PurchaseReceiptConfirmed } {
    if (this.status !== "draft") throw new PurchasingFailure("PURCHASE_RECEIPT_TRANSITION_INVALID", "Only a draft receipt can be confirmed.");
    const occurredAt = purchaseInstant(value);
    const version = this.version + 1;
    const operationKey = `purchase-receipt:${this.id}:v${version}`;
    const receipt = new GoodsReceipt({ ...this, status: "confirmed", confirmedAt: occurredAt, version });
    return { receipt, event: { type: "purchasing.receipt_confirmed", eventId: operationKey, operationKey, receiptId: this.id, companyId: this.companyId, supplierId: this.supplierId, effectiveDate: this.receiptDate, occurredAt, lines: this.lines } };
  }

  reverse(value: string): { readonly receipt: GoodsReceipt; readonly event: PurchaseReceiptReversed } {
    if (this.status !== "confirmed") throw new PurchasingFailure("PURCHASE_RECEIPT_TRANSITION_INVALID", "Only a confirmed receipt can be reversed.");
    const occurredAt = purchaseInstant(value);
    const originalOperationKey = `purchase-receipt:${this.id}:v${this.version}`;
    const version = this.version + 1;
    const receipt = new GoodsReceipt({ ...this, status: "reversed", reversedAt: occurredAt, version });
    return { receipt, event: { type: "purchasing.receipt_reversed", eventId: `purchase-receipt-reversal:${this.id}:v${version}`, originalOperationKey, receiptId: this.id, companyId: this.companyId, effectiveDate: this.receiptDate, occurredAt } };
  }
}

function validateLine(line: GoodsReceiptLine): GoodsReceiptLine {
  const inventoryLocationReference = line.inventoryLocationReference.trim();
  const basis = line.acquisitionValue.basis.trim();
  if (!inventoryLocationReference || inventoryLocationReference.length > 128 || !basis || basis.length > 500 || line.acquisitionValue.amount.minorAmount < 0n) {
    throw new PurchasingFailure("PURCHASE_RECEIPT_INVALID", "Goods receipt line is invalid.");
  }
  return { ...line, inventoryLocationReference, lotReference: line.lotReference?.trim() || null, acquisitionValue: { ...line.acquisitionValue, basis } };
}
