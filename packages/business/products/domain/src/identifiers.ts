import { ProductFailure } from "./product-failure";

declare const productIdBrand: unique symbol;
declare const productCategoryIdBrand: unique symbol;
declare const skuBrand: unique symbol;
declare const barcodeBrand: unique symbol;

export type ProductId = string & { readonly [productIdBrand]: true };
export type ProductCategoryId = string & { readonly [productCategoryIdBrand]: true };
export type Sku = string & { readonly [skuBrand]: true };
export type Barcode = string & { readonly [barcodeBrand]: true };

/**
 * Validates and brands a product identifier.
 * @param value - Untrusted identifier.
 * @returns The normalized product identifier.
 * @throws {ProductFailure} When invalid.
 */
export function productId(value: string): ProductId {
  return identifier(value, "product") as ProductId;
}

/**
 * Validates and brands a product-category identifier.
 * @param value - Untrusted identifier.
 * @returns The normalized category identifier.
 * @throws {ProductFailure} When invalid.
 */
export function productCategoryId(value: string): ProductCategoryId {
  return identifier(value, "product category") as ProductCategoryId;
}

/**
 * Normalizes and brands a product SKU.
 * @param value - Untrusted SKU.
 * @returns The uppercase normalized SKU.
 * @throws {ProductFailure} When empty, too long or containing control characters.
 */
export function sku(value: string): Sku {
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized.length > 64 || controlCharacters.test(normalized)) {
    throw new ProductFailure("PRODUCT_IDENTIFIER_INVALID", "The product SKU is invalid.");
  }
  return normalized as Sku;
}

/**
 * Rehydrates historical products that predate mandatory SKUs. New writes must
 * continue to use `sku`; an empty value is accepted only for a legacy record.
 * @param value - Persisted SKU value.
 * @param legacyProductId - Legacy identity proving the record predates mandatory SKUs.
 * @returns A validated SKU or the branded empty legacy sentinel.
 * @throws {ProductFailure} When both SKU and legacy identity are absent.
 */
export function rehydrateSku(value: string, legacyProductId: string | null): Sku {
  if (value.trim()) return sku(value);
  if (!legacyProductId?.trim()) {
    throw new ProductFailure("PRODUCT_IDENTIFIER_INVALID", "The product SKU is invalid.");
  }
  return "" as Sku;
}

/**
 * Validates and brands a product barcode.
 * @param value - Untrusted barcode value.
 * @returns The normalized barcode.
 * @throws {ProductFailure} When empty, too long or containing control characters.
 */
export function barcode(value: string): Barcode {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128 || controlCharacters.test(normalized)) {
    throw new ProductFailure("PRODUCT_IDENTIFIER_INVALID", "The product barcode is invalid.");
  }
  return normalized as Barcode;
}

const controlCharacters = /[\u0000-\u001f\u007f]/;

function identifier(value: string, kind: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new ProductFailure("PRODUCT_IDENTIFIER_INVALID", `The ${kind} identifier is invalid.`);
  }
  return normalized;
}
