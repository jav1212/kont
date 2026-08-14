import type { FiscalDocument, FiscalDocumentId, FiscalDocumentLineId } from "@kontave/fiscal-domain";
import { addDecimal, compareDecimal, exactDecimal, sameCurrency, type ExactDecimal } from "@kontave/monetary-domain";
import {
  SalesFailure,
  type Customer,
  type CustomerId,
  type CustomerInvoiceMatch,
  type CustomerInvoiceMatchId,
  type CustomerReturn,
  type CustomerReturnConfirmed,
  type CustomerReturnId,
  type GoodsDispatch,
  type GoodsDispatchId,
  type GoodsDispatchLineId,
  type SalesDispatchConfirmed,
  type SalesDispatchReversed,
  type SalesOrder,
  type SalesOrderLineId,
} from "@kontave/sales-domain";

export interface CustomerRepository { find(id: CustomerId): Promise<Customer | null> }
export interface SalesOrderRepository { find(id: SalesOrder["id"]): Promise<SalesOrder | null> }
export interface GoodsDispatchRepository { find(id: GoodsDispatchId): Promise<GoodsDispatch | null> }
export interface CustomerReturnRepository { find(id: CustomerReturnId): Promise<CustomerReturn | null> }
export interface CustomerInvoiceMatchRepository { find(id: CustomerInvoiceMatchId): Promise<CustomerInvoiceMatch | null> }
export interface FiscalDocumentReader { find(id: FiscalDocumentId): Promise<FiscalDocument | null> }
export interface FiscalUnitCompatibility {
  isCompatible(
    fiscalUnitCode: string,
    salesUnit: CustomerInvoiceMatch["allocations"][number]["invoicedQuantity"]["unit"],
  ): Promise<boolean>;
}

export interface SalesFulfillmentReader {
  dispatchedAmount(orderLineId: SalesOrderLineId): Promise<ExactDecimal>;
  returnedAmount(dispatchLineId: GoodsDispatchLineId): Promise<ExactDecimal>;
}

export interface SalesCommitPort {
  commitDispatch(dispatch: GoodsDispatch, event: SalesDispatchConfirmed | SalesDispatchReversed): Promise<void>;
  commitReturn(customerReturn: CustomerReturn, event: CustomerReturnConfirmed): Promise<void>;
  commitInvoiceMatch(match: CustomerInvoiceMatch): Promise<void>;
}

export interface SalesInventoryPort {
  postDispatch(event: SalesDispatchConfirmed): Promise<{ readonly operationId: string }>;
  reverseDispatch(event: SalesDispatchReversed): Promise<{ readonly operationId: string }>;
  postReturn(event: CustomerReturnConfirmed): Promise<{ readonly operationId: string }>;
}

export class ConfirmGoodsDispatch {
  constructor(
    private readonly dispatches: GoodsDispatchRepository,
    private readonly customers: CustomerRepository,
    private readonly orders: SalesOrderRepository,
    private readonly fulfillment: SalesFulfillmentReader,
    private readonly commit: SalesCommitPort,
  ) {}

  async execute(id: GoodsDispatchId, occurredAt: string): Promise<GoodsDispatch> {
    const dispatch = await requireDispatch(this.dispatches, id);
    const customer = await this.customers.find(dispatch.customerId);
    if (!customer) throw new SalesFailure("SALES_NOT_FOUND", "Customer does not exist.");
    customer.assertActive();
    if (customer.companyId !== dispatch.companyId) throw new SalesFailure("SALES_DISPATCH_INVALID", "Dispatch and customer belong to different companies.");
    if (dispatch.orderId !== null) {
      const order = await this.orders.find(dispatch.orderId);
      if (!order) throw new SalesFailure("SALES_NOT_FOUND", "Sales order does not exist.");
      await validateDispatchAgainstOrder(dispatch, order, this.fulfillment);
    } else if (dispatch.lines.some((line) => line.orderLineId !== null)) {
      throw new SalesFailure("SALES_DISPATCH_INVALID", "Unplanned dispatch cannot reference order lines.");
    }
    const confirmed = dispatch.confirm(occurredAt);
    await this.commit.commitDispatch(confirmed.dispatch, confirmed.event);
    return confirmed.dispatch;
  }
}

