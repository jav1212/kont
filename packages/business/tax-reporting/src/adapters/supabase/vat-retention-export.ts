import type { SupabaseClient } from "@supabase/supabase-js";
import { GetVatRetentionExport, type VatRetentionExportReader } from "../../application/get-vat-retention-export";
import { TaxReportingFailure, type VatRetentionExport, type VatRetentionExportRow } from "../../domain";

/** Supabase service-role adapter for the existing company-scoped VAT retention RPC. */
export class SupabaseVatRetentionExportReader implements VatRetentionExportReader {
  /**
   * Creates the server-only retention export reader.
   * @param client - Supabase client whose service-role key is kept on the server.
   * @returns A reader for the legacy retention export RPC.
   * @throws {TaxReportingFailure} When no database client is supplied.
   */
  constructor(private readonly client: SupabaseClient) {
    if (!client) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "VAT retention export requires a server database client.");
  }

  /** {@inheritDoc VatRetentionExportReader.read} */
  async read(input: { readonly tenantId: string; readonly companyId: string; readonly period: string }): Promise<VatRetentionExport> {
    const { data, error } = await this.client.rpc("shared_inventory_iva_retention_period", {
      p_tenant_id: input.tenantId,
      p_company_id: input.companyId,
      p_period: input.period,
    });
    if (error) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "VAT retention export source is unavailable or rejected the request.");
    return decodeExport(data, input.period);
  }
}

/** Composes the monthly VAT retention export with its Supabase adapter. */
export function createSupabaseVatRetentionExportActions(client: SupabaseClient): { readonly getVatRetentionExport: GetVatRetentionExport } {
  return { getVatRetentionExport: new GetVatRetentionExport(new SupabaseVatRetentionExportReader(client)) };
}

function decodeExport(value: unknown, requestedPeriod: string): VatRetentionExport {
  const envelope = asRecord(value);
  const agentRif = asNonEmptyText(envelope.agente_rif);
  const periodYyyymm = asNonEmptyText(envelope.periodo_yyyymm);
  if (periodYyyymm !== requestedPeriod.replace("-", "") || !Array.isArray(envelope.rows)) {
    invalid("VAT retention export returned an inconsistent period or row collection.");
  }
  return Object.freeze({
    agentRif,
    periodYyyymm,
    rows: Object.freeze(envelope.rows.map((row) => decodeRow(row, agentRif, periodYyyymm))),
  });
}

function decodeRow(value: unknown, agentRif: string, periodYyyymm: string): VatRetentionExportRow {
  const row = asRecord(value);
  const operationType = optionalText(row.tipo_operacion, "C");
  const documentType = optionalText(row.tipo_documento, "01");
  if (operationType !== "C" && operationType !== "V") invalid("VAT retention export contains an unknown operation type.");
  if (documentType !== "01" && documentType !== "02" && documentType !== "03") invalid("VAT retention export contains an unknown document type.");
  return Object.freeze({
    agentRif, periodYyyymm,
    date: requiredText(row.fecha), operationType, documentType,
    supplierRif: optionalText(row.proveedor_rif), supplierName: optionalText(row.proveedor_nombre),
    invoiceNumber: optionalText(row.numero_factura), controlNumber: optionalText(row.numero_control),
    taxableBase: numeric(row.base_imponible), vatRate: numeric(row.alicuota), vatAmount: numeric(row.iva_monto),
    vatWithheld: numeric(row.iva_retenido), lineTotal: numeric(row.monto_total_linea), exemptAmount: numeric(row.monto_exento),
    voucherNumber: optionalText(row.comprobante), affectedDocument: optionalText(row.documento_afectado, "0"),
    fileNumber: optionalText(row.expediente, "0"),
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid("VAT retention export returned an invalid payload.");
  return value as Record<string, unknown>;
}
function requiredText(value: unknown): string { if (typeof value !== "string" || !value.trim()) invalid("VAT retention export omitted a required field."); return value; }
function asNonEmptyText(value: unknown): string { return requiredText(value); }
function optionalText(value: unknown, fallback = ""): string { return value === null || value === undefined ? fallback : typeof value === "string" ? value : invalid("VAT retention export contains an invalid text field."); }
function numeric(value: unknown): number { if (value === null || value === undefined || value === "") invalid("VAT retention export omitted a monetary value."); const parsed = Number(value); if (!Number.isFinite(parsed)) invalid("VAT retention export contains a non-finite monetary value."); return parsed; }
function invalid(message: string): never { throw new TaxReportingFailure("TAX_REPORTING_INVALID", message); }
