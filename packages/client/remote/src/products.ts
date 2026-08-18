import type {
  ProductCategoryOverviewQuery,
  ProductInsightsQuery,
  ProductListQuery,
  ProductMovementQuery,
  ProductsPort,
} from "@kontave/client-contracts";
import type {
  CreateProductCategoryDto,
  CreateProductDto,
  OrganizationDto,
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
} from "@kontave/client-contracts";

interface ProductsRemoteTransport {
  /**
   * Reads and decodes one API resource.
   * @param path - Relative Client API path.
   * @returns The decoded response data.
   */
  get<T>(path: string): Promise<T>;
  /**
   * Sends a state-changing API request.
   * @param path - Relative Client API path.
   * @param init - HTTP method, headers and serialized body.
   * @returns The decoded response data.
   */
  request<T>(path: string, init: RequestInit): Promise<T>;
}

/** Shared Products API adapter. No renderer owns or duplicates these paths. */
export class RemoteProductsPort implements ProductsPort {
  /**
   * Binds every Products operation to one authenticated transport.
   * @param client - Platform-neutral transport used for all Products requests.
   */
  constructor(private readonly client: ProductsRemoteTransport) {}

  /** {@inheritDoc ProductsPort.permissions} */
  async permissions(organizationId: string): Promise<readonly string[]> {
    return (
      await this.client.get<OrganizationDto>(
        `/api/client/v1/organizations/${segment(organizationId)}`,
      )
    ).permissions;
  }

  /** {@inheritDoc ProductsPort.list} */
  list(
    organizationId: string,
    companyId: string,
    query: ProductListQuery = {},
  ): Promise<ProductListDto> {
    return this.client.get(
      `${root(organizationId, companyId)}/products${queryString(query)}`,
    );
  }

  /** {@inheritDoc ProductsPort.get} */
  get(
    organizationId: string,
    companyId: string,
    productId: string,
  ): Promise<ProductDetailDto> {
    return this.client.get(
      `${root(organizationId, companyId)}/products/${segment(productId)}`,
    );
  }

  /** {@inheritDoc ProductsPort.create} */
  create(
    organizationId: string,
    companyId: string,
    command: CreateProductDto,
  ): Promise<ProductDto> {
    return this.client.request(
      `${root(organizationId, companyId)}/products`,
      json("POST", command),
    );
  }

  /** {@inheritDoc ProductsPort.update} */
  update(
    organizationId: string,
    companyId: string,
    productId: string,
    command: UpdateProductDto,
  ): Promise<ProductDto> {
    return this.client.request(
      `${root(organizationId, companyId)}/products/${segment(productId)}`,
      json("PATCH", command),
    );
  }

  /** {@inheritDoc ProductsPort.setStatus} */
  setStatus(
    organizationId: string,
    companyId: string,
    productId: string,
    active: boolean,
    expectedVersion: number,
  ): Promise<ProductDto> {
    return this.client.request(
      `${root(organizationId, companyId)}/products/${segment(productId)}/${active ? "activate" : "deactivate"}`,
      json("POST", { expectedVersion }),
    );
  }

  /** {@inheritDoc ProductsPort.movements} */
  movements(
    organizationId: string,
    companyId: string,
    productId: string,
    query: ProductMovementQuery = {},
  ): Promise<ProductMovementPageDto> {
    return this.client.get(
      `${root(organizationId, companyId)}/products/${segment(productId)}/movements${queryString(query)}`,
    );
  }

  /** {@inheritDoc ProductsPort.updateInventoryProfile} */
  updateInventoryProfile(
    organizationId: string,
    companyId: string,
    productId: string,
    command: UpdateProductInventoryProfileDto,
  ): Promise<ProductReplenishmentPolicyDto> {
    return this.client.request(
      `${root(organizationId, companyId)}/products/${segment(productId)}/inventory-profile`,
      json("PATCH", command),
    );
  }