export class ReverseGoodsDispatch {
  constructor(private readonly dispatches: GoodsDispatchRepository, private readonly commit: SalesCommitPort) {}
  async execute(id: GoodsDispatchId, occurredAt: string): Promise<GoodsDispatch> {
    const dispatch = await requireDispatch(this.dispatches, id);
    const reversed = dispatch.reverse(occurredAt);
    await this.commit.commitDispatch(reversed.dispatch, reversed.event);
    return reversed.dispatch;
  }
}

export class ConfirmCustomerReturn {
  constructor(
    private readonly returns: CustomerReturnRepository,
    private readonly dispatches: GoodsDispatchRepository,
    private readonly fulfillment: SalesFulfillmentReader,
    private readonly commit: SalesCommitPort,
  ) {}
  async execute(id: CustomerReturnId, occurredAt: string): Promise<CustomerReturn> {
    const customerReturn = await this.returns.find(id);
    if (!customerReturn) throw new SalesFailure("SALES_NOT_FOUND", "Customer return does not exist.");
    const dispatch = await requireDispatch(this.dispatches, customerReturn.dispatchId);
    if (dispatch.status !== "confirmed" || dispatch.companyId !== customerReturn.companyId || dispatch.customerId !== customerReturn.customerId) {
      throw new SalesFailure("CUSTOMER_RETURN_INVALID", "Customer return does not match a confirmed dispatch.");
    }
    for (const line of customerReturn.lines) {
      const dispatchLine = dispatch.lines.find((candidate) => candidate.id === line.dispatchLineId);
      if (!dispatchLine || dispatchLine.productId !== line.productId || dispatchLine.quantity.unit !== line.quantity.unit ||
          dispatchLine.inventoryLocationReference !== line.inventoryLocationReference || dispatchLine.lotReference !== line.lotReference) {
        throw new SalesFailure("CUSTOMER_RETURN_INVALID", "Customer return line does not match its dispatch line.");
      }
      const returned = await this.fulfillment.returnedAmount(line.dispatchLineId);
      if (compareDecimal(addDecimal(returned, line.quantity.amount), dispatchLine.quantity.amount) > 0) {
        throw new SalesFailure("SALES_QUANTITY_EXCEEDED", "Returned quantity exceeds dispatched quantity.");
      }
    }
    const confirmed = customerReturn.confirm(occurredAt);
    await this.commit.commitReturn(confirmed.customerReturn, confirmed.event);
    return confirmed.customerReturn;
  }
}

export class ConfirmCustomerInvoiceMatch {
  constructor(
    private readonly matches: CustomerInvoiceMatchRepository,
    private readonly customers: CustomerRepository,
    private readonly fiscal: FiscalDocumentReader,
    private readonly units: FiscalUnitCompatibility,
    private readonly commit: SalesCommitPort,
  ) {}
  async execute(id: CustomerInvoiceMatchId, occurredAt: string): Promise<CustomerInvoiceMatch> {
    const match = await this.matches.find(id);
    if (!match) throw new SalesFailure("SALES_NOT_FOUND", "Customer invoice match does not exist.");
    const customer = await this.customers.find(match.customerId);
    if (!customer) throw new SalesFailure("SALES_NOT_FOUND", "Customer does not exist.");
    customer.assertActive();
    const document = await this.fiscal.find(match.fiscalDocumentId);
    if (!document || document.companyId !== match.companyId || customer.companyId !== match.companyId || document.direction !== "issued" || document.status !== "issued" || document.type !== "invoice") {
      throw new SalesFailure("CUSTOMER_INVOICE_MATCH_INVALID", "Customer invoice match requires an issued fiscal invoice from the same company.");
    }
    if (customer.taxIdentifier !== null && customer.taxIdentifier !== document.recipient.taxIdentifier) {
      throw new SalesFailure("CUSTOMER_INVOICE_MATCH_INVALID", "Fiscal invoice recipient differs from the customer.");
    }
    if (!sameCurrency(match.documentCurrency, document.documentCurrency)) {
      throw new SalesFailure("SALES_CURRENCY_MISMATCH", "Invoice match currency differs from the fiscal document.");
    }
    await validateFiscalAllocations(match, document, this.units);
    const confirmed = match.confirm(occurredAt);
    await this.commit.commitInvoiceMatch(confirmed);
    return confirmed;
  }
}

