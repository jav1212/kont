import type {
  CreateProductCategoryDto,
  CreateProductDto,
  ProductCategoryDto,
  ProductCategoryOverviewDto,
  ProductCategoryOverviewItemDto,
  ProductDetailDto,
  ProductDto,
  ProductListDto,
  ProductMovementPageDto,
  ProductReplenishmentPolicyDto,
  ProductSalePricingDto,
  ProductTaxationDto,
  ProductUnitEconomicsDto,
  UpdateProductCategoryDto,
  UpdateProductDto,
  UpdateProductInventoryProfileDto,
  UpdateProductSalePricingDto,
  UpdateProductTaxationDto,
} from "./dtos";

export * from "./dtos";

import type {
  ClientFailure,
  ClientFeature,
  ClientResultPort,
} from "../../core";

export interface ProductListQuery {
  readonly search?: string;
  readonly status?: "active" | "inactive" | "all";
  readonly categoryId?: string;
  readonly stock?: "all" | "available" | "low" | "out";
  readonly sort?: "name" | "sku" | "stock" | "value" | "updatedAt";
  readonly direction?: "asc" | "desc";
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ProductMovementQuery {
  readonly cursor?: string;
  readonly limit?: number;
  readonly from?: string;
  readonly to?: string;
  readonly type?: string;
}

export interface ProductCategoryOverviewQuery {
  readonly search?: string;
  readonly status?: "active" | "inactive" | "all";
  readonly sort?: "name" | "products" | "updatedAt";
  readonly direction?: "asc" | "desc";
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ProductInsightsQuery {
  readonly from: string;
  readonly to: string;
  readonly granularity: "day" | "week" | "month";
}

export type ProductsSnapshot =
  | { readonly status: "idle"; readonly list: null }
  | { readonly status: "loading"; readonly list: ProductListDto | null }
  | { readonly status: "ready"; readonly list: ProductListDto }
  | {
      readonly status: "failed";
      readonly list: ProductListDto | null;
      readonly failure: ClientFailure;
    };

/** Application-facing Products port. Its implementation may use HTTP, IPC or a test double. */
export interface ProductsPort {
  /**
   * Resolves permissions used to authorize Products actions for an organization.
   * @param organizationId - Stable organization identifier that scopes authorization.
   * @returns Permission codes granted to the authenticated actor.
   * @throws A typed adapter failure when authentication or organization access fails.
   */
  permissions(organizationId: string): Promise<readonly string[]>;
  /**
   * Lists products within one tenant and operational company.
   * @param organizationId - Organization that owns the operational company.
   * @param companyId - Company whose product catalog is requested.
   * @param query - Optional filtering, sorting, pagination and stock criteria.
   * @returns A page of product read models and an opaque continuation cursor.
   * @throws A typed adapter failure when the context, query or remote source is invalid.
   */
  list(
    organizationId: string,
    companyId: string,
    query?: ProductListQuery,
  ): Promise<ProductListDto>;
  /**
   * Loads a composed product detail read model.
   * @param organizationId - Organization that owns the operational company.
   * @param companyId - Company that owns the product.
   * @param productId - Stable product identifier.
   * @returns Product identity, inventory profile, pricing, taxation and capabilities.
   * @throws A typed adapter failure when the product is missing or inaccessible.
   */
  get(
    organizationId: string,
    companyId: string,
    productId: string,
  ): Promise<ProductDetailDto>;
  /**
   * Creates a product in the scoped company catalog.
   * @param organizationId - Organization that owns the operational company.
   * @param companyId - Company that will own the product.
   * @param command - Validated product identity and base-unit input.
   * @returns The persisted product read model.
   * @throws A typed adapter failure for invalid, duplicate or unauthorized data.
   */
  create(
    organizationId: string,
    companyId: string,
    command: CreateProductDto,
  ): Promise<ProductDto>;
  /**
   * Updates product identity under optimistic concurrency.
   * @param organizationId - Organization that owns the operational company.
   * @param companyId - Company that owns the product.
   * @param productId - Product to update.
   * @param command - Partial changes plus the expected identity version.
   * @returns The updated product read model.
   * @throws A typed adapter failure when validation, access or version checks fail.
   */
  update(
    organizationId: string,
    companyId: string,
    productId: string,
    command: UpdateProductDto,
  ): Promise<ProductDto>;
  /**
   * Changes product lifecycle state without deleting audit history.
   * @param organizationId - Organization that owns the operational company.
   * @param companyId - Company that owns the product.
   * @param productId - Product whose lifecycle changes.
   * @param active - `true` to activate or `false` to deactivate.
   * @param expectedVersion - Product identity version required for the transition.
   * @returns The product after the lifecycle transition.
   * @throws A typed adapter failure when the transition or version is invalid.
   */
  setStatus(
    organizationId: string,
    companyId: string,
    productId: string,
    active: boolean,
    expectedVersion: number,
  ): Promise<ProductDto>;
  /**
   * Lists immutable inventory movements associated with a product.
   * @param organizationId - Organization that owns the operational company.
   * @param companyId - Company that owns the product ledger.
   * @param productId - Product whose movement history is requested.
   * @param query - Optional period, movement type and cursor criteria.
   * @returns A movement page with an opaque continuation cursor.
   * @throws A typed adapter failure when the product or ledger is unavailable.
   */
  movements(
    organizationId: string,
    companyId: string,
    productId: string,
    query?: ProductMovementQuery,
  ): Promise<ProductMovementPageDto>;
  /**
   * Updates the independently versioned replenishment policy.
   * @param organizationId - Organization that owns the operational company.
   * @param companyId - Company that owns the inventory profile.
   * @param productId - Product whose minimum quantity changes.
   * @param command - Minimum quantity and expected inventory-profile version.
   * @returns The persisted replenishment policy.
   * @throws A typed adapter failure when validation or concurrency checks fail.
   */
  updateInventoryProfile(
    organizationId: string,
    companyId: string,
    productId: string,
    command: UpdateProductInventoryProfileDto,
  ): Promise<ProductReplenishmentPolicyDto>;
  /**
   * Lists categories visible within a company catalog.
   * @param organizationId - Organization that owns the operational company.
   * @param companyId - Company whose categories are requested.
   * @param status - Lifecycle filter; defaults to active categories.
   * @returns Matching category read models.
   * @throws A typed adapter failure when the company context is inaccessible.
   */
  categories(
    organizationId: string,
    companyId: string,
    status?: "active" | "inactive" | "all",
  ): Promise<readonly ProductCategoryDto[]>;
  /**
   * Creates a product category.
   * @param organizationId - Organization that owns the operational company.
   * @param companyId - Company that will own the category.
   * @param command - Category name and optional description.
   * @returns The persisted category.
   * @throws A typed adapter failure for duplicate, invalid or unauthorized data.
   */
  createCategory(
    organizationId: string,
    companyId: string,
    command: CreateProductCategoryDto,
  ): Promise<ProductCategoryDto>;
  /**
   * Updates category data under optimistic concurrency.
   * @param organizationId - Organization that owns the operational company.
   * @param companyId - Company that owns the category.
   * @param categoryId - Category to update.
   * @param command - Partial changes plus the expected category version.
   * @returns The updated category.
   * @throws A typed adapter failure when validation or version checks fail.
   */
  updateCategory(
    organizationId: string,
    companyId: string,
    categoryId: string,
    command: UpdateProductCategoryDto,
  ): Promise<ProductCategoryDto>;
  /**
   * Changes category lifecycle state without deleting product assignments.
   * @param organizationId - Organization that owns the operational company.
   * @param companyId - Company that owns the category.
   * @param categoryId - Category whose lifecycle changes.
   * @param active - `true` to activate or `false` to deactivate.
   * @param expectedVersion - Category version required for the transition.
   * @returns The category after the lifecycle transition.
   * @throws A typed adapter failure when the transition or version is invalid.
   */
  setCategoryStatus(
    organizationId: string,
    companyId: string,
    categoryId: string,
    active: boolean,
    expectedVersion: number,
  ): Promise<ProductCategoryDto>;
  /**
   * Loads one category and its aggregate product usage.
   * @param organizationId - Organization that owns the operational company.
   * @param companyId - Company that owns the category.
   * @param categoryId - Category to load.
   * @returns Category detail with product count and audit timestamps.
   * @throws A typed adapter failure when the category is missing or inaccessible.
   */
  getCategory(
    organizationId: string,
    companyId: string,
    categoryId: string,
  ): Promise<ProductCategoryOverviewItemDto>;
  /**
   * Loads the category overview used by catalog administration.
   * @param organizationId - Organization that owns the operational company.
   * @param companyId - Company whose category overview is requested.
   * @param query - Optional search, status, sorting and cursor criteria.
   * @returns A category page and aggregate lifecycle/assignment summary.
   * @throws A typed adapter failure when query or company access is invalid.
   */
  categoryOverview(
    organizationId: string,
    companyId: string,
    query?: ProductCategoryOverviewQuery,
  ): Promise<ProductCategoryOverviewDto>;
  /**
   * Loads weighted acquisition and realized-sale economics for a product.
   * @param organizationId - Organization that owns the operational company.
   * @param companyId - Company that owns the product.
   * @param productId - Product whose economics are requested.
   * @param query - Inclusive analysis period and aggregation granularity.
   * @returns Weighted aggregates, latest acquisition and coverage metadata.
   * @throws A typed adapter failure when the period or product context is invalid.
   */
  unitEconomics(
    organizationId: string,
    companyId: string,
    productId: string,
    query: ProductInsightsQuery,
  ): Promise<ProductUnitEconomicsDto>;
  /**
   * Updates the independently versioned commercial pricing policy.
   * @param organizationId - Organization that owns the operational company.
   * @param companyId - Company that owns the product.
   * @param productId - Product whose commercial policy changes.
   * @param command - Pricing policy plus expected pricing version.
   * @returns The persisted pricing policy.
   * @throws A typed adapter failure when policy, access or version checks fail.
   */
  updateSalePricing(
    organizationId: string,
    companyId: string,
    productId: string,
    command: UpdateProductSalePricingDto,
  ): Promise<ProductSalePricingDto>;
  /**
   * Updates the independently versioned tax treatment for a product.
   * @param organizationId - Organization that owns the operational company.
   * @param companyId - Company that owns the product.
   * @param productId - Product whose tax treatment changes.
   * @param command - Effective tax treatment plus expected taxation version.
   * @returns The resolved persisted taxation profile.
   * @throws A typed adapter failure when tax policy, access or version checks fail.
   */
  updateTaxation(
    organizationId: string,
    companyId: string,
    productId: string,
    command: UpdateProductTaxationDto,
  ): Promise<ProductTaxationDto>;
}

/**
 * Observable Products facade exposed to renderers. It preserves every documented
 * Products operation while converting expected adapter failures into result data.
 */
export type ProductsFeature = ClientFeature<ProductsSnapshot> &
  ClientResultPort<ProductsPort>;
