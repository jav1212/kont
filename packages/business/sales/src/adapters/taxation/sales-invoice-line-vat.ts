import { fiscalDate, fiscalTaxDetermination, type FiscalTaxDetermination } from "@kontave/fiscal/domain";
import { toFiscalTaxDeterminations } from "@kontave/taxation/fiscal";
import type { ResolveProductVenezuelanVat, ResolveServiceVenezuelanVat, TaxationContext } from "@kontave/taxation/application";
import type { TaxDecision } from "@kontave/taxation/domain";
import { productId } from "@kontave/products/domain";
import type { ConfirmedServiceInvoice, ConfirmedServiceInvoiceTaxResolver } from "../../application";
import { SalesFailure } from "../../domain";

/** Adapts product and service taxation use cases to the sales fiscal-preparation port. */
export class SalesInvoiceLineVatAdapter implements ConfirmedServiceInvoiceTaxResolver {
  /**
   * Creates a sales-line tax adapter for company-scoped product and service profiles.
   * @param products - Resolver for product classifications and company rule catalogs.
   * @param services - Resolver for service classifications and company rule catalogs.
   * @param context - Authenticated actor and authorized organization/company scope.
   * @returns No value; the adapter is available on the constructed instance.
   * @throws No expected failure during construction.
   */
  constructor(
    private readonly products: ResolveProductVenezuelanVat,
    private readonly services: ResolveServiceVenezuelanVat,
    private readonly context: Pick<TaxationContext, "actorUserId" | "organizationId" | "companyId">,
  ) {}

  /**
   * Resolves the effective product or service profile into an immutable fiscal snapshot.
   * @param invoice - Authorized commercial invoice snapshot.
   * @param lineIndex - Index of the line to resolve.
   * @returns Fiscal unit and audit-ready determinations for that line.
   * @throws {SalesFailure} When the line does not identify exactly one classified product or service.
   */
  async resolveLine(invoice: ConfirmedServiceInvoice, lineIndex: number): Promise<{
    readonly unitCode: string;
    readonly determinations: readonly FiscalTaxDetermination[];
  }> {
    const line = invoice.lines[lineIndex];
    if (!line) throw new SalesFailure("SALES_FISCAL_TAX_UNRESOLVED", "La línea de venta no existe.");

    let unitCode: string;
    let classificationVersion: string;
    let classificationLegalBasis: string;
    let decisions: readonly TaxDecision[];
    if (line.productId !== null && !line.serviceTaxCode?.trim()) {
      if (!line.productUnitCode?.trim()) {
        throw new SalesFailure("SALES_FISCAL_TAX_UNRESOLVED", "El producto no tiene una unidad fiscal admitida.");
      }
      const resolved = await this.products.executeWithClassification({
        ...this.context,
        productId: productId(line.productId),
        operationDate: invoice.invoiceDate,
        lineReference: line.id,
        lineAmount: line.netAmount,
        roundingMode: "half_up",
        requireCompanyCatalog: true,
      });
      unitCode = line.productUnitCode;
      classificationVersion = resolved.classificationVersion;
      classificationLegalBasis = resolved.classificationLegalBasis;
      decisions = resolved.determinations;
    } else if (line.productId === null && line.serviceTaxCode?.trim()) {
      const resolved = await this.services.execute({
        ...this.context,
        serviceCode: line.serviceTaxCode,
        operationDate: invoice.invoiceDate,
        lineReference: line.id,
        lineAmount: line.netAmount,
        roundingMode: "half_up",
        requireCompanyCatalog: true,
      });
      unitCode = resolved.unitCode;
      classificationVersion = resolved.classificationVersion;
      classificationLegalBasis = resolved.classificationLegalBasis;
      decisions = resolved.determinations;
    } else {
      throw new SalesFailure("SALES_FISCAL_TAX_UNRESOLVED", "Cada línea debe corresponder a un único producto o servicio clasificado.");
    }

    const operationDate = fiscalDate(invoice.invoiceDate);
    return {
      unitCode,
      determinations: Object.freeze(toFiscalTaxDeterminations(decisions).map((determination) => fiscalTaxDetermination({
        ...determination,
        operationDate,
        classificationVersion,
        classificationLegalBasis,
      }))),
    };
  }
}
