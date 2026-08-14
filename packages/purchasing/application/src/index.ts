import type { FiscalDocument, FiscalDocumentId } from "@kontave/fiscal-domain";
import { addDecimal, compareDecimal, type ExactDecimal } from "@kontave/monetary-domain";
import {
  PurchasingFailure,
  type GoodsReceipt,
  type GoodsReceiptId,
  type PurchaseOrder,
  type PurchaseOrderLineId,
  type PurchaseReceiptConfirmed,
  type PurchaseReceiptReversed,
  type PurchaseReturn,
  type PurchaseReturnConfirmed,
  type PurchaseReturnId,
  type Supplier,
  type SupplierId,
  type SupplierInvoiceMatch,
  type SupplierInvoiceMatchId,
} from "@kontave/purchasing-domain";

export interface SupplierRepository { find(id: SupplierId): Promise<Supplier | null> }
export interface PurchaseOrderRepository { find(id: PurchaseOrder["id"]): Promise<PurchaseOrder | null> }
export interface GoodsReceiptRepository { find(id: GoodsReceiptId): Promise<GoodsReceipt | null> }
export interface PurchaseReturnRepository { find(id: PurchaseReturnId): Promise<PurchaseReturn | null> }
export interface SupplierInvoiceMatchRepository { find(id: SupplierInvoiceMatchId): Promise<SupplierInvoiceMatch | null> }
export interface FiscalDocumentReader { find(id: FiscalDocumentId): Promise<FiscalDocument | null> }

export interface PurchaseFulfillmentReader {
  receivedAmount(orderLineId: PurchaseOrderLineId): Promise<ExactDecimal>;
  returnedAmount(receiptLineId: PurchaseReturn["lines"][number]["receiptLineId"]): Promise<ExactDecimal>;
}

export interface PurchasingCommitPort {
  commitReceipt(receipt: GoodsReceipt, event: PurchaseReceiptConfirmed | PurchaseReceiptReversed): Promise<void>;
  commitReturn(purchaseReturn: PurchaseReturn, event: PurchaseReturnConfirmed): Promise<void>;
  commitInvoiceMatch(match: SupplierInvoiceMatch): Promise<void>;
}

export interface PurchasingInventoryPort {
  postReceipt(event: PurchaseReceiptConfirmed): Promise<{ readonly operationId: string }>;
  reverseReceipt(event: PurchaseReceiptReversed): Promise<{ readonly operationId: string }>;
  postReturn(event: PurchaseReturnConfirmed): Promise<{ readonly operationId: string }>;
}

export class ConfirmGoodsReceipt {
  constructor(
    private readonly receipts: GoodsReceiptRepository,
    private readonly suppliers: SupplierRepository,
    private readonly orders: PurchaseOrderRepository,
    private readonly fulfillment: PurchaseFulfillmentReader,
    private readonly commit: PurchasingCommitPort,
  ) {}

  async execute(id: GoodsReceiptId, occurredAt: string): Promise<GoodsReceipt> {
    const receipt = await requireReceipt(this.receipts, id);
    const supplier = await this.suppliers.find(receipt.supplierId);
    if (!supplier) throw new PurchasingFailure("PURCHASE_NOT_FOUND", "Supplier does not exist.");
    supplier.assertActive();
    if (supplier.companyId !== receipt.companyId) throw new PurchasingFailure("PURCHASE_RECEIPT_INVALID", "Receipt and supplier belong to different companies.");
    if (receipt.orderId !== null) {
      const order = await this.orders.find(receipt.orderId);
      if (!order) throw new PurchasingFailure("PURCHASE_NOT_FOUND", "Purchase order does not exist.");
      await validateReceiptAgainstOrder(receipt, order, this.fulfillment);
    } else if (receipt.lines.some((line) => line.orderLineId !== null)) {
      throw new PurchasingFailure("PURCHASE_RECEIPT_INVALID", "Unplanned receipt cannot reference order lines.");
    }
    const confirmed = receipt.confirm(occurredAt);
    await this.commit.commitReceipt(confirmed.receipt, confirmed.event);
    return confirmed.receipt;
  }
}

export class ReverseGoodsReceipt {
  constructor(private readonly receipts: GoodsReceiptRepository, private readonly commit: PurchasingCommitPort) {}
  async execute(id: GoodsReceiptId, occurredAt: string): Promise<GoodsReceipt> {
    const receipt = await requireReceipt(this.receipts, id);
    const reversed = receipt.reverse(occurredAt);
    await this.commit.commitReceipt(reversed.receipt, reversed.event);
    return reversed.receipt;
  }
}

