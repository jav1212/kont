import type { CompanyId } from "@kontave/companies-domain";
import type { FiscalDocumentId, FiscalDocumentLineId } from "@kontave/fiscal-domain";
import { addMoney, moneyFromMinor, sameCurrency, type CurrencyDefinition, type Money } from "@kontave/monetary-domain";
import type { CustomerId, CustomerInvoiceMatchId, GoodsDispatchLineId, SalesOrderLineId } from "./identifiers";
import type { SalesQuantity } from "./quantity";
import { SalesFailure } from "./sales-failure";
import { salesInstant, type SalesInstant } from "./temporal";

export interface CustomerInvoiceAllocation {
  readonly fiscalLineId: FiscalDocumentLineId;
  readonly orderLineId: SalesOrderLineId | null;
  readonly dispatchLineId: GoodsDispatchLineId | null;
  readonly invoicedQuantity: SalesQuantity;
  readonly netAmount: Money;
}
export interface CustomerInvoiceMatchState {
  readonly id: CustomerInvoiceMatchId;
  readonly companyId: CompanyId;
  readonly customerId: CustomerId;
  readonly fiscalDocumentId: FiscalDocumentId;
  readonly documentCurrency: CurrencyDefinition;
  readonly allocations: readonly CustomerInvoiceAllocation[];
  readonly allocatedNetAmount: Money;
  readonly status: "draft" | "confirmed";
  readonly confirmedAt: SalesInstant | null;
  readonly version: number;
}

export class CustomerInvoiceMatch {
  readonly id: CustomerInvoiceMatchId;
  readonly companyId: CompanyId;
  readonly customerId: CustomerId;
  readonly fiscalDocumentId: FiscalDocumentId;
  readonly documentCurrency: CurrencyDefinition;
  readonly allocations: readonly CustomerInvoiceAllocation[];
  readonly allocatedNetAmount: Money;
  readonly status: "draft" | "confirmed";
  readonly confirmedAt: SalesInstant | null;
  readonly version: number;

  constructor(state: CustomerInvoiceMatchState) {
    if (!Number.isSafeInteger(state.version) || state.version < 0 || state.allocations.length === 0) throw new SalesFailure("CUSTOMER_INVOICE_MATCH_INVALID", "Customer invoice match state is invalid.");
    const allocations = state.allocations.map((allocation) => {
      if (allocation.orderLineId === null && allocation.dispatchLineId === null) throw new SalesFailure("CUSTOMER_INVOICE_MATCH_INVALID", "Invoice allocation must reference an order or dispatch line.");
      if (!sameCurrency(allocation.netAmount.currency, state.documentCurrency) || allocation.netAmount.minorAmount < 0n) throw new SalesFailure("SALES_CURRENCY_MISMATCH", "Invoice allocation currency is invalid.");
      return allocation;
    });
    const total = allocations.reduce((sum, allocation) => addMoney(sum, allocation.netAmount), moneyFromMinor(0n, state.documentCurrency));
    if (!sameCurrency(state.allocatedNetAmount.currency, state.documentCurrency) || total.minorAmount !== state.allocatedNetAmount.minorAmount) {
      throw new SalesFailure("CUSTOMER_INVOICE_MATCH_INVALID", "Customer invoice allocations do not reconcile.");
    }
    if ((state.status === "draft") !== (state.confirmedAt === null)) throw new SalesFailure("CUSTOMER_INVOICE_MATCH_INVALID", "Customer invoice match lifecycle is inconsistent.");
    this.id = state.id;
    this.companyId = state.companyId;
    this.customerId = state.customerId;
    this.fiscalDocumentId = state.fiscalDocumentId;
    this.documentCurrency = state.documentCurrency;
    this.allocations = Object.freeze(allocations);
    this.allocatedNetAmount = state.allocatedNetAmount;
    this.status = state.status;
    this.confirmedAt = state.confirmedAt;
    this.version = state.version;
  }

  confirm(value: string): CustomerInvoiceMatch {
    if (this.status !== "draft") throw new SalesFailure("CUSTOMER_INVOICE_MATCH_INVALID", "Only a draft customer invoice match can be confirmed.");
    return new CustomerInvoiceMatch({ ...this, status: "confirmed", confirmedAt: salesInstant(value), version: this.version + 1 });
  }
}
