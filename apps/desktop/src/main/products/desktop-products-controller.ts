import type {
  ClientPortFeature,
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
  ProductsPort,
  UpdateProductCategoryDto,
  UpdateProductDto,
  UpdateProductInventoryProfileDto,
  UpdateProductSalePricingDto,
  UpdateProductTaxationDto,
} from "@kontave/client-contracts";
import type {
  DesktopProductCategoryOverviewQuery,
  DesktopProductInsightsQuery,
  DesktopProductListQuery,
  DesktopProductMovementQuery,
  DesktopProductsResult,
} from "../../renderer-bridge";

export class DesktopProductsController {
  constructor(private readonly products: ClientPortFeature<ProductsPort>) {}

  list(
    organizationId: unknown,
    companyId: unknown,
    query: unknown,
  ): Promise<DesktopProductsResult<ProductListDto>> {
    return this.read(() =>
      this.products.list(
        segment(organizationId),
        segment(companyId),
        readListQuery(query),
      ),
    );
  }

  permissions(
    organizationId: unknown,
  ): Promise<DesktopProductsResult<readonly string[]>> {
    return this.read(() => this.products.permissions(segment(organizationId)));
  }

  get(
    organizationId: unknown,
    companyId: unknown,
    productId: unknown,
  ): Promise<DesktopProductsResult<ProductDetailDto>> {
    return this.read(() =>
      this.products.get(
        segment(organizationId),
        segment(companyId),
        segment(productId),
      ),
    );
  }

  create(
    organizationId: unknown,
    companyId: unknown,
    command: CreateProductDto,
  ): Promise<DesktopProductsResult<ProductDto>> {
    return this.write(() =>
      this.products.create(
        segment(organizationId),
        segment(companyId),
        command,
      ),
    );
  }

  update(
    organizationId: unknown,
    companyId: unknown,
    productId: unknown,
    command: UpdateProductDto,
  ): Promise<DesktopProductsResult<ProductDto>> {
    return this.write(() =>
      this.products.update(
        segment(organizationId),
        segment(companyId),
        segment(productId),
        command,
      ),
    );
  }

  setStatus(
    organizationId: unknown,
    companyId: unknown,
    productId: unknown,
    active: boolean,
    expectedVersion: number,
  ): Promise<DesktopProductsResult<ProductDto>> {
    return this.write(() =>
      this.products.setStatus(
        segment(organizationId),
        segment(companyId),
        segment(productId),
        active,
        expectedVersion,
      ),
    );
  }

  movements(
    organizationId: unknown,
    companyId: unknown,
    productId: unknown,
    query: unknown,
  ): Promise<DesktopProductsResult<ProductMovementPageDto>> {
    return this.read(() =>
      this.products.movements(
        segment(organizationId),
        segment(companyId),
        segment(productId),
        readMovementQuery(query),
      ),
    );
  }

  updateInventoryProfile(
    organizationId: unknown,
    companyId: unknown,
    productId: unknown,
    command: UpdateProductInventoryProfileDto,
  ): Promise<DesktopProductsResult<ProductReplenishmentPolicyDto>> {
    return this.write(() =>
      this.products.updateInventoryProfile(
        segment(organizationId),
        segment(companyId),
        segment(productId),
        command,
      ),
    );
  }

  categories(
    organizationId: unknown,
    companyId: unknown,
    status: unknown,
  ): Promise<DesktopProductsResult<readonly ProductCategoryDto[]>> {
    const normalized =
      status === "inactive" || status === "all" ? status : "active";
    return this.read(() =>
      this.products.categories(
        segment(organizationId),
        segment(companyId),
        normalized,
      ),
    );
  }

  categoryOverview(
    organizationId: unknown,
    companyId: unknown,
    query: unknown,
  ): Promise<DesktopProductsResult<ProductCategoryOverviewDto>> {
    return this.read(() =>
      this.products.categoryOverview(
        segment(organizationId),
        segment(companyId),
        readCategoryOverviewQuery(query),
      ),
    );
  }

  getCategory(
    organizationId: unknown,
    companyId: unknown,
    categoryId: unknown,
  ): Promise<DesktopProductsResult<ProductCategoryOverviewItemDto>> {
    return this.read(() =>
      this.products.getCategory(
        segment(organizationId),
        segment(companyId),
        segment(categoryId),
      ),
    );
  }

  unitEconomics(
    organizationId: unknown,
    companyId: unknown,
    productId: unknown,
    query: DesktopProductInsightsQuery,
  ): Promise<DesktopProductsResult<ProductUnitEconomicsDto>> {
    return this.read(() =>
      this.products.unitEconomics(
        segment(organizationId),
        segment(companyId),
        segment(productId),
        query,
      ),
    );
  }
  updateSalePricing(
    organizationId: unknown,
    companyId: unknown,
    productId: unknown,
    command: UpdateProductSalePricingDto,
  ): Promise<DesktopProductsResult<ProductSalePricingDto>> {
    return this.write(() =>
      this.products.updateSalePricing(
        segment(organizationId),
        segment(companyId),
        segment(productId),
        command,
      ),
    );
  }
  updateTaxation(
    organizationId: unknown,
    companyId: unknown,
    productId: unknown,
    command: UpdateProductTaxationDto,
  ): Promise<DesktopProductsResult<ProductTaxationDto>> {
    return this.write(() =>
      this.products.updateTaxation(
        segment(organizationId),
        segment(companyId),
        segment(productId),
        command,
      ),
    );
  }

  createCategory(
    organizationId: unknown,
    companyId: unknown,
    command: CreateProductCategoryDto,
  ): Promise<DesktopProductsResult<ProductCategoryDto>> {
    return this.write(() =>
      this.products.createCategory(
        segment(organizationId),
        segment(companyId),
        command,
      ),
    );
  }

  updateCategory(
    organizationId: unknown,
    companyId: unknown,
    categoryId: unknown,
    command: UpdateProductCategoryDto,
  ): Promise<DesktopProductsResult<ProductCategoryDto>> {
    return this.write(() =>
      this.products.updateCategory(
        segment(organizationId),
        segment(companyId),
        segment(categoryId),
        command,
      ),
    );
  }

  setCategoryStatus(
    organizationId: unknown,
    companyId: unknown,
    categoryId: unknown,
    active: boolean,
    expectedVersion: number,
  ): Promise<DesktopProductsResult<ProductCategoryDto>> {
    return this.write(() =>
      this.products.setCategoryStatus(
        segment(organizationId),
        segment(companyId),
        segment(categoryId),
        active,
        expectedVersion,
      ),
    );
  }

  private read<T>(
    operation: () => Promise<DesktopProductsResult<T>>,
  ): Promise<DesktopProductsResult<T>> {
    return operation();
  }
  private write<T>(
    operation: () => Promise<DesktopProductsResult<T>>,
  ): Promise<DesktopProductsResult<T>> {
    return operation();
  }
}

function segment(value: unknown): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error("El contexto de Productos no es válido.");
  return value;
}
function readListQuery(value: unknown): DesktopProductListQuery {
  return typeof value === "object" && value !== null
    ? (value as DesktopProductListQuery)
    : {};
}
function readMovementQuery(value: unknown): DesktopProductMovementQuery {
  return typeof value === "object" && value !== null
    ? (value as DesktopProductMovementQuery)
    : {};
}
function readCategoryOverviewQuery(
  value: unknown,
): DesktopProductCategoryOverviewQuery {
  return typeof value === "object" && value !== null
    ? (value as DesktopProductCategoryOverviewQuery)
    : {};
}
