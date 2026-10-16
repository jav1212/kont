import type { CompanyId } from "@kontave/companies/domain";
import type { ProductCategoryId } from "./identifiers";
import { ProductFailure } from "./product-failure";

/** Lifecycle of an alternate name assigned to a product category. */
export type ProductCategoryAliasStatus = "active" | "retired";

/** Persisted alternate name that resolves to one canonical product category. */
export interface ProductCategoryAliasState {
  readonly id: string;
  readonly companyId: CompanyId;
  readonly categoryId: ProductCategoryId;
  readonly alias: string;
  readonly status: ProductCategoryAliasStatus;
  readonly version: number;
}

/** Immutable company-scoped alternate name for a canonical product category. */
export class ProductCategoryAlias {
  readonly id: string;
  readonly companyId: CompanyId;
  readonly categoryId: ProductCategoryId;
  readonly alias: string;
  readonly status: ProductCategoryAliasStatus;
  readonly version: number;

  /**
   * Rehydrates and validates an alternate product-category name.
   * @param state - Authoritative company, category, alias, status, and revision.
   * @throws {ProductFailure} When the identifiers, alias, status, or revision are invalid.
   */
  constructor(state: ProductCategoryAliasState) {
    this.id = requiredIdentifier(state.id, "Product category alias ID");
    this.companyId = state.companyId;
    this.categoryId = state.categoryId;
    this.alias = normalizeProductCategoryAlias(state.alias);
    if (state.status !== "active" && state.status !== "retired") {
      throw new ProductFailure("PRODUCT_CATEGORY_ALIAS_INVALID", "The product category alias status is invalid.");
    }
    if (!Number.isSafeInteger(state.version) || state.version < 1) {
      throw new ProductFailure("PRODUCT_CATEGORY_ALIAS_INVALID", "The product category alias revision is invalid.");
    }
    this.status = state.status;
    this.version = state.version;
    Object.freeze(this);
  }

  /**
   * Produces a retired version while retaining the alias history.
   * @returns The retired alias with its next revision.
   * @throws {ProductFailure} Unless the alias is active.
   */
  retire(): ProductCategoryAlias {
    if (this.status !== "active") {
      throw new ProductFailure("PRODUCT_TRANSITION_INVALID", "Only an active category alias can be retired.");
    }
    return new ProductCategoryAlias({ ...this, status: "retired", version: this.version + 1 });
  }
}

/**
 * Normalizes an alternate category name for storage and case-insensitive matching.
 * @param value - User-entered or persisted alternate name.
 * @returns The trimmed canonical display form.
 * @throws {ProductFailure} When the name is empty, too long, or contains control characters.
 */
export function normalizeProductCategoryAlias(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 120 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new ProductFailure("PRODUCT_CATEGORY_ALIAS_INVALID", "The product category alias is invalid.");
  }
  return normalized;
}

function requiredIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new ProductFailure("PRODUCT_CATEGORY_ALIAS_INVALID", `${label} is invalid.`);
  }
  return normalized;
}
