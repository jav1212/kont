import type { FiscalDocument, FiscalDocumentId } from "@kontave/fiscal/domain";
export * from "./purchasing-dashboard";
import { addDecimal, compareDecimal, exactDecimal, sameCurrency, type ExactDecimal } from "@kontave/monetary/domain";
import type { TaxReportingFact, TaxReportingScope } from "@kontave/tax-reporting/domain";
import { fiscalDocumentTaxFact, type FiscalDocumentFactMetadata } from "@kontave/tax-reporting/fiscal-document-mapper";
import type { TaxCounterpartyFiscalProfile } from "@kontave/taxation/domain";
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
} from "../domain";

export interface SupplierRepository {
  /** @param id Supplier identifier. @returns The supplier, or `null` when absent. */
  find(id: SupplierId): Promise<Supplier | null>;
}
/** Reads supplier identity through an authenticated tenant and company scope. */
export interface SupplierIdentityReader {
  /** @param scope Authorized owner scope. @param id Supplier identifier. @param actorId Authenticated actor checked by persistence. @returns Supplier identity or `null` when it is outside the scope. @throws {PurchasingFailure} When the actor has no purchasing access. */
  findForInvoiceMatch(scope: TaxReportingScope, id: SupplierId, actorId: string): Promise<Supplier | null>;
}
/** Reads a supplier's company-owned fiscal classification effective on an invoice date. */
export interface SupplierFiscalProfileReader {
  /** @param scope - Authorized tenant, organization, and company. @param supplierId - Validated supplier identity. @param effectiveDate - Fiscal document issue date. @param actorId - Authenticated actor. @returns The historical profile or null when none is recorded. @throws {PurchasingFailure} When the fiscal profile store is unavailable or scope validation fails. */
  getEffectiveProfile(scope: TaxReportingScope, supplierId: SupplierId, effectiveDate: string, actorId: string): Promise<TaxCounterpartyFiscalProfile | null>;
}
export interface PurchaseOrderRepository {
  /** @param id Purchase-order identifier. @returns The order, or `null` when absent. */
  find(id: PurchaseOrder["id"]): Promise<PurchaseOrder | null>;
}
export interface GoodsReceiptRepository {
  /** @param id Goods-receipt identifier. @returns The receipt, or `null` when absent. */
  find(id: GoodsReceiptId): Promise<GoodsReceipt | null>;
}
export interface PurchaseReturnRepository {
  /** @param id Purchase-return identifier. @returns The return, or `null` when absent. */
  find(id: PurchaseReturnId): Promise<PurchaseReturn | null>;
}
export interface SupplierInvoiceMatchRepository {
  /** @param scope Authorized owner scope. @param id Invoice-match identifier. @param actorId Authenticated actor checked by persistence. @returns The match, or `null` when absent. @throws {PurchasingFailure} When the actor has no purchasing scope. */
  find(scope: TaxReportingScope, id: SupplierInvoiceMatchId, actorId: string): Promise<SupplierInvoiceMatch | null>;
}
/** Persistence port for the draft invoice-match lifecycle. */
export interface SupplierInvoiceMatchWriter {
  /** Persists a new draft match in its authorized company scope. @param scope Authorized owner scope. @param match New draft snapshot. @param actorId Authenticated actor. @returns Persisted draft match. @throws {PurchasingFailure} When scope or identity conflicts. */
  saveDraft(scope: TaxReportingScope, match: SupplierInvoiceMatch, actorId: string): Promise<SupplierInvoiceMatch>;
}
/** Atomic persistence boundary for confirming an invoice match and recognizing its VAT fact. */
export interface SupplierInvoiceMatchCommitPort {
  /** Persists the confirmed match and VAT fact in a single transaction. @param match Confirmed match snapshot. @param fact Historical IVA fact. @param actorId Authenticated actor. @param idempotencyKey Stable command identity. @returns Completion only after both snapshots are durable. @throws {PurchasingFailure} When scope, concurrency, or idempotency constraints fail. */
  commitInvoiceMatch(match: SupplierInvoiceMatch, fact: TaxReportingFact, actorId: string, idempotencyKey: string): Promise<void>;
}
export interface FiscalDocumentReader {
  /** @param scope Authorized owner scope. @param id Fiscal-document identifier. @returns The document, or `null` when absent. @throws {PurchasingFailure} When scoped persistence is unavailable. */
  find(scope: TaxReportingScope, id: FiscalDocumentId): Promise<FiscalDocument | null>;
}

