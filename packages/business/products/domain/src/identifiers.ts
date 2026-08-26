import { ProductFailure } from "./product-failure";

declare const productIdBrand: unique symbol;
declare const productCategoryIdBrand: unique symbol;
declare const skuBrand: unique symbol;
declare const barcodeBrand: unique symbol;

export type ProductId = string & { readonly [productIdBrand]: true };
export type ProductCategoryId = string & { readonly [productCategoryIdBrand]: true };
export type Sku = string & { readonly [skuBrand]: true };
export type Barcode = string & { readonly [barcodeBrand]: true };

export function productId(value: string): ProductId {
  return identifier(value, "product") as ProductId;
}

export function productCategoryId(value: string): ProductCategoryId {
  return identifier(value, "product category") as ProductCategoryId;
}

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
 */
export function rehydrateSku(value: string, legacyProductId: string | null): Sku {
  if (value.trim()) return sku(value);
  if (!legacyProductId?.trim()) {
    throw new ProductFailure("PRODUCT_IDENTIFIER_INVALID", "The product SKU is invalid.");
  }
  return "" as Sku;
}

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
