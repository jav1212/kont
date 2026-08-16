import type { CompanyId } from "@kontave/companies-domain";
import type { ProductId } from "@kontave/products-domain";
import type { CustomerId, CustomerReturnId, CustomerReturnLineId, GoodsDispatchId, GoodsDispatchLineId } from "./identifiers";
import type { SalesQuantity } from "./quantity";
import { SalesFailure } from "./sales-failure";
import { salesInstant, type SalesDate, type SalesInstant } from "./temporal";

export interface CustomerReturnLine {
  readonly id: CustomerReturnLineId;
  readonly dispatchLineId: GoodsDispatchLineId;
  readonly productId: ProductId;
  readonly quantity: SalesQuantity;
  readonly inventoryLocationReference: string;
  readonly lotReference: string | null;
}
export interface CustomerReturnState {
  readonly id: CustomerReturnId;
  readonly companyId: CompanyId;
  readonly customerId: CustomerId;
  readonly dispatchId: GoodsDispatchId;
  readonly returnDate: SalesDate;
  readonly reason: string;
  readonly lines: readonly CustomerReturnLine[];
  readonly status: "draft" | "confirmed";
  readonly confirmedAt: SalesInstant | null;
  readonly version: number;
}
export interface CustomerReturnConfirmed {
  readonly type: "sales.customer_return_confirmed";
  readonly eventId: string;
  readonly operationKey: string;
  readonly returnId: CustomerReturnId;
  readonly companyId: CompanyId;
  readonly customerId: CustomerId;
  readonly dispatchId: GoodsDispatchId;
  readonly effectiveDate: SalesDate;
  readonly occurredAt: SalesInstant;
  readonly lines: readonly CustomerReturnLine[];
}

export class CustomerReturn {
  readonly id: CustomerReturnId;
  readonly companyId: CompanyId;
  readonly customerId: CustomerId;
  readonly dispatchId: GoodsDispatchId;
  readonly returnDate: SalesDate;
  readonly reason: string;
  readonly lines: readonly CustomerReturnLine[];
  readonly status: "draft" | "confirmed";
  readonly confirmedAt: SalesInstant | null;
  readonly version: number;

  constructor(state: CustomerReturnState) {
    const reason = state.reason.trim();
    if (!reason || reason.length > 500 || !Number.isSafeInteger(state.version) || state.version < 0 || state.lines.length === 0 || new Set(state.lines.map((line) => line.id)).size !== state.lines.length) {
      throw new SalesFailure("CUSTOMER_RETURN_INVALID", "Customer return state is invalid.");
    }
    this.id = state.id;
    this.companyId = state.companyId;
    this.customerId = state.customerId;
    this.dispatchId = state.dispatchId;
    this.returnDate = state.returnDate;
    this.reason = reason;
    this.lines = Object.freeze(state.lines.map((line) => {
      const location = line.inventoryLocationReference.trim();
      if (!location || location.length > 128) throw new SalesFailure("CUSTOMER_RETURN_INVALID", "Customer return line is invalid.");
      return { ...line, inventoryLocationReference: location, lotReference: line.lotReference?.trim() || null };
    }));
    if ((state.status === "draft") !== (state.confirmedAt === null)) throw new SalesFailure("CUSTOMER_RETURN_INVALID", "Customer return lifecycle is inconsistent.");
    this.status = state.status;
    this.confirmedAt = state.confirmedAt;
    this.version = state.version;
  }

  confirm(value: string): { readonly customerReturn: CustomerReturn; readonly event: CustomerReturnConfirmed } {
    if (this.status !== "draft") throw new SalesFailure("CUSTOMER_RETURN_TRANSITION_INVALID", "Only a draft customer return can be confirmed.");
    const occurredAt = salesInstant(value);
    const version = this.version + 1;
    const operationKey = `customer-return:${this.id}:v${version}`;
    const customerReturn = new CustomerReturn({ ...this, status: "confirmed", confirmedAt: occurredAt, version });
    return { customerReturn, event: { type: "sales.customer_return_confirmed", eventId: operationKey, operationKey, returnId: this.id, companyId: this.companyId, customerId: this.customerId, dispatchId: this.dispatchId, effectiveDate: this.returnDate, occurredAt, lines: this.lines } };
  }
}