export interface PurchaseFulfillmentReader {
  /** @param orderLineId Order line to total. @returns Quantity already received. */
  receivedAmount(orderLineId: PurchaseOrderLineId): Promise<ExactDecimal>;
  /** @param receiptLineId Receipt line to total. @returns Quantity already returned. */
  returnedAmount(receiptLineId: PurchaseReturn["lines"][number]["receiptLineId"]): Promise<ExactDecimal>;
}

export interface PurchasingCommitPort {
  /**
   * Persists the receipt state change and its event in one durable transaction.
   * Implementations must scope both records to the receipt company and make the
   * event operation key unique, so a delivery retry cannot create a second event.
   * @param receipt Resulting receipt.
   * @param event Receipt event whose `operationKey` is the idempotency key.
   * @returns Completion only after both records are durable, or rejection with neither persisted.
   */
  commitReceipt(receipt: GoodsReceipt, event: PurchaseReceiptConfirmed | PurchaseReceiptReversed): Promise<void>;
  /**
   * Persists a return and its event in one company-scoped durable transaction.
   * @param purchaseReturn Resulting return.
   * @param event Return event whose `operationKey` is the idempotency key.
   * @returns Completion only after both records are durable, or rejection with neither persisted.
   */
  commitReturn(purchaseReturn: PurchaseReturn, event: PurchaseReturnConfirmed): Promise<void>;
}

/** Creates a draft match that links received fiscal lines with purchasing evidence. */
export class SaveSupplierInvoiceMatchDraft {
  /** Creates the draft command. @param matches Draft writer. @param fiscal Scoped fiscal-document reader. @param suppliers Supplier reader. @returns The configured use case. */
  constructor(
    private readonly matches: SupplierInvoiceMatchWriter,
    private readonly fiscal: FiscalDocumentReader,
    private readonly suppliers: SupplierIdentityReader,
  ) {}

  /** Saves a draft after checking that its parties and source document share the authorized company. @param input Scope, draft aggregate, and actor. @returns Persisted draft. @throws {PurchasingFailure} When the source is not a received purchase invoice or scope differs. */
  async execute(input: { readonly scope: TaxReportingScope; readonly match: SupplierInvoiceMatch; readonly actorId: string }): Promise<SupplierInvoiceMatch> {
    const { scope, match } = input;
    if (!input.actorId.trim() || match.status !== "draft" || match.companyId !== scope.companyId) {
      throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "A draft match requires an authenticated actor and the authorized company scope.");
    }
    const supplier = await this.suppliers.findForInvoiceMatch(scope, match.supplierId, input.actorId.trim());
    const document = await this.fiscal.find(scope, match.fiscalDocumentId);
    if (!document || document.status !== "received" || document.direction !== "received" || document.type !== "invoice" || document.companyId !== match.companyId
      || !supplier || supplier.companyId !== match.companyId) {
      throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "A draft match requires a received fiscal invoice and supplier from the same company.");
    }
    supplier.assertActive();
    assertAllocationsCoverFiscalDocument(match, document);
    return this.matches.saveDraft(scope, match, input.actorId.trim());
  }
}

export interface PurchasingInventoryPort {
  /** @param event Confirmed receipt event. @returns Created inventory operation identifier. */
  postReceipt(event: PurchaseReceiptConfirmed): Promise<{ readonly operationId: string }>;
  /** @param event Reversed receipt event. @returns Created inventory operation identifier. */
  reverseReceipt(event: PurchaseReceiptReversed): Promise<{ readonly operationId: string }>;
  /** @param event Confirmed return event. @returns Created inventory operation identifier. */
  postReturn(event: PurchaseReturnConfirmed): Promise<{ readonly operationId: string }>;
}

