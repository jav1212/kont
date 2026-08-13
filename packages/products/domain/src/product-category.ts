import type { CompanyId } from "@kontave/companies-domain";
import type { ProductCategoryId } from "./identifiers.js";
import { ProductFailure } from "./product-failure.js";

export enum ProductCategoryStatus { Active = "active", Inactive = "inactive" }

export interface ProductCategoryState {
  readonly id: ProductCategoryId;
  readonly companyId: CompanyId;
  readonly legacyCategoryId: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly status: ProductCategoryStatus;
  readonly version: number;
}

export class ProductCategory {
  readonly id: ProductCategoryId;
  readonly companyId: CompanyId;
  readonly legacyCategoryId: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly status: ProductCategoryStatus;
  readonly version: number;

  constructor(state: ProductCategoryState) {
    if (!Number.isSafeInteger(state.version) || state.version < 1) {
      throw new ProductFailure("PRODUCT_CATEGORY_INVALID", "The product category version is invalid.");
    }
    this.id = state.id;
    this.companyId = state.companyId;
    this.legacyCategoryId = optionalIdentifier(state.legacyCategoryId);
    this.name = requiredText(state.name, 120, "Product category name");
    this.description = optionalText(state.description, 500, "Product category description");
    this.status = state.status;
    this.version = state.version;
  }

  rename(name: string, description: string | null = this.description): ProductCategory {
    return new ProductCategory({ ...this, name, description, version: this.version + 1 });
  }

  deactivate(): ProductCategory {
    if (this.status !== ProductCategoryStatus.Active) {
      throw new ProductFailure("PRODUCT_TRANSITION_INVALID", "Only an active product category can be deactivated.");
    }
    return new ProductCategory({ ...this, status: ProductCategoryStatus.Inactive, version: this.version + 1 });
  }

  activate(): ProductCategory {
    if (this.status !== ProductCategoryStatus.Inactive) {
      throw new ProductFailure("PRODUCT_TRANSITION_INVALID", "Only an inactive product category can be activated.");
    }
    return new ProductCategory({ ...this, status: ProductCategoryStatus.Active, version: this.version + 1 });
  }
}

function requiredText(value: string, maximumLength: number, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) {
    throw new ProductFailure("PRODUCT_CATEGORY_INVALID", `${label} is invalid.`);
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
    throw new ProductFailure("PRODUCT_CATEGORY_INVALID", "The legacy category identifier is invalid.");
  }
  return normalized;
}