export class ConfirmPurchaseReturn {
  constructor(
    private readonly returns: PurchaseReturnRepository,
    private readonly receipts: GoodsReceiptRepository,
    private readonly fulfillment: PurchaseFulfillmentReader,
    private readonly commit: PurchasingCommitPort,
  ) {}
  async execute(id: PurchaseReturnId, occurredAt: string): Promise<PurchaseReturn> {
    const purchaseReturn = await this.returns.find(id);
    if (!purchaseReturn) throw new PurchasingFailure("PURCHASE_NOT_FOUND", "Purchase return does not exist.");
    const receipt = await requireReceipt(this.receipts, purchaseReturn.receiptId);
    if (receipt.status !== "confirmed" || receipt.companyId !== purchaseReturn.companyId || receipt.supplierId !== purchaseReturn.supplierId) {
      throw new PurchasingFailure("PURCHASE_RETURN_INVALID", "Purchase return does not match a confirmed receipt.");
    }
    for (const line of purchaseReturn.lines) {
      const receiptLine = receipt.lines.find((candidate) => candidate.id === line.receiptLineId);
      if (!receiptLine || receiptLine.productId !== line.productId || receiptLine.quantity.unit !== line.quantity.unit ||
          receiptLine.inventoryLocationReference !== line.inventoryLocationReference || receiptLine.lotReference !== line.lotReference) {
        throw new PurchasingFailure("PURCHASE_RETURN_INVALID", "Return line does not match its receipt line.");
      }
      const returned = await this.fulfillment.returnedAmount(line.receiptLineId);
      if (compareDecimal(addDecimal(returned, line.quantity.amount), receiptLine.quantity.amount) > 0) {
        throw new PurchasingFailure("PURCHASE_QUANTITY_EXCEEDED", "Returned quantity exceeds received quantity.");
      }
    }
    const confirmed = purchaseReturn.confirm(occurredAt);
    await this.commit.commitReturn(confirmed.purchaseReturn, confirmed.event);
    return confirmed.purchaseReturn;
  }
}

export class ConfirmSupplierInvoiceMatch {
  constructor(private readonly matches: SupplierInvoiceMatchRepository, private readonly fiscal: FiscalDocumentReader, private readonly commit: PurchasingCommitPort) {}
  async execute(id: SupplierInvoiceMatchId, occurredAt: string): Promise<SupplierInvoiceMatch> {
    const match = await this.matches.find(id);
    if (!match) throw new PurchasingFailure("PURCHASE_NOT_FOUND", "Supplier invoice match does not exist.");
    const document = await this.fiscal.find(match.fiscalDocumentId);
    if (!document || document.companyId !== match.companyId || document.direction !== "received" || document.status !== "received" || document.type !== "invoice") {
      throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Supplier invoice match requires a received fiscal invoice from the same company.");
    }
    const confirmed = match.confirm(occurredAt);
    await this.commit.commitInvoiceMatch(confirmed);
    return confirmed;
  }
}

export class PostPurchasingEventToInventory {
  constructor(private readonly inventory: PurchasingInventoryPort) {}
  execute(event: PurchaseReceiptConfirmed | PurchaseReceiptReversed | PurchaseReturnConfirmed) {
    if (event.type === "purchasing.receipt_confirmed") return this.inventory.postReceipt(event);
    if (event.type === "purchasing.receipt_reversed") return this.inventory.reverseReceipt(event);
    return this.inventory.postReturn(event);
  }
}

async function validateReceiptAgainstOrder(receipt: GoodsReceipt, order: PurchaseOrder, fulfillment: PurchaseFulfillmentReader): Promise<void> {
  if (order.status !== "approved" || order.companyId !== receipt.companyId || order.supplierId !== receipt.supplierId) {
    throw new PurchasingFailure("PURCHASE_RECEIPT_INVALID", "Receipt requires an approved order from the same company and supplier.");
  }
  for (const line of receipt.lines) {
    if (line.orderLineId === null) throw new PurchasingFailure("PURCHASE_RECEIPT_INVALID", "Ordered receipt line requires an order line reference.");
    const ordered = order.lines.find((candidate) => candidate.id === line.orderLineId);
    if (!ordered || ordered.kind !== "stock" || ordered.productId !== line.productId || ordered.orderedQuantity.unit !== line.quantity.unit) {
      throw new PurchasingFailure("PURCHASE_RECEIPT_INVALID", "Receipt line does not match an inventory-bearing order line.");
    }
    const received = await fulfillment.receivedAmount(line.orderLineId);
    if (compareDecimal(addDecimal(received, line.quantity.amount), ordered.orderedQuantity.amount) > 0) {
      throw new PurchasingFailure("PURCHASE_QUANTITY_EXCEEDED", "Received quantity exceeds ordered quantity.");
    }
  }
}

async function requireReceipt(repository: GoodsReceiptRepository, id: GoodsReceiptId): Promise<GoodsReceipt> {
  const receipt = await repository.find(id);
  if (!receipt) throw new PurchasingFailure("PURCHASE_NOT_FOUND", "Goods receipt does not exist.");
  return receipt;
}