export class ConfirmGoodsReceipt {
  /**
   * Creates the receipt-confirmation service.
   * @param receipts Receipt repository.
   * @param suppliers Supplier repository.
   * @param orders Purchase-order repository.
   * @param fulfillment Reader for already fulfilled quantities.
   * @param commit Atomic persistence boundary.
   */
  constructor(
    private readonly receipts: GoodsReceiptRepository,
    private readonly suppliers: SupplierRepository,
    private readonly orders: PurchaseOrderRepository,
    private readonly fulfillment: PurchaseFulfillmentReader,
    private readonly commit: PurchasingCommitPort,
  ) {}

  /**
   * Confirms a valid goods receipt and commits its domain event.
   * @param id Receipt identifier.
   * @param occurredAt ISO instant assigned to the confirmation.
   * @returns The confirmed receipt.
   * @throws {PurchasingFailure} When related entities or quantities are invalid.
   */
  async execute(id: GoodsReceiptId, occurredAt: string): Promise<GoodsReceipt> {
    const receipt = await requireReceipt(this.receipts, id);
    const supplier = await this.suppliers.find(receipt.supplierId);
    if (!supplier) throw new PurchasingFailure("PURCHASE_NOT_FOUND", "Supplier does not exist.");
    supplier.assertActive();
    if (supplier.companyId !== receipt.companyId) {
      throw new PurchasingFailure(
        "PURCHASE_RECEIPT_INVALID",
        "Receipt and supplier belong to different companies.",
      );
    }
    if (receipt.orderId !== null) {
      const order = await this.orders.find(receipt.orderId);
      if (!order) {
        throw new PurchasingFailure("PURCHASE_NOT_FOUND", "Purchase order does not exist.");
      }
      await validateReceiptAgainstOrder(receipt, order, this.fulfillment);
    } else if (receipt.lines.some((line) => line.orderLineId !== null)) {
      throw new PurchasingFailure(
        "PURCHASE_RECEIPT_INVALID",
        "Unplanned receipt cannot reference order lines.",
      );
    }
    const confirmed = receipt.confirm(occurredAt);
    await this.commit.commitReceipt(confirmed.receipt, confirmed.event);
    return confirmed.receipt;
  }
}

export class ReverseGoodsReceipt {
  /**
   * Creates the receipt-reversal service.
   * @param receipts Receipt repository.
   * @param commit Atomic persistence boundary.
   */
  constructor(
    private readonly receipts: GoodsReceiptRepository,
    private readonly commit: PurchasingCommitPort,
  ) {}

  /**
   * Reverses a confirmed receipt and commits its domain event.
   * @param id Receipt identifier.
   * @param occurredAt ISO instant assigned to the reversal.
   * @returns The reversed receipt.
   * @throws {PurchasingFailure} When the receipt is absent or cannot be reversed.
   */
  async execute(id: GoodsReceiptId, occurredAt: string): Promise<GoodsReceipt> {
    const receipt = await requireReceipt(this.receipts, id);
    const reversed = receipt.reverse(occurredAt);
    await this.commit.commitReceipt(reversed.receipt, reversed.event);
    return reversed.receipt;
  }
}

