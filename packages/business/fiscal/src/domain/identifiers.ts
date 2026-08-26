import { FiscalFailure } from "./fiscal-failure";

declare const fiscalDocumentIdBrand: unique symbol;
declare const fiscalDocumentLineIdBrand: unique symbol;
declare const fiscalNumberBrand: unique symbol;

export type FiscalDocumentId = string & { readonly [fiscalDocumentIdBrand]: true };
export type FiscalDocumentLineId = string & { readonly [fiscalDocumentLineIdBrand]: true };
export type FiscalNumber = string & { readonly [fiscalNumberBrand]: true };

/**
 * Creates the stable identity of a fiscal document.
 *
 * @param value - Persistence or integration identifier to validate.
 * @returns A validated branded fiscal-document identifier.
 * @throws {@link FiscalFailure} When the identifier is blank or exceeds its supported length.
 */
export const fiscalDocumentId = (value: string): FiscalDocumentId => identifier(value, "document") as FiscalDocumentId;

/**
 * Creates the stable identity of a line within a fiscal document.
 *
 * @param value - Persistence or integration identifier to validate.
 * @returns A validated branded fiscal-document-line identifier.
 * @throws {@link FiscalFailure} When the identifier is blank or exceeds its supported length.
 */
export const fiscalDocumentLineId = (value: string): FiscalDocumentLineId => identifier(value, "line") as FiscalDocumentLineId;

/**
 * Creates the legally visible number assigned to a fiscal document.
 *
 * @param value - Provider or authority number to validate.
 * @returns A validated branded fiscal number.
 * @throws {@link FiscalFailure} When the number is blank or exceeds its supported length.
 */
export const fiscalNumber = (value: string): FiscalNumber => identifier(value, "number") as FiscalNumber;

function identifier(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new FiscalFailure("FISCAL_IDENTIFIER_INVALID", `Fiscal ${name} is invalid.`);
  }
  return normalized;
}
