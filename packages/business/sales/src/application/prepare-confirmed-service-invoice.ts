import {
  FiscalDocument,
  FiscalFailure,
  fiscalDocumentId,
  fiscalDocumentLineId,
  fiscalInstant,
  fiscalDate,
  fiscalTaxDetermination,
  type FiscalDocumentRepository,
  type FiscalPersistenceScope,
  type FiscalTaxDetermination,
  type FiscalTaxSummary,
  type PersistFiscalDocumentResult,
} from "@kontave/fiscal/domain";
import {
  addMoney,
  currency,
  moneyFromMinor,
  sameCurrency,
  subtractMoney,
  type Money,
  type ExactDecimal,
} from "@kontave/monetary/domain";
import { SalesFailure } from "../domain";

export interface ConfirmedServiceInvoiceLine {
  readonly id: string;
  readonly productId: string | null;
  readonly serviceTaxCode: string | null;
  readonly description: string;
  readonly quantity: ExactDecimal;
  readonly grossAmount: Money;
  readonly unitPrice: Money;
  readonly discountAmount: Money;
  readonly surchargeAmount: Money;
  readonly netAmount: Money;
}

/** Immutable commercial invoice data needed to prepare its fiscal snapshot. */
export interface ConfirmedServiceInvoice {
  readonly id: string;
  readonly companyId: FiscalPersistenceScope["companyId"];
  readonly customerId: string;
  readonly invoiceNumber: string;
  readonly documentType: "venta" | "nota_entrega";
  readonly status: "borrador" | "confirmada" | "anulada";
  readonly invoiceDate: string;
  readonly currencyCode: string;
  readonly subtotal: Money;
  readonly vatAmount: Money;
  readonly total: Money;
  readonly documentDiscount: Money;
  readonly documentSurcharge: Money;
  readonly financialTaxAmount: Money;
  readonly customer: {
    readonly legalName: string;
    readonly taxIdentifier: string | null;
    readonly fiscalAddress: string | null;
  } | null;
  readonly lines: readonly ConfirmedServiceInvoiceLine[];
}

/** Company fiscal identity read from the server-side company record. */
export interface SalesFiscalIssuerIdentity {
  readonly companyId: FiscalPersistenceScope["companyId"];
  readonly jurisdiction: string;
  readonly taxIdentifier: string;
  readonly legalName: string;
  readonly fiscalAddress: string | null;
}

/** Read-only commercial source for a confirmed service invoice. */
export interface ConfirmedServiceInvoiceReader {
  /**
   * Finds a sales invoice and its persisted line/customer snapshots.
   * @param scope - Tenant, organization, and company requested by the authorized API.
   * @param invoiceId - Stable source invoice identity.
   * @returns The invoice or `null` when it is outside the scope or absent.
   */
  find(scope: FiscalPersistenceScope, invoiceId: string): Promise<ConfirmedServiceInvoice | null>;
}

/** Reads legal issuer identity from a company-owned server source. */
export interface SalesFiscalIssuerReader {
  /**
   * Reads the issuer identity for a company in the authorized fiscal scope.
   * @param scope - Tenant, organization, and company authorized by the API.
   * @returns Current legal identity, or `null` when the source is incomplete.
   */
  find(scope: FiscalPersistenceScope): Promise<SalesFiscalIssuerIdentity | null>;
}

/** Effective unit and versioned tax decisions for one persisted service line. */
export interface ConfirmedServiceInvoiceTaxResolver {
  /**
   * Resolves an invoice line using its persisted service classification and date.
   * @param invoice - Confirmed invoice source and immutable lines.
   * @param lineIndex - Index of the line being resolved.
   * @returns Fiscal unit and tax snapshot for this line.
   */
  resolveLine(invoice: ConfirmedServiceInvoice, lineIndex: number): Promise<{
    readonly unitCode: string;
    readonly determinations: readonly FiscalTaxDetermination[];
  }>;
}

/** Prepares an immutable fiscal draft from a confirmed, service-only legacy invoice. */
export class PrepareConfirmedServiceInvoiceFiscalDocument {
  /**
   * Creates a service invoice preparation use case.
   * @param invoices - Read-only source of persisted commercial invoices.
   * @param issuers - Company legal identity reader.
   * @param taxes - Resolver for effective service tax classification and rules.
   * @param documents - Durable fiscal snapshot repository.
   * @returns No value; the use case is available on the constructed instance.
   * @throws No expected failure during construction.
   */
  constructor(
    private readonly invoices: ConfirmedServiceInvoiceReader,
    private readonly issuers: SalesFiscalIssuerReader,
    private readonly taxes: ConfirmedServiceInvoiceTaxResolver,
    private readonly documents: FiscalDocumentRepository,
  ) {}

