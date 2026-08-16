import type { CompanyId } from "@kontave/companies-domain";
import type { ProductId } from "@kontave/products-domain";
import type { CustomerId, GoodsDispatchId, GoodsDispatchLineId, SalesOrderId, SalesOrderLineId } from "./identifiers";
import type { SalesQuantity } from "./quantity";
import { SalesFailure } from "./sales-failure";
import { salesInstant, type SalesDate, type SalesInstant } from "./temporal";

export interface GoodsDispatchLine {
  readonly id: GoodsDispatchLineId;
  readonly orderLineId: SalesOrderLineId | null;
  readonly productId: ProductId;
  readonly quantity: SalesQuantity;
  readonly inventoryLocationReference: string;
  readonly lotReference: string | null;
}
export type GoodsDispatchStatus = "draft" | "confirmed" | "reversed";
export interface GoodsDispatchState {
  readonly id: GoodsDispatchId;
  readonly companyId: CompanyId;
  readonly customerId: CustomerId;
  readonly orderId: SalesOrderId | null;
  readonly dispatchDate: SalesDate;
  readonly lines: readonly GoodsDispatchLine[];
  readonly status: GoodsDispatchStatus;
  readonly confirmedAt: SalesInstant | null;
  readonly reversedAt: SalesInstant | null;
  readonly version: number;
}
export interface SalesDispatchConfirmed {
  readonly type: "sales.dispatch_confirmed";
  readonly eventId: string;
  readonly operationKey: string;
  readonly dispatchId: GoodsDispatchId;
  readonly companyId: CompanyId;
  readonly customerId: CustomerId;
  readonly effectiveDate: SalesDate;
  readonly occurredAt: SalesInstant;
  readonly lines: readonly GoodsDispatchLine[];
}
export interface SalesDispatchReversed {
  readonly type: "sales.dispatch_reversed";
  readonly eventId: string;
  readonly originalOperationKey: string;
  readonly dispatchId: GoodsDispatchId;
  readonly companyId: CompanyId;
  readonly effectiveDate: SalesDate;
  readonly occurredAt: SalesInstant;
}

export class GoodsDispatch {
  readonly id: GoodsDispatchId;
  readonly companyId: CompanyId;
  readonly customerId: CustomerId;
  readonly orderId: SalesOrderId | null;
  readonly dispatchDate: SalesDate;
  readonly lines: readonly GoodsDispatchLine[];
  readonly status: GoodsDispatchStatus;
  readonly confirmedAt: SalesInstant | null;
  readonly reversedAt: SalesInstant | null;
  readonly version: number;

  constructor(state: GoodsDispatchState) {
    if (!Number.isSafeInteger(state.version) || state.version < 0 || state.lines.length === 0 || new Set(state.lines.map((line) => line.id)).size !== state.lines.length) {
      throw new SalesFailure("SALES_DISPATCH_INVALID", "Goods dispatch state is invalid.");
    }
    this.id = state.id;
    this.companyId = state.companyId;
    this.customerId = state.customerId;
    this.orderId = state.orderId;
    this.dispatchDate = state.dispatchDate;
    this.lines = Object.freeze(state.lines.map(validateLine));
    if ((state.status === "draft") !== (state.confirmedAt === null) || (state.status === "reversed") !== (state.reversedAt !== null)) {
      throw new SalesFailure("SALES_DISPATCH_INVALID", "Goods dispatch lifecycle is inconsistent.");
    }
    this.status = state.status;
    this.confirmedAt = state.confirmedAt;
    this.reversedAt = state.reversedAt;
    this.version = state.version;
  }

  confirm(value: string): { readonly dispatch: GoodsDispatch; readonly event: SalesDispatchConfirmed } {
    if (this.status !== "draft") throw new SalesFailure("SALES_DISPATCH_TRANSITION_INVALID", "Only a draft dispatch can be confirmed.");
    const occurredAt = salesInstant(value);
    const version = this.version + 1;
    const operationKey = `sales-dispatch:${this.id}:v${version}`;
    const dispatch = new GoodsDispatch({ ...this, status: "confirmed", confirmedAt: occurredAt, version });
    return { dispatch, event: { type: "sales.dispatch_confirmed", eventId: operationKey, operationKey, dispatchId: this.id, companyId: this.companyId, customerId: this.customerId, effectiveDate: this.dispatchDate, occurredAt, lines: this.lines } };
  }

  reverse(value: string): { readonly dispatch: GoodsDispatch; readonly event: SalesDispatchReversed } {
    if (this.status !== "confirmed") throw new SalesFailure("SALES_DISPATCH_TRANSITION_INVALID", "Only a confirmed dispatch can be reversed.");
    const occurredAt = salesInstant(value);
    const originalOperationKey = `sales-dispatch:${this.id}:v${this.version}`;
    const version = this.version + 1;
    const dispatch = new GoodsDispatch({ ...this, status: "reversed", reversedAt: occurredAt, version });
    return { dispatch, event: { type: "sales.dispatch_reversed", eventId: `sales-dispatch-reversal:${this.id}:v${version}`, originalOperationKey, dispatchId: this.id, companyId: this.companyId, effectiveDate: this.dispatchDate, occurredAt } };
  }
}

function validateLine(line: GoodsDispatchLine): GoodsDispatchLine {
  const location = line.inventoryLocationReference.trim();
  if (!location || location.length > 128) throw new SalesFailure("SALES_DISPATCH_INVALID", "Goods dispatch line is invalid.");
  return { ...line, inventoryLocationReference: location, lotReference: line.lotReference?.trim() || null };
}
