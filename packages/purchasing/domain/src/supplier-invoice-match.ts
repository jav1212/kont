import type { CompanyId } from "@kontave/companies-domain";
import type { FiscalDocumentId, FiscalDocumentLineId } from "@kontave/fiscal-domain";
import { addMoney, moneyFromMinor, sameCurrency, type CurrencyDefinition, type Money } from "@kontave/monetary-domain";
import type { GoodsReceiptLineId, PurchaseOrderLineId, SupplierId, SupplierInvoiceMatchId } from "./identifiers";
import { PurchasingFailure } from "./purchasing-failure";
import type { PurchaseQuantity } from "./quantity";
import { purchaseInstant, type PurchaseInstant } from "./temporal";

export interface SupplierInvoiceAllocation {
  readonly fiscalLineId: FiscalDocumentLineId;
  readonly orderLineId: PurchaseOrderLineId | null;
  readonly receiptLineId: GoodsReceiptLineId | null;
  readonly invoicedQuantity: PurchaseQuantity;
  readonly netAmount: Money;
}
export interface SupplierInvoiceMatchState {
  readonly id: SupplierInvoiceMatchId;
  readonly companyId: CompanyId;
  readonly supplierId: SupplierId;
  readonly fiscalDocumentId: FiscalDocumentId;
  readonly documentCurrency: CurrencyDefinition;
  readonly allocations: readonly SupplierInvoiceAllocation[];
  readonly allocatedNetAmount: Money;
  readonly status: "draft" | "confirmed";
  readonly confirmedAt: PurchaseInstant | null;
  readonly version: number;
}

export class SupplierInvoiceMatch {
  readonly id: SupplierInvoiceMatchId;
  readonly companyId: CompanyId;
  readonly supplierId: SupplierId;
  readonly fiscalDocumentId: FiscalDocumentId;
  readonly documentCurrency: CurrencyDefinition;
  readonly allocations: readonly SupplierInvoiceAllocation[];
  readonly allocatedNetAmount: Money;
  readonly status: "draft" | "confirmed";
  readonly confirmedAt: PurchaseInstant | null;
  readonly version: number;

  constructor(state: SupplierInvoiceMatchState) {
    if (!Number.isSafeInteger(state.version) || state.version < 0 || state.allocations.length === 0) throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Supplier invoice match state is invalid.");
    const allocations = state.allocations.map((allocation) => {
      if (allocation.orderLineId === null && allocation.receiptLineId === null) throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Invoice allocation must reference an order or receipt line.");
      if (!sameCurrency(allocation.netAmount.currency, state.documentCurrency) || allocation.netAmount.minorAmount < 0n) throw new PurchasingFailure("PURCHASE_CURRENCY_MISMATCH", "Invoice allocation currency is invalid.");
      return allocation;
    });
    const total = allocations.reduce((sum, allocation) => addMoney(sum, allocation.netAmount), moneyFromMinor(0n, state.documentCurrency));
    if (!sameCurrency(state.allocatedNetAmount.currency, state.documentCurrency) || total.minorAmount !== state.allocatedNetAmount.minorAmount) {
      throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Supplier invoice allocations do not reconcile.");
    }
    if ((state.status === "draft") !== (state.confirmedAt === null)) throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Supplier invoice match lifecycle is inconsistent.");
    this.id = state.id;
    this.companyId = state.companyId;
    this.supplierId = state.supplierId;
    this.fiscalDocumentId = state.fiscalDocumentId;
    this.documentCurrency = state.documentCurrency;
    this.allocations = Object.freeze(allocations);
    this.allocatedNetAmount = state.allocatedNetAmount;
    this.status = state.status;
    this.confirmedAt = state.confirmedAt;
    this.version = state.version;
  }

  confirm(value: string): SupplierInvoiceMatch {
    if (this.status !== "draft") throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Only a draft supplier invoice match can be confirmed.");
    return new SupplierInvoiceMatch({ ...this, status: "confirmed", confirmedAt: purchaseInstant(value), version: this.version + 1 });
  }
}
