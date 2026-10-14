import { TaxReportingFailure } from "../domain";
import type { VatRetentionExport } from "../domain/vat-retention-export";

/** Server-side reader for the legacy monthly VAT withholding export. */
export interface VatRetentionExportReader {
  /**
   * Reads the export envelope for one tenant-owned company and month.
   * @param input - Tenant, company, and calendar month.
   * @returns Export identity and rows for the selected month.
   * @throws {TaxReportingFailure} When scope is invalid or persistence rejects the read.
   */
  read(input: { readonly tenantId: string; readonly companyId: string; readonly period: string }): Promise<VatRetentionExport>;
}

/** Validates and retrieves one monthly VAT withholding export. */
export class GetVatRetentionExport {
  /**
   * Creates the use case with its authorized persistence reader.
   * @param reader - Tenant-scoped export reader.
   * @returns A monthly VAT withholding export use case.
   */
  constructor(private readonly reader: VatRetentionExportReader) {}

  /**
   * Returns the legacy export envelope for a valid company and month.
   * @param input - Tenant scope, company identity, and `YYYY-MM` period.
   * @returns Export rows with the agent and period identifiers.
   * @throws {TaxReportingFailure} When identifiers or period are invalid or the source fails.
   */
  async execute(input: { readonly tenantId: string; readonly companyId: string; readonly period: string }): Promise<VatRetentionExport> {
    const { tenantId, companyId, period } = input;
    if (!tenantId.trim() || !companyId.trim() || companyId.length > 256 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new TaxReportingFailure("TAX_REPORTING_INVALID", "VAT retention export requires a tenant, company, and valid YYYY-MM period.");
    }
    return this.reader.read({ tenantId: tenantId.trim(), companyId: companyId.trim(), period });
  }
}
