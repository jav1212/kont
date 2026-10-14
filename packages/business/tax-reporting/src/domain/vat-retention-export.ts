/** One fiscal line returned by the legacy Venezuelan VAT withholding export. */
export interface VatRetentionExportRow {
  readonly agentRif: string;
  readonly periodYyyymm: string;
  readonly date: string;
  readonly operationType: "C" | "V";
  readonly documentType: "01" | "02" | "03";
  readonly supplierRif: string;
  readonly supplierName: string;
  readonly invoiceNumber: string;
  readonly controlNumber: string;
  readonly taxableBase: number;
  readonly vatRate: number;
  readonly vatAmount: number;
  readonly vatWithheld: number;
  readonly lineTotal: number;
  readonly exemptAmount: number;
  readonly voucherNumber: string;
  readonly affectedDocument: string;
  readonly fileNumber: string;
}

/** Envelope consumed by the client-side SENIAT TXT renderer. */
export interface VatRetentionExport {
  readonly agentRif: string;
  readonly periodYyyymm: string;
  readonly rows: readonly VatRetentionExportRow[];
}
