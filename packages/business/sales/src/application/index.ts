import type {
  FiscalDocument,
  FiscalDocumentId,
  FiscalDocumentLineId,
} from "@kontave/fiscal/domain";
import {
  addDecimal,
  compareDecimal,
  exactDecimal,
  sameCurrency,
  type ExactDecimal,
} from "@kontave/monetary/domain";
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
} from "../domain";

export * from "./sales-dashboard";
export * from "./sales-performance-report";

export interface CustomerRepository {
  /** @param id Customer identifier. @returns The customer, or `null` when absent. */
  find(id: CustomerId): Promise<Customer | null>;
}
export interface SalesOrderRepository {
  /** @param id Sales-order identifier. @returns The order, or `null` when absent. */
  find(id: SalesOrder["id"]): Promise<SalesOrder | null>;
}
export interface GoodsDispatchRepository {
  /** @param id Goods-dispatch identifier. @returns The dispatch, or `null` when absent. */
  find(id: GoodsDispatchId): Promise<GoodsDispatch | null>;
}
export interface CustomerReturnRepository {
  /** @param id Customer-return identifier. @returns The return, or `null` when absent. */
  find(id: CustomerReturnId): Promise<CustomerReturn | null>;
}
export interface CustomerInvoiceMatchRepository {
  /** @param id Invoice-match identifier. @returns The match, or `null` when absent. */
  find(id: CustomerInvoiceMatchId): Promise<CustomerInvoiceMatch | null>;
}
export interface FiscalDocumentReader {
  /** @param id Fiscal-document identifier. @returns The document, or `null` when absent. */
  find(id: FiscalDocumentId): Promise<FiscalDocument | null>;
}
export interface FiscalUnitCompatibility {
  /**
   * Determines whether a fiscal unit can represent a sales quantity.
   * @param fiscalUnitCode Unit code recorded by the fiscal document.
   * @param salesUnit Unit used by the sales allocation.
   * @returns Whether the units are compatible.
   */
  isCompatible(
    fiscalUnitCode: string,
    salesUnit: CustomerInvoiceMatch["allocations"][number]["invoicedQuantity"]["unit"],
  ): Promise<boolean>;
}

export interface SalesFulfillmentReader {
  /** @param orderLineId Order line to total. @returns Quantity already dispatched. */
  dispatchedAmount(orderLineId: SalesOrderLineId): Promise<ExactDecimal>;
  /** @param dispatchLineId Dispatch line to total. @returns Quantity already returned. */
  returnedAmount(dispatchLineId: GoodsDispatchLineId): Promise<ExactDecimal>;
}

export interface SalesCommitPort {
  /**
   * Persists the dispatch state change and its event in one durable transaction.
   * Implementations must scope both records to the dispatch company and make the
   * event operation key unique, so a delivery retry cannot create a second event.
   * @param dispatch Resulting dispatch.
   * @param event Dispatch event whose `operationKey` is the idempotency key.
   * @returns Completion only after both records are durable, or rejection with neither persisted.
   */
  commitDispatch(dispatch: GoodsDispatch, event: SalesDispatchConfirmed | SalesDispatchReversed): Promise<void>;
  /**
   * Persists a customer return and its event in one company-scoped durable transaction.
   * @param customerReturn Resulting return.
   * @param event Return event whose `operationKey` is the idempotency key.
   * @returns Completion only after both records are durable, or rejection with neither persisted.
   */
  commitReturn(customerReturn: CustomerReturn, event: CustomerReturnConfirmed): Promise<void>;
  /** @param match Confirmed invoice match. @returns Completion after atomic persistence. */
  commitInvoiceMatch(match: CustomerInvoiceMatch): Promise<void>;
}

export interface SalesInventoryPort {
  /** @param event Confirmed dispatch event. @returns Created inventory operation identifier. */
  postDispatch(event: SalesDispatchConfirmed): Promise<{ readonly operationId: string }>;
  /** @param event Reversed dispatch event. @returns Created inventory operation identifier. */
  reverseDispatch(event: SalesDispatchReversed): Promise<{ readonly operationId: string }>;
  /** @param event Confirmed return event. @returns Created inventory operation identifier. */
  postReturn(event: CustomerReturnConfirmed): Promise<{ readonly operationId: string }>;
}

export class ConfirmGoodsDispatch {
  /**
   * Creates the dispatch-confirmation service.
   * @param dispatches Dispatch repository.
   * @param customers Customer repository.
   * @param orders Sales-order repository.
   * @param fulfillment Reader for already fulfilled quantities.
   * @param commit Atomic persistence boundary.
   */
  constructor(
    private readonly dispatches: GoodsDispatchRepository,
    private readonly customers: CustomerRepository,
    private readonly orders: SalesOrderRepository,
    private readonly fulfillment: SalesFulfillmentReader,
    private readonly commit: SalesCommitPort,
  ) {}

