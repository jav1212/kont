import { ProductFailure } from "./product-failure";
import {
  productCategoryId,
  productId,
  type ProductCategoryId,
  type ProductId,
} from "./identifiers";

/** The deterministic treatment selected for target catalog collisions. */
export enum ProductCatalogImportConflictPolicy {
  Fail = "fail",
  Skip = "skip",
}

/** A source catalog item type participating in an import. */
export type ProductCatalogImportItemKind = "category" | "product";

/** A supported, safe reason why a source master record cannot be created in the target catalog. */
export type ProductCatalogImportConflictReason =
  | "source_category_unsupported_master"
  | "source_category_name_ambiguous"
  | "source_product_sku_ambiguous"
  | "source_product_barcode_ambiguous"
  | "source_product_name_ambiguous"
  | "source_product_category_not_selected"
  | "source_product_unsupported_master"
  | "destination_product_category_conflict"
  | "destination_category_name_exists"
  | "destination_category_name_ambiguous"
  | "destination_product_sku_exists"
  | "destination_product_sku_ambiguous"
  | "destination_product_barcode_exists"
  | "destination_product_barcode_ambiguous"
  | "destination_product_name_exists"
  | "destination_product_name_ambiguous";

/** Explicit master-data selection for a product catalog import. */
export interface ProductCatalogImportSelection {
  readonly sourceCategoryIds: readonly ProductCategoryId[];
  readonly sourceProductIds: readonly ProductId[];
  readonly conflictPolicy: ProductCatalogImportConflictPolicy;
}

/**
 * Validates and freezes a selection before it reaches a preview or write boundary.
 * @param selection - Caller-selected source category and product identities.
 * @returns An immutable, nonempty, duplicate-free selection.
 * @throws {ProductFailure} When the policy or source item selection is invalid.
 */
export function normalizeProductCatalogImportSelection(
  selection: ProductCatalogImportSelection,
): ProductCatalogImportSelection {
  if (!selection || !Array.isArray(selection.sourceCategoryIds) || !Array.isArray(selection.sourceProductIds)) {
    throw invalid("The product catalog import selection is invalid.");
  }
  if (selection.conflictPolicy !== ProductCatalogImportConflictPolicy.Fail
    && selection.conflictPolicy !== ProductCatalogImportConflictPolicy.Skip) {
    throw invalid("The product catalog import conflict policy is invalid.");
  }
  const categories = normalizeCategoryIds(selection.sourceCategoryIds);
  const products = normalizeProductIds(selection.sourceProductIds);
  if (categories.length + products.length === 0) {
    throw invalid("At least one product catalog item must be selected.");
  }
  if (categories.length + products.length > 100) {
    throw invalid("A product catalog import cannot select more than 100 master records.");
  }
  return Object.freeze({
    sourceCategoryIds: Object.freeze(categories),
    sourceProductIds: Object.freeze(products),
    conflictPolicy: selection.conflictPolicy,
  });
}

function normalizeCategoryIds(values: readonly ProductCategoryId[]): ProductCategoryId[] {
  if (!Array.isArray(values)) throw invalid("The selected source category IDs are invalid.");
  const normalized = values.map((value) => productCategoryId(value));
  if (new Set(normalized).size !== normalized.length) throw invalid("The selected source category IDs are invalid.");
  return normalized;
}

function normalizeProductIds(values: readonly ProductId[]): ProductId[] {
  if (!Array.isArray(values)) throw invalid("The selected source product IDs are invalid.");
  const normalized = values.map((value) => productId(value));
  if (new Set(normalized).size !== normalized.length) throw invalid("The selected source product IDs are invalid.");
  return normalized;
}

function invalid(message: string): ProductFailure {
  return new ProductFailure("PRODUCT_CATALOG_IMPORT_INVALID", message);
}
