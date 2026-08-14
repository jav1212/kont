import { FiscalFailure } from "./fiscal-failure.js";

declare const fiscalDocumentIdBrand: unique symbol;
declare const fiscalDocumentLineIdBrand: unique symbol;
declare const fiscalNumberBrand: unique symbol;

export type FiscalDocumentId = string & { readonly [fiscalDocumentIdBrand]: true };
export type FiscalDocumentLineId = string & { readonly [fiscalDocumentLineIdBrand]: true };
export type FiscalNumber = string & { readonly [fiscalNumberBrand]: true };

export const fiscalDocumentId = (value: string): FiscalDocumentId => identifier(value, "document") as FiscalDocumentId;
export const fiscalDocumentLineId = (value: string): FiscalDocumentLineId => identifier(value, "line") as FiscalDocumentLineId;
export const fiscalNumber = (value: string): FiscalNumber => identifier(value, "number") as FiscalNumber;

function identifier(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new FiscalFailure("FISCAL_IDENTIFIER_INVALID", `Fiscal ${name} is invalid.`);
  }
  return normalized;
}