  /**
   * Creates a draft fiscal snapshot without issuing an external fiscal document.
   *
   * The command accepts only confirmed service invoices. Persisted tax classification,
   * legal issuer data, and fiscal rules are resolved on the server and snapshotted.
   * Totals must reconcile with the commercial invoice before persistence.
   *
   * @param input - Authorized scope, invoice identity, actor, and command time.
   * @returns The saved fiscal snapshot and whether an equivalent command replayed.
   * @throws {SalesFailure} When source, identity, classification, or totals are invalid.
   * @throws {FiscalFailure} When a field snapshotted in the confirmed source or issuer changed after a draft was persisted.
   */
  async execute(input: {
    readonly scope: FiscalPersistenceScope;
    readonly invoiceId: string;
    readonly actorId: string;
    readonly occurredAt: string;
  }): Promise<PersistFiscalDocumentResult> {
    const identity = `legacy-sales-invoice:${input.scope.companyId}:${input.invoiceId}`;
    if (identity.length > 128 || !input.actorId.trim()) {
      throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "Fiscal preparation identity is invalid.");
    }
    fiscalInstant(input.occurredAt);
    const invoice = await this.invoices.find(input.scope, input.invoiceId);
    if (!invoice) throw new SalesFailure("SALES_NOT_FOUND", "La factura de venta no existe en la empresa autorizada.");
    if (invoice.companyId !== input.scope.companyId) {
      throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "La factura de venta no pertenece a la empresa autorizada.");
    }
    let operationDate: ReturnType<typeof fiscalDate>;
    try {
      operationDate = fiscalDate(invoice.invoiceDate);
    } catch (cause) {
      throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "La fecha de operación de la factura confirmada es inválida.", { cause });
    }
    if (invoice.currencyCode.trim().toUpperCase() !== "VES") {
      throw new SalesFailure("SALES_CURRENCY_MISMATCH", "Este flujo de borrador fiscal solo admite facturas expresadas en VES.");
    }
    assertInvoiceMoneyCurrency(invoice);
    if (invoice.financialTaxAmount.minorAmount !== 0n) {
      throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "Este flujo de borrador fiscal no incluye impuesto financiero cobrado al pago.");
    }
    if (invoice.documentDiscount.minorAmount !== 0n || invoice.documentSurcharge.minorAmount !== 0n) {
      throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "Este flujo de borrador fiscal requiere asignar los ajustes comerciales a las líneas de servicio.");
    }
    const issuer = await this.issuers.find(input.scope);
    const id = fiscalDocumentId(identity);
    const prior = await this.documents.find(input.scope, id);
    if (prior !== null) {
      if (!isEligibleCommercialSource(invoice) || !matchesPreparedCommercialSource(prior, invoice, operationDate) || !matchesPreparedIssuer(prior, issuer)) {
        throw new FiscalFailure("FISCAL_DOCUMENT_SOURCE_CONFLICT", "La fuente comercial o la identidad fiscal cambió después de preparar el borrador fiscal.");
      }
      return { document: prior, replayed: true };
    }
    if (!isEligibleCommercialSource(invoice)) {
      throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "El borrador fiscal requiere una factura de servicios confirmada y con cada línea clasificada.");
    }
    if (!issuer || issuer.companyId !== invoice.companyId || !issuer.taxIdentifier.trim() || !issuer.legalName.trim() || !issuer.fiscalAddress?.trim()) {
      throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "La identidad fiscal de la empresa debe incluir RIF, razón social y domicilio fiscal.");
    }
    if (!invoice.customer?.legalName.trim() || !invoice.customer.taxIdentifier?.trim() || !invoice.customer.fiscalAddress?.trim()) {
      throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "La identidad fiscal del cliente debe incluir RIF, razón social y domicilio fiscal.");
    }
    const lines = [];
    const determinations: FiscalTaxDetermination[] = [];
    for (const [index, sourceLine] of invoice.lines.entries()) {
      const resolved = await this.taxes.resolveLine(invoice, index);
      const lineId = fiscalDocumentLineId(sourceLine.id);
      if (!resolved.unitCode.trim() || resolved.determinations.length === 0
        || resolved.determinations.some((item) => item.source.kind !== "line" || item.source.lineId !== lineId
          || item.jurisdiction.toUpperCase() !== issuer.jurisdiction.toUpperCase()
          || (item.operationDate !== undefined && item.operationDate !== operationDate))) {
        throw new SalesFailure("SALES_FISCAL_TAX_UNRESOLVED", "Una línea de servicio no tiene una determinación fiscal completa y vinculada a su línea.");
      }
      determinations.push(...resolved.determinations.map((item) => fiscalTaxDetermination({ ...item, operationDate })));
      const adjustments = [];
      if (sourceLine.discountAmount.minorAmount > 0n) adjustments.push({ kind: "discount" as const, scope: "line" as const, calculation: { kind: "fixed_amount" as const }, reason: null, amount: sourceLine.discountAmount });
      if (sourceLine.surchargeAmount.minorAmount > 0n) adjustments.push({ kind: "surcharge" as const, scope: "line" as const, calculation: { kind: "fixed_amount" as const }, reason: null, amount: sourceLine.surchargeAmount });
      lines.push({
        id: lineId, commercialReference: sourceLine.serviceTaxCode,
        description: sourceLine.description, quantity: sourceLine.quantity,
        unitCode: resolved.unitCode, unitPrice: sourceLine.unitPrice,
        grossAmount: sourceLine.grossAmount, adjustments, netAmount: sourceLine.netAmount,
      });
    }

    const currencyDefinition = currency(invoice.currencyCode, 2);
    const zero = moneyFromMinor(0n, currencyDefinition);
    const sum = (values: readonly Money[]) => values.reduce((total, value) => {
      if (!sameCurrency(total.currency, value.currency)) throw new SalesFailure("SALES_CURRENCY_MISMATCH", "Invoice fiscal amounts use different currencies.");
      return addMoney(total, value);
    }, zero);
    const grossAmount = sum(lines.map((line) => line.grossAmount));
    const lineDiscount = sum(lines.flatMap((line) => line.adjustments.filter((adjustment) => adjustment.kind === "discount").map((adjustment) => adjustment.amount)));
    const lineSurcharge = sum(lines.flatMap((line) => line.adjustments.filter((adjustment) => adjustment.kind === "surcharge").map((adjustment) => adjustment.amount)));
    const discountTotal = addMoney(lineDiscount, invoice.documentDiscount);
    const surchargeTotal = addMoney(lineSurcharge, invoice.documentSurcharge);
    const lineNetAmount = sum(lines.map((line) => line.netAmount));
    const netAmount = addMoney(subtractMoney(lineNetAmount, invoice.documentDiscount), invoice.documentSurcharge);
    const taxTotal = sum(determinations.map((item) => item.amount));
    const addedTax = sum(determinations.filter((item) => item.calculationMode === "tax_exclusive").map((item) => item.amount));
    const payableAmount = addMoney(netAmount, addedTax);
    if (!sameAmount(netAmount, invoice.subtotal) || !sameAmount(taxTotal, invoice.vatAmount) || !sameAmount(payableAmount, invoice.total)) {
      throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "Los impuestos resueltos no concilian con los totales de la factura confirmada.");
    }

    const document = new FiscalDocument({
      id, companyId: invoice.companyId, type: "invoice", direction: "issued",
      jurisdiction: issuer.jurisdiction, documentCurrency: currencyDefinition,
      issuer: { taxIdentifier: issuer.taxIdentifier, legalName: issuer.legalName, fiscalAddress: issuer.fiscalAddress, additionalInformation: [] },
      recipient: { taxIdentifier: invoice.customer.taxIdentifier, legalName: invoice.customer.legalName, fiscalAddress: invoice.customer.fiscalAddress, additionalInformation: [] },
      affectedDocument: null,
      lines,
      documentAdjustments: [
        ...(invoice.documentDiscount.minorAmount > 0n ? [{ kind: "discount" as const, scope: "document" as const, calculation: { kind: "fixed_amount" as const }, reason: null, amount: invoice.documentDiscount }] : []),
        ...(invoice.documentSurcharge.minorAmount > 0n ? [{ kind: "surcharge" as const, scope: "document" as const, calculation: { kind: "fixed_amount" as const }, reason: null, amount: invoice.documentSurcharge }] : []),
      ],
      taxDeterminations: determinations, payments: [],
      totals: {
        grossAmount, discountTotal, surchargeTotal, netAmount,
        taxSummaries: summarizeTaxes(determinations), taxTotal,
        payableAmount, recognizedPayments: zero, changeAmount: zero, outstandingAmount: payableAmount,
      },
      status: "draft", number: null, issuedAt: null, issueDate: null, issuanceEvidence: null,
    });
    return this.documents.persist({
      scope: input.scope,
      source: { kind: "legacy_sales_invoice", id: invoice.id },
      document,
      idempotencyKey: `prepare_legacy_sales_invoice:${invoice.id}`,
      actorId: input.actorId,
      occurredAt: input.occurredAt,
    });
  }
}

