import type { CompanyId } from "@kontave/companies/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import {
  Product,
  ProductCategory,
  ProductCategoryStatus,
  ProductFailure,
  ProductStatus,
  type Barcode,
  type ProductCategoryId,
  type ProductId,
  type Sku,
  type UnitOfMeasure,
} from "@kontave/products-domain";

export type ProductStockFilter = "all" | "available" | "low" | "out";
export type ProductListSort = "name" | "sku" | "stock" | "value" | "updatedAt";
export type SortDirection = "asc" | "desc";
export interface ProductCatalogContext { readonly actorUserId: UserId; readonly organizationId: OrganizationId; readonly companyId: CompanyId }
export interface ProductListQuery extends ProductCatalogContext {
  readonly search: string | null; readonly status: ProductStatus | "all"; readonly categoryId: ProductCategoryId | null;
  readonly stock: ProductStockFilter; readonly sort: ProductListSort; readonly direction: SortDirection;
  readonly cursor: string | null; readonly limit: number;
}
export interface ProductInventorySummary {
  readonly onHand: { readonly quantity: string; readonly unit: UnitOfMeasure };
  readonly replenishment: { readonly minimumQuantity: string | null; readonly state: "available" | "low" | "out"; readonly version: number; readonly updatedAt: string };
  readonly valuation: { readonly unitCost: string; readonly totalValue: string; readonly currency: "VES" };
}
export interface ProductListItem {
  readonly product: Product; readonly category: ProductCategory | null; readonly inventory: ProductInventorySummary | null; readonly updatedAt: string;
}
export interface ProductListSummary {
  readonly active: number; readonly inactive: number; readonly lowStock: number; readonly outOfStock: number;
  readonly inventoryValue: { readonly amount: string; readonly currency: "VES" };
}
export interface ProductCursorPage { readonly items: readonly ProductListItem[]; readonly nextCursor: string | null; readonly total: number; readonly summary: ProductListSummary }
export interface ProductDetail {
  readonly product: Product; readonly category: ProductCategory | null; readonly inventory: ProductInventorySummary | null; readonly updatedAt: string;
  readonly capabilities: { readonly inventoryEnabled: boolean; readonly locationTracking: boolean; readonly lotTracking: boolean };
}
export interface ProductMovementQuery extends ProductCatalogContext {
  readonly productId: ProductId; readonly cursor: string | null; readonly limit: number; readonly from: string | null; readonly to: string | null;
  readonly type: string | null; readonly locationId: string | null;
}
export interface ProductMovement {
  readonly id: string; readonly effectiveDate: string; readonly type: string;
  readonly quantity: { readonly value: string; readonly unit: UnitOfMeasure };
  readonly unitCost: { readonly amount: string; readonly currency: "VES" };
  readonly totalCost: { readonly amount: string; readonly currency: "VES" };
  readonly balanceQuantity: string; readonly reference: string | null; readonly notes: string | null; readonly createdAt: string;
}
export interface ProductMovementPage { readonly items: readonly ProductMovement[]; readonly nextCursor: string | null }
export interface CreateProductCommand extends ProductCatalogContext {
  readonly sku: Sku; readonly barcodes: readonly Barcode[]; readonly name: string; readonly description: string | null;
  readonly categoryId: ProductCategoryId | null; readonly baseUnit: UnitOfMeasure;
}
export interface UpdateProductCommand extends ProductCatalogContext {
  readonly productId: ProductId; readonly sku?: Sku; readonly barcodes?: readonly Barcode[]; readonly name?: string;
  readonly description?: string | null; readonly categoryId?: ProductCategoryId | null; readonly baseUnit?: UnitOfMeasure; readonly expectedVersion: number;
}
export interface ProductVersionCommand extends ProductCatalogContext { readonly productId: ProductId; readonly expectedVersion: number }
export interface ProductCategoryListQuery extends ProductCatalogContext { readonly status: ProductCategoryStatus | "all" }
export type ProductCategoryOverviewSort = "name" | "products" | "updatedAt";
export interface ProductCategoryOverviewQuery extends ProductCatalogContext {
  readonly search: string | null; readonly status: ProductCategoryStatus | "all"; readonly sort: ProductCategoryOverviewSort;
  readonly direction: SortDirection; readonly cursor: string | null; readonly limit: number;
}
export interface ProductCategoryOverviewItem { readonly category: ProductCategory; readonly productCount: number; readonly createdAt: string | null; readonly updatedAt: string | null }
export interface ProductCategoryOverviewPage {
  readonly items: readonly ProductCategoryOverviewItem[]; readonly nextCursor: string | null; readonly total: number;
  readonly summary: { readonly active: number; readonly inactive: number; readonly inUse: number; readonly unused: number; readonly unassignedProducts: number };
}
export interface CreateProductCategoryCommand extends ProductCatalogContext { readonly name: string; readonly description: string | null }
export interface UpdateProductCategoryCommand extends ProductCatalogContext { readonly categoryId: ProductCategoryId; readonly name?: string; readonly description?: string | null; readonly expectedVersion: number }
export interface ProductCategoryVersionCommand extends ProductCatalogContext { readonly categoryId: ProductCategoryId; readonly expectedVersion: number }

