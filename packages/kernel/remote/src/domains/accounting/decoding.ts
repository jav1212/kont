import type { AccountingCommandReceiptDto, AccountingQueryResultDto } from "@kontave/client-contracts";
import type { Decoder } from "../../decoding";

/** Decodes the receipt produced by an accounting command endpoint.
 * @param value - Untrusted response body.
 * @returns A frozen receipt when the required fields are valid; otherwise `null`.
 */
export const accountingCommandReceipt: Decoder<AccountingCommandReceiptDto> = (value) => {
  const input = record(value);
  if (input === null || typeof input.commandId !== "string" || typeof input.replayed !== "boolean" || !Array.isArray(input.affectedIds) || !input.affectedIds.every((item) => typeof item === "string")) return null;
  const versions = record(input.versions);
  if (versions === null || !Object.values(versions).every((version) => Number.isSafeInteger(version) && (version as number) >= 0)) return null;
  return Object.freeze({ commandId: input.commandId, replayed: input.replayed, affectedIds: Object.freeze([...(input.affectedIds as string[])]), versions: Object.freeze({ ...(versions as Record<string, number>) }) });
};

/** Accepts only JSON objects, arrays of objects, or null for accounting read models.
 * @param value - Untrusted query response body.
 * @returns A shape-safe read result or `null` when the payload is malformed.
 */
export const accountingQueryResult: Decoder<AccountingQueryResultDto> = (value) => {
  if (value === null) return null;
  if (Array.isArray(value)) return value.every((item) => record(item) !== null) ? Object.freeze(value.map((item) => Object.freeze({ ...(item as Record<string, unknown>) }))) : null;
  const input = record(value);
  return input === null ? null : Object.freeze({ ...input });
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
