import { TaxationFailure } from "./taxation-failure";

declare const taxProfileIdBrand: unique symbol;
declare const taxRuleIdBrand: unique symbol;
declare const taxCodeBrand: unique symbol;
export type ProductTaxProfileId = string & { readonly [taxProfileIdBrand]: true };
export type TaxRuleId = string & { readonly [taxRuleIdBrand]: true };
export type TaxCode = string & { readonly [taxCodeBrand]: true };

/**
 * Validates and brands a product tax-profile identifier.
 * @param value - Untrusted identifier.
 * @returns The normalized profile identifier.
 * @throws {TaxationFailure} When empty or longer than 128 characters.
 */
export function productTaxProfileId(value: string): ProductTaxProfileId {
  return identifier(value, 128, "profile") as ProductTaxProfileId;
}

/**
 * Validates and brands a tax-rule identifier.
 * @param value - Untrusted identifier.
 * @returns The normalized rule identifier.
 * @throws {TaxationFailure} When empty or longer than 128 characters.
 */
export function taxRuleId(value: string): TaxRuleId {
  return identifier(value, 128, "rule") as TaxRuleId;
}

/**
 * Normalizes and brands a tax code.
 * @param value - Untrusted code.
 * @returns The uppercase normalized tax code.
 * @throws {TaxationFailure} When empty or longer than 64 characters.
 */
export function taxCode(value: string): TaxCode {
  return identifier(value.toUpperCase(), 64, "code") as TaxCode;
}

function identifier(value: string, limit: number, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > limit) throw new TaxationFailure("TAXATION_IDENTIFIER_INVALID", `Tax ${name} is invalid.`);
  return normalized;
}