export class PostSalesEventToInventory {
  constructor(private readonly inventory: SalesInventoryPort) {}
  execute(event: SalesDispatchConfirmed | SalesDispatchReversed | CustomerReturnConfirmed) {
    if (event.type === "sales.dispatch_confirmed") return this.inventory.postDispatch(event);
    if (event.type === "sales.dispatch_reversed") return this.inventory.reverseDispatch(event);
    return this.inventory.postReturn(event);
  }
}

async function validateDispatchAgainstOrder(dispatch: GoodsDispatch, order: SalesOrder, fulfillment: SalesFulfillmentReader): Promise<void> {
  if (order.status !== "approved" || order.companyId !== dispatch.companyId || order.customerId !== dispatch.customerId) {
    throw new SalesFailure("SALES_DISPATCH_INVALID", "Dispatch requires an approved order from the same company and customer.");
  }
  for (const line of dispatch.lines) {
    if (line.orderLineId === null) throw new SalesFailure("SALES_DISPATCH_INVALID", "Ordered dispatch line requires an order line reference.");
    const ordered = order.lines.find((candidate) => candidate.id === line.orderLineId);
    if (!ordered || ordered.kind !== "stock" || ordered.productId !== line.productId || ordered.orderedQuantity.unit !== line.quantity.unit) {
      throw new SalesFailure("SALES_DISPATCH_INVALID", "Dispatch line does not match an inventory-bearing order line.");
    }
    const dispatched = await fulfillment.dispatchedAmount(line.orderLineId);
    if (compareDecimal(addDecimal(dispatched, line.quantity.amount), ordered.orderedQuantity.amount) > 0) {
      throw new SalesFailure("SALES_QUANTITY_EXCEEDED", "Dispatched quantity exceeds ordered quantity.");
    }
  }
}

async function validateFiscalAllocations(match: CustomerInvoiceMatch, document: FiscalDocument, units: FiscalUnitCompatibility): Promise<void> {
  const allocatedByLine = new Map<FiscalDocumentLineId, { readonly amount: bigint; readonly quantity: ExactDecimal }>();
  for (const allocation of match.allocations) {
    const fiscalLine = document.lines.find((line) => line.id === allocation.fiscalLineId);
    if (!fiscalLine || !await units.isCompatible(fiscalLine.unitCode, allocation.invoicedQuantity.unit)) {
      throw new SalesFailure("CUSTOMER_INVOICE_MATCH_INVALID", "Invoice allocation does not match a fiscal line and unit.");
    }
    const current = allocatedByLine.get(allocation.fiscalLineId);
    allocatedByLine.set(allocation.fiscalLineId, {
      amount: (current?.amount ?? 0n) + allocation.netAmount.minorAmount,
      quantity: addDecimal(current?.quantity ?? exactDecimal("0"), allocation.invoicedQuantity.amount),
    });
  }
  for (const [lineId, allocated] of allocatedByLine) {
    const fiscalLine = document.lines.find((line) => line.id === lineId);
    if (fiscalLine === undefined || allocated.amount > fiscalLine.netAmount.minorAmount || compareDecimal(allocated.quantity, fiscalLine.quantity) > 0) {
      throw new SalesFailure("CUSTOMER_INVOICE_MATCH_INVALID", "Allocation exceeds the fiscal line quantity or amount.");
    }
  }
}

async function requireDispatch(repository: GoodsDispatchRepository, id: GoodsDispatchId): Promise<GoodsDispatch> {
  const dispatch = await repository.find(id);
  if (!dispatch) throw new SalesFailure("SALES_NOT_FOUND", "Goods dispatch does not exist.");
  return dispatch;
}