/** Persistence port owned by the products application layer. */
export interface ProductsRepository {
  /** @returns A validated cursor page of products. */
  list(query: ProductListQuery): Promise<ProductCursorPage>;
  /** @returns Product detail, or `null` when the product does not exist in scope. */
  get(context: ProductCatalogContext, productId: ProductId): Promise<ProductDetail | null>;
  /** @returns The authoritative product detail created by persistence. */
  create(command: CreateProductCommand): Promise<ProductDetail>;
  /** @returns The authoritative product detail after an optimistic update. */
  update(command: UpdateProductCommand): Promise<ProductDetail>;
  /** @returns Product detail after changing lifecycle status. */
  setStatus(command: ProductVersionCommand, status: ProductStatus): Promise<ProductDetail>;
  /** @returns A cursor page of inventory movements for a product. */
  listMovements(query: ProductMovementQuery): Promise<ProductMovementPage>;
  /** @returns Product categories matching the requested status. */
  listCategories(query: ProductCategoryListQuery): Promise<readonly ProductCategory[]>;
  /** @returns Category overview detail, or `null` when absent. */
  getCategory(context: ProductCatalogContext, categoryId: ProductCategoryId): Promise<ProductCategoryOverviewItem | null>;
  /** @returns A validated cursor page of category overview rows. */
  overviewCategories(query: ProductCategoryOverviewQuery): Promise<ProductCategoryOverviewPage>;
  /** @returns The authoritative category created by persistence. */
  createCategory(command: CreateProductCategoryCommand): Promise<ProductCategory>;
  /** @returns The authoritative category after an optimistic update. */
  updateCategory(command: UpdateProductCategoryCommand): Promise<ProductCategory>;
  /** @returns The category after changing lifecycle status. */
  setCategoryStatus(command: ProductCategoryVersionCommand, status: ProductCategoryStatus): Promise<ProductCategory>;
}

/** Lists products using validated search, stock, sorting and cursor filters. */
export class ListProducts {
  /** @param repository - Products persistence port. */
  constructor(private readonly repository: ProductsRepository) {}

  /**
   * @param query - Organization scope and list filters.
   * @returns A cursor page and inventory summary.
   * @throws {ProductFailure} When validation or persistence fails.
   */
  execute(query: ProductListQuery): Promise<ProductCursorPage> {
    const valid = validateList(query);
    return productCall(() => this.repository.list(valid));
  }
}

/** Retrieves one product within an explicit catalog scope. */
export class GetProduct {
  /** @param repository - Products persistence port. */
  constructor(private readonly repository: ProductsRepository) {}