  /**
   * Confirms a valid goods dispatch and commits its domain event.
   * @param id Dispatch identifier.
   * @param occurredAt ISO instant assigned to the confirmation.
   * @returns The confirmed dispatch.
   * @throws {SalesFailure} When related entities or quantities are invalid.
   */
  async execute(id: GoodsDispatchId, occurredAt: string): Promise<GoodsDispatch> {
    const dispatch = await requireDispatch(this.dispatches, id);
    const customer = await this.customers.find(dispatch.customerId);
    if (!customer) throw new SalesFailure("SALES_NOT_FOUND", "Customer does not exist.");
    customer.assertActive();
    if (customer.companyId !== dispatch.companyId) {
      throw new SalesFailure(
        "SALES_DISPATCH_INVALID",
        "Dispatch and customer belong to different companies.",
      );
    }
    if (dispatch.orderId !== null) {
      const order = await this.orders.find(dispatch.orderId);
      if (!order) throw new SalesFailure("SALES_NOT_FOUND", "Sales order does not exist.");
      await validateDispatchAgainstOrder(dispatch, order, this.fulfillment);
    } else if (dispatch.lines.some((line) => line.orderLineId !== null)) {
      throw new SalesFailure(
        "SALES_DISPATCH_INVALID",
        "Unplanned dispatch cannot reference order lines.",
      );
    }
    const confirmed = dispatch.confirm(occurredAt);
    await this.commit.commitDispatch(confirmed.dispatch, confirmed.event);
    return confirmed.dispatch;
  }
}

export class ReverseGoodsDispatch {
  /**
   * Creates the dispatch-reversal service.
   * @param dispatches Dispatch repository.
   * @param commit Atomic persistence boundary.
   */
  constructor(
    private readonly dispatches: GoodsDispatchRepository,
    private readonly commit: SalesCommitPort,
  ) {}

  /**
   * Reverses a confirmed dispatch and commits its domain event.
   * @param id Dispatch identifier.
   * @param occurredAt ISO instant assigned to the reversal.
   * @returns The reversed dispatch.
   * @throws {SalesFailure} When the dispatch is absent or cannot be reversed.
   */
  async execute(id: GoodsDispatchId, occurredAt: string): Promise<GoodsDispatch> {
    const dispatch = await requireDispatch(this.dispatches, id);
    const reversed = dispatch.reverse(occurredAt);
    await this.commit.commitDispatch(reversed.dispatch, reversed.event);
    return reversed.dispatch;
  }
}

