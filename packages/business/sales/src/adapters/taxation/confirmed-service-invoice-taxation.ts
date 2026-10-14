import { fiscalDate, fiscalTaxDetermination } from "@kontave/fiscal/domain";
import type { FiscalTaxDetermination } from "@kontave/fiscal/domain";
import { toFiscalTaxDeterminations } from "@kontave/taxation/fiscal";
import type { ResolveServiceVenezuelanVat, ResolveServiceVenezuelanVatInput } from "@kontave/taxation/application";
import type { ConfirmedServiceInvoice, ConfirmedServiceInvoiceTaxResolver } from "../../application";
import { SalesFailure } from "../../domain";

/** Adapts taxation's service IVA use case to the sales fiscal-preparation port. */
export class ConfirmedServiceInvoiceVatAdapter implements ConfirmedServiceInvoiceTaxResolver {
  /**
   * Creates the sales-facing IVA resolver adapter.
   * @param taxation - Company-scoped service IVA use case from `@kontave/taxation`.
   * @param context - Authenticated actor and authorized organization/company scope.
   * @returns No value; the adapter is available on the constructed instance.
   * @throws No expected failure during construction.
   */
  constructor(
    private readonly taxation: ResolveServiceVenezuelanVat,
    private readonly context: Pick<ResolveServiceVenezuelanVatInput, "actorUserId" | "organizationId" | "companyId">,
  ) {}

  /**
   * Resolves and maps the immutable tax snapshot for one confirmed service line.
   * @param invoice - Persisted confirmed invoice snapshot.
   * @param lineIndex - Index of the source line to resolve.
   * @returns Fiscal unit and auditable tax determinations for the line.
   * @throws {SalesFailure} When the line does not contain a service tax code.
   */
  async resolveLine(invoice: ConfirmedServiceInvoice, lineIndex: number): Promise<{
    readonly unitCode: string;
    readonly determinations: readonly FiscalTaxDetermination[];
  }> {
    const line = invoice.lines[lineIndex];
    if (!line?.serviceTaxCode?.trim()) {
      throw new SalesFailure("SALES_FISCAL_TAX_UNRESOLVED", "Confirmed service line has no tax classification code.");
    }
    const resolved = await this.taxation.execute({
      ...this.context,
      serviceCode: line.serviceTaxCode,
      operationDate: invoice.invoiceDate,
      lineReference: line.id,
      lineAmount: line.netAmount,
      roundingMode: "half_up",
    });
    const operationDate = fiscalDate(invoice.invoiceDate);
    return {
      unitCode: resolved.unitCode,
      determinations: Object.freeze(toFiscalTaxDeterminations(resolved.determinations).map((determination) => fiscalTaxDetermination({
        ...determination,
        operationDate,
        classificationVersion: resolved.classificationVersion,
        classificationLegalBasis: resolved.classificationLegalBasis,
      }))),
    };
  }
}