  /**
   * @param context - Actor, organization and company scope.
   * @param id - Product identifier.
   * @returns The matching product detail.
   * @throws {ProductFailure} When absent or persistence fails.
   */
  async execute(context: ProductCatalogContext, id: ProductId): Promise<ProductDetail> {
    const value = await productCall(() => this.repository.get(context, id));
    if (!value) throw new ProductFailure("PRODUCT_NOT_FOUND", "Product was not found.");
    return value;
  }
}

/** Creates a product after validating barcode uniqueness. */
export class CreateProduct {
  /** @param repository - Products persistence port. */
  constructor(private readonly repository: ProductsRepository) {}

  /**
   * @param command - Product identity, classification and ownership data.
   * @returns The created product detail.
   * @throws {ProductFailure} When barcodes conflict or persistence fails.
   */
  execute(command: CreateProductCommand): Promise<ProductDetail> {
    validateBarcodes(command.barcodes);
    return productCall(() => this.repository.create(command));
  }
}

/** Updates a product using optimistic concurrency. */
export class UpdateProduct {
  /** @param repository - Products persistence port. */
  constructor(private readonly repository: ProductsRepository) {}

  /**
   * @param command - Product changes and expected aggregate version.
   * @returns The updated product detail.
   * @throws {ProductFailure} When validation, concurrency or persistence fails.
   */
  execute(command: UpdateProductCommand): Promise<ProductDetail> {
    expectedVersion(command.expectedVersion);
    if (command.barcodes) validateBarcodes(command.barcodes);
    return productCall(() => this.repository.update(command));
  }
}

/** Changes product lifecycle status using optimistic concurrency. */
export class SetProductStatus {
  /**
   * @param repository - Products persistence port.
   * @param status - Target lifecycle status.
   */
  constructor(
    private readonly repository: ProductsRepository,
    private readonly status: ProductStatus,
  ) {}

  /**
   * @param command - Product identity, scope and expected version.
   * @returns Product detail after the status transition.
   * @throws {ProductFailure} When validation, transition, concurrency or persistence fails.
   */
  execute(command: ProductVersionCommand): Promise<ProductDetail> {
    expectedVersion(command.expectedVersion);
    return productCall(() => this.repository.setStatus(command, this.status));
  }
}

/** Lists inventory movements belonging to a product. */
export class ListProductMovements {
  /** @param repository - Products persistence port. */
  constructor(private readonly repository: ProductsRepository) {}

  /**
   * @param query - Product, date and cursor filters.
   * @returns A cursor page of movements.
   * @throws {ProductFailure} When validation or persistence fails.
   */
  execute(query: ProductMovementQuery): Promise<ProductMovementPage> {
    const valid = validateMovement(query);
    return productCall(() => this.repository.listMovements(valid));
  }
}

/** Lists product categories in a company catalog. */
export class ListProductCategories {
  /** @param repository - Products persistence port. */
  constructor(private readonly repository: ProductsRepository) {}

  /**
   * @param query - Catalog scope and lifecycle filter.
   * @returns Matching categories.
   * @throws {ProductFailure} When persistence fails.
   */
  execute(query: ProductCategoryListQuery): Promise<readonly ProductCategory[]> {
    return productCall(() => this.repository.listCategories(query));
  }
}

/** Retrieves category detail and usage information. */
export class GetProductCategory {
  /** @param repository - Products persistence port. */
  constructor(private readonly repository: ProductsRepository) {}

  /**
   * @param context - Actor, organization and company scope.
   * @param id - Category identifier.
   * @returns The matching category overview.
   * @throws {ProductFailure} When absent or persistence fails.
   */
  async execute(
    context: ProductCatalogContext,
    id: ProductCategoryId,
  ): Promise<ProductCategoryOverviewItem> {
    const value = await productCall(() => this.repository.getCategory(context, id));
    if (!value) {
      throw new ProductFailure("PRODUCT_CATEGORY_NOT_FOUND", "Product category was not found.");
    }
    return value;
  }
}

