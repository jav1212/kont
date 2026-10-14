import { TaxReportingFailure } from "../domain";
import type { VatRetentionExportRow } from "../domain/vat-retention-export";

/** Input envelope rendered by the Venezuelan monthly VAT-retention TXT format. */
export interface BuildVatRetentionTxtInput {
  readonly agentRif: string;
  readonly periodYyyymm: string;
  readonly rows: readonly VatRetentionExportRow[];
}

/**
 * Builds the tab-separated IVA withholding payload for the browser download adapter.
 *
 * Empty periods produce the legacy zero-operations row. Negative or non-finite
 * monetary snapshots fail explicitly because silently clamping a note would
 * misstate the declared retention amount.
 *
 * @param input - Agent, month, and source-provided rows.
 * @returns UTF-8 JavaScript text with one trailing newline.
 * @throws {TaxReportingFailure} When row amounts are invalid or negative.
 */
export function buildVatRetentionTxt(input: BuildVatRetentionTxtInput): string {
  if (!input.agentRif.trim()) invalid("La empresa no tiene RIF — requerido por SENIAT.");
  validatePeriod(input.periodYyyymm);
  const agentRif = formatRif(input.agentRif);
  if (input.rows.length === 0) return ["1", agentRif, input.periodYyyymm, ...Array.from({ length: 14 }, () => "0")].join("\t") + "\n";

  return input.rows.map((row, index) => {
    for (const amount of [row.lineTotal, row.taxableBase, row.vatWithheld, row.exemptAmount]) {
      if (!Number.isFinite(amount) || amount < 0 || amount >= 10_000_000_000_000) {
        invalid("La fila de retención contiene un monto negativo o fuera del formato admitido.");
      }
    }
    if (!Number.isFinite(row.vatRate) || row.vatRate < 0 || row.vatRate > 100) invalid("La fila de retención contiene una alícuota inválida.");
    if (!isRealDate(row.date)) invalid("La fila de retención contiene una fecha inválida.");
    if (!/^\d{14}$/.test(row.voucherNumber)) invalid("La fila de retención no contiene un comprobante de 14 dígitos.");
    return [
      String(index + 1), agentRif, input.periodYyyymm, safeText(row.date, 10), row.operationType, row.documentType,
      formatRif(row.supplierRif), safeText(row.invoiceNumber, 20) || "0", safeText(row.controlNumber, 20) || "0",
      formatAmount(row.lineTotal), formatAmount(row.taxableBase), formatAmount(row.vatWithheld),
      safeText(row.affectedDocument, 20) || "0", safeText(row.voucherNumber, 14) || "0",
      formatAmount(row.exemptAmount), row.vatRate.toFixed(2), safeText(row.fileNumber, 20) || "0",
    ].join("\t");
  }).join("\n") + "\n";
}

/**
 * Encodes content using the single-byte encoding required by the existing file download.
 * @param content - Text produced by `buildVatRetentionTxt`.
 * @returns Bytes with characters outside Latin-1 replaced by `?`.
 */
export function encodeVatRetentionTxtLatin1(content: string): ArrayBuffer {
  const bytes = new Uint8Array(new ArrayBuffer(content.length));
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    bytes[index] = code <= 0xff ? code : 0x3f;
  }
  return bytes.buffer;
}

/**
 * Returns the established local filename convention for a withholding export.
 * @param agentRif - Tax identifier displayed in the file name.
 * @param periodYyyymm - Month in `YYYYMM` form.
 * @returns Filename without path components.
 * @throws {TaxReportingFailure} When the month is malformed.
 */
export function defaultVatRetentionTxtFilename(agentRif: string, periodYyyymm: string): string {
  validatePeriod(periodYyyymm);
  return `RetIVA_${formatRif(agentRif)}_${periodYyyymm}.txt`;
}

function formatRif(value: string): string {
  const raw = value.trim();
  if (!raw) invalid("El RIF requerido para el archivo está vacío.");
  const letter = /^[VvEeJjPpGg]/.test(raw) ? raw[0]!.toUpperCase() : "J";
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length !== 9) invalid("El RIF del archivo debe contener nueve dígitos además del prefijo.");
  return `${letter}${digits}`;
}
function formatAmount(value: number): string { return value.toFixed(2); }
function safeText(value: string | null | undefined, max: number): string { return (value ?? "").replace(/[\t\r\n]/g, " ").trim().slice(0, max); }
function validatePeriod(value: string): void { if (!/^\d{4}(0[1-9]|1[0-2])$/.test(value)) invalid("Período de retención inválido; se esperaba AAAAMM."); }
function isRealDate(value: string): boolean { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00.000Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }
function invalid(message: string): never { throw new TaxReportingFailure("TAX_REPORTING_INVALID", message); }
