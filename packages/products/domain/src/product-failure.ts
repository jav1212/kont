export type ProductFailureCode =
  | "PRODUCT_IDENTIFIER_INVALID"
  | "PRODUCT_INVALID"
  | "PRODUCT_CATEGORY_INVALID"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_CATEGORY_NOT_FOUND"
  | "PRODUCT_DUPLICATE_SKU"
  | "PRODUCT_DUPLICATE_BARCODE"
  | "PRODUCT_DUPLICATE_CATEGORY"
  | "PRODUCT_OUTSIDE_COMPANY"
  | "PRODUCT_TRANSITION_INVALID"
  | "PRODUCT_REPOSITORY_UNAVAILABLE";

export class ProductFailure extends Error {
  constructor(readonly code: ProductFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProductFailure";
  }
}