/** Lists category overview rows using validated cursor filters. */
export class ListProductCategoryOverview {
  /** @param repository - Products persistence port. */
  constructor(private readonly repository: ProductsRepository) {}

  /**
   * @param query - Catalog scope, filters, sorting and cursor settings.
   * @returns A cursor page with category usage summary.
   * @throws {ProductFailure} When validation or persistence fails.
   */
  execute(query: ProductCategoryOverviewQuery): Promise<ProductCategoryOverviewPage> {
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) {
      invalid("Product category page limit must be between 1 and 100.");
    }
    if (query.search !== null && query.search.trim().length > 200) {
      invalid("Product category search is invalid.");
    }
    const valid = { ...query, search: query.search?.trim() || null };
    return productCall(() => this.repository.overviewCategories(valid));
  }
}

/** Creates a product category. */
export class CreateProductCategory {
  /** @param repository - Products persistence port. */
  constructor(private readonly repository: ProductsRepository) {}

  /**
   * @param command - Category ownership and descriptive data.
   * @returns The created category.
   * @throws {ProductFailure} When validation or persistence fails.
   */
  execute(command: CreateProductCategoryCommand): Promise<ProductCategory> {
    return productCall(() => this.repository.createCategory(command));
  }
}

/** Updates a product category using optimistic concurrency. */
export class UpdateProductCategory {
  /** @param repository - Products persistence port. */
  constructor(private readonly repository: ProductsRepository) {}

  /**
   * @param command - Category changes and expected version.
   * @returns The updated category.
   * @throws {ProductFailure} When validation, concurrency or persistence fails.
   */
  execute(command: UpdateProductCategoryCommand): Promise<ProductCategory> {
    expectedVersion(command.expectedVersion);
    return productCall(() => this.repository.updateCategory(command));
  }
}

/** Changes category lifecycle status using optimistic concurrency. */
export class SetProductCategoryStatus {
  /**
   * @param repository - Products persistence port.
   * @param status - Target category status.
   */
  constructor(
    private readonly repository: ProductsRepository,
    private readonly status: ProductCategoryStatus,
  ) {}

  /**
   * @param command - Category identity, scope and expected version.
   * @returns The category after the status transition.
   * @throws {ProductFailure} When validation, concurrency or persistence fails.
   */
  execute(command: ProductCategoryVersionCommand): Promise<ProductCategory> {
    expectedVersion(command.expectedVersion);
    return productCall(() => this.repository.setCategoryStatus(command, this.status));
  }
}

function validateList(query: ProductListQuery): ProductListQuery {
  if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) {
    invalid("Product page limit must be between 1 and 100.");
  }
  if (query.search !== null && query.search.trim().length > 200) invalid("Product search is invalid.");
  return Object.freeze({ ...query, search: query.search?.trim() || null });
}

function validateMovement(query: ProductMovementQuery): ProductMovementQuery {
  if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) {
    invalid("Movement page limit must be between 1 and 100.");
  }
  if (query.from && query.to && query.from > query.to) {
    invalid("Movement start date must not be after its end date.");
  }
  return query;
}

function validateBarcodes(values: readonly Barcode[]): void {
  if (new Set<string>(values).size !== values.length) {
    throw new ProductFailure("PRODUCT_DUPLICATE_BARCODE", "A product cannot contain duplicate barcodes.");
  }
}

function expectedVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) invalid("Expected version is invalid.");
}

function invalid(message: string): never {
  throw new ProductFailure("PRODUCT_INVALID", message);
}

async function productCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause: unknown) {
    if (cause instanceof ProductFailure) throw cause;
    throw new ProductFailure("PRODUCT_REPOSITORY_UNAVAILABLE", "Product repository is unavailable.", { cause });
  }
}

export { ProductStatus, ProductCategoryStatus };
