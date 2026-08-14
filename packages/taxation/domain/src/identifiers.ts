import { TaxationFailure } from "./taxation-failure.js";

declare const taxProfileIdBrand: unique symbol;
declare const taxRuleIdBrand: unique symbol;
declare const taxCodeBrand: unique symbol;
export type ProductTaxProfileId = string & { readonly [taxProfileIdBrand]: true };
export type TaxRuleId = string & { readonly [taxRuleIdBrand]: true };
export type TaxCode = string & { readonly [taxCodeBrand]: true };

export const productTaxProfileId = (value: string): ProductTaxProfileId => identifier(value, 128, "profile") as ProductTaxProfileId;
export const taxRuleId = (value: string): TaxRuleId => identifier(value, 128, "rule") as TaxRuleId;
export const taxCode = (value: string): TaxCode => identifier(value.toUpperCase(), 64, "code") as TaxCode;

function identifier(value: string, limit: number, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > limit) throw new TaxationFailure("TAXATION_IDENTIFIER_INVALID", `Tax ${name} is invalid.`);
  return normalized;
}