  /** {@inheritDoc ProductsPort.categories} */
  categories(
    organizationId: string,
    companyId: string,
    status: "active" | "inactive" | "all" = "active",
  ): Promise<readonly ProductCategoryDto[]> {
    return this.client.get(
      `${root(organizationId, companyId)}/product-categories?status=${status}`,
    );
  }

  /** {@inheritDoc ProductsPort.createCategory} */
  createCategory(
    organizationId: string,
    companyId: string,
    command: CreateProductCategoryDto,
  ): Promise<ProductCategoryDto> {
    return this.client.request(
      `${root(organizationId, companyId)}/product-categories`,
      json("POST", command),
    );
  }

  /** {@inheritDoc ProductsPort.updateCategory} */
  updateCategory(
    organizationId: string,
    companyId: string,
    categoryId: string,
    command: UpdateProductCategoryDto,
  ): Promise<ProductCategoryDto> {
    return this.client.request(
      `${root(organizationId, companyId)}/product-categories/${segment(categoryId)}`,
      json("PATCH", command),
    );
  }

  /** {@inheritDoc ProductsPort.setCategoryStatus} */
  setCategoryStatus(
    organizationId: string,
    companyId: string,
    categoryId: string,
    active: boolean,
    expectedVersion: number,
  ): Promise<ProductCategoryDto> {
    return this.client.request(
      `${root(organizationId, companyId)}/product-categories/${segment(categoryId)}/${active ? "activate" : "deactivate"}`,
      json("POST", { expectedVersion }),
    );
  }

  /** {@inheritDoc ProductsPort.getCategory} */
  getCategory(
    organizationId: string,
    companyId: string,
    categoryId: string,
  ): Promise<ProductCategoryOverviewItemDto> {
    return this.client.get(
      `${root(organizationId, companyId)}/product-categories/${segment(categoryId)}`,
    );
  }

  /** {@inheritDoc ProductsPort.categoryOverview} */
  categoryOverview(
    organizationId: string,
    companyId: string,
    query: ProductCategoryOverviewQuery = {},
  ): Promise<ProductCategoryOverviewDto> {
    return this.client.get(
      `${root(organizationId, companyId)}/product-categories/overview${queryString(query)}`,
    );
  }

  /** {@inheritDoc ProductsPort.unitEconomics} */
  unitEconomics(
    organizationId: string,
    companyId: string,
    productId: string,
    query: ProductInsightsQuery,
  ): Promise<ProductUnitEconomicsDto> {
    return this.client.get(
      `${root(organizationId, companyId)}/products/${segment(productId)}/unit-economics${queryString(query)}`,
    );
  }

  /** {@inheritDoc ProductsPort.updateSalePricing} */
  updateSalePricing(
    organizationId: string,
    companyId: string,
    productId: string,
    command: UpdateProductSalePricingDto,
  ): Promise<ProductSalePricingDto> {
    return this.client.request(
      `${root(organizationId, companyId)}/products/${segment(productId)}/sale-pricing`,
      json("PATCH", command),
    );
  }

  /** {@inheritDoc ProductsPort.updateTaxation} */
  updateTaxation(
    organizationId: string,
    companyId: string,
    productId: string,
    command: UpdateProductTaxationDto,
  ): Promise<ProductTaxationDto> {
    return this.client.request(
      `${root(organizationId, companyId)}/products/${segment(productId)}/tax-profile`,
      json("PATCH", command),
    );
  }
}

function root(organizationId: string, companyId: string): string {
  return `/api/client/v1/organizations/${segment(organizationId)}/companies/${segment(companyId)}`;
}
function segment(value: string): string {
  if (!value.trim()) throw new Error("El contexto de Productos no es válido.");
  return encodeURIComponent(value);
}
function json(method: "POST" | "PATCH", body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
function queryString(query: object): string {
  const values = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (
      (typeof value === "string" || typeof value === "number") &&
      value !== ""
    )
      values.set(key, String(value));
  });
  const encoded = values.toString();
  return encoded ? `?${encoded}` : "";
}
