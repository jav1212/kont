import {
  productList,
  productDetail,
  product,
  productMovementPage,
  replenishmentPolicy,
  category,
  categoryOverviewItem,
  categoryOverview,
  unitEconomics,
  salePricing,
  taxation,
} from "./decoding";
import { organization } from "../organizations/decoding";
import { decodeRemote, array } from "../../decoding";
import type {
  ProductCategoryOverviewQuery,
  ProductUnitEconomicsQuery,
  ProductListQuery,
  ProductMovementQuery,
  ProductsPort,
} from "@kontave/client-contracts";
import type { RemoteTransport } from "../../transport";
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
} from "@kontave/client-contracts";

/** Shared Products API adapter. No renderer owns or duplicates these paths. */
export class RemoteProductsPort implements ProductsPort {
  /**
   * Binds every Products operation to one authenticated transport.
   * @param client - Platform-neutral transport used for all Products requests.
   */
  constructor(private readonly client: RemoteTransport) {}

  /** {@inheritDoc ProductsPort.permissions}
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  async permissions(organizationId: string): Promise<readonly string[]> {
    return (
      await decodeRemote(
        this.client,
        `/api/client/v1/organizations/${segment(organizationId)}`,
        { method: "GET" },
        organization,
      )
    ).permissions;
  }

  /** {@inheritDoc ProductsPort.list}
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  list(
    organizationId: string,
    companyId: string,
    query: ProductListQuery = {},
  ): Promise<ProductListDto> {
    return decodeRemote(
      this.client,
      `${root(organizationId, companyId)}/products${queryString(query)}`,
      { method: "GET" },
      productList,
    );
  }

  /** {@inheritDoc ProductsPort.get}
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  get(
    organizationId: string,
    companyId: string,
    productId: string,
  ): Promise<ProductDetailDto> {
    return decodeRemote(
      this.client,
      `${root(organizationId, companyId)}/products/${segment(productId)}`,
      { method: "GET" },
      productDetail,
    );
  }

  /** {@inheritDoc ProductsPort.create}
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  create(
    organizationId: string,
    companyId: string,
    command: CreateProductDto,
  ): Promise<ProductDto> {
    return decodeRemote(
      this.client,
      `${root(organizationId, companyId)}/products`,
      json("POST", command),
      product,
    );
  }

  /** {@inheritDoc ProductsPort.update}
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  update(
    organizationId: string,
    companyId: string,
    productId: string,
    command: UpdateProductDto,
  ): Promise<ProductDto> {
    return decodeRemote(
      this.client,
      `${root(organizationId, companyId)}/products/${segment(productId)}`,
      json("PATCH", command),
      product,
    );
  }

  /** {@inheritDoc ProductsPort.setStatus}
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  setStatus(
    organizationId: string,
    companyId: string,
    productId: string,
    active: boolean,
    expectedVersion: number,
  ): Promise<ProductDto> {
    return decodeRemote(
      this.client,
      `${root(organizationId, companyId)}/products/${segment(productId)}/${active ? "activate" : "deactivate"}`,
      json("POST", { expectedVersion }),
      product,
    );
  }

  /** {@inheritDoc ProductsPort.movements}
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  movements(
    organizationId: string,
    companyId: string,
    productId: string,
    query: ProductMovementQuery = {},
  ): Promise<ProductMovementPageDto> {
    return decodeRemote(
      this.client,
      `${root(organizationId, companyId)}/products/${segment(productId)}/movements${queryString(query)}`,
      { method: "GET" },
      productMovementPage,
    );
  }

  /** {@inheritDoc ProductsPort.updateInventoryProfile}
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  updateInventoryProfile(
    organizationId: string,
    companyId: string,
    productId: string,
    command: UpdateProductInventoryProfileDto,
  ): Promise<ProductReplenishmentPolicyDto> {
    return decodeRemote(
      this.client,
      `${root(organizationId, companyId)}/products/${segment(productId)}/inventory-profile`,
      json("PATCH", command),
      replenishmentPolicy,
    );
  }

  /** {@inheritDoc ProductsPort.categories}
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  categories(
    organizationId: string,
    companyId: string,
    status: "active" | "inactive" | "all" = "active",
  ): Promise<readonly ProductCategoryDto[]> {
    return decodeRemote(
      this.client,
      `${root(organizationId, companyId)}/product-categories?status=${status}`,
      { method: "GET" },
      (value) => array(value, category),
    );
  }

  /** {@inheritDoc ProductsPort.createCategory}
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  createCategory(
    organizationId: string,
    companyId: string,
    command: CreateProductCategoryDto,
  ): Promise<ProductCategoryDto> {
    return decodeRemote(
      this.client,
      `${root(organizationId, companyId)}/product-categories`,
      json("POST", command),
      category,
    );
  }

  /** {@inheritDoc ProductsPort.updateCategory}
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  updateCategory(
    organizationId: string,
    companyId: string,
    categoryId: string,
    command: UpdateProductCategoryDto,
  ): Promise<ProductCategoryDto> {
    return decodeRemote(
      this.client,
      `${root(organizationId, companyId)}/product-categories/${segment(categoryId)}`,
      json("PATCH", command),
      category,
    );
  }

  /** {@inheritDoc ProductsPort.setCategoryStatus}
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  setCategoryStatus(
    organizationId: string,
    companyId: string,
    categoryId: string,
    active: boolean,
    expectedVersion: number,
  ): Promise<ProductCategoryDto> {
    return decodeRemote(
      this.client,
      `${root(organizationId, companyId)}/product-categories/${segment(categoryId)}/${active ? "activate" : "deactivate"}`,
      json("POST", { expectedVersion }),
      category,
    );
  }

  /** {@inheritDoc ProductsPort.getCategory}
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  getCategory(
    organizationId: string,
    companyId: string,
    categoryId: string,
  ): Promise<ProductCategoryOverviewItemDto> {
    return decodeRemote(
      this.client,
      `${root(organizationId, companyId)}/product-categories/${segment(categoryId)}`,
      { method: "GET" },
      categoryOverviewItem,
    );
  }

  /** {@inheritDoc ProductsPort.categoryOverview}
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  categoryOverview(
    organizationId: string,
    companyId: string,
    query: ProductCategoryOverviewQuery = {},
  ): Promise<ProductCategoryOverviewDto> {
    return decodeRemote(
      this.client,
      `${root(organizationId, companyId)}/product-categories/overview${queryString(query)}`,
      { method: "GET" },
      categoryOverview,
    );
  }

  /** {@inheritDoc ProductsPort.unitEconomics}
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  unitEconomics(
    organizationId: string,
    companyId: string,
    productId: string,
    query: ProductUnitEconomicsQuery,
  ): Promise<ProductUnitEconomicsDto> {
    return decodeRemote(
      this.client,
      `${root(organizationId, companyId)}/products/${segment(productId)}/unit-economics${queryString(query)}`,
      { method: "GET" },
      unitEconomics,
    );
  }

  /** {@inheritDoc ProductsPort.updateSalePricing}
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  updateSalePricing(
    organizationId: string,
    companyId: string,
    productId: string,
    command: UpdateProductSalePricingDto,
  ): Promise<ProductSalePricingDto> {
    return decodeRemote(
      this.client,
      `${root(organizationId, companyId)}/products/${segment(productId)}/sale-pricing`,
      json("PATCH", command),
      salePricing,
    );
  }

  /** {@inheritDoc ProductsPort.updateTaxation}
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  updateTaxation(
    organizationId: string,
    companyId: string,
    productId: string,
    command: UpdateProductTaxationDto,
  ): Promise<ProductTaxationDto> {
    return decodeRemote(
      this.client,
      `${root(organizationId, companyId)}/products/${segment(productId)}/tax-profile`,
      json("PATCH", command),
      taxation,
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
