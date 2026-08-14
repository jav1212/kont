import type { CompanyId } from "@kontave/companies-domain";
import { addMoney, moneyFromMinor, sameCurrency, subtractMoney, type CurrencyDefinition, type Money } from "@kontave/monetary-domain";
import type { ProductId } from "@kontave/products-domain";
import type { CustomerId, SalesOrderId, SalesOrderLineId } from "./identifiers.js";
import type { SalesQuantity } from "./quantity.js";
import { SalesFailure } from "./sales-failure.js";
import type { SalesDate } from "./temporal.js";

export type SalesOrderStatus = "draft" | "approved" | "closed" | "cancelled";
export type SalesLineKind = "stock" | "service";
export type PaymentTerms =
  | { readonly kind: "immediate" }
  | { readonly kind: "credit"; readonly dueDate: SalesDate; readonly description: string | null };
export interface SalesAdjustment { readonly kind: "discount" | "surcharge"; readonly reason: string | null; readonly amount: Money }
export interface SalesOrderLine {
  readonly id: SalesOrderLineId;
  readonly kind: SalesLineKind;
  readonly productId: ProductId | null;
  readonly description: string;
  readonly orderedQuantity: SalesQuantity;
  readonly unitPrice: Money;
  readonly grossAmount: Money;
  readonly adjustments: readonly SalesAdjustment[];
  readonly netAmount: Money;
}
export interface SalesOrderState {
  readonly id: SalesOrderId;
  readonly companyId: CompanyId;
  readonly customerId: CustomerId;
  readonly orderDate: SalesDate;
  readonly transactionCurrency: CurrencyDefinition;
  readonly paymentTerms: PaymentTerms;
  readonly lines: readonly SalesOrderLine[];
  readonly status: SalesOrderStatus;
  readonly version: number;
}

export class SalesOrder {
  readonly id: SalesOrderId;
  readonly companyId: CompanyId;
  readonly customerId: CustomerId;
  readonly orderDate: SalesDate;
  readonly transactionCurrency: CurrencyDefinition;
  readonly paymentTerms: PaymentTerms;
  readonly lines: readonly SalesOrderLine[];
  readonly status: SalesOrderStatus;
  readonly version: number;

  constructor(state: SalesOrderState) {
    if (!Number.isSafeInteger(state.version) || state.version < 0 || state.lines.length === 0 || new Set(state.lines.map((line) => line.id)).size !== state.lines.length) {
      throw new SalesFailure("SALES_ORDER_INVALID", "Sales order state is invalid.");
    }
    this.id = state.id;
    this.companyId = state.companyId;
    this.customerId = state.customerId;
    this.orderDate = state.orderDate;
    this.transactionCurrency = state.transactionCurrency;
    this.paymentTerms = validatePaymentTerms(state.paymentTerms);
    this.lines = Object.freeze(state.lines.map((line) => validateLine(line, state.transactionCurrency)));
    this.status = state.status;
    this.version = state.version;
  }

  approve(): SalesOrder {
    if (this.status !== "draft") throw new SalesFailure("SALES_ORDER_TRANSITION_INVALID", "Only a draft sales order can be approved.");
    return new SalesOrder({ ...this, status: "approved", version: this.version + 1 });
  }
  close(): SalesOrder {
    if (this.status !== "approved") throw new SalesFailure("SALES_ORDER_TRANSITION_INVALID", "Only an approved sales order can be closed.");
    return new SalesOrder({ ...this, status: "closed", version: this.version + 1 });
  }
  cancel(): SalesOrder {
    if (this.status !== "draft" && this.status !== "approved") throw new SalesFailure("SALES_ORDER_TRANSITION_INVALID", "Sales order cannot be cancelled from its current state.");
    return new SalesOrder({ ...this, status: "cancelled", version: this.version + 1 });
  }
}

function validatePaymentTerms(terms: PaymentTerms): PaymentTerms {
  if (terms.kind === "immediate") return terms;
  const description = terms.description?.trim() || null;
  if (description !== null && description.length > 200) throw new SalesFailure("SALES_ORDER_INVALID", "Credit terms description is invalid.");
  return { ...terms, description };
}
function validateLine(line: SalesOrderLine, currency: CurrencyDefinition): SalesOrderLine {
  if ((line.kind === "stock") !== (line.productId !== null)) throw new SalesFailure("SALES_ORDER_INVALID", "Only stock sales lines require a product.");
  const description = line.description.trim();
  if (!description || description.length > 500 || line.unitPrice.minorAmount < 0n || line.grossAmount.minorAmount < 0n || line.netAmount.minorAmount < 0n) {
    throw new SalesFailure("SALES_ORDER_INVALID", "Sales order line is invalid.");
  }
  requireCurrency(line.unitPrice, currency);
  requireCurrency(line.grossAmount, currency);
  requireCurrency(line.netAmount, currency);
  const adjustments = line.adjustments.map((adjustment) => {
    requireCurrency(adjustment.amount, currency);
    if (adjustment.amount.minorAmount <= 0n) throw new SalesFailure("SALES_ORDER_INVALID", "Sales adjustment must be positive.");
    return { ...adjustment, reason: adjustment.reason?.trim() || null };
  });
  const discounts = sum(adjustments.filter((item) => item.kind === "discount").map((item) => item.amount), currency);
  const surcharges = sum(adjustments.filter((item) => item.kind === "surcharge").map((item) => item.amount), currency);
  if (subtractMoney(addMoney(line.grossAmount, surcharges), discounts).minorAmount !== line.netAmount.minorAmount) {
    throw new SalesFailure("SALES_ORDER_INVALID", "Sales line amounts do not reconcile.");
  }
  return { ...line, description, adjustments: Object.freeze(adjustments) };
}
function sum(values: readonly Money[], currency: CurrencyDefinition): Money {
  return values.reduce((total, value) => addMoney(total, value), moneyFromMinor(0n, currency));
}
function requireCurrency(value: Money, currency: CurrencyDefinition): void {
  if (!sameCurrency(value.currency, currency)) throw new SalesFailure("SALES_CURRENCY_MISMATCH", "Sales amount differs from the transaction currency.");
}
