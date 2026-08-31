import type { CompanyId } from "@kontave/companies/domain";
import type { Barcode, ProductCategoryId, ProductId, Sku } from "./identifiers";
import { ProductFailure } from "./product-failure";
import type { UnitOfMeasure } from "./unit-of-measure";

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

/** Company-owned product aggregate with controlled lifecycle transitions. */
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

  /**
   * Rehydrates and validates a product aggregate.
   * @param state - Complete persisted or newly-created product state.
   * @throws {ProductFailure} When version, identifiers, text or barcodes are invalid.
   */
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

  /**
   * Renames the product and optionally replaces its description.
   * @param name - New product name.
   * @param description - New description, defaulting to the current value.
   * @returns A new aggregate version.
   * @throws {ProductFailure} When text constraints fail.
   */
  rename(name: string, description: string | null = this.description): Product {
    return new Product({ ...this, name, description, version: this.version + 1 });
  }

  /**
   * Changes the optional owning category.
   * @param categoryId - New category, or `null` for unassigned.
   * @returns A new aggregate version.
   */
  recategorize(categoryId: ProductCategoryId | null): Product {
    return new Product({ ...this, categoryId, version: this.version + 1 });
  }

  /**
   * Replaces all product barcodes.
   * @param barcodes - New unique barcode collection.
   * @returns A new aggregate version.
   * @throws {ProductFailure} When duplicate barcodes are supplied.
   */
  replaceBarcodes(barcodes: readonly Barcode[]): Product {
    return new Product({ ...this, barcodes, version: this.version + 1 });
  }

  /**
   * Deactivates an active product.
   * @returns A new inactive aggregate version.
   * @throws {ProductFailure} Unless currently active.
   */
  deactivate(): Product {
    if (this.status !== ProductStatus.Active) {
      throw new ProductFailure("PRODUCT_TRANSITION_INVALID", "Only an active product can be deactivated.");
    }
    return new Product({ ...this, status: ProductStatus.Inactive, version: this.version + 1 });
  }

  /**
   * Activates an inactive product.
   * @returns A new active aggregate version.
   * @throws {ProductFailure} Unless currently inactive.
   */
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
