import type { CompanyId } from "@kontave/companies-domain";
import { addMoney, moneyFromMinor, sameCurrency, subtractMoney, type CurrencyDefinition, type Money } from "@kontave/monetary-domain";
import type { ProductId } from "@kontave/products-domain";
import type { PurchaseOrderId, PurchaseOrderLineId, SupplierId } from "./identifiers";
import { PurchasingFailure } from "./purchasing-failure";
import type { PurchaseQuantity } from "./quantity";
import type { PurchaseDate } from "./temporal";

export type PurchaseOrderStatus = "draft" | "approved" | "closed" | "cancelled";
export type PurchaseLineKind = "stock" | "service" | "expense";
export interface PurchaseAdjustment { readonly kind: "discount" | "surcharge"; readonly reason: string | null; readonly amount: Money }
export interface PurchaseOrderLine {
  readonly id: PurchaseOrderLineId;
  readonly kind: PurchaseLineKind;
  readonly productId: ProductId | null;
  readonly description: string;
  readonly orderedQuantity: PurchaseQuantity;
  readonly unitPrice: Money;
  readonly grossAmount: Money;
  readonly adjustments: readonly PurchaseAdjustment[];
  readonly netAmount: Money;
}
export interface PurchaseOrderState {
  readonly id: PurchaseOrderId;
  readonly companyId: CompanyId;
  readonly supplierId: SupplierId;
  readonly orderDate: PurchaseDate;
  readonly transactionCurrency: CurrencyDefinition;
  readonly lines: readonly PurchaseOrderLine[];
  readonly status: PurchaseOrderStatus;
  readonly version: number;
}

export class PurchaseOrder {
  readonly id: PurchaseOrderId;
  readonly companyId: CompanyId;
  readonly supplierId: SupplierId;
  readonly orderDate: PurchaseDate;
  readonly transactionCurrency: CurrencyDefinition;
  readonly lines: readonly PurchaseOrderLine[];
  readonly status: PurchaseOrderStatus;
  readonly version: number;

  constructor(state: PurchaseOrderState) {
    if (!Number.isSafeInteger(state.version) || state.version < 0 || state.lines.length === 0) throw new PurchasingFailure("PURCHASE_ORDER_INVALID", "Purchase order state is invalid.");
    if (new Set(state.lines.map((line) => line.id)).size !== state.lines.length) throw new PurchasingFailure("PURCHASE_ORDER_INVALID", "Purchase order line identifiers must be unique.");
    this.id = state.id;
    this.companyId = state.companyId;
    this.supplierId = state.supplierId;
    this.orderDate = state.orderDate;
    this.transactionCurrency = state.transactionCurrency;
    this.lines = Object.freeze(state.lines.map((line) => validateLine(line, state.transactionCurrency)));
    this.status = state.status;
    this.version = state.version;
  }

  approve(): PurchaseOrder {
    if (this.status !== "draft") throw new PurchasingFailure("PURCHASE_ORDER_TRANSITION_INVALID", "Only a draft purchase order can be approved.");
    return new PurchaseOrder({ ...this, status: "approved", version: this.version + 1 });
  }
  close(): PurchaseOrder {
    if (this.status !== "approved") throw new PurchasingFailure("PURCHASE_ORDER_TRANSITION_INVALID", "Only an approved purchase order can be closed.");
    return new PurchaseOrder({ ...this, status: "closed", version: this.version + 1 });
  }
  cancel(): PurchaseOrder {
    if (this.status !== "draft" && this.status !== "approved") throw new PurchasingFailure("PURCHASE_ORDER_TRANSITION_INVALID", "Purchase order cannot be cancelled from its current state.");
    return new PurchaseOrder({ ...this, status: "cancelled", version: this.version + 1 });
  }
}

function validateLine(line: PurchaseOrderLine, currency: CurrencyDefinition): PurchaseOrderLine {
  if ((line.kind === "stock") !== (line.productId !== null)) throw new PurchasingFailure("PURCHASE_ORDER_INVALID", "Only stock purchase lines require a product.");
  const description = line.description.trim();
  if (!description || description.length > 500 || line.unitPrice.minorAmount < 0n || line.grossAmount.minorAmount < 0n || line.netAmount.minorAmount < 0n) {
    throw new PurchasingFailure("PURCHASE_ORDER_INVALID", "Purchase order line is invalid.");
  }
  requireCurrency(line.unitPrice, currency);
  requireCurrency(line.grossAmount, currency);
  requireCurrency(line.netAmount, currency);
  const adjustments = line.adjustments.map((adjustment) => {
    requireCurrency(adjustment.amount, currency);
    if (adjustment.amount.minorAmount <= 0n) throw new PurchasingFailure("PURCHASE_ORDER_INVALID", "Purchase adjustment must be positive.");
    return { ...adjustment, reason: adjustment.reason?.trim() || null };
  });
  const discounts = sum(adjustments.filter((item) => item.kind === "discount").map((item) => item.amount), currency);
  const surcharges = sum(adjustments.filter((item) => item.kind === "surcharge").map((item) => item.amount), currency);
  if (subtractMoney(addMoney(line.grossAmount, surcharges), discounts).minorAmount !== line.netAmount.minorAmount) {
    throw new PurchasingFailure("PURCHASE_ORDER_INVALID", "Purchase line amounts do not reconcile.");
  }
  return { ...line, description, adjustments: Object.freeze(adjustments) };
}

function sum(values: readonly Money[], currency: CurrencyDefinition): Money {
  return values.reduce((total, value) => addMoney(total, value), moneyFromMinor(0n, currency));
}
function requireCurrency(value: Money, currency: CurrencyDefinition): void {
  if (!sameCurrency(value.currency, currency)) throw new PurchasingFailure("PURCHASE_CURRENCY_MISMATCH", "Purchase amount differs from the transaction currency.");
}