function sameAmount(left: Money, right: Money): boolean {
  return sameCurrency(left.currency, right.currency) && left.minorAmount === right.minorAmount;
}

function isEligibleCommercialSource(invoice: ConfirmedServiceInvoice): boolean {
  return invoice.status === "confirmada"
    && invoice.documentType === "venta"
    && invoice.lines.length > 0
    && invoice.lines.every((line) => line.productId === null && !!line.serviceTaxCode?.trim());
}

function assertInvoiceMoneyCurrency(invoice: ConfirmedServiceInvoice): void {
  const expected = currency("VES", 2);
  const amounts = [
    invoice.subtotal,
    invoice.vatAmount,
    invoice.total,
    invoice.documentDiscount,
    invoice.documentSurcharge,
    invoice.financialTaxAmount,
    ...invoice.lines.flatMap((line) => [
      line.grossAmount,
      line.unitPrice,
      line.discountAmount,
      line.surchargeAmount,
      line.netAmount,
    ]),
  ];
  if (amounts.some((amount) => !sameCurrency(amount.currency, expected))) {
    throw new SalesFailure("SALES_CURRENCY_MISMATCH", "Los importes fiscales de la factura deben usar la moneda de la factura.");
  }
}

function matchesPreparedCommercialSource(
  document: FiscalDocument,
  invoice: ConfirmedServiceInvoice,
  operationDate: ReturnType<typeof fiscalDate>,
): boolean {
  if (
    document.companyId !== invoice.companyId
    || !sameAmount(document.totals.netAmount, invoice.subtotal)
    || !sameAmount(document.totals.taxTotal, invoice.vatAmount)
    || !sameAmount(document.totals.payableAmount, invoice.total)
    || document.lines.length !== invoice.lines.length
    || document.taxDeterminations.length === 0
    || document.taxDeterminations.some((determination) => determination.operationDate !== operationDate)
    || document.recipient.taxIdentifier !== invoice.customer?.taxIdentifier?.trim()
    || document.recipient.legalName !== invoice.customer?.legalName.trim()
    || document.recipient.fiscalAddress !== invoice.customer?.fiscalAddress?.trim()
  ) return false;
  return invoice.lines.every((sourceLine, index) => {
    const snapshot = document.lines[index];
    if (!snapshot) return false;
    const discount = sourceLine.discountAmount;
    const surcharge = sourceLine.surchargeAmount;
    return snapshot.id === fiscalDocumentLineId(sourceLine.id)
      && snapshot.commercialReference === sourceLine.serviceTaxCode?.trim()
      && snapshot.description === sourceLine.description.trim()
      && snapshot.quantity === sourceLine.quantity
      && sameAmount(snapshot.unitPrice, sourceLine.unitPrice)
      && sameAmount(snapshot.grossAmount, sourceLine.grossAmount)
      && sameAmount(snapshot.netAmount, sourceLine.netAmount)
      && sameAmount(adjustmentAmount(snapshot, "discount"), discount)
      && sameAmount(adjustmentAmount(snapshot, "surcharge"), surcharge);
  });
}