export class ConfirmPurchaseReturn {
  /**
   * Creates the purchase-return confirmation service.
   * @param returns Purchase-return repository.
   * @param receipts Receipt repository.
   * @param fulfillment Reader for already returned quantities.
   * @param commit Atomic persistence boundary.
   */
  constructor(
    private readonly returns: PurchaseReturnRepository,
    private readonly receipts: GoodsReceiptRepository,
    private readonly fulfillment: PurchaseFulfillmentReader,
    private readonly commit: PurchasingCommitPort,
  ) {}
  /**
   * Confirms a purchase return after validating it against its receipt.
   * @param id Purchase-return identifier.
   * @param occurredAt ISO instant assigned to the confirmation.
   * @returns The confirmed return.
   * @throws {PurchasingFailure} When references or quantities are invalid.
   */
  async execute(id: PurchaseReturnId, occurredAt: string): Promise<PurchaseReturn> {
    const purchaseReturn = await this.returns.find(id);
    if (!purchaseReturn) {
      throw new PurchasingFailure("PURCHASE_NOT_FOUND", "Purchase return does not exist.");
    }
    const receipt = await requireReceipt(this.receipts, purchaseReturn.receiptId);
    if (
      receipt.status !== "confirmed" ||
      receipt.companyId !== purchaseReturn.companyId ||
      receipt.supplierId !== purchaseReturn.supplierId
    ) {
      throw new PurchasingFailure(
        "PURCHASE_RETURN_INVALID",
        "Purchase return does not match a confirmed receipt.",
      );
    }
    for (const line of purchaseReturn.lines) {
      const receiptLine = receipt.lines.find((candidate) => candidate.id === line.receiptLineId);
      if (
        !receiptLine ||
        receiptLine.productId !== line.productId ||
        receiptLine.quantity.unit !== line.quantity.unit ||
        receiptLine.inventoryLocationReference !== line.inventoryLocationReference ||
        receiptLine.lotReference !== line.lotReference
      ) {
        throw new PurchasingFailure(
          "PURCHASE_RETURN_INVALID",
          "Return line does not match its receipt line.",
        );
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
  /**
   * Creates the supplier-invoice matching service.
   * @param matches Invoice-match repository.
   * @param fiscal Fiscal-document reader.
   * @param suppliers Supplier reader used to validate the fiscal counterparty.
   * @param fiscalProfiles Reader for the classification version effective on the supplier invoice date.
   * @param commit Atomic match and VAT-fact persistence boundary.
   * @returns The configured confirmation use case.
   */
  constructor(
    private readonly matches: SupplierInvoiceMatchRepository,
    private readonly fiscal: FiscalDocumentReader,
    private readonly suppliers: SupplierIdentityReader,
    private readonly fiscalProfiles: SupplierFiscalProfileReader,
    private readonly commit: SupplierInvoiceMatchCommitPort,
  ) {}

  /**
   * Confirms a match against a received invoice from the same company.
   * @param input Authorized company scope, match identity, reviewed fact metadata, actor, and confirmation time.
   * @returns The confirmed match.
   * @throws {PurchasingFailure} When the match or fiscal document is invalid.
   */
  async execute(input: {
    readonly scope: TaxReportingScope;
    readonly id: SupplierInvoiceMatchId;
    readonly occurredAt: string;
    readonly actorId: string;
    readonly factMetadata: FiscalDocumentFactMetadata;
  }): Promise<SupplierInvoiceMatch> {
    const actorId = input.actorId.trim();
    if (!actorId) throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Invoice match confirmation requires an authenticated actor.");
    const match = await this.matches.find(input.scope, input.id, actorId);
    if (!match) {
      throw new PurchasingFailure("PURCHASE_NOT_FOUND", "Supplier invoice match does not exist.");
    }
    if (match.companyId !== input.scope.companyId) {
      throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Invoice match is outside the authorized company scope.");
    }
    const document = await this.fiscal.find(input.scope, match.fiscalDocumentId);
    if (
      !document ||
      document.companyId !== match.companyId ||
      document.direction !== "received" ||
      document.status !== "received" ||
      document.type !== "invoice"
    ) {
      throw new PurchasingFailure(
        "PURCHASE_INVOICE_MATCH_INVALID",
        "Supplier invoice match requires a received fiscal invoice from the same company.",
      );
    }
    assertAllocationsCoverFiscalDocument(match, document);
    const supplier = await this.suppliers.findForInvoiceMatch(input.scope, match.supplierId, actorId);
    if (!supplier || supplier.companyId !== match.companyId || (supplier.taxIdentifier !== null && document.issuer.taxIdentifier !== null && supplier.taxIdentifier !== document.issuer.taxIdentifier.toUpperCase().replace(/\s+/g, ""))) {
      throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Received fiscal invoice does not match the selected supplier identity.");
    }
    supplier.assertActive();
    const counterpartyFiscalProfile = await this.fiscalProfiles.getEffectiveProfile(input.scope, supplier.id, document.issueDate!, actorId);
    const fact = fiscalDocumentTaxFact(document, input.scope, { ...input.factMetadata, counterpartyFiscalProfile });
    if (fact.direction !== "purchase") throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Received supplier invoice produced a non-purchase VAT fact.");
    const confirmed = match.confirm(input.occurredAt);
    const idempotencyKey = `supplier-invoice-match:${confirmed.id}:v${confirmed.version}`;
    if (idempotencyKey.length > 128) throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Invoice match idempotency identity is too long.");
    await this.commit.commitInvoiceMatch(confirmed, fact, actorId, idempotencyKey);
    return confirmed;
  }
}

export class PostPurchasingEventToInventory {
  /** @param inventory Inventory integration port. */
  constructor(private readonly inventory: PurchasingInventoryPort) {}

  /**
   * Routes a purchasing stock event to the matching inventory operation.
   * @param event Confirmed receipt, reversed receipt, or confirmed return event.
   * @returns The identifier assigned by inventory.
   */
  execute(
    event: PurchaseReceiptConfirmed | PurchaseReceiptReversed | PurchaseReturnConfirmed,
  ): Promise<{ readonly operationId: string }> {
    if (event.type === "purchasing.receipt_confirmed") return this.inventory.postReceipt(event);
    if (event.type === "purchasing.receipt_reversed") return this.inventory.reverseReceipt(event);
    return this.inventory.postReturn(event);
  }
}

async function validateReceiptAgainstOrder(
  receipt: GoodsReceipt,
  order: PurchaseOrder,
  fulfillment: PurchaseFulfillmentReader,
): Promise<void> {
  if (
    order.status !== "approved" ||
    order.companyId !== receipt.companyId ||
    order.supplierId !== receipt.supplierId
  ) {
    throw new PurchasingFailure(
      "PURCHASE_RECEIPT_INVALID",
      "Receipt requires an approved order from the same company and supplier.",
    );
  }
  for (const line of receipt.lines) {
    if (line.orderLineId === null) {
      throw new PurchasingFailure(
        "PURCHASE_RECEIPT_INVALID",
        "Ordered receipt line requires an order line reference.",
      );
    }
    const ordered = order.lines.find((candidate) => candidate.id === line.orderLineId);
    if (
      !ordered ||
      ordered.kind !== "stock" ||
      ordered.productId !== line.productId ||
      ordered.orderedQuantity.unit !== line.quantity.unit
    ) {
      throw new PurchasingFailure(
        "PURCHASE_RECEIPT_INVALID",
        "Receipt line does not match an inventory-bearing order line.",
      );
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

function assertAllocationsCoverFiscalDocument(match: SupplierInvoiceMatch, document: FiscalDocument): void {
  if (!sameCurrency(match.documentCurrency, document.documentCurrency)
    || !sameCurrency(match.allocatedNetAmount.currency, document.totals.netAmount.currency)
    || match.allocatedNetAmount.minorAmount !== document.totals.netAmount.minorAmount) {
    throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Invoice allocations do not reconcile to the fiscal document currency and net amount.");
  }
  const totals = new Map<string, bigint>();
  const quantities = new Map<string, ExactDecimal>();
  const units = new Map<string, string>();
  for (const allocation of match.allocations) {
    const line = document.lines.find((candidate) => candidate.id === allocation.fiscalLineId);
    if (!line || !sameCurrency(allocation.netAmount.currency, line.netAmount.currency)) {
      throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Invoice allocation references an absent fiscal line or another currency.");
    }
    totals.set(line.id, (totals.get(line.id) ?? 0n) + allocation.netAmount.minorAmount);
    const unit = units.get(line.id);
    if (unit !== undefined && unit !== allocation.invoicedQuantity.unit) {
      throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Allocations for one fiscal line must use a consistent unit.");
    }
    units.set(line.id, allocation.invoicedQuantity.unit);
    quantities.set(line.id, addDecimal(quantities.get(line.id) ?? exactDecimal("0"), allocation.invoicedQuantity.amount));
  }
  if (document.lines.length !== totals.size || document.lines.some((line) =>
    totals.get(line.id) !== line.netAmount.minorAmount || compareDecimal(quantities.get(line.id) ?? exactDecimal("0"), line.quantity) !== 0
  )) {
    throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Invoice allocations must reconcile each fiscal line quantity and net amount exactly.");
  }
}
