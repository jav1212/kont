import {
  FiscalDocument,
  fiscalDocumentId,
  fiscalDocumentLineId,
  type PersistFiscalDocumentResult,
  type FiscalDocumentRepository,
  type FiscalPersistenceScope,
  type FiscalTaxDetermination,
  type FiscalTaxSummary,
} from "@kontave/fiscal/domain";
import {
  addMoney,
  moneyFromMinor,
  type Money,
} from "@kontave/monetary/domain";
import { fiscalInstant } from "@kontave/fiscal/domain";
import { SalesFailure, type Customer, type SalesOrder } from "../domain";
import type { CustomerRepository, SalesOrderRepository } from "./index";

/** Company-owned legal identity used as the issuer snapshot on an invoice draft. */
export interface SalesIssuerFiscalIdentity {
  readonly companyId: FiscalPersistenceScope["companyId"];
  readonly jurisdiction: string;
  readonly taxIdentifier: string;
  readonly legalName: string;
  readonly fiscalAddress: string | null;
}

/** Server-side source of the company's current fiscal identity. */
export interface SalesIssuerFiscalIdentityReader {
  /**
   * Finds the issuer identity inside an already authorized company scope.
   * @param companyId - Company whose legal identity will be snapshotted.
   * @returns The current legal identity, or `null` when fiscal identity is incomplete.
   */
  find(companyId: FiscalPersistenceScope["companyId"]): Promise<SalesIssuerFiscalIdentity | null>;
}

/** Tax resolutions required for every service line before a fiscal draft can be saved. */
export interface ServiceSaleFiscalTaxResolution {
  readonly jurisdiction: string;
  readonly unitCode: string;
  readonly determinations: readonly FiscalTaxDetermination[];
}

/** Server-side resolver that applies effective company and service tax rules. */
export interface ServiceSaleFiscalTaxResolver {
  /**
   * Resolves all fiscal tax determinations for one persisted service line.
   * @param order - Approved source order containing the line.
   * @param lineIndex - Index of the line in the immutable order snapshot.
   * @returns The jurisdiction, fiscal unit code, and line-level tax decisions.
   */
  resolveLine(order: SalesOrder, lineIndex: number): Promise<ServiceSaleFiscalTaxResolution>;
}

/** Input needed to prepare a durable draft for one approved service order. */
export interface PrepareServiceSaleFiscalDocumentInput {
  readonly scope: FiscalPersistenceScope;
  readonly orderId: SalesOrder["id"];
  readonly actorId: string;
  readonly occurredAt: string;
}

/** Prepares a versioned fiscal invoice draft from an approved service order. */
export class PrepareServiceSaleFiscalDocument {
  /**
   * Creates the service-sale fiscal preparation use case.
   * @param orders - Repository of persisted commercial orders.
   * @param customers - Repository of customer identity snapshots.
   * @param issuerIdentities - Server-side company fiscal identity reader.
   * @param taxes - Resolver of effective fiscal rules for each service line.
   * @param documents - Durable repository for fiscal snapshots and preparation events.
   */
  constructor(
    private readonly orders: SalesOrderRepository,
    private readonly customers: CustomerRepository,
    private readonly issuerIdentities: SalesIssuerFiscalIdentityReader,
    private readonly taxes: ServiceSaleFiscalTaxResolver,
    private readonly documents: FiscalDocumentRepository,
  ) {}