function matchesPreparedIssuer(
  document: FiscalDocument,
  issuer: SalesFiscalIssuerIdentity | null,
): issuer is SalesFiscalIssuerIdentity {
  return issuer !== null
    && issuer.companyId === document.companyId
    && issuer.jurisdiction.trim().toUpperCase() === document.jurisdiction
    && issuer.taxIdentifier.trim() === document.issuer.taxIdentifier
    && issuer.legalName.trim() === document.issuer.legalName
    && issuer.fiscalAddress?.trim() === document.issuer.fiscalAddress;
}

function adjustmentAmount(documentLine: FiscalDocument["lines"][number], kind: "discount" | "surcharge"): Money {
  const currencyDefinition = documentLine.netAmount.currency;
  return documentLine.adjustments
    .filter((adjustment) => adjustment.kind === kind)
    .reduce((total, adjustment) => addMoney(total, adjustment.amount), moneyFromMinor(0n, currencyDefinition));
}

function summarizeTaxes(items: readonly FiscalTaxDetermination[]): FiscalTaxSummary[] {
  const result = new Map<string, FiscalTaxSummary>();
  for (const item of items) {
    const key = `${item.taxCode}|${item.category}|${item.calculationMode}|${item.rate}`;
    const current = result.get(key);
    result.set(key, current === undefined
      ? { taxCode: item.taxCode, category: item.category, calculationMode: item.calculationMode, rate: item.rate, taxableBase: item.taxableBase, amount: item.amount }
      : { ...current, taxableBase: addMoney(current.taxableBase, item.taxableBase), amount: addMoney(current.amount, item.amount) });
  }
  return [...result.values()];
}