export class ConfirmCustomerReturn {
  /**
   * Creates the customer-return confirmation service.
   * @param returns Customer-return repository.
   * @param dispatches Dispatch repository.
   * @param fulfillment Reader for already returned quantities.
   * @param commit Atomic persistence boundary.
   */
  constructor(
    private readonly returns: CustomerReturnRepository,
    private readonly dispatches: GoodsDispatchRepository,
    private readonly fulfillment: SalesFulfillmentReader,
    private readonly commit: SalesCommitPort,
  ) {}
  /**
   * Confirms a customer return after validating it against its dispatch.
   * @param id Customer-return identifier.
   * @param occurredAt ISO instant assigned to the confirmation.
   * @returns The confirmed return.
   * @throws {SalesFailure} When references or quantities are invalid.
   */
  async execute(id: CustomerReturnId, occurredAt: string): Promise<CustomerReturn> {
    const customerReturn = await this.returns.find(id);
    if (!customerReturn) {
      throw new SalesFailure("SALES_NOT_FOUND", "Customer return does not exist.");
    }
    const dispatch = await requireDispatch(this.dispatches, customerReturn.dispatchId);
    if (
      dispatch.status !== "confirmed" ||
      dispatch.companyId !== customerReturn.companyId ||
      dispatch.customerId !== customerReturn.customerId
    ) {
      throw new SalesFailure(
        "CUSTOMER_RETURN_INVALID",
        "Customer return does not match a confirmed dispatch.",
      );
    }
    for (const line of customerReturn.lines) {
      const dispatchLine = dispatch.lines.find((candidate) => candidate.id === line.dispatchLineId);
      if (
        !dispatchLine ||
        dispatchLine.productId !== line.productId ||
        dispatchLine.quantity.unit !== line.quantity.unit ||
        dispatchLine.inventoryLocationReference !== line.inventoryLocationReference ||
        dispatchLine.lotReference !== line.lotReference
      ) {
        throw new SalesFailure(
          "CUSTOMER_RETURN_INVALID",
          "Customer return line does not match its dispatch line.",
        );
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
  /**
   * Creates the customer-invoice matching service.
   * @param matches Invoice-match repository.
   * @param customers Customer repository.
   * @param fiscal Fiscal-document reader.
   * @param units Fiscal-to-sales unit compatibility policy.
   * @param commit Atomic persistence boundary.
   */
  constructor(
    private readonly matches: CustomerInvoiceMatchRepository,
    private readonly customers: CustomerRepository,
    private readonly fiscal: FiscalDocumentReader,
    private readonly units: FiscalUnitCompatibility,
    private readonly commit: SalesCommitPort,
  ) {}
  /**
   * Confirms allocations against an issued invoice for the same customer.
   * @param id Invoice-match identifier.
   * @param occurredAt ISO instant assigned to the confirmation.
   * @returns The confirmed match.
   * @throws {SalesFailure} When customer, currency, unit, or allocation data is invalid.
   */
  async execute(id: CustomerInvoiceMatchId, occurredAt: string): Promise<CustomerInvoiceMatch> {
    const match = await this.matches.find(id);
    if (!match) {
      throw new SalesFailure("SALES_NOT_FOUND", "Customer invoice match does not exist.");
    }
    const customer = await this.customers.find(match.customerId);
    if (!customer) throw new SalesFailure("SALES_NOT_FOUND", "Customer does not exist.");
    customer.assertActive();
    const document = await this.fiscal.find(match.fiscalDocumentId);
    if (
      !document ||
      document.companyId !== match.companyId ||
      customer.companyId !== match.companyId ||
      document.direction !== "issued" ||
      document.status !== "issued" ||
      document.type !== "invoice"
    ) {
      throw new SalesFailure(
        "CUSTOMER_INVOICE_MATCH_INVALID",
        "Customer invoice match requires an issued fiscal invoice from the same company.",
      );
    }
    if (customer.taxIdentifier !== null && customer.taxIdentifier !== document.recipient.taxIdentifier) {
      throw new SalesFailure(
        "CUSTOMER_INVOICE_MATCH_INVALID",
        "Fiscal invoice recipient differs from the customer.",
      );
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
  /** @param inventory Inventory integration port. */
  constructor(private readonly inventory: SalesInventoryPort) {}

  /**
   * Routes a sales stock event to the matching inventory operation.
   * @param event Confirmed dispatch, reversed dispatch, or confirmed return event.
   * @returns The identifier assigned by inventory.
   */
  execute(
    event: SalesDispatchConfirmed | SalesDispatchReversed | CustomerReturnConfirmed,
  ): Promise<{ readonly operationId: string }> {
    if (event.type === "sales.dispatch_confirmed") return this.inventory.postDispatch(event);
    if (event.type === "sales.dispatch_reversed") return this.inventory.reverseDispatch(event);
    return this.inventory.postReturn(event);
  }
}

async function validateDispatchAgainstOrder(
  dispatch: GoodsDispatch,
  order: SalesOrder,
  fulfillment: SalesFulfillmentReader,
): Promise<void> {
  if (
    order.status !== "approved" ||
    order.companyId !== dispatch.companyId ||
    order.customerId !== dispatch.customerId
  ) {
    throw new SalesFailure(
      "SALES_DISPATCH_INVALID",
      "Dispatch requires an approved order from the same company and customer.",
    );
  }
  for (const line of dispatch.lines) {
    if (line.orderLineId === null) {
      throw new SalesFailure(
        "SALES_DISPATCH_INVALID",
        "Ordered dispatch line requires an order line reference.",
      );
    }
    const ordered = order.lines.find((candidate) => candidate.id === line.orderLineId);
    if (
      !ordered ||
      ordered.kind !== "stock" ||
      ordered.productId !== line.productId ||
      ordered.orderedQuantity.unit !== line.quantity.unit
    ) {
      throw new SalesFailure(
        "SALES_DISPATCH_INVALID",
        "Dispatch line does not match an inventory-bearing order line.",
      );
    }
    const dispatched = await fulfillment.dispatchedAmount(line.orderLineId);
    if (compareDecimal(addDecimal(dispatched, line.quantity.amount), ordered.orderedQuantity.amount) > 0) {
      throw new SalesFailure("SALES_QUANTITY_EXCEEDED", "Dispatched quantity exceeds ordered quantity.");
    }
  }
}

async function validateFiscalAllocations(
  match: CustomerInvoiceMatch,
  document: FiscalDocument,
  units: FiscalUnitCompatibility,
): Promise<void> {
  const allocatedByLine = new Map<
    FiscalDocumentLineId,
    { readonly amount: bigint; readonly quantity: ExactDecimal }
  >();
  for (const allocation of match.allocations) {
    const fiscalLine = document.lines.find((line) => line.id === allocation.fiscalLineId);
    if (
      !fiscalLine ||
      !(await units.isCompatible(fiscalLine.unitCode, allocation.invoicedQuantity.unit))
    ) {
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