  /**
   * Builds and persists an invoice draft while preserving the exact commercial and tax inputs.
   *
   * The order, company identity, and tax decisions are loaded through server-owned ports.
   * Only approved orders composed entirely of services are accepted by this first circuit.
   *
   * @param input - Authorized scope, persisted order identity, actor, and command time.
   * @returns The saved fiscal document and whether an equivalent idempotent request replayed.
   * @throws {SalesFailure} When commercial data, issuer identity, or tax classifications are invalid.
   * @throws {Error} When the fiscal aggregate or persistence invariants fail.
   */
  async execute(input: PrepareServiceSaleFiscalDocumentInput): Promise<PersistFiscalDocumentResult> {
    const order = await this.orders.find(input.orderId);
    if (!order) throw new SalesFailure("SALES_NOT_FOUND", "Sales order does not exist.");
    if (order.companyId !== input.scope.companyId || (order.status !== "approved" && order.status !== "closed") || order.lines.some((line) => line.kind !== "service")) {
      throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "Fiscal preparation requires an approved or closed service-only order in the requested company.");
    }
    if (!input.actorId.trim()) {
      throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "Fiscal preparation actor or occurrence time is invalid.");
    }
    fiscalInstant(input.occurredAt);

    const stableDocumentIdentity = `sales-order:${order.companyId}:${order.id}`;
    if (stableDocumentIdentity.length > 128) {
      throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "Sales order identity is too long to derive a fiscal document id.");
    }
    const documentId = fiscalDocumentId(stableDocumentIdentity);
    const existing = await this.documents.find(input.scope, documentId);
    if (existing !== null) return { document: existing, replayed: true };

    const customer = await this.customers.find(order.customerId);
    validateCustomer(customer, order);
    const issuer = await this.issuerIdentities.find(order.companyId);
    if (!issuer || issuer.companyId !== order.companyId || !issuer.taxIdentifier.trim() || !issuer.legalName.trim()) {
      throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "Company fiscal identity is incomplete or outside the order company.");
    }

    const lines = [];
    const taxDeterminations: FiscalTaxDetermination[] = [];
    for (const [lineIndex, orderLine] of order.lines.entries()) {
      const resolution = await this.taxes.resolveLine(order, lineIndex);
      const lineId = fiscalDocumentLineId(orderLine.id);
      if (!resolution.unitCode.trim() || !resolution.determinations.length || resolution.jurisdiction.toUpperCase() !== issuer.jurisdiction.toUpperCase()) {
        throw new SalesFailure("SALES_FISCAL_TAX_UNRESOLVED", "A service line has no complete tax or fiscal-unit determination.");
      }
      if (resolution.determinations.some((determination) => determination.source.kind !== "line" || determination.source.lineId !== lineId)) {
        throw new SalesFailure("SALES_FISCAL_TAX_UNRESOLVED", "Service tax decisions must refer to their own order line.");
      }
      taxDeterminations.push(...resolution.determinations);
      lines.push({
        id: lineId,
        commercialReference: null,
        description: orderLine.description,
        quantity: orderLine.orderedQuantity.amount,
        unitCode: resolution.unitCode,
        unitPrice: orderLine.unitPrice,
        grossAmount: orderLine.grossAmount,
        adjustments: orderLine.adjustments.map((adjustment) => ({
          kind: adjustment.kind,
          scope: "line" as const,
          calculation: { kind: "fixed_amount" as const },
          reason: adjustment.reason,
          amount: adjustment.amount,
        })),
        netAmount: orderLine.netAmount,
      });
    }

    const currency = order.transactionCurrency;
    const zero = moneyFromMinor(0n, currency);
    const sum = (amounts: readonly Money[]) => amounts.reduce((total, amount) => addMoney(total, amount), zero);
    const grossAmount = sum(lines.map((line) => line.grossAmount));
    const discountTotal = sum(lines.flatMap((line) => line.adjustments.filter((item) => item.kind === "discount").map((item) => item.amount)));
    const surchargeTotal = sum(lines.flatMap((line) => line.adjustments.filter((item) => item.kind === "surcharge").map((item) => item.amount)));
    const netAmount = sum(lines.map((line) => line.netAmount));
    const taxTotal = sum(taxDeterminations.map((determination) => determination.amount));
    const addedTax = sum(taxDeterminations.filter((determination) => determination.calculationMode === "tax_exclusive").map((determination) => determination.amount));
    const payableAmount = addMoney(netAmount, addedTax);
    const taxSummaries = summarizeTaxDeterminations(taxDeterminations);
    const document = new FiscalDocument({
      id: documentId,
      companyId: order.companyId,
      type: "invoice",
      direction: "issued",
      jurisdiction: issuer.jurisdiction,
      documentCurrency: currency,
      issuer: { taxIdentifier: issuer.taxIdentifier, legalName: issuer.legalName, fiscalAddress: issuer.fiscalAddress, additionalInformation: [] },
      recipient: { taxIdentifier: requiredCustomerTaxIdentifier(customer), legalName: customer.legalName, fiscalAddress: customer.fiscalAddress, additionalInformation: [] },
      affectedDocument: null,
      lines,
      documentAdjustments: [],
      taxDeterminations,
      payments: [],
      totals: {
        grossAmount, discountTotal, surchargeTotal, netAmount, taxSummaries, taxTotal,
        payableAmount, recognizedPayments: zero, changeAmount: zero, outstandingAmount: payableAmount,
      },
      status: "draft",
      number: null,
      issuedAt: null,
      issueDate: null,
      issuanceEvidence: null,
    });

    return this.documents.persist({
      scope: input.scope,
      source: { kind: "sales_order", id: order.id },
      document,
      idempotencyKey: `prepare_sales_order:${order.id}`,
      actorId: input.actorId,
      occurredAt: input.occurredAt,
    });
  }
}

function validateCustomer(customer: Customer | null, order: SalesOrder): asserts customer is Customer {
  if (!customer) throw new SalesFailure("SALES_NOT_FOUND", "Sales customer does not exist.");
  customer.assertActive();
  if (customer.companyId !== order.companyId) {
    throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "Customer and sales order belong to different companies.");
  }
}

function requiredCustomerTaxIdentifier(customer: Customer): string {
  if (!customer.taxIdentifier?.trim()) {
    throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "Customer fiscal identity is incomplete.");
  }
  return customer.taxIdentifier;
}

function summarizeTaxDeterminations(
  determinations: readonly FiscalTaxDetermination[],
): FiscalTaxSummary[] {
  const summaries = new Map<string, FiscalTaxSummary>();
  for (const determination of determinations) {
    const key = `${determination.taxCode}|${determination.category}|${determination.calculationMode}|${determination.rate}`;
    const current = summaries.get(key);
    summaries.set(key, current === undefined
      ? { taxCode: determination.taxCode, category: determination.category, calculationMode: determination.calculationMode, rate: determination.rate, taxableBase: determination.taxableBase, amount: determination.amount }
      : { ...current, taxableBase: addMoney(current.taxableBase, determination.taxableBase), amount: addMoney(current.amount, determination.amount) });
  }
  return [...summaries.values()];
}
