import type { PayablesCommandReceiptDto, PayablesReportDto } from "@kontave/client-contracts";
import type { Decoder } from "../../decoding";

/**
 * Decodes a payables command receipt.
 * @param value - Untrusted response payload returned by the transport.
 * @returns A frozen receipt when every required field has the documented shape; otherwise `null`.
 */
export const payablesCommandReceipt: Decoder<PayablesCommandReceiptDto> = (value) => {
  const input = record(value);
  if (input === null || typeof input.commandId !== "string" || typeof input.replayed !== "boolean" || !Array.isArray(input.affectedIds) || !input.affectedIds.every((item) => typeof item === "string")) return null;
  const versions = record(input.versions) ?? {};
  if (!Object.values(versions).every((version) => Number.isSafeInteger(version))) return null;
  return Object.freeze({
    commandId: input.commandId,
    replayed: input.replayed,
    affectedIds: Object.freeze([...(input.affectedIds as string[])]),
    versions: Object.freeze({ ...(versions as Record<string, number>) }),
    ...(Array.isArray(input.warnings) ? { warnings: Object.freeze([...(input.warnings as Record<string, string>[])]) } : {}),
    ...(typeof input.checkNumber === "string" || input.checkNumber === null ? { checkNumber: input.checkNumber as string | null } : {}),
  });
};

/**
 * Decodes a payables report page. Amounts must arrive as strings so no float rounding happens.
 * @param value - Untrusted response payload returned by the transport.
 * @returns A frozen page when its envelope is valid and no row carries a JSON number amount; otherwise `null`.
 */
export const payablesReport: Decoder<PayablesReportDto> = (value) => {
  const input = record(value);
  if (input === null || !Array.isArray(input.rows) || !Number.isSafeInteger(input.total) || (input.total as number) < 0) return null;
  if (!input.rows.every((row) => record(row) !== null && !hasNumericAmount(row))) return null;
  return Object.freeze({
    rows: Object.freeze([...(input.rows as Record<string, unknown>[])]),
    total: input.total as number,
    ...(typeof input.asOf === "string" ? { asOf: input.asOf } : {}),
    ...(Array.isArray(input.totals) ? { totals: Object.freeze([...(input.totals as Record<string, unknown>[])]) } : {}),
    ...(typeof input.rulesActive === "boolean" ? { rulesActive: input.rulesActive } : {}),
  });
};

const amountKeys = new Set(["amount", "principal", "balance", "applied", "debt", "credit", "net", "amountVes", "openAmount"]);

function hasNumericAmount(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasNumericAmount);
  const row = record(value);
  if (row === null) return false;
  return Object.entries(row).some(([key, nested]) => (amountKeys.has(key) && typeof nested === "number") || (typeof nested === "object" && hasNumericAmount(nested)));
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
