import type { CompanyId } from "@kontave/companies-domain";
import type { Barcode, ProductCategoryId, ProductId, Sku } from "./identifiers.js";
import { ProductFailure } from "./product-failure.js";
import type { UnitOfMeasure } from "./unit-of-measure.js";

export enum ProductStatus { Active = "active", Inactive = "inactive" }

export interface ProductState {
  readonly id: ProductId;
  readonly companyId: CompanyId;
  readonly legacyProductId: string | null;
  readonly sku: Sku;
  readonly barcodes: readonly Barcode[];
  readonly name: string;
  readonly description: string | null;
  readonly categoryId: ProductCategoryId | null;
  readonly baseUnit: UnitOfMeasure;
  readonly status: ProductStatus;
  readonly version: number;
}

export class Product {
  readonly id: ProductId;
  readonly companyId: CompanyId;
  readonly legacyProductId: string | null;
  readonly sku: Sku;
  readonly barcodes: readonly Barcode[];
  readonly name: string;
  readonly description: string | null;
  readonly categoryId: ProductCategoryId | null;
  readonly baseUnit: UnitOfMeasure;
  readonly status: ProductStatus;
  readonly version: number;

  constructor(state: ProductState) {
    if (!Number.isSafeInteger(state.version) || state.version < 1) {
      throw new ProductFailure("PRODUCT_INVALID", "The product version is invalid.");
    }
    if (new Set<string>(state.barcodes).size !== state.barcodes.length) {
      throw new ProductFailure("PRODUCT_DUPLICATE_BARCODE", "A product cannot contain duplicate barcodes.");
    }
    this.id = state.id;
    this.companyId = state.companyId;
    this.legacyProductId = optionalIdentifier(state.legacyProductId);
    this.sku = state.sku;
    this.barcodes = Object.freeze([...state.barcodes]);
    this.name = requiredText(state.name, 200, "Product name");
    this.description = optionalText(state.description, 2_000, "Product description");
    this.categoryId = state.categoryId;
    this.baseUnit = state.baseUnit;
    this.status = state.status;
    this.version = state.version;
  }

  rename(name: string, description: string | null = this.description): Product {
    return new Product({ ...this, name, description, version: this.version + 1 });
  }

  recategorize(categoryId: ProductCategoryId | null): Product {
    return new Product({ ...this, categoryId, version: this.version + 1 });
  }

  replaceBarcodes(barcodes: readonly Barcode[]): Product {
    return new Product({ ...this, barcodes, version: this.version + 1 });
  }

  deactivate(): Product {
    if (this.status !== ProductStatus.Active) {
      throw new ProductFailure("PRODUCT_TRANSITION_INVALID", "Only an active product can be deactivated.");
    }
    return new Product({ ...this, status: ProductStatus.Inactive, version: this.version + 1 });
  }

  activate(): Product {
    if (this.status !== ProductStatus.Inactive) {
      throw new ProductFailure("PRODUCT_TRANSITION_INVALID", "Only an inactive product can be activated.");
    }
    return new Product({ ...this, status: ProductStatus.Active, version: this.version + 1 });
  }
}

function requiredText(value: string, maximumLength: number, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) {
    throw new ProductFailure("PRODUCT_INVALID", `${label} is invalid.`);
  }
  return normalized;
}

function optionalText(value: string | null, maximumLength: number, label: string): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized ? requiredText(normalized, maximumLength, label) : null;
}

function optionalIdentifier(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new ProductFailure("PRODUCT_INVALID", "The legacy product identifier is invalid.");
  }
  return normalized;
}
